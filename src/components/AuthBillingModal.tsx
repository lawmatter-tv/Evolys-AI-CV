import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { AppLanguage, SubscriptionPlan, UserAccountProfile } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  confirmCheckoutSessionRequest,
  createCheckoutSessionRequest,
  loginAccountRequest,
  registerAccountRequest,
  resendOtpRequest,
  verifyOtpRequest,
} from '../utils/api';

interface AuthBillingModalProps {
  isOpen: boolean;
  initialTab?: 'account' | 'billing';
  language: AppLanguage;
  currentUser: UserAccountProfile | null;
  defaultLocality: string;
  onClose: () => void;
  onGoogleLogin: () => Promise<void>;
  onAppleLogin: () => Promise<void>;
  onOtpLoginSuccess: (user: UserAccountProfile, token: string) => void;
  onPlanActivated: (plan: Exclude<SubscriptionPlan, 'trial'>, stripeCustomerId?: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export const AuthBillingModal: React.FC<AuthBillingModalProps> = ({
  isOpen,
  initialTab = 'account',
  language,
  currentUser,
  defaultLocality,
  onClose,
  onGoogleLogin,
  onAppleLogin,
  onOtpLoginSuccess,
  onPlanActivated,
  onLogout,
}) => {
  const isEn = language === 'en';
  const [tab, setTab] = useState<'account' | 'billing'>(initialTab);
  const [authMode, setAuthMode] = useState<'register' | 'login' | 'otp'>('register');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [locality, setLocality] = useState(defaultLocality || "Côte d'Ivoire");

  const [pendingUid, setPendingUid] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<'standard' | 'premium'>('standard');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'mobile_money'>('card');
  const [mobileProvider, setMobileProvider] = useState<'Wave' | 'Orange Money' | 'MTN MoMo'>('Wave');
  const [mobilePhone, setMobilePhone] = useState('');
  const [sandboxSession, setSandboxSession] = useState<{
    sessionId: string;
    plan: 'standard' | 'premium';
    amountUsd: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError(null);
      if (defaultLocality) setLocality(defaultLocality);
    }
  }, [isOpen, initialTab, defaultLocality]);

  if (!isOpen) return null;

