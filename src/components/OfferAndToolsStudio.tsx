import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileEdit,
  Globe,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import {
  AppLanguage,
  CandidateApplication,
  CompanyCompatibilityResult,
  CoverLetterResult,
  CvAnalysisResult,
  InterviewPrepResult,
  JobListingItem,
  JobMatchResult,
  JobSearchResult,
  RecreatedCvResult,
} from '../types';
import {
  companyCompatibilityRequest,
  compareOfferRequest,
  generateCoverLetterRequest,
  generateInterviewPrepRequest,
  parseExternalOfferUrlRequest,
  searchLocalizedJobsRequest,
  tailorCvToOfferRequest,
} from '../utils/api';
import { exportCoverLetterToPdf } from '../utils/pdfExport';
import { createDraftViaGmail, sendApplicationViaGmail } from '../utils/gmail';
import { GoogleSignInButton } from './GoogleSignInButton';

export type OfferToolTab =
  | 'job-feed'
  | 'compare-offer'
  | 'companies'
  | 'cover-letter'
  | 'interview';

interface OfferAndToolsStudioProps {
  analysis: CvAnalysisResult;
  cvTextForTools: string;
  targetRole: string;
  userLocality: string;
  onUserLocalityChange: (loc: string) => void;
  language: AppLanguage;
  initialTab?: OfferToolTab;
  gmailAccessToken: string | null;
  connectedEmail?: string;
  onConnectGmail: () => Promise<void>;
  onApplyTailoredCv: (res: RecreatedCvResult) => void;
  onBackToAnalysis: () => void;
  onSaveApplication: (app: Omit<CandidateApplication, 'id'>) => void;
}

