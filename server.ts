import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import {
  analyzeCvLocally,
  companyCompatibilityLocally,
  compareOfferLocally,
  coverLetterLocally,
  extractTextFromUpload,
  interviewPrepLocally,
  recreateCvLocally,
  runResilientJsonAi,
  scrapeExternalOfferHtml,
  searchWebJobsFallback,
} from './server/aiEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, '.data');
const STORE_PATH = path.join(DATA_DIR, 'evolys-store.json');
const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TRIAL_DAYS = 7;

interface ServerUserRecord {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  identifierKey: string;
  passwordHash: string;
  salt: string;
  verified: boolean;
  otpCode?: string;
  otpExpiresAt?: number;
  otpAttempts?: number;
  locality: string;
  plan: 'trial' | 'standard' | 'premium';
  subscriptionStatus: 'trialing' | 'active' | 'expired' | 'canceled';
  trialStartedAt: string;
  trialEndsAt: string;
  stripeCustomerId?: string;
  createdAt: string;
}

interface PendingCheckoutRecord {
  sessionId: string;
  plan: 'standard' | 'premium';
  paymentMethod: 'card' | 'mobile_money';
  uid?: string;
  email?: string;
  createdAt: number;
}

interface StoreShape {
  users: Record<string, ServerUserRecord>;
  workspaces: Record<
    string,
    {
      cvs: unknown[];
      applications: unknown[];
    }
  >;
  pendingCheckouts: Record<string, PendingCheckoutRecord>;
}

function readStore(): StoreShape {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { users: {}, workspaces: {}, pendingCheckouts: {} };
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || {},
      workspaces: parsed.workspaces || {},
      pendingCheckouts: parsed.pendingCheckouts || {},
    };
  } catch {
    return { users: {}, workspaces: {}, pendingCheckouts: {} };
  }
}

function writeStore(store: StoreShape): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function signAuthToken(uid: string): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ uid, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAuthToken(token: string): { uid: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.uid || !decoded.exp || Date.now() > decoded.exp) {
      return null;
    }
    return { uid: String(decoded.uid) };
  } catch {
    return null;
  }
}

function sanitizeUserResponse(user: ServerUserRecord) {
  return {
    uid: user.uid,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    authMethod: 'email_otp' as const,
    locality: user.locality,
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
    stripeCustomerId: user.stripeCustomerId,
  };
}

interface AuthenticatedRequest extends Request {
  authUid?: string;
}

function requireBearerAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  const token = header.slice(7).trim();
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Session expirée ou invalide.' });
    return;
  }
  req.authUid = decoded.uid;
  next();
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  if (net.isIPv4(lower)) {
    const octets = lower.split('.').map(Number);
    if (octets[0] === 127 || octets[0] === 10 || octets[0] === 0) return true;
    if (octets[0] === 169 && octets[1] === 254) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  }
  if (net.isIPv6(lower)) {
    if (
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    ) {
      return true;
    }
  }
  return false;
}

function validateSafeExternalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Lien URL invalide. Veuillez coller une adresse commençant par https://');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Seuls les liens HTTP/HTTPS sont autorisés.');
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error('Adresse réseau privée ou locale non autorisée.');
  }
  return parsed.toString();
}

function getLanguageDirective(language: 'fr' | 'en'): string {
  return language === 'en'
    ? 'Respond strictly in clear, professional English.'
    : 'Réponds strictement en français professionnel, naturel et précis.';
}

