export type AppLanguage = 'fr' | 'en';
export type AppThemeMode = 'light' | 'green' | 'dark';

export type CheckStatus = 'passed' | 'warning' | 'failed';

export interface AtsCheckItem {
  id: string;
  label: string;
  pointsEarned: number;
  maxPoints: number;
  status: CheckStatus;
  finding: string;
  explanation: string;
  howToFix: string;
}

export interface ContentPassedCheck {
  title: string;
  detail: string;
}

export interface ContentIssueItem {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  fromYourCv: string;
  howToImprove: string;
  severity: 'high' | 'medium';
}

export interface QuickWinItem {
  id: string;
  title: string;
  pointsGain: number;
  description: string;
  targetSection: string;
}

export interface LineFeedbackItem {
  id: string;
  section: string;
  originalLine: string;
  issue: string;
  improvedLine: string;
  rationale: string;
}

export interface CvExperience {
  role: string;
  company: string;
  period: string;
  location: string;
  bullets: string[];
}

export interface CvEducation {
  degree: string;
  school: string;
  period: string;
  details: string;
}

export interface StructuredCvData {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  summary: string;
  experiences: CvExperience[];
  education: CvEducation[];
  skills: string[];
  languages: string[];
  certifications: string[];
}

export interface RadarCriteriaMetrics {
  atsCompatibility: number;
  skillRelevance: number;
  experienceImpact: number;
  quantifiedResults: number;
  sectionStructure: number;
  readability: number;
}

export interface CvAnalysisResult {
  fileName: string;
  analyzedAt: string;
  extractedText: string;
  formatScore: number;
  contentScore: number;
  formatVerdict: string;
  contentVerdict: string;
  summaryBanner: string;
  potentialGainPoints: number;
  radarMetrics?: RadarCriteriaMetrics;
  atsChecks: AtsCheckItem[];
  contentPassedChecks: ContentPassedCheck[];
  contentIssues: ContentIssueItem[];
  quickWins: QuickWinItem[];
  lineByLineFeedback: LineFeedbackItem[];
  structuredCv: StructuredCvData;
}

export interface RecreatedCvResult {
  cv: StructuredCvData;
  projectedFormatScore: number;
  projectedContentScore: number;
  improvementsSummary: string[];
  tailoredFor?: {
    company: string;
    jobTitle: string;
    matchScoreAfterTailoring?: number;
  };
}

export interface JobMatchResult {
  matchScore: number;
  roleFitSummary: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  exactAdditions: {
    targetSection: string;
    suggestion: string;
    reason: string;
  }[];
}

export interface CompanyCompatibilityItem {
  company: string;
  sector: string;
  compatibilityScore: number;
  verdict: string;
  keyStrengths: string[];
  priorityGaps: string[];
}

export interface CompanyCompatibilityResult {
  overallReadiness: string;
  companies: CompanyCompatibilityItem[];
}

export interface CoverLetterResult {
  subject: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
  fullText: string;
}

export interface InterviewQuestionItem {
  id: string;
  category: string;
  question: string;
  whyRecruiterAsks: string;
  starAnswerGuide: string;
  starBreakdown?: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
}

export interface InterviewPrepResult {
  focusSummary: string;
  questions: InterviewQuestionItem[];
}

export interface JobListingItem {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  contractType: string;
  publishedAt: string;
  summary: string;
  description: string;
  url: string;
}

export interface JobSearchResult {
  locality: string;
  query: string;
  jobs: JobListingItem[];
  sourcesUsed: string[];
  groundingLinks: { title: string; url: string }[];
}

export interface ParsedExternalOfferResult {
  jobTitle: string;
  company: string;
  location: string;
  description: string;
  sourceUrl: string;
}

export type ApplicationStatus = 'a_envoyer' | 'envoye' | 'entretien' | 'offre' | 'refus';

export interface CandidateApplication {
  id: string;
  candidateName: string;
  company: string;
  jobTitle: string;
  recipientEmail?: string;
  status: ApplicationStatus;
  appliedDate: string;
  atsScoreSnapshot: number;
  notes: string;
  coverLetterSnapshot?: string;
  gmailMessageId?: string;
}

export interface SavedCvHistoryItem {
  id: string;
  fileName: string;
  candidateName: string;
  targetRole: string;
  formatScore: number;
  contentScore: number;
  analyzedAt: string;
  analysis: CvAnalysisResult;
  recreated?: RecreatedCvResult;
}

export type AuthMethod = 'google' | 'apple' | 'email_otp';
export type SubscriptionPlan = 'trial' | 'standard' | 'premium';
export type SubscriptionStatus = 'trialing' | 'active' | 'expired' | 'canceled';

export interface UserAccountProfile {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  authMethod: AuthMethod;
  locality: string;
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  trialStartedAt: string;
  trialEndsAt: string;
  stripeCustomerId?: string;
}
