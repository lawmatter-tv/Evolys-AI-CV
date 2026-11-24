import {
  AppLanguage,
  CandidateApplication,
  CompanyCompatibilityResult,
  CoverLetterResult,
  CvAnalysisResult,
  InterviewPrepResult,
  JobMatchResult,
  JobSearchResult,
  LineFeedbackItem,
  ParsedExternalOfferResult,
  RecreatedCvResult,
  SavedCvHistoryItem,
  StructuredCvData,
  SubscriptionPlan,
  SubscriptionStatus,
  UserAccountProfile,
} from '../types';

async function requestJson<T>(
  url: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; bearerToken?: string | null } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.bearerToken) {
    headers.Authorization = `Bearer ${options.bearerToken}`;
  }

  const res = await fetch(url, {
    method: options.method || 'POST',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur serveur (${res.status})`) as Error & {
      data?: Record<string, unknown>;
    };
    err.data = data;
    throw err;
  }
  return data as T;
}

export function analyzeCvRequest(payload: {
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  rawText?: string;
  targetRole?: string;
  language: AppLanguage;
}): Promise<CvAnalysisResult> {
  return requestJson<CvAnalysisResult>('/api/cv/analyze', { body: payload });
}

export function recreateCvRequest(payload: {
  extractedText: string;
  structuredCv: StructuredCvData;
  acceptedLineRewrites?: LineFeedbackItem[];
  targetRole?: string;
  tone?: 'ats-classic' | 'evolys-modern' | 'executive';
  customInstructions?: string;
  language: AppLanguage;
}): Promise<RecreatedCvResult> {
  return requestJson<RecreatedCvResult>('/api/cv/recreate', { body: payload });
}

export function tailorCvToOfferRequest(payload: {
  extractedText: string;
  structuredCv: StructuredCvData;
  jobOfferText: string;
  jobTitle?: string;
  company?: string;
  tone?: 'ats-classic' | 'evolys-modern' | 'executive';
  language: AppLanguage;
}): Promise<RecreatedCvResult> {
  return requestJson<RecreatedCvResult>('/api/cv/tailor-to-offer', { body: payload });
}

export function compareOfferRequest(payload: {
  cvText: string;
  jobOfferText: string;
  jobTitle?: string;
  company?: string;
  language: AppLanguage;
}): Promise<JobMatchResult> {
  return requestJson<JobMatchResult>('/api/cv/compare-offer', { body: payload });
}

export function companyCompatibilityRequest(payload: {
  cvText: string;
  targetRole?: string;
  companies?: string[];
  language: AppLanguage;
}): Promise<CompanyCompatibilityResult> {
  return requestJson<CompanyCompatibilityResult>('/api/cv/company-compatibility', { body: payload });
}

export function generateCoverLetterRequest(payload: {
  cvText: string;
  jobOfferText?: string;
  companyName: string;
  jobTitle: string;
  tone?: 'professionnel' | 'dynamique' | 'sobre';
  language: AppLanguage;
}): Promise<CoverLetterResult> {
  return requestJson<CoverLetterResult>('/api/cv/cover-letter', { body: payload });
}

export function generateInterviewPrepRequest(payload: {
  cvText: string;
  targetRole?: string;
  jobOfferText?: string;
  language: AppLanguage;
}): Promise<InterviewPrepResult> {
  return requestJson<InterviewPrepResult>('/api/cv/interview-prep', { body: payload });
}

export function searchLocalizedJobsRequest(payload: {
  query: string;
  locality: string;
  language: AppLanguage;
}): Promise<JobSearchResult> {
  return requestJson<JobSearchResult>('/api/jobs/search', { body: payload });
}

export function parseExternalOfferUrlRequest(payload: {
  url: string;
  language: AppLanguage;
}): Promise<ParsedExternalOfferResult> {
  return requestJson<ParsedExternalOfferResult>('/api/jobs/parse-url', { body: payload });
}

// --- Custom OTP Auth & Workspace Sync ---
export function registerAccountRequest(payload: {
  firstName: string;
  lastName: string;
  identifier: string;
  password: string;
  locality: string;
}): Promise<{
  pendingUid: string;
  channel: 'email' | 'sms';
  maskedTarget: string;
  otpSent: boolean;
  devOtpPreview?: string;
}> {
  return requestJson('/api/auth/register', { body: payload });
}

export function verifyOtpRequest(payload: {
  pendingUid: string;
  otpCode: string;
}): Promise<{ token: string; user: UserAccountProfile }> {
  return requestJson('/api/auth/verify-otp', { body: payload });
}

export function resendOtpRequest(payload: {
  pendingUid: string;
}): Promise<{ ok: boolean; devOtpPreview?: string }> {
  return requestJson('/api/auth/resend-otp', { body: payload });
}

export function loginAccountRequest(payload: {
  identifier: string;
  password: string;
}): Promise<{ token: string; user: UserAccountProfile }> {
  return requestJson('/api/auth/login', { body: payload });
}

export function fetchWorkspaceDataRequest(
  bearerToken: string
): Promise<{ cvs: SavedCvHistoryItem[]; applications: CandidateApplication[] }> {
  return requestJson('/api/workspace/data', { method: 'GET', bearerToken });
}

export function syncWorkspaceDataRequest(
  bearerToken: string,
  payload: {
    cvs?: SavedCvHistoryItem[];
    applications?: CandidateApplication[];
    locality?: string;
  }
): Promise<{ ok: boolean }> {
  return requestJson('/api/workspace/sync', { body: payload, bearerToken });
}

// --- Subscription Billing ---
export function createCheckoutSessionRequest(payload: {
  plan: Exclude<SubscriptionPlan, 'trial'>;
  paymentMethod: 'card' | 'mobile_money';
  email?: string;
  uid?: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{
  mode: 'stripe_live' | 'sandbox';
  sessionId: string;
  checkoutUrl?: string;
  plan: 'standard' | 'premium';
  paymentMethod?: 'card' | 'mobile_money';
  amountUsd: string;
}> {
  return requestJson('/api/billing/create-checkout-session', { body: payload });
}

export function confirmCheckoutSessionRequest(payload: {
  sessionId: string;
  uid?: string;
}): Promise<{
  ok: boolean;
  plan: 'standard' | 'premium';
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string;
}> {
  return requestJson('/api/billing/confirm-session', { body: payload });
}