  const daysRemaining = currentUser
    ? Math.max(
        0,
        Math.ceil(
          (new Date(currentUser.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : 7;

  const handleGoogleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onGoogleLogin();
      setNotice(
        isEn
          ? 'Google account & Gmail connected. Your 7-day free trial is active.'
          : 'Compte Google & Gmail connectés. Votre essai gratuit de 7 jours est actif.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onAppleLogin();
      setNotice(
        isEn
          ? 'Apple account connected. Your workspace is synced.'
          : 'Compte Apple connecté. Vos données sont sauvegardées.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('operation-not-allowed') || msg.includes('configuration-not-found')) {
        setError(
          isEn
            ? 'Apple Sign-In must be enabled in Firebase Console (Authentication → Sign-in method → Apple). Use Google or Email/Phone + OTP below right now.'
            : 'La connexion Apple doit être activée dans la console Firebase (Authentication → Sign-in method → Apple). Utilisez Google ou le formulaire avec OTP ci-dessous immédiatement.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await registerAccountRequest({
        firstName,
        lastName,
        identifier,
        password,
        locality,
      });
      setPendingUid(res.pendingUid);
      setDevOtpHint(res.devOtpPreview || null);
      setAuthMode('otp');
      setNotice(
        isEn
          ? `A 6-digit verification code was issued for ${res.maskedTarget}.`
          : `Un code de vérification OTP à 6 chiffres a été généré pour ${res.maskedTarget}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du compte.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await verifyOtpRequest({ pendingUid, otpCode });
      onOtpLoginSuccess(res.user, res.token);
      setDevOtpHint(null);
      setNotice(
        isEn
          ? 'Account verified! Your 7-day free trial has started.'
          : 'Compte vérifié ! Votre essai gratuit de 7 jours est activé.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code OTP invalide.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingUid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await resendOtpRequest({ pendingUid });
      setDevOtpHint(res.devOtpPreview || null);
      setNotice(isEn ? 'New 6-digit code sent.' : 'Nouveau code OTP envoyé.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de renvoyer le code.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await loginAccountRequest({ identifier, password });
      onOtpLoginSuccess(res.user, res.token);
      setNotice(isEn ? 'Welcome back!' : 'Connexion réussie !');
    } catch (err: unknown) {
      const eObj = err as Error & { data?: Record<string, unknown> };
      if (eObj.data?.requiresOtp && eObj.data?.pendingUid) {
        setPendingUid(String(eObj.data.pendingUid));
        setDevOtpHint(eObj.data.devOtpPreview ? String(eObj.data.devOtpPreview) : null);
        setAuthMode('otp');
      }
      setError(eObj.message || 'Identifiants incorrects.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartCheckout = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const session = await createCheckoutSessionRequest({
        plan: selectedPlan,
        paymentMethod,
        email: currentUser?.email || identifier,
        uid: currentUser?.uid,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      });

      if (session.mode === 'stripe_live' && session.checkoutUrl) {
        window.location.assign(session.checkoutUrl);
        return;
      }

      setSandboxSession({
        sessionId: session.sessionId,
        plan: session.plan,
        amountUsd: session.amountUsd,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’initialisation du paiement.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSandboxPayment = async () => {
    if (!sandboxSession) return;
    setLoading(true);
    setError(null);
    try {
      const res = await confirmCheckoutSessionRequest({
        sessionId: sandboxSession.sessionId,
        uid: currentUser?.uid,
      });
      await onPlanActivated(res.plan, res.stripeCustomerId);
      setSandboxSession(null);
      setNotice(
        isEn
          ? `Subscription ${res.plan.toUpperCase()} activated successfully!`
          : `Abonnement ${res.plan === 'premium' ? 'Premium ($2.99/mois)' : 'Standard ($0.99/mois)'} activé avec succès !`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de confirmation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl shadow-xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 p-1 bg-[var(--bg-elevated)] rounded-xl">
            <button
              type="button"
              onClick={() => {
                setTab('account');
                setError(null);
              }}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                tab === 'account'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {isEn ? 'My Account' : 'Mon Compte'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('billing');
                setError(null);
              }}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                tab === 'billing'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {isEn ? '7-Day Trial & Plans' : 'Essai 7j & Abonnement'}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-grouped)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl text-xs border"
              style={{
                backgroundColor: 'var(--status-err-bg)',
                color: 'var(--status-err)',
                borderColor: 'var(--status-err)',
              }}
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              className="p-3.5 rounded-xl text-xs font-medium flex items-center gap-2"
              style={{ backgroundColor: 'var(--status-ok-bg)', color: 'var(--status-ok)' }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {tab === 'account' && (
            <>
              {currentUser ? (
                <div className="space-y-4">
                  <div className="p-5 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-[var(--text-primary)]">
                          {currentUser.firstName} {currentUser.lastName}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {currentUser.email || currentUser.phone} ·{' '}
                          {currentUser.authMethod === 'google'
                            ? 'Google & Gmail'
                            : currentUser.authMethod === 'apple'
                              ? 'Apple'
                              : 'Compte vérifié OTP'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl hover:bg-[var(--bg-elevated)] cursor-pointer"
                    >
                      {isEn ? 'Sign out' : 'Se déconnecter'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl">
                      <p className="text-xs text-[var(--text-secondary)]">
                        {isEn ? 'Active Plan' : 'Formule active'}
                      </p>
                      <p className="text-sm font-bold text-[var(--accent-text)] mt-1">
                        {currentUser.plan === 'premium'
                          ? 'Premium ($2.99/mois)'
                          : currentUser.plan === 'standard'
                            ? 'Standard ($0.99/mois)'
                            : isEn
                              ? `7-Day Free Trial (${daysRemaining}d left)`
                              : `Essai gratuit 7 jours (${daysRemaining}j restants)`}
                      </p>
                    </div>
                    <div className="p-4 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl">
                      <p className="text-xs text-[var(--text-secondary)]">
                        {isEn ? 'Cloud Sync' : 'Sauvegarde Cloud'}
                      </p>
                      <p className="text-sm font-bold text-[var(--text-primary)] mt-1">
                        {isEn ? 'CVs & Applications Saved' : 'CV & Candidatures synchronisés'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTab('billing')}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    {isEn ? 'Manage subscription ($0.99 / $2.99)' : 'Gérer mon abonnement ($0.99 / $2.99)'}
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">
                      {isEn
                        ? 'Save your CVs, recreated PDFs & applications'
                        : 'Créez votre compte pour sauvegarder vos CV'}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {isEn
                        ? 'Includes a 7-day free trial, then $0.99/mo (Standard) or $2.99/mo (Premium).'
                        : 'Profitez de 7 jours d’essai gratuit sans engagement, puis 0,99 $/mois (Standard) ou 2,99 $/mois (Premium).'}
                    </p>
                  </div>

                  {/* Quick Social Auth: Google & Apple */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <GoogleSignInButton
                      onClick={handleGoogleClick}
                      disabled={loading}
                      label={isEn ? 'Continue with Google' : 'Continuer avec Google'}
                    />
                    <button
                      type="button"
                      onClick={handleAppleClick}
                      disabled={loading}
                      className="min-h-[44px] w-full inline-flex items-center justify-center gap-2.5 px-4 py-2 text-sm font-semibold rounded-xl bg-[#111814] text-white border border-[var(--border-strong)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
                      </svg>
                      {isEn ? 'Continue with Apple' : 'Continuer avec Apple'}
                    </button>
                  </div>

                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-[var(--border-hairline)]" />
                    <span className="shrink mx-3 text-xs text-[var(--text-secondary)]">
                      {isEn ? 'or with phone / email + OTP' : 'ou par formulaire + vérification OTP'}
                    </span>
                    <div className="flex-grow border-t border-[var(--border-hairline)]" />
                  </div>

                  {authMode !== 'otp' && (
                    <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl w-fit">
                      <button
                        type="button"
                        onClick={() => setAuthMode('register')}
                        className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer ${
                          authMode === 'register'
                            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {isEn ? 'Create Account' : 'Créer un compte'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer ${
                          authMode === 'login'
                            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {isEn ? 'Sign In' : 'Se connecter'}
                      </button>
                    </div>
                  )}

                  {authMode === 'register' && (
                    <form onSubmit={handleRegisterSubmit} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder={isEn ? 'First name *' : 'Prénom *'}
                          className="min-h-[42px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                        />
                        <input
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder={isEn ? 'Last name *' : 'Nom *'}
                          className="min-h-[42px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          required
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder={
                            isEn ? 'Email or phone number *' : 'Numéro (+225...) ou E-mail *'
                          }
                          className="min-h-[42px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                        />
                        <input
                          type="text"
                          value={locality}
                          onChange={(e) => setLocality(e.target.value)}
                          placeholder={isEn ? 'Locality (e.g. Côte d’Ivoire)' : 'Pays / Ville (ex: Côte d’Ivoire)'}
                          className="min-h-[42px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                        />
                      </div>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={isEn ? 'Password (min. 6 chars) *' : 'Mot de passe (6 caractères min.) *'}
                        className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer disabled:opacity-60"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                        {isEn
                          ? 'Create account & receive OTP code'
                          : 'Créer mon compte & recevoir le code OTP'}
                      </button>
                    </form>
                  )}

                  {authMode === 'login' && (
                    <form onSubmit={handleLoginSubmit} className="space-y-3">
                      <input
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={isEn ? 'Email or phone number' : 'Numéro ou E-mail'}
                        className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={isEn ? 'Password' : 'Mot de passe'}
                        className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer disabled:opacity-60"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        {isEn ? 'Sign In' : 'Se connecter'}
                      </button>
                    </form>
                  )}

                  {authMode === 'otp' && (
                    <form onSubmit={handleVerifyOtp} className="space-y-4 p-4 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          {isEn ? 'OTP Verification (6 digits)' : 'Vérification OTP (6 chiffres)'}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {isEn
                            ? 'Enter the 6-digit code to verify your account and activate your 7-day free trial.'
                            : 'Saisissez le code à 6 chiffres pour confirmer votre identité et démarrer vos 7 jours gratuits.'}
                        </p>
                      </div>

                      {devOtpHint && (
                        <div className="p-3 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] text-xs font-mono-tabular">
                          {isEn
                            ? `Preview OTP code: ${devOtpHint}`
                            : `Code OTP de vérification (aperçu) : ${devOtpHint}`}
                        </div>
                      )}

                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="w-full min-h-[48px] px-4 py-2 text-center text-xl tracking-[0.4em] font-mono-tabular font-bold bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleResendOtp}
                          disabled={loading}
                          className="text-xs font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                        >
                          {isEn ? 'Resend OTP' : 'Renvoyer un code'}
                        </button>
                        <button
                          type="submit"
                          disabled={loading || otpCode.length !== 6}
                          className="min-h-[42px] px-6 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer disabled:opacity-60"
                        >
                          {isEn ? 'Verify & Start 7-Day Trial' : 'Valider & Activer 7j gratuits'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'billing' && (
            <div className="space-y-5">
              <div className="p-4 bg-[var(--accent-soft)] rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[var(--accent-text)] uppercase tracking-wider">
                    {isEn ? '7-Day Free Trial Included' : '7 Jours d’essai gratuit inclus'}
                  </p>
                  <p className="text-xs text-[var(--text-primary)] mt-0.5">
                    {currentUser
                      ? isEn
                        ? `Current status: ${currentUser.plan.toUpperCase()} (${daysRemaining} trial days remaining)`
                        : `Statut actuel : ${currentUser.plan === 'trial' ? `Essai gratuit (${daysRemaining} jours restants)` : currentUser.plan.toUpperCase()}`
                      : isEn
                        ? 'Try EVOLYS free for 7 days, then pick $0.99/mo or $2.99/mo.'
                        : 'Testez EVOLYS gratuitement pendant 7 jours, puis passez à 0,99 $/mois ou 2,99 $/mois.'}
                  </p>
                </div>
                <Sparkles className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
              </div>

              {/* 2 Paid Plans: $0.99 & $2.99 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    id: 'standard' as const,
                    name: 'Standard',
                    price: '$0.99',
                    period: isEn ? '/ month' : '/ mois',
                    subtitle: isEn ? 'Essential employability tools' : 'L’essentiel pour décrocher un poste',
                    features: isEn
                      ? [
                          'Cloud history & applications saved',
                          'Localized job feed (CI, LinkedIn, Indeed)',
                          'CV tailoring to external job offers',
                          'ATS Audit & PDF export',
                        ]
                      : [
                          'Sauvegarde cloud illimitée (CV & suivi)',
                          'Flux d’offres locales (CI, LinkedIn, Indeed)',
                          'Réadaptation du CV selon chaque offre',
                          'Audit ATS complet & export PDF',
                        ],
                  },
                  {
                    id: 'premium' as const,
                    name: 'Premium',
                    price: '$2.99',
                    period: isEn ? '/ month' : '/ mois',
                    subtitle: isEn ? 'Full acceleration + Gmail & STAR' : 'Accélération complète + Gmail & Coach',
                    features: isEn
                      ? [
                          'Everything in Standard',
                          'Direct Gmail job application sending',
                          'Personalized Interview Prep (STAR)',
                          '5-Giants benchmark & priority templates',
                        ]
                      : [
                          'Tout le forfait Standard inclus',
                          'Envoi direct de candidatures via Gmail',
                          'Préparation entretien personnalisée STAR',
                          'Benchmark 5 géants & tous modèles PDF',
                        ],
                  },
                ].map((plan) => {
                  const active = selectedPlan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`text-left p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40 ring-2 ring-[var(--accent)]/20'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-grouped)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-base font-bold text-[var(--text-primary)]">
                          {plan.name}
                        </span>
                        <span className="font-mono-tabular text-xl font-extrabold text-[var(--accent-text)]">
                          {plan.price}
                          <span className="text-xs font-normal text-[var(--text-secondary)]">
                            {plan.period}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{plan.subtitle}</p>
                      <ul className="space-y-1.5 text-xs text-[var(--text-primary)]">
                        {plan.features.map((feat) => (
                          <li key={feat} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>

              {/* Payment Method */}
              <div className="space-y-3 pt-1">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  {isEn ? 'Payment method' : 'Moyen de paiement'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 cursor-pointer ${
                      paymentMethod === 'card'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-grouped)] text-[var(--text-primary)]'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    {isEn ? 'Bank Card (Visa / Mastercard · Stripe)' : 'Carte bancaire (Visa / Mastercard · Stripe)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('mobile_money')}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 cursor-pointer ${
                      paymentMethod === 'mobile_money'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-grouped)] text-[var(--text-primary)]'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 shrink-0" />
                    Mobile Money (Wave, Orange, MTN)
                  </button>
                </div>

                {paymentMethod === 'mobile_money' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl">
                    <select
                      value={mobileProvider}
                      onChange={(e) =>
                        setMobileProvider(e.target.value as 'Wave' | 'Orange Money' | 'MTN MoMo')
                      }
                      className="min-h-[40px] px-3 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl"
                    >
                      <option value="Wave">Wave Côte d’Ivoire / Sénégal</option>
                      <option value="Orange Money">Orange Money</option>
                      <option value="MTN MoMo">MTN Mobile Money</option>
                    </select>
                    <input
                      type="tel"
                      value={mobilePhone}
                      onChange={(e) => setMobilePhone(e.target.value)}
                      placeholder="+225 07 XX XX XX XX"
                      className="min-h-[40px] px-3 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl"
                    />
                  </div>
                )}

                {!sandboxSession ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleStartCheckout}
                    className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    {selectedPlan === 'premium'
                      ? isEn
                        ? 'Subscribe to Premium — $2.99/mo'
                        : 'Activer Premium — 2,99 $/mois'
                      : isEn
                        ? 'Subscribe to Standard — $0.99/mo'
                        : 'Activer Standard — 0,99 $/mois'}
                  </button>
                ) : (
                  <div className="p-4 bg-[var(--bg-grouped)] border border-[var(--accent)] rounded-2xl space-y-3">
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      {isEn
                        ? `Confirm checkout: ${sandboxSession.plan.toUpperCase()} ($${sandboxSession.amountUsd}/mo)`
                        : `Confirmation de paiement : ${sandboxSession.plan === 'premium' ? 'Premium' : 'Standard'} (${sandboxSession.amountUsd} $/mois)`}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {paymentMethod === 'mobile_money'
                        ? `${mobileProvider} ${mobilePhone || ''}`.trim()
                        : isEn
                          ? 'Checkout session ready. Add STRIPE_SECRET_KEY in environment secrets for live Visa/Mastercard charges, or confirm test activation below.'
                          : 'Session de paiement prête. Ajoutez STRIPE_SECRET_KEY dans les secrets serveur pour les paiements réels par carte, ou validez l’activation test ci-dessous.'}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleConfirmSandboxPayment}
                        className="flex-1 min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer"
                      >
                        {isEn ? 'Confirm & Activate Plan' : 'Confirmer et activer le forfait'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSandboxSession(null)}
                        className="min-h-[40px] px-3 py-2 text-xs text-[var(--text-secondary)] cursor-pointer"
                      >
                        {isEn ? 'Cancel' : 'Annuler'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
