import React, { useEffect, useState } from 'react';
import {
  ApplicationStatus,
  AppLanguage,
  AppThemeMode,
  CandidateApplication,
  CvAnalysisResult,
  RecreatedCvResult,
  SavedCvHistoryItem,
  SubscriptionPlan,
  UserAccountProfile,
} from './types';
import {
  analyzeCvRequest,
  confirmCheckoutSessionRequest,
  fetchWorkspaceDataRequest,
  syncWorkspaceDataRequest,
} from './utils/api';
import {
  deleteApplicationFromFirestore,
  firebaseSignOut,
  getOrCreateFirestoreUserProfile,
  listApplicationsFromFirestore,
  listCvsFromFirestore,
  saveApplicationToFirestore,
  saveCvToFirestore,
  signInWithAppleAccount,
  signInWithGoogleAndGmail,
  subscribeFirebaseAuth,
  updateApplicationStatusInFirestore,
  updateFirestoreUserLocality,
  updateFirestoreUserPlan,
} from './firebase';
import { ImportLanding } from './components/ImportLanding';
import { AnalysisDashboard, WorkspaceToolTarget } from './components/AnalysisDashboard';
import { CvRecreatorStudio } from './components/CvRecreatorStudio';
import { OfferAndToolsStudio, OfferToolTab } from './components/OfferAndToolsStudio';
import { ApplicationsTracker } from './components/ApplicationsTracker';
import { SettingsView } from './components/SettingsView';
import { AuthBillingModal } from './components/AuthBillingModal';
import {
  Briefcase,
  FileCheck2,
  FilePlus2,
  Gauge,
  Leaf,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  UserCheck,
} from 'lucide-react';

type MainView =
  | 'import'
  | 'analysis'
  | 'recreate'
  | 'tools'
  | 'applications'
  | 'settings';

