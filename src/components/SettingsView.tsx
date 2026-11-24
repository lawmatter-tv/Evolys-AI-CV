import React, { useState } from 'react';
import {
  Check,
  ChevronRight,
  CreditCard,
  Globe,
  Leaf,
  MapPin,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Target,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { AppLanguage, AppThemeMode, UserAccountProfile } from '../types';

interface SettingsViewProps {
  language: AppLanguage;
  onLanguageChange: (lang: AppLanguage) => void;
  themeMode: AppThemeMode;
  onThemeModeChange: (mode: AppThemeMode) => void;
  targetRole: string;
  onTargetRoleChange: (role: string) => void;
  userLocality: string;
  onUserLocalityChange: (loc: string) => void;
  currentUser: UserAccountProfile | null;
  gmailConnected: boolean;
  onOpenAccountModal: (tab: 'account' | 'billing') => void;
  onOpenApplications: () => void;
  applicationsCount: number;
  historyCount: number;
  onClearLocalData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  language,
  onLanguageChange,
  themeMode,
  onThemeModeChange,
  targetRole,
  onTargetRoleChange,
  userLocality,
  onUserLocalityChange,
  currentUser,
  gmailConnected,
  onOpenAccountModal,
  onOpenApplications,
  applicationsCount,
  historyCount,
  onClearLocalData,
}) => {
  const isEn = language === 'en';
  const [confirmClear, setConfirmClear] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState<'privacy' | 'terms' | null>(null);

  const planLabel = currentUser
    ? currentUser.plan === 'premium'
      ? 'Premium ($2.99/mois)'
      : currentUser.plan === 'standard'
        ? 'Standard ($0.99/mois)'
        : isEn
          ? '7-Day Free Trial'
          : 'Essai gratuit 7 jours'
    : isEn
      ? 'Guest (Sign in to save)'
      : 'Invité (Connectez-vous pour sauvegarder)';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          {isEn ? 'Settings' : 'Réglages'}
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          EVOLYS · {isEn ? 'Employability & CV Studio' : 'Employabilité & Atelier CV'}
        </p>
      </div>

      {/* Account, Plan & Cloud Sync */}
      <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl divide-y divide-[var(--border-hairline)]">
        <div className="p-4 sm:px-6 min-h-[64px] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {currentUser
                  ? `${currentUser.firstName} ${currentUser.lastName}`
                  : isEn
                    ? 'EVOLYS Client Account'
                    : 'Compte client EVOLYS'}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {currentUser
                  ? `${currentUser.email || currentUser.phone} · ${planLabel}`
                  : planLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenAccountModal('account')}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-text)] bg-[var(--accent-soft)] rounded-xl cursor-pointer"
            >
              {currentUser ? (isEn ? 'Account' : 'Gérer le compte') : isEn ? 'Sign In' : 'Créer / Connexion'}
            </button>
            <button
              type="button"
              onClick={() => onOpenAccountModal('billing')}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {isEn ? 'Plans' : 'Forfaits'}
            </button>
          </div>
        </div>

        <div className="p-4 sm:px-6 min-h-[56px] flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">
              {isEn ? 'Gmail Application Sending' : 'Envoi direct Gmail'}
            </p>
            <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">
              {gmailConnected
                ? isEn
                  ? 'Connected in session'
                  : 'Connecté pour cette session'
                : isEn
                  ? 'Not connected'
                  : 'Non connecté'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenAccountModal('account')}
            className="text-xs font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
          >
            {gmailConnected ? (isEn ? 'Active' : 'Actif') : isEn ? 'Connect' : 'Connecter'}
          </button>
        </div>

        <div className="p-4 sm:px-6 min-h-[56px] flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">
              {isEn ? 'Saved CV Audits' : 'CV analysés en mémoire'}
            </p>
            <p className="text-sm font-mono-tabular font-semibold text-[var(--text-primary)] mt-0.5">
              {historyCount}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenApplications}
            className="min-h-[40px] inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
          >
            {isEn ? `Applications (${applicationsCount})` : `Candidatures (${applicationsCount})`}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Role, Locality & Language */}
      <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl divide-y divide-[var(--border-hairline)]">
        <div className="p-4 sm:px-6 space-y-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--accent-text)]" />
            <label
              htmlFor="settings-role"
              className="text-sm font-semibold text-[var(--text-primary)]"
            >
              {isEn ? 'Target position' : 'Quel poste visez-vous ?'}
            </label>
          </div>
          <input
            id="settings-role"
            type="text"
            value={targetRole}
            onChange={(e) => onTargetRoleChange(e.target.value)}
            placeholder={
              isEn
                ? 'e.g., Project Manager, Nurse, Accountant...'
                : 'Ex : Chef de projet, Infirmière, Développeur...'
            }
            className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
          />
        </div>

        <div className="p-4 sm:px-6 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--accent-text)]" />
            <label
              htmlFor="settings-locality"
              className="text-sm font-semibold text-[var(--text-primary)]"
            >
              {isEn ? 'Job Feed Locality' : 'Localité du flux d’offres d’emploi'}
            </label>
          </div>
          <input
            id="settings-locality"
            type="text"
            value={userLocality}
            onChange={(e) => onUserLocalityChange(e.target.value)}
            placeholder="Côte d'Ivoire, Abidjan, Sénégal, France..."
            className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
          />
          <p className="text-[11px] text-[var(--text-secondary)]">
            {isEn
              ? 'Adapts job search portals automatically (e.g. Emploi Jeunes CI, Jobivoire, Educarriere, Emploi Rapide Net + LinkedIn & Indeed).'
              : 'Adapte automatiquement les portails locaux (ex. en Côte d’Ivoire : Emploi Jeunes CI, Jobivoire, Educarriere, Emploi Rapide Net + LinkedIn & Indeed).'}
          </p>
        </div>

        <div className="p-4 sm:px-6 min-h-[60px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[var(--accent-text)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {isEn ? 'Language' : 'Langue'}
            </span>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl">
            <button
              type="button"
              onClick={() => onLanguageChange('fr')}
              className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer ${
                language === 'fr'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Français
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange('en')}
              className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer ${
                language === 'en'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* 3-Mode Appearance Selector: Clair / Vert / Sombre */}
        <div className="p-4 sm:px-6 space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--accent-text)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {isEn ? 'Display Theme' : 'Mode d’affichage'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {(
              [
                {
                  id: 'light' as const,
                  title: isEn ? 'Light Mode' : 'Mode Clair',
                  swatch: '#f5f7f6',
                  icon: Sun,
                },
                {
                  id: 'green' as const,
                  title: isEn ? 'EVOLYS Green' : 'Mode Vert',
                  swatch: '#0d3322',
                  icon: Leaf,
                },
                {
                  id: 'dark' as const,
                  title: isEn ? 'Dark Mode' : 'Mode Sombre',
                  swatch: '#0d110f',
                  icon: Moon,
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = themeMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onThemeModeChange(opt.id)}
                  className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--accent-text)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-grouped)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 text-xs font-semibold whitespace-nowrap">
                    <Icon className="w-4 h-4 shrink-0" />
                    {opt.title}
                  </span>
                  <span
                    className="w-4 h-4 rounded-full border border-[var(--border-strong)] shrink-0"
                    style={{ backgroundColor: opt.swatch }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Legal & Charter */}
      <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl divide-y divide-[var(--border-hairline)] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLegalModal('privacy')}
          className="w-full min-h-[52px] p-4 sm:px-6 flex items-center justify-between text-left hover:bg-[var(--bg-grouped)] transition-colors cursor-pointer"
        >
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {isEn ? 'Privacy Policy' : 'Politique de confidentialité'}
          </span>
          <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
        </button>
        <button
          type="button"
          onClick={() => setShowLegalModal('terms')}
          className="w-full min-h-[52px] p-4 sm:px-6 flex items-center justify-between text-left hover:bg-[var(--bg-grouped)] transition-colors cursor-pointer"
        >
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {isEn
              ? 'Terms of Use & Anti-Fabrication Charter'
              : 'Conditions d’utilisation & Charte « Rien d’inventé »'}
          </span>
          <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
        </button>
      </section>

      {showLegalModal && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--accent-text)]">
              <ShieldCheck className="w-4 h-4" />
              <h3 className="text-sm font-bold">
                {showLegalModal === 'privacy'
                  ? isEn
                    ? 'Privacy Policy'
                    : 'Politique de confidentialité'
                  : isEn
                    ? 'EVOLYS Anti-Fabrication Charter'
                    : 'Charte EVOLYS « Rien d’inventé »'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowLegalModal(null)}
              className="min-h-[36px] px-3 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {isEn ? 'Close' : 'Fermer'}
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {showLegalModal === 'privacy'
              ? isEn
                ? 'Your CV is sent to the AI analysis engine solely to generate your ATS score, line-by-line suggestions, recreated PDF, cover letter, and interview prep. Nothing is published or sold.'
                : 'Votre CV est transmis au moteur d’analyse uniquement pour générer votre score ATS, vos corrections, votre CV recréé, vos lettres et votre préparation d’entretien. Il n’est jamais vendu ni partagé publiquement.'
              : isEn
                ? 'EVOLYS never invents degrees, employers, dates, or fake metrics. All rewritten sentences and cover letters remain strictly faithful to your verified background.'
                : 'EVOLYS s’engage à ne jamais inventer de faux diplômes, d’entreprises fictives, ni de chiffres statistiques imaginaires. Toute reformulation ou recréation reste strictement fidèle au parcours réel du candidat.'}
          </p>
        </div>
      )}

      {/* Clear Local Data */}
      <div className="pt-2">
        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-[var(--bg-surface)] border rounded-xl transition-colors cursor-pointer"
            style={{ color: 'var(--status-err)', borderColor: 'var(--status-err)' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isEn
              ? 'Reset local history & applications'
              : 'Effacer l’historique local et les candidatures'}
          </button>
        ) : (
          <div
            className="p-4 border rounded-2xl flex flex-wrap items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--status-err-bg)',
              borderColor: 'var(--status-err)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--status-err)' }}>
              {isEn
                ? 'Confirm clearing saved CVs and tracked applications?'
                : 'Confirmer la suppression de l’historique local et des candidatures ?'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearLocalData();
                  setConfirmClear(false);
                }}
                className="min-h-[38px] inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-white rounded-xl cursor-pointer"
                style={{ backgroundColor: 'var(--status-err)' }}
              >
                <Check className="w-3.5 h-3.5" />
                {isEn ? 'Confirm' : 'Confirmer'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                {isEn ? 'Cancel' : 'Annuler'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