function handleApiError(res: Response, err: unknown) {
  console.error('[EVOLYS API Error]', err);
  const message =
    err instanceof Error ? err.message : 'Une erreur inattendue est survenue lors du traitement.';
  res.status(500).json({ error: message });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'evolys-cv-studio', trialDays: TRIAL_DAYS });
  });

  // --- AUTH & OTP ENDPOINTS ---
  app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
      const {
        firstName = '',
        lastName = '',
        identifier = '',
        password = '',
        locality = "Côte d'Ivoire",
      } = req.body || {};

      const cleanFirst = String(firstName).trim();
      const cleanLast = String(lastName).trim();
      const cleanId = String(identifier).trim();
      const cleanPassword = String(password);

      if (!cleanFirst || !cleanLast || !cleanId || cleanPassword.length < 6) {
        res.status(400).json({
          error:
            'Veuillez renseigner prénom, nom, e-mail ou téléphone et un mot de passe (6 caractères min.).',
        });
        return;
      }

      const isEmail = cleanId.includes('@');
      const identifierKey = cleanId.toLowerCase();
      const store = readStore();

      const existingUser = Object.values(store.users).find(
        (u) => u.identifierKey === identifierKey
      );
      if (existingUser && existingUser.verified) {
        res.status(409).json({
          error: 'Un compte vérifié existe déjà avec cet identifiant. Veuillez vous connecter.',
        });
        return;
      }

      const uid = existingUser?.uid || `usr_${crypto.randomBytes(10).toString('hex')}`;
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(cleanPassword, salt);
      const otpCode = String(crypto.randomInt(100000, 1000000));
      const now = new Date();
      const trialEnds = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      store.users[uid] = {
        uid,
        firstName: cleanFirst.slice(0, 100),
        lastName: cleanLast.slice(0, 100),
        email: isEmail ? cleanId.slice(0, 200) : '',
        phone: isEmail ? '' : cleanId.slice(0, 40),
        identifierKey,
        passwordHash,
        salt,
        verified: false,
        otpCode,
        otpExpiresAt: Date.now() + 10 * 60 * 1000,
        otpAttempts: 0,
        locality: String(locality || "Côte d'Ivoire").slice(0, 120),
        plan: 'trial',
        subscriptionStatus: 'trialing',
        trialStartedAt: now.toISOString(),
        trialEndsAt: trialEnds.toISOString(),
        createdAt: now.toISOString(),
      };
      writeStore(store);

      const isProd = process.env.NODE_ENV === 'production';
      res.json({
        pendingUid: uid,
        channel: isEmail ? 'email' : 'sms',
        maskedTarget: cleanId,
        otpSent: true,
        devOtpPreview: !isProd ? otpCode : undefined,
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/auth/verify-otp', (req: Request, res: Response) => {
    try {
      const { pendingUid, otpCode } = req.body || {};
      const store = readStore();
      const user = store.users[String(pendingUid || '')];
      if (!user) {
        res.status(404).json({ error: 'Demande de vérification introuvable.' });
        return;
      }
      if (!user.otpCode || !user.otpExpiresAt || Date.now() > user.otpExpiresAt) {
        res.status(400).json({ error: 'Code OTP expiré. Veuillez demander un nouveau code.' });
        return;
      }
      if ((user.otpAttempts || 0) >= 5) {
        res.status(429).json({ error: 'Trop de tentatives. Demandez un nouveau code OTP.' });
        return;
      }

      const provided = String(otpCode || '').trim();
      const expected = user.otpCode;
      const a = Buffer.from(provided.padEnd(6, ' '));
      const b = Buffer.from(expected.padEnd(6, ' '));
      const match = provided.length === 6 && crypto.timingSafeEqual(a, b);

      if (!match) {
        user.otpAttempts = (user.otpAttempts || 0) + 1;
        writeStore(store);
        res.status(400).json({ error: 'Code OTP incorrect. Vérifiez les 6 chiffres.' });
        return;
      }

      user.verified = true;
      delete user.otpCode;
      delete user.otpExpiresAt;
      delete user.otpAttempts;
      if (!store.workspaces[user.uid]) {
        store.workspaces[user.uid] = { cvs: [], applications: [] };
      }
      writeStore(store);

      const token = signAuthToken(user.uid);
      res.json({
        token,
        user: sanitizeUserResponse(user),
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/auth/resend-otp', (req: Request, res: Response) => {
    try {
      const { pendingUid } = req.body || {};
      const store = readStore();
      const user = store.users[String(pendingUid || '')];
      if (!user) {
        res.status(404).json({ error: 'Compte introuvable.' });
        return;
      }
      const otpCode = String(crypto.randomInt(100000, 1000000));
      user.otpCode = otpCode;
      user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
      user.otpAttempts = 0;
      writeStore(store);

      const isProd = process.env.NODE_ENV === 'production';
      res.json({
        ok: true,
        devOtpPreview: !isProd ? otpCode : undefined,
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { identifier = '', password = '' } = req.body || {};
      const key = String(identifier).trim().toLowerCase();
      const store = readStore();
      const user = Object.values(store.users).find((u) => u.identifierKey === key);

      if (!user || !verifyPassword(String(password), user.salt, user.passwordHash)) {
        res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
        return;
      }

      if (!user.verified) {
        const otpCode = String(crypto.randomInt(100000, 1000000));
        user.otpCode = otpCode;
        user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
        user.otpAttempts = 0;
        writeStore(store);
        const isProd = process.env.NODE_ENV === 'production';
        res.status(403).json({
          requiresOtp: true,
          pendingUid: user.uid,
          error: 'Compte non vérifié. Un code OTP vient d’être généré.',
          devOtpPreview: !isProd ? otpCode : undefined,
        });
        return;
      }

      const token = signAuthToken(user.uid);
      res.json({
        token,
        user: sanitizeUserResponse(user),
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.get('/api/auth/me', requireBearerAuth, (req: AuthenticatedRequest, res: Response) => {
    const store = readStore();
    const user = store.users[req.authUid!];
    if (!user) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }
    res.json({ user: sanitizeUserResponse(user) });
  });

  app.get('/api/workspace/data', requireBearerAuth, (req: AuthenticatedRequest, res: Response) => {
    const store = readStore();
    const ws = store.workspaces[req.authUid!] || { cvs: [], applications: [] };
    res.json(ws);
  });

  app.post('/api/workspace/sync', requireBearerAuth, (req: AuthenticatedRequest, res: Response) => {
    const { cvs, applications, locality } = req.body || {};
    const store = readStore();
    const existingWs = store.workspaces[req.authUid!] || { cvs: [], applications: [] };
    store.workspaces[req.authUid!] = {
      cvs: Array.isArray(cvs) ? cvs.slice(0, 20) : existingWs.cvs,
      applications: Array.isArray(applications) ? applications.slice(0, 100) : existingWs.applications,
    };
    if (locality && store.users[req.authUid!]) {
      store.users[req.authUid!].locality = String(locality).slice(0, 120);
    }
    writeStore(store);
    res.json({ ok: true });
  });

  // --- BILLING & SUBSCRIPTIONS ($0.99/mo & $2.99/mo after 7-day Free Trial) ---
  app.post('/api/billing/create-checkout-session', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        plan,
        paymentMethod = 'card',
        email = '',
        uid = '',
        successUrl,
        cancelUrl,
      } = req.body || {};

      if (plan !== 'standard' && plan !== 'premium') {
        res.status(400).json({ error: 'Forfait invalide (standard ou premium requis).' });
        return;
      }

      const amountCents = plan === 'premium' ? 299 : 99;
      const planTitle =
        plan === 'premium' ? 'EVOLYS CV Studio — Premium' : 'EVOLYS CV Studio — Standard';
      const stripeSecret = process.env.STRIPE_SECRET_KEY;

      if (stripeSecret && stripeSecret !== 'MY_STRIPE_SECRET_KEY' && paymentMethod === 'card') {
        const stripe = new Stripe(stripeSecret);
        const origin =
          (typeof successUrl === 'string' && successUrl.startsWith('http')
            ? new URL(successUrl).origin
            : process.env.APP_URL) || `http://localhost:${PORT}`;

        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer_email: email || undefined,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: amountCents,
                recurring: { interval: 'month' },
                product_data: {
                  name: planTitle,
                  description:
                    plan === 'premium'
                      ? 'Envoi Gmail illimité, coaching entretien STAR, PDF ATS & offres locales'
                      : 'Sauvegarde cloud, flux d’offres locales et adaptation CV par offre',
                },
              },
            },
          ],
          metadata: { uid: String(uid || ''), plan },
          success_url: `${origin}/?checkout_session={CHECKOUT_SESSION_ID}&plan=${plan}`,
          cancel_url: cancelUrl || `${origin}/?checkout_canceled=1`,
        });

        res.json({
          mode: 'stripe_live',
          sessionId: session.id,
          checkoutUrl: session.url,
          plan,
          amountUsd: (amountCents / 100).toFixed(2),
        });
        return;
      }

      const sessionId = `chk_${crypto.randomBytes(12).toString('hex')}`;
      const store = readStore();
      store.pendingCheckouts[sessionId] = {
        sessionId,
        plan,
        paymentMethod: paymentMethod === 'mobile_money' ? 'mobile_money' : 'card',
        uid: uid ? String(uid) : undefined,
        email: email ? String(email) : undefined,
        createdAt: Date.now(),
      };
      writeStore(store);

      res.json({
        mode: 'sandbox',
        sessionId,
        plan,
        paymentMethod,
        amountUsd: (amountCents / 100).toFixed(2),
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/billing/confirm-session', async (req: Request, res: Response) => {
    try {
      const { sessionId, uid } = req.body || {};
      if (!sessionId) {
        res.status(400).json({ error: 'Identifiant de session de paiement manquant.' });
        return;
      }

      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      let verifiedPlan: 'standard' | 'premium' | null = null;
      let stripeCustomerId: string | undefined;

      if (
        stripeSecret &&
        stripeSecret !== 'MY_STRIPE_SECRET_KEY' &&
        String(sessionId).startsWith('cs_')
      ) {
        const stripe = new Stripe(stripeSecret);
        const session = await stripe.checkout.sessions.retrieve(String(sessionId));
        if (session.payment_status !== 'paid' && session.status !== 'complete') {
          res.status(402).json({ error: 'Le paiement Stripe n’est pas encore confirmé.' });
          return;
        }
        verifiedPlan = session.metadata?.plan === 'premium' ? 'premium' : 'standard';
        stripeCustomerId = typeof session.customer === 'string' ? session.customer : undefined;
      } else {
        const store = readStore();
        const pending = store.pendingCheckouts[String(sessionId)];
        if (!pending) {
          res.status(404).json({ error: 'Session de paiement introuvable ou expirée.' });
          return;
        }
        verifiedPlan = pending.plan;
        delete store.pendingCheckouts[String(sessionId)];
        writeStore(store);
      }

      const targetUid = String(uid || '');
      if (targetUid) {
        const store = readStore();
        if (store.users[targetUid]) {
          store.users[targetUid].plan = verifiedPlan;
          store.users[targetUid].subscriptionStatus = 'active';
          if (stripeCustomerId) {
            store.users[targetUid].stripeCustomerId = stripeCustomerId;
          }
          writeStore(store);
        }
      }

      res.json({
        ok: true,
        plan: verifiedPlan,
        subscriptionStatus: 'active',
        stripeCustomerId,
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 1. Analyze CV (Open-Source LLM Chain + Zero-Quota Deterministic NLP Fallback) ---
  app.post('/api/cv/analyze', async (req: Request, res: Response) => {
    try {
      const {
        fileName = 'CV_importe.pdf',
        mimeType,
        fileBase64,
        rawText,
        targetRole = '',
        language = 'fr',
      } = req.body || {};

      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';
      const extracted = await extractTextFromUpload(fileName, mimeType, fileBase64, rawText);
      const langRule = getLanguageDirective(lang);

      const systemPrompt = `Tu es un auditeur ATS expert et conseiller en employabilité chez EVOLYS.
${langRule}
RÈGLE D'OR ABSOLUE : N'INVENTE JAMAIS aucune information, chiffre, diplôme, entreprise, date ou compétence qui ne figure pas dans le CV fourni.
Retourne EXCLUSIVEMENT un objet JSON valide respectant exactement ces clés :
{
  "extractedText": string,
  "formatScore": integer (somme exacte des 10 pointsEarned),
  "contentScore": integer (0-100),
  "formatVerdict": string,
  "contentVerdict": string,
  "summaryBanner": string,
  "potentialGainPoints": integer (100 - formatScore),
  "radarMetrics": {
    "atsCompatibility": integer,
    "skillRelevance": integer,
    "experienceImpact": integer,
    "quantifiedResults": integer,
    "sectionStructure": integer,
    "readability": integer
  },
  "atsChecks": [
    { "id": "readable_text|email|phone|experience_section|education_section|skills_section|clear_headings|reasonable_length|no_image_text|chronology", "label": string, "pointsEarned": integer, "maxPoints": integer (20,10,6,14,10,12,8,8,6,6), "status": "passed|warning|failed", "finding": string, "explanation": string, "howToFix": string }
  ],
  "contentPassedChecks": [{ "title": string, "detail": string }],
  "contentIssues": [{ "id": string, "title": string, "summary": string, "whyItMatters": string, "fromYourCv": string, "howToImprove": string, "severity": "high|medium" }],
  "quickWins": [{ "id": string, "title": string, "pointsGain": integer, "description": string, "targetSection": string }],
  "lineByLineFeedback": [{ "id": string, "section": string, "originalLine": string, "issue": string, "improvedLine": string, "rationale": string }],
  "structuredCv": {
    "fullName": string, "headline": string, "email": string, "phone": string, "location": string, "links": string[], "summary": string,
    "experiences": [{ "role": string, "company": string, "period": string, "location": string, "bullets": string[] }],
    "education": [{ "degree": string, "school": string, "period": string, "details": string }],
    "skills": string[], "languages": string[], "certifications": string[]
  }
}`;

      const userPrompt = `${targetRole ? `Poste ciblé : "${targetRole}".\n` : ''}${
        extracted.text
          ? `Contenu texte du CV :\n"""\n${extracted.text.slice(0, 14000)}\n"""`
          : 'Analyse le document CV joint ci-dessus.'
      }`;

      const aiResp = await runResilientJsonAi({
        systemPrompt,
        userPrompt,
        inlinePart: extracted.inlinePart,
      });

      const parsed =
        aiResp?.data && aiResp.data.structuredCv
          ? aiResp.data
          : analyzeCvLocally(extracted.text || '', targetRole, lang);

      res.json({
        fileName,
        analyzedAt: new Date().toISOString(),
        ...parsed,
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 2. Recreate / Improve Entire CV in One Gesture ---
  app.post('/api/cv/recreate', async (req: Request, res: Response) => {
    try {
      const {
        extractedText,
        structuredCv,
        acceptedLineRewrites = [],
        targetRole = '',
        tone = 'ats-classic',
        customInstructions = '',
        language = 'fr',
      } = req.body || {};

      if (!extractedText && !structuredCv) {
        res.status(400).json({ error: 'Données du CV manquantes pour la recréation.' });
        return;
      }

      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';
      const langRule = getLanguageDirective(lang);

      const systemPrompt = `Tu es le moteur de recréation de CV d'EVOLYS.
${langRule}
RÈGLE CRITIQUE : N'INVENTE JAMAIS aucun diplôme, entreprise, date, certification ni faux chiffre statistique.
Retourne UNIQUEMENT un objet JSON :
{
  "cv": { "fullName": string, "headline": string, "email": string, "phone": string, "location": string, "links": string[], "summary": string, "experiences": [{ "role": string, "company": string, "period": string, "location": string, "bullets": string[] }], "education": [{ "degree": string, "school": string, "period": string, "details": string }], "skills": string[], "languages": string[], "certifications": string[] },
  "projectedFormatScore": integer,
  "projectedContentScore": integer,
  "improvementsSummary": string[]
}`;

      const userPrompt = `Style: ${tone}. ${targetRole ? `Poste ciblé: ${targetRole}.` : ''} ${customInstructions ? `Consignes: ${customInstructions}.` : ''}
${acceptedLineRewrites.length > 0 ? `Réécritures validées :\n${JSON.stringify(acceptedLineRewrites)}` : ''}
CV original :\n"""\n${extractedText || JSON.stringify(structuredCv)}\n"""`;

      const aiResp = await runResilientJsonAi({ systemPrompt, userPrompt });
      const result =
        aiResp?.data && aiResp.data.cv
          ? aiResp.data
          : recreateCvLocally({
              extractedText: extractedText || '',
              structuredCv,
              acceptedLineRewrites,
              targetRole,
              lang,
            });

      res.json(result);
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 2B. Tailor / Re-adapt Entire CV to a Selected or External Job Offer ---
  app.post('/api/cv/tailor-to-offer', async (req: Request, res: Response) => {
    try {
      const {
        extractedText,
        structuredCv,
        jobOfferText,
        jobTitle = '',
        company = '',
        tone = 'evolys-modern',
        language = 'fr',
      } = req.body || {};

      if ((!extractedText && !structuredCv) || !jobOfferText) {
        res.status(400).json({ error: 'Le CV et le texte de l’offre sont requis pour l’adaptation.' });
        return;
      }

      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';
      const langRule = getLanguageDirective(lang);

      const systemPrompt = `Tu es l'architecte carrière senior d'EVOLYS.
${langRule}
Réadapte ce CV pour le poste "${jobTitle}" chez "${company}" en réorganisant les compétences réelles et reformulant les puces existantes pour l'ATS.
RÈGLE D'OR (ANTI-FABRICATION) : N'INVENTE JAMAIS un diplôme, outil non maîtrisé, entreprise ou faux chiffre.
Retourne UNIQUEMENT un objet JSON :
{
  "cv": { "fullName": string, "headline": string, "email": string, "phone": string, "location": string, "links": string[], "summary": string, "experiences": [{ "role": string, "company": string, "period": string, "location": string, "bullets": string[] }], "education": [{ "degree": string, "school": string, "period": string, "details": string }], "skills": string[], "languages": string[], "certifications": string[] },
  "projectedFormatScore": integer,
  "projectedContentScore": integer,
  "matchScoreAfterTailoring": integer,
  "improvementsSummary": string[]
}`;

      const userPrompt = `Style: ${tone}\nOffre d'emploi:\n"""\n${jobOfferText}\n"""\n\nCV candidat:\n"""\n${extractedText || JSON.stringify(structuredCv)}\n"""`;

      const aiResp = await runResilientJsonAi({ systemPrompt, userPrompt });
      const parsed =
        aiResp?.data && aiResp.data.cv
          ? aiResp.data
          : recreateCvLocally({
              extractedText: extractedText || '',
              structuredCv,
              jobOfferText,
              company,
              jobTitle,
              lang,
            });

      res.json({
        cv: parsed.cv,
        projectedFormatScore: parsed.projectedFormatScore,
        projectedContentScore: parsed.projectedContentScore,
        improvementsSummary: parsed.improvementsSummary,
        tailoredFor: {
          company: company || 'Offre ciblée',
          jobTitle:
            jobTitle || (parsed.cv as { headline?: string } | undefined)?.headline || 'Poste visé',
          matchScoreAfterTailoring: parsed.matchScoreAfterTailoring,
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 3. Compare CV to a Job Offer ---
  app.post('/api/cv/compare-offer', async (req: Request, res: Response) => {
    try {
      const { cvText, jobOfferText, jobTitle = '', company = '', language = 'fr' } = req.body || {};
      if (!cvText || !jobOfferText) {
        res.status(400).json({ error: 'Veuillez fournir le texte du CV et la description de l’offre.' });
        return;
      }

      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';
      const langRule = getLanguageDirective(lang);

      const systemPrompt = `Tu es un expert ATS et recrutement chez EVOLYS.
${langRule}
Retourne UNIQUEMENT un objet JSON :
{
  "matchScore": integer,
  "roleFitSummary": string,
  "matchedKeywords": string[],
  "missingKeywords": string[],
  "exactAdditions": [{ "targetSection": string, "suggestion": string, "reason": string }]
}`;

      const userPrompt = `Poste: ${jobTitle} | Entreprise: ${company}\nOffre:\n"""\n${jobOfferText}\n"""\n\nCV:\n"""\n${cvText}\n"""`;

      const aiResp = await runResilientJsonAi({ systemPrompt, userPrompt });
      const parsed =
        aiResp?.data && typeof aiResp.data.matchScore === 'number'
          ? aiResp.data
          : compareOfferLocally(cvText, jobOfferText, jobTitle, company, lang);

      res.json(parsed);
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 4. Company Compatibility (5 Giants) ---
  app.post('/api/cv/company-compatibility', async (req: Request, res: Response) => {
    try {
      const {
        cvText,
        targetRole = '',
        companies = ['Google', 'Microsoft', 'Orange', 'Deloitte', 'Société Générale'],
        language = 'fr',
      } = req.body || {};

      if (!cvText) {
        res.status(400).json({ error: 'CV requis pour évaluer la compatibilité entreprise.' });
        return;
      }

      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';
      const langRule = getLanguageDirective(lang);

      const systemPrompt = `Tu es un recruteur senior chez EVOLYS.
${langRule}
Évalue la compatibilité du CV face à : ${companies.join(', ')}.
Retourne UNIQUEMENT un objet JSON :
{
  "overallReadiness": string,
  "companies": [{ "company": string, "sector": string, "compatibilityScore": integer, "verdict": string, "keyStrengths": string[], "priorityGaps": string[] }]
}`;

      const userPrompt = `${targetRole ? `Poste ciblé : ${targetRole}\n` : ''}CV :\n"""\n${cvText}\n"""`;

      const aiResp = await runResilientJsonAi({ systemPrompt, userPrompt });
      const parsed =
        aiResp?.data && Array.isArray(aiResp.data.companies)
          ? aiResp.data
          : companyCompatibilityLocally(cvText, targetRole, companies, lang);

      res.json(parsed);
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 5. Tailored Cover Letter ---
  app.post('/api/cv/cover-letter', async (req: Request, res: Response) => {
    try {
      const {
        cvText,
        jobOfferText = '',
        companyName = '',
        jobTitle = '',
        tone = 'professionnel',
        language = 'fr',
      } = req.body || {};

      if (!cvText) {
        res.status(400).json({ error: 'Le CV est requis pour générer une lettre de motivation.' });
        return;
      }

      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';
      const langRule = getLanguageDirective(lang);

      const systemPrompt = `Tu es un expert en rédaction de candidatures chez EVOLYS.
${langRule}
Rédige une lettre de motivation en utilisant UNIQUEMENT les faits réels du CV. N'invente rien.
Retourne UNIQUEMENT un objet JSON :
{ "subject": string, "greeting": string, "paragraphs": string[], "closing": string, "fullText": string }`;

      const userPrompt = `Ton: ${tone} | Entreprise: ${companyName} | Poste: ${jobTitle}
${jobOfferText ? `Offre:\n"""\n${jobOfferText}\n"""\n` : ''}CV:\n"""\n${cvText}\n"""`;

      const aiResp = await runResilientJsonAi({ systemPrompt, userPrompt });
      const parsed =
        aiResp?.data && aiResp.data.fullText
          ? aiResp.data
          : coverLetterLocally({ cvText, jobOfferText, companyName, jobTitle, tone, lang });

      res.json(parsed);
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 6. Personalized Interview Prep + STAR Breakdown ---
  app.post('/api/cv/interview-prep', async (req: Request, res: Response) => {
    try {
      const { cvText, targetRole = '', jobOfferText = '', language = 'fr' } = req.body || {};
      if (!cvText) {
        res.status(400).json({ error: 'Le CV est requis pour préparer l’entretien.' });
        return;
      }

      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';
      const langRule = getLanguageDirective(lang);

      const systemPrompt = `Tu es un coach d'entretien senior chez EVOLYS.
${langRule}
Génère 6 questions personnalisées basées uniquement sur le CV réel et l'offre cible, avec réponses méthode STAR.
Retourne UNIQUEMENT un objet JSON :
{
  "focusSummary": string,
  "questions": [{ "id": string, "category": string, "question": string, "whyRecruiterAsks": string, "starAnswerGuide": string, "starBreakdown": { "situation": string, "task": string, "action": string, "result": string } }]
}`;

      const userPrompt = `${targetRole ? `Poste ciblé: ${targetRole}\n` : ''}${jobOfferText ? `Offre:\n"""\n${jobOfferText}\n"""\n` : ''}CV:\n"""\n${cvText}\n"""`;

      const aiResp = await runResilientJsonAi({ systemPrompt, userPrompt });
      const parsed =
        aiResp?.data && Array.isArray(aiResp.data.questions)
          ? aiResp.data
          : interviewPrepLocally({ cvText, targetRole, jobOfferText, lang });

      res.json(parsed);
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 7. Localized Live Job Feed (LinkedIn, Indeed + Local Boards e.g. Côte d'Ivoire) ---
  app.post('/api/jobs/search', async (req: Request, res: Response) => {
    try {
      const { query = 'emploi', locality = "Côte d'Ivoire", language = 'fr' } = req.body || {};
      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';

      const fallbackFeed = await searchWebJobsFallback(String(query), String(locality), lang);

      // If web scraping produced results, let open-source AI enrich job descriptions cleanly without blocking on quotas
      const aiResp = await runResilientJsonAi({
        systemPrompt: `Tu es le moteur de structuration d'offres d'emploi EVOLYS. ${getLanguageDirective(lang)}
Retourne un JSON { "jobs": [{ "id": string, "title": string, "company": string, "location": string, "source": string, "contractType": string, "publishedAt": string, "summary": string, "description": string, "url": string }] } enrichissant ces résultats réels sans changer leurs URLs.`,
        userPrompt: `Recherche: "${query}", Localité: "${locality}". Offres trouvées:\n${JSON.stringify(fallbackFeed.jobs)}`,
      });

      const jobs =
        aiResp?.data && Array.isArray(aiResp.data.jobs) && aiResp.data.jobs.length > 0
          ? aiResp.data.jobs
          : fallbackFeed.jobs;

      res.json({
        locality,
        query,
        jobs,
        sourcesUsed: fallbackFeed.sourcesUsed,
        groundingLinks: fallbackFeed.groundingLinks,
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // --- 8. Parse External Job Posting URL (SSRF-protected direct fetch + Open-Source AI) ---
  app.post('/api/jobs/parse-url', async (req: Request, res: Response) => {
    try {
      const { url, language = 'fr' } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Veuillez coller le lien URL d’une offre d’emploi.' });
        return;
      }

      const safeUrl = validateSafeExternalUrl(url);
      const lang: 'fr' | 'en' = language === 'en' ? 'en' : 'fr';

      let scraped = { title: '', company: '', location: '', description: '' };
      try {
        scraped = await scrapeExternalOfferHtml(safeUrl);
      } catch (err) {
        console.warn('[EVOLYS URL Scrape]', err instanceof Error ? err.message : err);
      }

      const aiResp = await runResilientJsonAi({
        systemPrompt: `${getLanguageDirective(lang)}
Extrais les informations structurées de cette offre d'emploi web et retourne UNIQUEMENT un objet JSON :
{ "jobTitle": string, "company": string, "location": string, "description": string }`,
        userPrompt: `URL: ${safeUrl}\nTitre détecté: ${scraped.title}\nEntreprise: ${scraped.company}\nLieu: ${scraped.location}\nContenu extrait:\n${scraped.description}`,
      });

      res.json({
        jobTitle: String(aiResp?.data?.jobTitle || scraped.title || ''),
        company: String(aiResp?.data?.company || scraped.company || ''),
        location: String(aiResp?.data?.location || scraped.location || ''),
        description: String(aiResp?.data?.description || scraped.description || ''),
        sourceUrl: safeUrl,
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Vite dev middleware or production static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EVOLYS CV Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start EVOLYS server:', err);
  process.exit(1);
});