const STORAGE_HISTORY_KEY = 'evolys_cv_history_v1';
const STORAGE_APPS_KEY = 'evolys_cv_applications_v1';
const STORAGE_LANG_KEY = 'evolys_cv_language_v1';
const STORAGE_ROLE_KEY = 'evolys_cv_target_role_v1';
const STORAGE_LOCALITY_KEY = 'evolys_cv_locality_v1';
const STORAGE_THEME_KEY = 'evolys_theme_mode_v1';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Impossible de lire ce fichier.'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const saved = localStorage.getItem(STORAGE_LANG_KEY);
    return saved === 'en' ? 'en' : 'fr';
  });
  const [themeMode, setThemeMode] = useState<AppThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_THEME_KEY);
    if (saved === 'green' || saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });
  const [targetRole, setTargetRole] = useState<string>(
    () => localStorage.getItem(STORAGE_ROLE_KEY) || ''
  );
  const [userLocality, setUserLocality] = useState<string>(
    () => localStorage.getItem(STORAGE_LOCALITY_KEY) || "Côte d'Ivoire"
  );

  const [history, setHistory] = useState<SavedCvHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [applications, setApplications] = useState<CandidateApplication[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_APPS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [activeView, setActiveView] = useState<MainView>('import');
  const [currentAnalysis, setCurrentAnalysis] = useState<CvAnalysisResult | null>(null);
  const [currentRecreated, setCurrentRecreated] = useState<RecreatedCvResult | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [recreateTab, setRecreateTab] = useState<'line-feedback' | 'recreate'>('recreate');
  const [offerToolTab, setOfferToolTab] = useState<OfferToolTab>('job-feed');

  // Account, Trial & Gmail Auth State (tokens held strictly in memory)
  const [currentUser, setCurrentUser] = useState<UserAccountProfile | null>(null);
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(null);
  const [otpBearerToken, setOtpBearerToken] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'account' | 'billing'>('account');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [logoLoadError, setLogoLoadError] = useState(false);

  const isEn = language === 'en';
  const isFirebaseUser =
    currentUser !== null &&
    (currentUser.authMethod === 'google' || currentUser.authMethod === 'apple');

  useEffect(() => {
    localStorage.setItem(STORAGE_LANG_KEY, language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem(STORAGE_THEME_KEY, themeMode);
    document.documentElement.setAttribute('data-theme', themeMode);
    document.documentElement.style.colorScheme = themeMode === 'light' ? 'light' : 'dark';
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_ROLE_KEY, targetRole);
  }, [targetRole]);

  useEffect(() => {
    localStorage.setItem(STORAGE_LOCALITY_KEY, userLocality);
    if (isFirebaseUser && currentUser) {
      updateFirestoreUserLocality(currentUser.uid, userLocality).catch(() => {});
    }
  }, [userLocality]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_APPS_KEY, JSON.stringify(applications));
    } catch {
      // Ignore storage quota errors
    }
  }, [applications]);

  // Sync Firebase Auth & Load Firestore Data
  useEffect(() => {
    const unsubscribe = subscribeFirebaseAuth(async (fbUser, token) => {
      if (!fbUser) {
        setGmailAccessToken(null);
        setCurrentUser((prev) => (prev?.authMethod === 'email_otp' ? prev : null));
        return;
      }

      if (token) setGmailAccessToken(token);

      try {
        const providerId = fbUser.providerData?.[0]?.providerId || '';
        const method: 'google' | 'apple' = providerId.includes('apple') ? 'apple' : 'google';
        const profile = await getOrCreateFirestoreUserProfile(fbUser, method, userLocality);
        setCurrentUser(profile);
        if (profile.locality) setUserLocality(profile.locality);

        const [remoteCvs, remoteApps] = await Promise.all([
          listCvsFromFirestore(fbUser.uid),
          listApplicationsFromFirestore(fbUser.uid),
        ]);
        if (remoteCvs.length > 0) setHistory(remoteCvs);
        if (remoteApps.length > 0) setApplications(remoteApps);
      } catch (err) {
        console.error('Firebase sync warning:', err);
      }
    });
    return () => unsubscribe();
  }, []);

  // Verify returning Stripe checkout session if present in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutSessionId = params.get('checkout_session');
    if (checkoutSessionId) {
      confirmCheckoutSessionRequest({
        sessionId: checkoutSessionId,
        uid: currentUser?.uid,
      })
        .then(async (res) => {
          if (res.ok) {
            await handlePlanActivated(res.plan, res.stripeCustomerId);
          }
        })
        .catch(() => {})
        .finally(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, [currentUser?.uid]);

  // Sync OTP user workspace to server whenever history/apps change
  useEffect(() => {
    if (otpBearerToken && currentUser?.authMethod === 'email_otp') {
      syncWorkspaceDataRequest(otpBearerToken, {
        cvs: history,
        applications,
        locality: userLocality,
      }).catch(() => {});
    }
  }, [history, applications, userLocality, otpBearerToken, currentUser?.authMethod]);

  const handleGoogleLogin = async () => {
    const { user, gmailAccessToken: token } = await signInWithGoogleAndGmail();
    if (token) setGmailAccessToken(token);
    const profile = await getOrCreateFirestoreUserProfile(user, 'google', userLocality);
    setCurrentUser(profile);
    setOtpBearerToken(null);
    const [remoteCvs, remoteApps] = await Promise.all([
      listCvsFromFirestore(user.uid),
      listApplicationsFromFirestore(user.uid),
    ]);
    if (remoteCvs.length > 0) {
      setHistory(remoteCvs);
    } else if (history.length > 0) {
      await Promise.all(history.slice(0, 6).map((item) => saveCvToFirestore(user.uid, item)));
    }
    if (remoteApps.length > 0) {
      setApplications(remoteApps);
    } else if (applications.length > 0) {
      await Promise.all(applications.slice(0, 20).map((a) => saveApplicationToFirestore(user.uid, a)));
    }
  };

  const handleAppleLogin = async () => {
    const { user } = await signInWithAppleAccount();
    const profile = await getOrCreateFirestoreUserProfile(user, 'apple', userLocality);
    setCurrentUser(profile);
    setOtpBearerToken(null);
  };

  const handleOtpLoginSuccess = async (user: UserAccountProfile, token: string) => {
    setCurrentUser(user);
    setOtpBearerToken(token);
    if (user.locality) setUserLocality(user.locality);
    try {
      const ws = await fetchWorkspaceDataRequest(token);
      if (ws.cvs?.length > 0) setHistory(ws.cvs);
      if (ws.applications?.length > 0) setApplications(ws.applications);
    } catch {
      // Ignore empty workspace
    }
  };

  const handlePlanActivated = async (
    plan: Exclude<SubscriptionPlan, 'trial'>,
    stripeCustomerId?: string
  ) => {
    if (!currentUser) return;
    if (isFirebaseUser) {
      await updateFirestoreUserPlan(currentUser.uid, plan, 'active', stripeCustomerId);
    }
    setCurrentUser((prev) =>
      prev
        ? {
            ...prev,
            plan,
            subscriptionStatus: 'active',
            stripeCustomerId: stripeCustomerId || prev.stripeCustomerId,
          }
        : prev
    );
  };

  const handleLogout = async () => {
    await firebaseSignOut().catch(() => {});
    setCurrentUser(null);
    setGmailAccessToken(null);
    setOtpBearerToken(null);
  };

  const saveSessionToHistory = (analysis: CvAnalysisResult, recreated?: RecreatedCvResult) => {
    const sessionId = `cv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry: SavedCvHistoryItem = {
      id: sessionId,
      fileName: analysis.fileName,
      candidateName: analysis.structuredCv.fullName || analysis.fileName,
      targetRole,
      formatScore: analysis.formatScore,
      contentScore: analysis.contentScore,
      analyzedAt: analysis.analyzedAt,
      analysis,
      recreated,
    };
    setCurrentSessionId(sessionId);
    setHistory((prev) =>
      [entry, ...prev.filter((h) => h.fileName !== analysis.fileName)].slice(0, 12)
    );
    if (isFirebaseUser && currentUser) {
      saveCvToFirestore(currentUser.uid, entry).catch((e) => console.error(e));
    }
  };

  const handleAnalyzeFile = async (file: File) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await analyzeCvRequest({
        fileName: file.name,
        mimeType: file.type,
        fileBase64: base64,
        targetRole: targetRole.trim(),
        language,
      });
      setCurrentAnalysis(result);
      setCurrentRecreated(null);
      saveSessionToHistory(result);
      setActiveView('analysis');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Erreur lors de l’analyse du fichier.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeText = async (text: string, fileName: string) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await analyzeCvRequest({
        fileName,
        rawText: text,
        targetRole: targetRole.trim(),
        language,
      });
      setCurrentAnalysis(result);
      setCurrentRecreated(null);
      saveSessionToHistory(result);
      setActiveView('analysis');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Erreur lors de l’analyse du CV.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReanalyzeWithRole = async () => {
    if (!currentAnalysis) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await analyzeCvRequest({
        fileName: currentAnalysis.fileName,
        rawText: currentAnalysis.extractedText,
        targetRole: targetRole.trim(),
        language,
      });
      setCurrentAnalysis(result);
      saveSessionToHistory(result, currentRecreated || undefined);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Erreur lors de l’actualisation.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRecreatedSaved = (res: RecreatedCvResult) => {
    setCurrentRecreated(res);
    if (currentSessionId) {
      setHistory((prev) => {
        const updated = prev.map((item) =>
          item.id === currentSessionId ? { ...item, recreated: res } : item
        );
        const targetItem = updated.find((i) => i.id === currentSessionId);
        if (targetItem && isFirebaseUser && currentUser) {
          saveCvToFirestore(currentUser.uid, targetItem).catch((e) => console.error(e));
        }
        return updated;
      });
    }
  };

  const handleApplyTailoredCv = (res: RecreatedCvResult) => {
    handleRecreatedSaved(res);
    setRecreateTab('recreate');
    setActiveView('recreate');
  };

  const handleOpenTool = (tool: WorkspaceToolTarget) => {
    if (tool === 'line-feedback' || tool === 'recreate') {
      setRecreateTab(tool);
      setActiveView('recreate');
      return;
    }
    setOfferToolTab(tool);
    setActiveView('tools');
  };

  const handleSelectHistory = (item: SavedCvHistoryItem) => {
    setCurrentSessionId(item.id);
    setCurrentAnalysis(item.analysis);
    setCurrentRecreated(item.recreated || null);
    if (item.targetRole) setTargetRole(item.targetRole);
    setActiveView('analysis');
  };

  const handleAddApplication = (appItem: Omit<CandidateApplication, 'id'>) => {
    const created: CandidateApplication = {
      ...appItem,
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    setApplications((prev) => [created, ...prev]);
    if (isFirebaseUser && currentUser) {
      saveApplicationToFirestore(currentUser.uid, created).catch((e) => console.error(e));
    }
  };

  const handleUpdateApplicationStatus = (id: string, status: ApplicationStatus) => {
    setApplications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
    if (isFirebaseUser && currentUser) {
      updateApplicationStatusInFirestore(currentUser.uid, id, status).catch((e) =>
        console.error(e)
      );
    }
  };

  const handleDeleteApplication = (id: string) => {
    setApplications((prev) => prev.filter((item) => item.id !== id));
    if (isFirebaseUser && currentUser) {
      deleteApplicationFromFirestore(currentUser.uid, id).catch((e) => console.error(e));
    }
  };

  const handleClearLocalData = () => {
    setHistory([]);
    setApplications([]);
    localStorage.removeItem(STORAGE_HISTORY_KEY);
    localStorage.removeItem(STORAGE_APPS_KEY);
  };

  const cvTextForTools = currentRecreated
    ? JSON.stringify(currentRecreated.cv)
    : currentAnalysis?.extractedText || '';

  const openAccountModal = (tab: 'account' | 'billing') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] pb-16 md:pb-0">
      {/* Executive SaaS 3-Zone Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Transparent EVOLYS Brand Mark */}
          <button
            type="button"
            onClick={() => setActiveView(currentAnalysis ? 'analysis' : 'import')}
            className="flex items-center whitespace-nowrap shrink-0 cursor-pointer rounded-md"
          >
            {!logoLoadError ? (
              <img
                src="/assets/aistudio/image_74900d68.png"
                alt="EVOLYS"
                onError={() => setLogoLoadError(true)}
                className="h-6 sm:h-7 w-auto object-contain dark:brightness-0 dark:invert"
              />
            ) : (
              <span className="font-display text-lg font-extrabold tracking-tight text-[var(--accent-text)]">
                EVOLYS
              </span>
            )}
          </button>

          {/* Zone 2: Desktop Single-Line Navigation */}
          <nav
            aria-label={isEn ? 'Primary Navigation' : 'Navigation principale'}
            className="hidden md:flex items-center gap-5 text-sm font-medium text-[var(--text-secondary)]"
          >
            <button
              type="button"
              onClick={() => setActiveView(currentAnalysis ? 'analysis' : 'import')}
              className={`min-h-[40px] flex items-center hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'analysis' || activeView === 'import'
                  ? 'text-[var(--accent-text)] font-semibold border-b-2 border-[var(--accent)]'
                  : ''
              }`}
            >
              {isEn ? 'Audit' : 'Analyse ATS'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (currentAnalysis) {
                  setRecreateTab('recreate');
                  setActiveView('recreate');
                } else {
                  setActiveView('import');
                }
              }}
              className={`min-h-[40px] flex items-center hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'recreate'
                  ? 'text-[var(--accent-text)] font-semibold border-b-2 border-[var(--accent)]'
                  : ''
              }`}
            >
              {isEn ? 'Recreate CV' : 'Recréer CV'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (currentAnalysis) {
                  setActiveView('tools');
                } else {
                  setActiveView('import');
                }
              }}
              className={`min-h-[40px] flex items-center hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'tools'
                  ? 'text-[var(--accent-text)] font-semibold border-b-2 border-[var(--accent)]'
                  : ''
              }`}
            >
              {isEn ? 'Jobs & Prep' : 'Offres & Entretien'}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('applications')}
              className={`min-h-[40px] flex items-center hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'applications'
                  ? 'text-[var(--accent-text)] font-semibold border-b-2 border-[var(--accent)]'
                  : ''
              }`}
            >
              {isEn ? 'Tracker' : 'Candidatures'}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('settings')}
              className={`min-h-[40px] flex items-center hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'settings'
                  ? 'text-[var(--accent-text)] font-semibold border-b-2 border-[var(--accent)]'
                  : ''
              }`}
            >
              {isEn ? 'Settings' : 'Réglages'}
            </button>
          </nav>

          {/* Zone 3: Theme Mode (Clair / Vert / Sombre) + Account + Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label={isEn ? 'Theme appearance' : 'Thème d’affichage'}
              className="flex items-center gap-0.5 p-0.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-lg shrink-0"
            >
              {(
                [
                  { id: 'light' as const, label: isEn ? 'Light' : 'Clair', icon: Sun },
                  { id: 'green' as const, label: isEn ? 'Green' : 'Vert', icon: Leaf },
                  { id: 'dark' as const, label: isEn ? 'Dark' : 'Sombre', icon: Moon },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const active = themeMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setThemeMode(m.id)}
                    title={m.label}
                    aria-label={m.label}
                    aria-pressed={active}
                    className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[var(--bg-surface)] text-[var(--accent-text)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden xl:inline">{m.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => openAccountModal(currentUser ? 'billing' : 'account')}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--accent-text)] bg-[var(--accent-soft)] hover:opacity-85 rounded-lg transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {currentUser
                  ? `${currentUser.firstName} · ${
                      currentUser.plan === 'premium'
                        ? 'Premium'
                        : currentUser.plan === 'standard'
                          ? 'Standard'
                          : isEn
                            ? '7d Trial'
                            : 'Essai 7j'
                    }`
                  : isEn
                    ? 'Account · 7d'
                    : 'Compte · 7j'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('import')}
              className="min-h-[38px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isEn ? 'Import CV' : 'Nouveau CV'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layer */}
      <main className="flex-1">
        {activeView === 'import' && (
          <ImportLanding
            language={language}
            targetRole={targetRole}
            onTargetRoleChange={setTargetRole}
            isAnalyzing={isAnalyzing}
            error={analyzeError}
            onAnalyzeFile={handleAnalyzeFile}
            onAnalyzeText={handleAnalyzeText}
            history={history}
            onSelectHistory={handleSelectHistory}
          />
        )}

        {activeView === 'analysis' && currentAnalysis && (
          <AnalysisDashboard
            analysis={currentAnalysis}
            targetRole={targetRole}
            onUpdateTargetRole={setTargetRole}
            onReanalyzeWithRole={handleReanalyzeWithRole}
            onReplaceCv={() => setActiveView('import')}
            onOpenTool={handleOpenTool}
            language={language}
            isReanalyzing={isAnalyzing}
          />
        )}

        {activeView === 'recreate' && currentAnalysis && (
          <CvRecreatorStudio
            analysis={currentAnalysis}
            recreatedResult={currentRecreated}
            onRecreatedSaved={handleRecreatedSaved}
            targetRole={targetRole}
            language={language}
            initialTab={recreateTab}
            onBackToAnalysis={() => setActiveView('analysis')}
          />
        )}

        {activeView === 'tools' && currentAnalysis && (
          <OfferAndToolsStudio
            analysis={currentAnalysis}
            cvTextForTools={cvTextForTools}
            targetRole={targetRole}
            userLocality={userLocality}
            onUserLocalityChange={setUserLocality}
            language={language}
            initialTab={offerToolTab}
            gmailAccessToken={gmailAccessToken}
            connectedEmail={currentUser?.email}
            onConnectGmail={handleGoogleLogin}
            onApplyTailoredCv={handleApplyTailoredCv}
            onBackToAnalysis={() => setActiveView('analysis')}
            onSaveApplication={handleAddApplication}
          />
        )}

        {activeView === 'applications' && (
          <ApplicationsTracker
            applications={applications}
            onAddApplication={handleAddApplication}
            onUpdateStatus={handleUpdateApplicationStatus}
            onDeleteApplication={handleDeleteApplication}
            defaultCandidateName={currentAnalysis?.structuredCv.fullName || ''}
            defaultJobTitle={targetRole}
            defaultAtsScore={currentAnalysis?.formatScore || 0}
            language={language}
          />
        )}

        {activeView === 'settings' && (
          <SettingsView
            language={language}
            onLanguageChange={setLanguage}
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
            targetRole={targetRole}
            onTargetRoleChange={setTargetRole}
            userLocality={userLocality}
            onUserLocalityChange={setUserLocality}
            currentUser={currentUser}
            gmailConnected={Boolean(gmailAccessToken)}
            onOpenAccountModal={openAccountModal}
            onOpenApplications={() => setActiveView('applications')}
            applicationsCount={applications.length}
            historyCount={history.length}
            onClearLocalData={handleClearLocalData}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label={isEn ? 'Mobile Tab Bar' : 'Barre d’onglets'}
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 flex items-center justify-around"
      >
        {[
          {
            id: 'analysis',
            label: isEn ? 'Audit' : 'Analyse',
            icon: Gauge,
            active: activeView === 'analysis' || activeView === 'import',
            onClick: () => setActiveView(currentAnalysis ? 'analysis' : 'import'),
          },
          {
            id: 'recreate',
            label: isEn ? 'Rebuild' : 'Recréer',
            icon: FileCheck2,
            active: activeView === 'recreate',
            onClick: () => {
              if (currentAnalysis) {
                setRecreateTab('recreate');
                setActiveView('recreate');
              } else {
                setActiveView('import');
              }
            },
          },
          {
            id: 'tools',
            label: isEn ? 'Jobs' : 'Offres',
            icon: SlidersHorizontal,
            active: activeView === 'tools',
            onClick: () => setActiveView(currentAnalysis ? 'tools' : 'import'),
          },
          {
            id: 'applications',
            label: isEn ? 'Tracker' : 'Suivi',
            icon: Briefcase,
            active: activeView === 'applications',
            onClick: () => setActiveView('applications'),
          },
          {
            id: 'settings',
            label: isEn ? 'Settings' : 'Réglages',
            icon: Settings,
            active: activeView === 'settings',
            onClick: () => setActiveView('settings'),
          },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={tab.onClick}
              className={`min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl text-[11px] font-semibold transition-colors whitespace-nowrap ${
                tab.active ? 'text-[var(--accent-text)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account, Trial & Payment Modal */}
      <AuthBillingModal
        isOpen={authModalOpen}
        initialTab={authModalTab}
        language={language}
        currentUser={currentUser}
        defaultLocality={userLocality}
        onClose={() => setAuthModalOpen(false)}
        onGoogleLogin={handleGoogleLogin}
        onAppleLogin={handleAppleLogin}
        onOtpLoginSuccess={handleOtpLoginSuccess}
        onPlanActivated={handlePlanActivated}
        onLogout={handleLogout}
      />

      {/* Clean Footer */}
      <footer className="border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] py-5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
          <p>
            EVOLYS · {isEn ? 'Building Tomorrow’s Skills' : 'Construire les compétences de demain'} ·{' '}
            {isEn
              ? 'Training · Employability · Digital Solutions'
              : 'Formation · Employabilité · Solutions Numériques'}
          </p>
          <p>
            {isEn
              ? 'EVOLYS Employability Suite — 7-day free trial, then $0.99/mo or $2.99/mo'
              : 'EVOLYS Employabilité — 7j d’essai gratuit puis 0,99 $/mois ou 2,99 $/mois'}
          </p>
        </div>
      </footer>
    </div>
  );
}