export const OfferAndToolsStudio: React.FC<OfferAndToolsStudioProps> = ({
  analysis,
  cvTextForTools,
  targetRole,
  userLocality,
  onUserLocalityChange,
  language,
  initialTab = 'job-feed',
  gmailAccessToken,
  connectedEmail,
  onConnectGmail,
  onApplyTailoredCv,
  onBackToAnalysis,
  onSaveApplication,
}) => {
  const isEn = language === 'en';
  const [activeTab, setActiveTab] = useState<OfferToolTab>(initialTab);

  // Active Target Job Context shared across Feed, Compare, Cover Letter & Interview Prep
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState(targetRole || analysis.structuredCv.headline || '');
  const [jobOfferText, setJobOfferText] = useState('');
  const [externalOfferUrl, setExternalOfferUrl] = useState('');
  const [loadingUrlImport, setLoadingUrlImport] = useState(false);

  // Job Feed State
  const [feedQuery, setFeedQuery] = useState(
    targetRole || analysis.structuredCv.headline || 'Développeur / Gestionnaire / Commercial'
  );
  const [feedResult, setFeedResult] = useState<JobSearchResult | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [tailoringJobId, setTailoringJobId] = useState<string | null>(null);

  // Compare & Tailor State
  const [matchResult, setMatchResult] = useState<JobMatchResult | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [loadingTailor, setLoadingTailor] = useState(false);

  // 5 Giants State
  const [customCompanies, setCustomCompanies] = useState(
    'Google, Microsoft, Orange, Deloitte, Société Générale'
  );
  const [companyResult, setCompanyResult] = useState<CompanyCompatibilityResult | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  // Cover Letter + Gmail Composer State
  const [letterTone, setLetterTone] = useState<'professionnel' | 'dynamique' | 'sobre'>(
    'professionnel'
  );
  const [coverLetter, setCoverLetter] = useState<CoverLetterResult | null>(null);
  const [editedLetterText, setEditedLetterText] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [includeCvSummaryInEmail, setIncludeCvSummaryInEmail] = useState(true);
  const [loadingLetter, setLoadingLetter] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [savedToTracker, setSavedToTracker] = useState(false);
  const [showGmailConfirmModal, setShowGmailConfirmModal] = useState(false);
  const [sendingGmail, setSendingGmail] = useState(false);
  const [gmailNotice, setGmailNotice] = useState<string | null>(null);

  // Interview Prep State
  const [interviewPrep, setInterviewPrep] = useState<InterviewPrepResult | null>(null);
  const [loadingInterview, setLoadingInterview] = useState(false);
  const [revealedStarIds, setRevealedStarIds] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const buildEmailBodyWithCvSummary = () => {
    const base = editedLetterText.trim();
    if (!includeCvSummaryInEmail) return base;
    const cv = analysis.structuredCv;
    const topExps = cv.experiences
      .slice(0, 3)
      .map((e) => `• ${e.role} — ${e.company} (${e.period})`)
      .join('\n');
    const summaryBlock = [
      '',
      '---',
      `${isEn ? 'CANDIDATE PROFILE SUMMARY' : 'SYNTHÈSE DU PROFIL CANDIDAT'} — ${cv.fullName}`,
      cv.headline ? `${cv.headline}` : '',
      cv.email || cv.phone || cv.location
        ? `${[cv.email, cv.phone, cv.location].filter(Boolean).join(' · ')}`
        : '',
      topExps ? `\n${isEn ? 'Key Experiences' : 'Expériences principales'}:\n${topExps}` : '',
      cv.skills.length > 0
        ? `\n${isEn ? 'Core Skills' : 'Compétences clés'}: ${cv.skills.slice(0, 12).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    return `${base}\n${summaryBlock}`;
  };

  const handleImportExternalUrl = async () => {
    if (!externalOfferUrl.trim()) return;
    setLoadingUrlImport(true);
    setError(null);
    try {
      const parsed = await parseExternalOfferUrlRequest({
        url: externalOfferUrl.trim(),
        language,
      });
      if (parsed.jobTitle) setJobTitle(parsed.jobTitle);
      if (parsed.company) setCompanyName(parsed.company);
      if (parsed.description) setJobOfferText(parsed.description);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de lire ce lien. Copiez-collez directement le texte de l’offre.'
      );
    } finally {
      setLoadingUrlImport(false);
    }
  };

  const handleSearchJobs = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoadingFeed(true);
    setError(null);
    try {
      const res = await searchLocalizedJobsRequest({
        query: feedQuery.trim() || targetRole || 'emploi',
        locality: userLocality.trim() || "Côte d'Ivoire",
        language,
      });
      setFeedResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la recherche d’offres.');
    } finally {
      setLoadingFeed(false);
    }
  };

  const selectJobIntoContext = (job: JobListingItem) => {
    setCompanyName(job.company);
    setJobTitle(job.title);
    setJobOfferText(
      `${job.title} — ${job.company} (${job.location})\nSource : ${job.source}\n\n${job.description || job.summary}`
    );
    setEmailSubject(
      isEn
        ? `Application: ${job.title} — ${analysis.structuredCv.fullName}`
        : `Candidature : ${job.title} — ${analysis.structuredCv.fullName}`
    );
  };

  const handleTailorCvToOffer = async (
    offerTextArg?: string,
    titleArg?: string,
    companyArg?: string,
    jobId?: string
  ) => {
    const finalOffer = (offerTextArg ?? jobOfferText).trim();
    if (!finalOffer) {
      setError(
        isEn
          ? 'Select a job or paste a job description first.'
          : 'Sélectionnez une offre ou collez le texte de l’offre d’abord.'
      );
      return;
    }
    if (jobId) setTailoringJobId(jobId);
    else setLoadingTailor(true);
    setError(null);
    try {
      const res = await tailorCvToOfferRequest({
        extractedText: analysis.extractedText,
        structuredCv: analysis.structuredCv,
        jobOfferText: finalOffer,
        jobTitle: (titleArg ?? jobTitle).trim(),
        company: (companyArg ?? companyName).trim(),
        tone: 'evolys-modern',
        language,
      });
      onApplyTailoredCv(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la réadaptation du CV.');
    } finally {
      setTailoringJobId(null);
      setLoadingTailor(false);
    }
  };

  const handleRunOfferCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobOfferText.trim()) return;
    setLoadingMatch(true);
    setError(null);
    try {
      const res = await compareOfferRequest({
        cvText: cvTextForTools,
        jobOfferText: jobOfferText.trim(),
        jobTitle: jobTitle.trim(),
        company: companyName.trim(),
        language,
      });
      setMatchResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la comparaison.');
    } finally {
      setLoadingMatch(false);
    }
  };

  const handleRunCompanies = async () => {
    setLoadingCompanies(true);
    setError(null);
    try {
      const list = customCompanies
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 5);
      const res = await companyCompatibilityRequest({
        cvText: cvTextForTools,
        targetRole: jobTitle || targetRole,
        companies: list.length === 5 ? list : undefined,
        language,
      });
      setCompanyResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’évaluation.');
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleGenerateLetter = async () => {
    setLoadingLetter(true);
    setError(null);
    setSavedToTracker(false);
    setGmailNotice(null);
    try {
      const res = await generateCoverLetterRequest({
        cvText: cvTextForTools,
        jobOfferText: jobOfferText.trim(),
        companyName: companyName.trim(),
        jobTitle: jobTitle.trim() || targetRole,
        tone: letterTone,
        language,
      });
      setCoverLetter(res);
      setEditedLetterText(res.fullText);
      setEmailSubject(res.subject);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération de la lettre.');
    } finally {
      setLoadingLetter(false);
    }
  };

  const handleSendViaGmailConfirmed = async () => {
    if (!gmailAccessToken) return;
    setSendingGmail(true);
    setError(null);
    setGmailNotice(null);
    try {
      const finalBody = buildEmailBodyWithCvSummary();
      const sent = await sendApplicationViaGmail({
        accessToken: gmailAccessToken,
        to: recipientEmail.trim(),
        subject:
          emailSubject.trim() ||
          `Candidature : ${jobTitle || targetRole || 'Poste'} — ${analysis.structuredCv.fullName}`,
        body: finalBody,
      });

      onSaveApplication({
        candidateName: analysis.structuredCv.fullName || analysis.fileName,
        company: companyName.trim() || (isEn ? 'Target Company' : 'Entreprise ciblée'),
        jobTitle: jobTitle.trim() || targetRole || (isEn ? 'Target Role' : 'Poste visé'),
        recipientEmail: recipientEmail.trim(),
        status: 'envoye',
        appliedDate: new Date().toISOString().slice(0, 10),
        atsScoreSnapshot: analysis.formatScore,
        notes: `Envoyé via Gmail (${recipientEmail.trim()})`,
        coverLetterSnapshot: editedLetterText,
        gmailMessageId: sent.id,
      });

      setShowGmailConfirmModal(false);
      setSavedToTracker(true);
      setGmailNotice(
        isEn
          ? `Application sent via Gmail to ${recipientEmail.trim()} and logged in Tracker.`
          : `Candidature envoyée via Gmail à ${recipientEmail.trim()} et ajoutée au suivi.`
      );
    } catch (err) {
      setShowGmailConfirmModal(false);
      setError(err instanceof Error ? err.message : 'Échec de l’envoi Gmail.');
    } finally {
      setSendingGmail(false);
    }
  };

  const handleCreateGmailDraft = async () => {
    if (!gmailAccessToken) return;
    setSendingGmail(true);
    setError(null);
    setGmailNotice(null);
    try {
      await createDraftViaGmail({
        accessToken: gmailAccessToken,
        to: recipientEmail.trim(),
        subject:
          emailSubject.trim() ||
          `Candidature : ${jobTitle || targetRole || 'Poste'} — ${analysis.structuredCv.fullName}`,
        body: buildEmailBodyWithCvSummary(),
      });
      setGmailNotice(
        isEn
          ? 'Draft saved in your Gmail Drafts folder.'
          : 'Brouillon enregistré dans votre boîte Gmail.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du brouillon.');
    } finally {
      setSendingGmail(false);
    }
  };

  const handleRunInterviewPrep = async () => {
    setLoadingInterview(true);
    setError(null);
    try {
      const res = await generateInterviewPrepRequest({
        cvText: cvTextForTools,
        targetRole: jobTitle || targetRole,
        jobOfferText: jobOfferText.trim(),
        language,
      });
      setInterviewPrep(res);
      setRevealedStarIds(res.questions.map((q) => q.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la préparation.');
    } finally {
      setLoadingInterview(false);
    }
  };

  const handleCopyLetter = async () => {
    if (!editedLetterText) return;
    await navigator.clipboard.writeText(editedLetterText);
    setCopiedLetter(true);
    setTimeout(() => setCopiedLetter(false), 2000);
  };

  const handleSaveLetterApplication = () => {
    onSaveApplication({
      candidateName: analysis.structuredCv.fullName || analysis.fileName,
      company: companyName.trim() || (isEn ? 'Target Company' : 'Entreprise ciblée'),
      jobTitle: jobTitle.trim() || targetRole || (isEn ? 'Target Role' : 'Poste visé'),
      recipientEmail: recipientEmail.trim() || undefined,
      status: 'a_envoyer',
      appliedDate: new Date().toISOString().slice(0, 10),
      atsScoreSnapshot: analysis.formatScore,
      notes: matchResult
        ? `Correspondance offre : ${matchResult.matchScore}%`
        : 'Lettre générée via EVOLYS Studio',
      coverLetterSnapshot: editedLetterText,
    });
    setSavedToTracker(true);
  };

  const toggleStarReveal = (id: string) => {
    setRevealedStarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Functional Workspace Toolbar */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToAnalysis}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {isEn ? 'Audit' : 'Diagnostic'}
          </button>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              {isEn
                ? 'Jobs, CV Tailoring, Gmail & Interview Prep'
                : 'Offres locales, Adaptation CV, Gmail & Entretien'}
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              {analysis.structuredCv.fullName || analysis.fileName}
              {jobTitle ? ` · ${jobTitle}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl">
          {(
            [
              { id: 'job-feed', label: isEn ? 'Job Feed' : 'Offres d’emploi', icon: Globe },
              { id: 'compare-offer', label: isEn ? 'Compare & Adapt' : 'Comparer & Adapter', icon: Target },
              { id: 'companies', label: isEn ? '5 Giants' : '5 géants', icon: Building2 },
              { id: 'cover-letter', label: isEn ? 'Letter & Gmail' : 'Lettre & Gmail', icon: Mail },
              { id: 'interview', label: isEn ? 'Interview Prep' : 'Entretien STAR', icon: MessageSquare },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setError(null);
                  setActiveTab(tab.id);
                }}
                className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl text-sm border"
          style={{
            backgroundColor: 'var(--status-err-bg)',
            color: 'var(--status-err)',
            borderColor: 'var(--status-err)',
          }}
        >
          {error}
        </div>
      )}

      {/* TAB 1: Localized Live Job Feed + External Offer Importer */}
      {activeTab === 'job-feed' && (
        <div className="space-y-6">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {isEn
                    ? 'Localized Job Feed (LinkedIn, Indeed & Local Portals)'
                    : 'Flux d’offres d’emploi localisé (LinkedIn, Indeed & Portails locaux)'}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {isEn
                    ? 'Automatically prioritizes local job boards (e.g. Emploi Jeunes CI, Jobivoire, Educarriere, Emploi Rapide Net) alongside LinkedIn & Indeed.'
                    : 'Priorise les sites locaux selon votre pays (ex. Côte d’Ivoire : Emploi Jeunes CI, Jobivoire, Educarriere, Emploi Rapide Net) + LinkedIn & Indeed.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Côte d'Ivoire", 'Abidjan', 'Sénégal', 'France', 'Canada'].map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => onUserLocalityChange(loc)}
                    className={`min-h-[30px] px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer transition-colors ${
                      userLocality.toLowerCase() === loc.toLowerCase()
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent)]'
                        : 'bg-[var(--bg-grouped)] text-[var(--text-secondary)] border-[var(--border-hairline)]'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleSearchJobs}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
            >
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={feedQuery}
                  onChange={(e) => setFeedQuery(e.target.value)}
                  placeholder={
                    isEn ? 'Job title or keywords...' : 'Métier ou mots-clés (ex : Comptable, Développeur)...'
                  }
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
              <div className="md:col-span-4 relative">
                <MapPin className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userLocality}
                  onChange={(e) => onUserLocalityChange(e.target.value)}
                  placeholder="Côte d'Ivoire, Abidjan, Dakar..."
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={loadingFeed}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 rounded-xl cursor-pointer"
                >
                  {loadingFeed ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  {loadingFeed
                    ? isEn
                      ? 'Searching...'
                      : 'Recherche en cours...'
                    : isEn
                      ? 'Search Live Jobs'
                      : 'Rechercher les offres'}
                </button>
              </div>
            </form>

            {/* Import External Offer by Link or Paste */}
            <div className="pt-4 border-t border-[var(--border-hairline)] space-y-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {isEn
                  ? 'Or import an external offer (paste URL from LinkedIn, Jobivoire, Indeed...)'
                  : 'Ou importer une offre extérieure par lien URL (LinkedIn, Jobivoire, Educarriere, Indeed...)'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={externalOfferUrl}
                    onChange={(e) => setExternalOfferUrl(e.target.value)}
                    placeholder="https://www.jobivoire.ci/offre/... ou https://linkedin.com/jobs/..."
                    className="w-full min-h-[42px] pl-10 pr-3.5 py-2 text-xs bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                  />
                </div>
                <button
                  type="button"
                  disabled={loadingUrlImport || !externalOfferUrl.trim()}
                  onClick={async () => {
                    await handleImportExternalUrl();
                    setActiveTab('compare-offer');
                  }}
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--accent-text)] bg-[var(--accent-soft)] hover:opacity-85 disabled:opacity-50 rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                >
                  {loadingUrlImport ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {isEn ? 'Extract Offer & Adapt CV' : 'Importer l’offre & Adapter'}
                </button>
              </div>
            </div>
          </div>

          {/* Live Job Cards */}
          {feedResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  {feedResult.jobs.length}{' '}
                  {isEn
                    ? `live opportunities found for "${feedResult.locality}"`
                    : `offres détectées pour « ${feedResult.locality} »`}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {feedResult.sourcesUsed.join(' · ')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feedResult.jobs.map((job, idx) => {
                  const rowId = job.id || `job_${idx}`;
                  const isTailoringThis = tailoringJobId === rowId;
                  return (
                    <article
                      key={rowId}
                      className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                              {job.source} {job.contractType ? `· ${job.contractType}` : ''}
                            </p>
                            <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5 leading-snug">
                              {job.title}
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              {job.company} · {job.location}
                              {job.publishedAt ? ` · ${job.publishedAt}` : ''}
                            </p>
                          </div>
                          {job.url && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-[34px] min-h-[34px] rounded-xl bg-[var(--bg-grouped)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-text)] shrink-0"
                              title={isEn ? 'Open original job post' : 'Voir l’annonce originale'}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          {job.summary || job.description}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-[var(--border-hairline)] flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isTailoringThis}
                          onClick={() => {
                            selectJobIntoContext(job);
                            handleTailorCvToOffer(
                              job.description || job.summary,
                              job.title,
                              job.company,
                              rowId
                            );
                          }}
                          className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer disabled:opacity-60"
                        >
                          {isTailoringThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileEdit className="w-3.5 h-3.5" />
                          )}
                          {isEn ? 'Adapt & Recreate CV' : 'Adapter mon CV à cette offre'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            selectJobIntoContext(job);
                            setActiveTab('compare-offer');
                          }}
                          className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl cursor-pointer hover:bg-[var(--bg-elevated)]"
                        >
                          {isEn ? 'Analyze' : 'Analyser'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            selectJobIntoContext(job);
                            setActiveTab('cover-letter');
                          }}
                          className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl cursor-pointer hover:bg-[var(--bg-elevated)]"
                        >
                          <Mail className="w-3 h-3" />
                          {isEn ? 'Apply' : 'Postuler'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            selectJobIntoContext(job);
                            setActiveTab('interview');
                          }}
                          className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl cursor-pointer hover:bg-[var(--bg-elevated)]"
                        >
                          <MessageSquare className="w-3 h-3" />
                          STAR
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {feedResult.groundingLinks.length > 0 && (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                    {isEn ? 'Verified Search Sources' : 'Sources vérifiées consultées'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {feedResult.groundingLinks.slice(0, 6).map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-[var(--accent-text)] bg-[var(--accent-soft)] rounded-lg hover:underline"
                      >
                        {src.title}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Compare & Tailor CV to Any Offer */}
      {activeTab === 'compare-offer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleRunOfferCompare}
            className="lg:col-span-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {isEn ? 'Compare & Adapt CV to an Offer' : 'Comparer & Réadapter le CV à une offre'}
            </h2>

            <div className="flex gap-2">
              <input
                type="url"
                value={externalOfferUrl}
                onChange={(e) => setExternalOfferUrl(e.target.value)}
                placeholder={
                  isEn ? 'Paste offer URL to auto-fill...' : 'Coller le lien URL de l’offre...'
                }
                className="flex-1 min-h-[40px] px-3 py-1.5 text-xs bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
              />
              <button
                type="button"
                disabled={loadingUrlImport || !externalOfferUrl.trim()}
                onClick={handleImportExternalUrl}
                className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-[var(--accent-text)] bg-[var(--accent-soft)] rounded-xl cursor-pointer disabled:opacity-50"
              >
                {loadingUrlImport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEn ? 'Fetch' : 'Lire lien'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isEn ? 'Company' : 'Entreprise'}
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex : Orange CI, MTN..."
                  className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isEn ? 'Job Title' : 'Intitulé du poste'}
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Ex : Chargé de projet"
                  className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {isEn ? 'Job Description' : 'Texte de l’offre d’emploi'}
              </label>
              <textarea
                rows={8}
                value={jobOfferText}
                onChange={(e) => setJobOfferText(e.target.value)}
                placeholder={
                  isEn
                    ? 'Paste the full job requirements and responsibilities...'
                    : 'Collez ici les missions et compétences demandées dans l’offre...'
                }
                className="w-full p-3 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="submit"
                disabled={loadingMatch || !jobOfferText.trim()}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-grouped)] hover:bg-[var(--bg-elevated)] border border-[var(--border-hairline)] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
              >
                {loadingMatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                {isEn ? 'Keyword Match' : 'Analyser les écarts'}
              </button>
              <button
                type="button"
                disabled={loadingTailor || !jobOfferText.trim()}
                onClick={() => handleTailorCvToOffer()}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
              >
                {loadingTailor ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileEdit className="w-4 h-4" />}
                {loadingTailor
                  ? isEn
                    ? 'Rewriting CV...'
                    : 'Réadaptation...'
                  : isEn
                    ? 'Rewrite CV for Offer'
                    : 'Réécrire mon CV pour l’offre'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-7 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6">
            {!matchResult ? (
              <div className="py-16 text-center space-y-2">
                <Target className="w-8 h-8 text-[var(--accent-text)] mx-auto opacity-80" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {isEn
                    ? 'Paste a job description or URL to inspect keywords or rewrite your CV'
                    : 'Collez une offre ou son lien pour analyser les mots-clés et réadapter votre CV'}
                </p>
                <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                  {isEn
                    ? 'EVOLYS aligns your headline, summary, bullets, and skills strictly using your real experience.'
                    : 'EVOLYS réaligne votre titre, accroche, réalisations et compétences sur l’offre sans rien inventer.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-4">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                      {isEn ? 'Offer Alignment' : 'Adéquation avec l’offre'}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {matchResult.roleFitSummary}
                    </p>
                  </div>
                  <div className="text-right shrink-0 pl-4">
                    <span className="font-mono-tabular text-3xl font-bold text-[var(--accent-text)]">
                      {matchResult.matchScore}%
                    </span>
                    <p className="text-xs text-[var(--text-secondary)]">Match ATS</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                      style={{ color: 'var(--status-ok)' }}
                    >
                      {isEn ? 'Matched Keywords' : 'Mots-clés présents'} (
                      {matchResult.matchedKeywords.length})
                    </p>
                    <ul className="space-y-1.5 text-xs text-[var(--text-primary)]">
                      {matchResult.matchedKeywords.map((kw, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <CheckCircle2
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: 'var(--status-ok)' }}
                          />
                          <span>{kw}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                      style={{ color: 'var(--status-err)' }}
                    >
                      {isEn ? 'Missing Keywords' : 'Mots-clés manquants'} (
                      {matchResult.missingKeywords.length})
                    </p>
                    <ul className="space-y-1.5 text-xs text-[var(--text-primary)]">
                      {matchResult.missingKeywords.map((kw, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <XCircle
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: 'var(--status-err)' }}
                          />
                          <span>{kw}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2.5">
                    {isEn ? 'Recommended Adjustments' : 'Ce qu’il faut ajouter et où'}
                  </p>
                  <div className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-2xl">
                    {matchResult.exactAdditions.map((add, i) => (
                      <div key={i} className="p-4 text-xs">
                        <p className="font-semibold text-[var(--accent-text)]">
                          {add.targetSection}
                        </p>
                        <p className="text-[var(--text-primary)] font-medium mt-1">
                          {add.suggestion}
                        </p>
                        <p className="text-[var(--text-secondary)] mt-1">{add.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: 5 Giants */}
      {activeTab === 'companies' && (
        <div className="space-y-6">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                {isEn
                  ? '5 Major Employers to Benchmark Against (comma separated)'
                  : '5 grands employeurs de référence (modifiables, séparés par virgule)'}
              </label>
              <input
                type="text"
                value={customCompanies}
                onChange={(e) => setCustomCompanies(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
              />
            </div>
            <button
              type="button"
              disabled={loadingCompanies}
              onClick={handleRunCompanies}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loadingCompanies ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Building2 className="w-4 h-4" />
              )}
              {loadingCompanies
                ? isEn
                  ? 'Benchmarking...'
                  : 'Évaluation...'
                : isEn
                  ? 'Evaluate 5 Giants Match'
                  : 'Évaluer · 5 géants'}
            </button>
          </div>

          {companyResult && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {companyResult.overallReadiness}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {companyResult.companies.map((comp) => (
                  <div
                    key={comp.company}
                    className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                          {comp.company}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {comp.sector} · {comp.verdict}
                        </p>
                      </div>
                      <span className="font-mono-tabular text-xl font-bold text-[var(--accent-text)]">
                        {comp.compatibilityScore}%
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <p
                          className="font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--status-ok)' }}
                        >
                          {isEn ? 'Strengths' : 'Atouts détectés'}
                        </p>
                        <ul className="mt-1 space-y-1 text-[var(--text-primary)]">
                          {comp.keyStrengths.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p
                          className="font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--status-warn)' }}
                        >
                          {isEn ? 'Priority Gaps' : 'Écarts à combler'}
                        </p>
                        <ul className="mt-1 space-y-1 text-[var(--text-secondary)]">
                          {comp.priorityGaps.map((g, i) => (
                            <li key={i}>• {g}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Tailored Cover Letter & Direct Gmail Application Send */}
      {activeTab === 'cover-letter' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {isEn ? 'Tailored Cover Letter' : 'Lettre de motivation sur mesure'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {isEn
                ? 'Generated strictly from verified facts in your CV, then ready to send via Gmail.'
                : 'Rédigée uniquement à partir de votre CV réel, puis prête à être envoyée par Gmail.'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isEn ? 'Company Name' : 'Nom de l’entreprise'}
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex : EVOLYS, Orange Côte d'Ivoire..."
                  className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isEn ? 'Target Position' : 'Poste visé'}
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Ex : Chef de projet numérique"
                  className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isEn ? 'Tone' : 'Ton de rédaction'}
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl">
                  {(['professionnel', 'dynamique', 'sobre'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setLetterTone(t)}
                      className={`min-h-[36px] py-1.5 text-xs font-semibold rounded-lg capitalize cursor-pointer ${
                        letterTone === t
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isEn ? 'Job Offer Details (optional)' : 'Détails de l’offre (optionnel)'}
                </label>
                <textarea
                  rows={5}
                  value={jobOfferText}
                  onChange={(e) => setJobOfferText(e.target.value)}
                  placeholder={
                    isEn ? 'Paste offer details if available...' : 'Collez l’offre si disponible...'
                  }
                  className="w-full p-3 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={loadingLetter}
              onClick={handleGenerateLetter}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
            >
              {loadingLetter ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loadingLetter
                ? isEn
                  ? 'Drafting letter...'
                  : 'Rédaction en cours...'
                : isEn
                  ? 'Generate Cover Letter'
                  : 'Générer la lettre sur mesure'}
            </button>
          </div>

          <div className="lg:col-span-7 space-y-5">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-4">
              {!coverLetter && !editedLetterText ? (
                <div className="py-12 text-center space-y-2">
                  <Briefcase className="w-8 h-8 text-[var(--accent-text)] mx-auto opacity-80" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {isEn
                      ? 'Your tailored cover letter will appear here'
                      : 'Votre lettre de motivation personnalisée apparaîtra ici'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-hairline)]">
                    <p className="text-xs font-semibold text-[var(--accent-text)] truncate">
                      {emailSubject || coverLetter?.subject}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyLetter}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--bg-grouped)] hover:bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl cursor-pointer"
                      >
                        {copiedLetter ? (
                          <Check className="w-3.5 h-3.5" style={{ color: 'var(--status-ok)' }} />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedLetter ? (isEn ? 'Copied' : 'Copié') : isEn ? 'Copy' : 'Copier'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          exportCoverLetterToPdf(
                            editedLetterText,
                            analysis.structuredCv.fullName,
                            companyName
                          )
                        }
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveLetterApplication}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--accent-text)] bg-[var(--accent-soft)] rounded-xl cursor-pointer"
                      >
                        {savedToTracker ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        {savedToTracker
                          ? isEn
                            ? 'Saved'
                            : 'Ajouté au suivi'
                          : isEn
                            ? 'Track'
                            : 'Suivre'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={editedLetterText}
                    onChange={(e) => setEditedLetterText(e.target.value)}
                    className="w-full p-4 text-sm text-[var(--text-primary)] bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl leading-relaxed"
                  />
                </>
              )}
            </div>

            {/* Direct Gmail Application Sender */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {isEn ? 'Send Application via Gmail' : 'Créer et envoyer la candidature via Gmail'}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {gmailAccessToken
                        ? isEn
                          ? `Connected as ${connectedEmail || 'Google Account'}`
                          : `Connecté (${connectedEmail || 'Compte Gmail prêt'})`
                        : isEn
                          ? 'Authorize Gmail access to create drafts and send directly.'
                          : 'Connectez votre compte Gmail pour enregistrer un brouillon ou postuler directement.'}
                    </p>
                  </div>
                </div>
              </div>

              {gmailNotice && (
                <div
                  className="p-3 rounded-xl text-xs font-medium flex items-center gap-2"
                  style={{ backgroundColor: 'var(--status-ok-bg)', color: 'var(--status-ok)' }}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{gmailNotice}</span>
                </div>
              )}

              {!gmailAccessToken ? (
                <div className="max-w-xs">
                  <GoogleSignInButton
                    onClick={onConnectGmail}
                    label={isEn ? 'Sign in with Google' : 'Connecter Gmail avec Google'}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {isEn ? 'Recruiter Email *' : 'E-mail du recruteur *'}
                      </label>
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="recrutement@entreprise.ci"
                        className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {isEn ? 'Email Subject *' : 'Objet de l’e-mail *'}
                      </label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder={`Candidature : ${jobTitle || 'Poste'} — ${analysis.structuredCv.fullName}`}
                        className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCvSummaryInEmail}
                      onChange={(e) => setIncludeCvSummaryInEmail(e.target.checked)}
                      className="rounded accent-[var(--accent)]"
                    />
                    {isEn
                      ? 'Include structured CV summary below the cover letter'
                      : 'Joindre automatiquement la synthèse structurée de mon CV sous la lettre'}
                  </label>

                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={sendingGmail || !editedLetterText.trim()}
                      onClick={handleCreateGmailDraft}
                      className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-grouped)] hover:bg-[var(--bg-elevated)] border border-[var(--border-hairline)] disabled:opacity-50 rounded-xl cursor-pointer"
                    >
                      {isEn ? 'Save Gmail Draft' : 'Enregistrer en brouillon Gmail'}
                    </button>
                    <button
                      type="button"
                      disabled={sendingGmail || !recipientEmail.trim() || !editedLetterText.trim()}
                      onClick={() => setShowGmailConfirmModal(true)}
                      className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 rounded-xl cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {isEn ? 'Send Application via Gmail' : 'Envoyer la candidature via Gmail'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Personalized Interview Prep + STAR Method Responses */}
      {activeTab === 'interview' && (
        <div className="space-y-6">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {isEn
                    ? 'Personalized Interview Prep (STAR Method)'
                    : 'Préparation personnalisée à l’entretien (Méthode STAR)'}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {isEn
                    ? 'Generates tailored questions & STAR responses grounded in your analyzed CV and target job description.'
                    : 'Génère des questions ciblées et des réponses STAR basées sur votre CV analysé et l’offre visée.'}
                </p>
              </div>
              <button
                type="button"
                disabled={loadingInterview}
                onClick={handleRunInterviewPrep}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {loadingInterview ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageSquare className="w-4 h-4" />
                )}
                {loadingInterview
                  ? isEn
                    ? 'Preparing STAR Coaching...'
                    : 'Génération des questions STAR...'
                  : isEn
                    ? 'Generate Personalized Interview Prep'
                    : 'Générer mes questions & réponses STAR'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-[var(--border-hairline)]">
              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isEn ? 'Target Role' : 'Poste visé'}
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Ex : Responsable Commercial, Développeur..."
                  className="w-full min-h-[40px] px-3 py-2 text-xs bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
              <div className="md:col-span-8">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isEn ? 'Target Job Description (enhances STAR specificity)' : 'Description de l’offre ciblée (affine les questions)'}
                </label>
                <textarea
                  rows={2}
                  value={jobOfferText}
                  onChange={(e) => setJobOfferText(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Paste the target job description or select a job from the Job Feed...'
                      : 'Collez l’offre ciblée (ou sélectionnez-en une dans l’onglet Offres d’emploi)...'
                  }
                  className="w-full p-2.5 text-xs bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                />
              </div>
            </div>
          </div>

          {interviewPrep && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {interviewPrep.focusSummary}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {interviewPrep.questions.map((q, index) => {
                  const isOpen = revealedStarIds.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[var(--accent-text)] uppercase tracking-wider">
                          {String(index + 1).padStart(2, '0')}. {q.category}
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleStarReveal(q.id)}
                          className="text-[11px] font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                        >
                          {isOpen
                            ? isEn
                              ? 'Hide STAR guide'
                              : 'Masquer STAR'
                            : isEn
                              ? 'Show STAR guide'
                              : 'Voir réponse STAR'}
                        </button>
                      </div>

                      <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                        {q.question}
                      </h3>

                      <div className="text-xs space-y-3 pt-1">
                        <div>
                          <p className="font-semibold text-[var(--text-secondary)]">
                            {isEn ? 'What the recruiter checks:' : 'Ce que le recruteur vérifie :'}
                          </p>
                          <p className="text-[var(--text-primary)] mt-0.5">{q.whyRecruiterAsks}</p>
                        </div>

                        {isOpen && (
                          <div className="space-y-2.5">
                            {q.starBreakdown && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {[
                                  { k: 'S · Situation', v: q.starBreakdown.situation },
                                  { k: 'T · Tâche', v: q.starBreakdown.task },
                                  { k: 'A · Action', v: q.starBreakdown.action },
                                  { k: 'R · Résultat', v: q.starBreakdown.result },
                                ].map((part) => (
                                  <div
                                    key={part.k}
                                    className="p-2.5 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                                  >
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                                      {part.k}
                                    </p>
                                    <p className="text-xs text-[var(--text-primary)] mt-0.5 leading-relaxed">
                                      {part.v}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="p-3.5 bg-[var(--accent-soft)]/50 border border-[var(--border-hairline)] rounded-xl">
                              <p className="font-semibold text-[var(--accent-text)]">
                                {isEn ? 'Complete STAR Oral Answer:' : 'Réponse orale fluide (STAR) :'}
                              </p>
                              <p className="text-[var(--text-primary)] mt-0.5 leading-relaxed">
                                {q.starAnswerGuide}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mandatory Explicit Gmail Send Confirmation Modal */}
      {showGmailConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              {isEn ? 'Confirm Sending via Gmail' : 'Confirmer l’envoi via Gmail'}
            </h3>
            <div className="p-4 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl text-xs space-y-1.5">
              <p>
                <span className="text-[var(--text-secondary)]">
                  {isEn ? 'To: ' : 'Destinataire : '}
                </span>
                <span className="font-semibold text-[var(--text-primary)]">{recipientEmail}</span>
              </p>
              <p>
                <span className="text-[var(--text-secondary)]">
                  {isEn ? 'Subject: ' : 'Objet : '}
                </span>
                <span className="font-semibold text-[var(--text-primary)]">{emailSubject}</span>
              </p>
              <p>
                <span className="text-[var(--text-secondary)]">
                  {isEn ? 'Company: ' : 'Entreprise : '}
                </span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {companyName || 'Entreprise ciblée'}
                </span>
              </p>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {isEn
                ? 'This email will be sent immediately from your connected Gmail account and logged in your Applications Tracker.'
                : 'Cet e-mail sera envoyé immédiatement depuis votre compte Gmail connecté et enregistré dans votre suivi des candidatures.'}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={sendingGmail}
                onClick={() => setShowGmailConfirmModal(false)}
                className="min-h-[40px] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {isEn ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="button"
                disabled={sendingGmail}
                onClick={handleSendViaGmailConfirmed}
                className="min-h-[40px] inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer disabled:opacity-60"
              >
                {sendingGmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {isEn ? 'Confirm & Send Email' : 'Confirmer et envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
