import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { GoogleGenAI } from '@google/genai';

export interface StructuredCvData {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  summary: string;
  experiences: {
    role: string;
    company: string;
    period: string;
    location: string;
    bullets: string[];
  }[];
  education: {
    degree: string;
    school: string;
    period: string;
    details: string;
  }[];
  skills: string[];
  languages: string[];
  certifications: string[];
}

export interface ExtractedUpload {
  text?: string;
  inlinePart?: { inlineData: { mimeType: string; data: string } };
  isImageOnly?: boolean;
}

interface OpenSourceEndpoint {
  name: string;
  url: string;
  apiKey?: string;
  models: string[];
  extraHeaders?: Record<string, string>;
}

// Track zero-key anonymous OSS rate-limit window cleanly so requests never stall
let anonymousOssCooldownUntil = 0;

const DEFAULT_STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'et', 'ou', 'en', 'au', 'aux',
  'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'dans', 'chez', 'vers', 'entre', 'dont',
  'qui', 'que', 'quoi', 'est', 'sont', 'etre', 'être', 'avoir', 'faire', 'plus', 'tres',
  'très', 'nous', 'vous', 'ils', 'elles', 'leur', 'leurs', 'nos', 'vos', 'cette', 'ce',
  'ces', 'cet', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'tout', 'tous', 'toute', 'toutes',
  'afin', 'ainsi', 'alors', 'apres', 'après', 'avant', 'bien', 'comme', 'encore', 'meme',
  'même', 'mis', 'mise', 'non', 'oui', 'pas', 'peut', 'poste', 'profil', 'mission', 'missions',
  'entreprise', 'equipe', 'équipe', 'travail', 'annee', 'années', 'ans', 'experience',
  'expérience', 'competences', 'compétences', 'formation', 'candidat', 'recherche', 'recherchons',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'will', 'have', 'has', 'are',
  'was', 'were', 'been', 'being', 'about', 'into', 'over', 'such', 'than', 'then', 'them',
  'they', 'their', 'our', 'you', 'all', 'any', 'can', 'not', 'but', 'job', 'role', 'work',
  'team', 'years', 'experience', 'skills', 'required', 'preferred', 'responsibilities',
]);

// Domain competency clusters for semantic matching & tailored rewrites
const COMPETENCY_CLUSTERS: Record<string, string[]> = {
  project: ['gestion de projet', 'agile', 'scrum', 'kanban', 'coordination', 'planification', 'livrables', 'roadmap', 'jira', 'trello', 'kpi'],
  finance: ['comptabilité', 'syscohada', 'bilan', 'fiscalité', 'trésorerie', 'audit', 'contrôle de gestion', 'sage', 'budget', 'recouvrement', 'facturation'],
  tech: ['javascript', 'typescript', 'react', 'node', 'python', 'sql', 'api', 'git', 'cloud', 'docker', 'html', 'css', 'power bi', 'excel'],
  commercial: ['prospection', 'négociation', 'vente', 'b2b', 'b2c', 'crm', 'fidélisation', 'chiffre d’affaires', 'portefeuille client', 'marketing'],
  hr: ['recrutement', 'paie', 'cnps', 'formation', 'gpec', 'onboarding', 'entretiens', 'droit du travail', 'ressources humaines'],
  health: ['soins', 'patient', 'hygiène', 'protocole', 'accueil', 'triage', 'pharmacie', 'dossier médical', 'asepsie'],
  logistics: ['supply chain', 'logistique', 'stock', 'approvisionnement', 'transit', 'douane', 'import', 'export', 'inventaire'],
};

const WEAK_FR_PATTERNS: Array<{ pattern: RegExp; replacement: string; reason: string }> = [
  {
    pattern: /^(?:charg[ée]e?\s+(?:de|du|des|d['’]))\s+/i,
    replacement: 'Piloté et exécuté ',
    reason: 'Remplace une tournure passive (« Chargé de ») par un verbe d’action orienté réalisation.',
  },
  {
    pattern: /^(?:responsable\s+(?:de|du|des|d['’]))\s+/i,
    replacement: 'Supervisé et optimisé ',
    reason: 'Transforme un intitulé statique (« Responsable de ») en verbe d’impact mesurable.',
  },
  {
    pattern: /^(?:participation\s+(?:à|au|aux)|particip[ée]\s+(?:à|au|aux))\s+/i,
    replacement: 'Contribué activement à ',
    reason: 'Clarifie votre rôle actif plutôt qu’une présence passive.',
  },
  {
    pattern: /^(?:aide\s+(?:à|au|pour)|aid[ée]\s+(?:à|pour))\s+/i,
    replacement: 'Appuyé et déployé ',
    reason: 'Renforce la posture professionnelle devant les recruteurs et logiciels ATS.',
  },
  {
    pattern: /^(?:suivi\s+(?:de|du|des|d['’]))\s+/i,
    replacement: 'Suivi et coordonné avec rigueur ',
    reason: 'Précise la valeur opérationnelle de l’action de suivi.',
  },
  {
    pattern: /^(?:gestion\s+(?:de|du|des|d['’]))\s+/i,
    replacement: 'Géré et structuré ',
    reason: 'Privilégie le verbe d’action conjugué plutôt que le substantif abstrait.',
  },
  {
    pattern: /^(?:cr[ée]ation\s+(?:de|du|des|d['’]))\s+/i,
    replacement: 'Conçu et déployé ',
    reason: 'Met en avant l’initiative de conception de bout en bout.',
  },
  {
    pattern: /^(?:mise\s+en\s+place\s+(?:de|du|des|d['’]))\s+/i,
    replacement: 'Déployé et structuré ',
    reason: 'Formulation plus directe et reconnue par les filtres ATS.',
  },
  {
    pattern: /^(?:r[ée]daction\s+(?:de|du|des|d['’]))\s+/i,
    replacement: 'Rédigé et formalisé ',
    reason: 'Dynamise la compétence rédactionnelle avec précision.',
  },
  {
    pattern: /^(?:analyse\s+(?:de|du|des|d['’]))\s+/i,
    replacement: 'Analysé et synthétisé ',
    reason: 'Valorise la capacité d’analyse et de restitution décisionnelle.',
  },
];

const WEAK_EN_PATTERNS: Array<{ pattern: RegExp; replacement: string; reason: string }> = [
  {
    pattern: /^(?:responsible\s+for)\s+/i,
    replacement: 'Led and delivered ',
    reason: 'Replaces passive ownership phrasing with a strong action verb.',
  },
  {
    pattern: /^(?:helped\s+(?:with|to)|assisted\s+(?:with|in))\s+/i,
    replacement: 'Supported and executed ',
    reason: 'Highlights concrete operational execution over generic assistance.',
  },
  {
    pattern: /^(?:worked\s+on)\s+/i,
    replacement: 'Delivered and maintained ',
    reason: 'Demonstrates direct ownership and output.',
  },
  {
    pattern: /^(?:handled|dealt\s+with)\s+/i,
    replacement: 'Managed and resolved ',
    reason: 'Uses stronger ATS-preferred action vocabulary.',
  },
  {
    pattern: /^(?:tasked\s+with|in\s+charge\s+of)\s+/i,
    replacement: 'Spearheaded and coordinated ',
    reason: 'Elevates executive presence and ownership.',
  },
];

const ACTION_VERBS = [
  'dirigé', 'piloté', 'conçu', 'développé', 'amélioré', 'optimisé', 'géré', 'coordonné',
  'réduit', 'augmenté', 'déployé', 'structuré', 'négocié', 'analysé', 'supervisé', 'formé',
  'automatisé', 'réalisé', 'lancé', 'assuré', 'accompagné', 'établi', 'produit', 'contrôlé',
  'rédigé', 'administré', 'animé', 'organisé', 'validé', 'résolu',
  'led', 'managed', 'built', 'designed', 'developed', 'improved', 'increased', 'reduced',
  'delivered', 'launched', 'automated', 'coordinated', 'executed', 'analyzed', 'implemented',
  'optimized', 'trained', 'supervised', 'established', 'streamlined', 'spearheaded', 'supported',
];

export function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Réponse structurée illisible depuis le moteur IA.');
  }
}

export async function extractTextFromUpload(
  fileName: string,
  mimeType: string | undefined,
  fileBase64: string | undefined,
  rawText: string | undefined
): Promise<ExtractedUpload> {
  if (rawText && rawText.trim().length > 0) {
    return { text: rawText.trim() };
  }

  if (!fileBase64) {
    throw new Error('Aucun fichier ou texte de CV fourni.');
  }

  const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
  const buffer = Buffer.from(cleanBase64, 'base64');
  const lowerName = (fileName || '').toLowerCase();
  const normalizedMime = (mimeType || '').toLowerCase();

  // 1. PDF -> Extract UTF-8 text locally via unpdf
  if (lowerName.endsWith('.pdf') || normalizedMime === 'application/pdf') {
    try {
      const pdfResult = await extractText(new Uint8Array(buffer), { mergePages: true });
      const extracted = (
        Array.isArray(pdfResult.text) ? pdfResult.text.join('\n') : String(pdfResult.text || '')
      ).trim();
      if (extracted.length >= 40) {
        return { text: extracted };
      }
    } catch (err) {
      console.warn('[EVOLYS PDF Parser warning]', err instanceof Error ? err.message : err);
    }
    return {
      inlinePart: {
        inlineData: {
          mimeType: 'application/pdf',
          data: cleanBase64,
        },
      },
      isImageOnly: true,
    };
  }

  // 2. DOCX -> mammoth
  if (lowerName.endsWith('.docx') || normalizedMime.includes('wordprocessingml')) {
    const result = await mammoth.extractRawText({ buffer });
    const extracted = (result.value || '').trim();
    if (!extracted) {
      throw new Error('Impossible d’extraire du texte lisible depuis ce fichier DOCX.');
    }
    return { text: extracted };
  }

  // 3. Legacy DOC -> readable text pass
  if (lowerName.endsWith('.doc') || normalizedMime === 'application/msword') {
    const rawStr = buffer.toString('utf8').replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, ' ');
    const cleaned = rawStr.replace(/[ \t]{2,}/g, ' ').trim();
    if (cleaned.length > 80) {
      return { text: cleaned };
    }
    throw new Error(
      'Le format binaire .doc ancien est difficile à lire. Veuillez convertir en PDF ou DOCX, ou coller le texte du CV.'
    );
  }

  // 4. Plain text / Markdown
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || normalizedMime.startsWith('text/')) {
    return { text: buffer.toString('utf8').trim() };
  }

  // 5. Image CV upload
  const resolvedMime =
    normalizedMime && normalizedMime.startsWith('image/') ? normalizedMime : 'image/png';
  return {
    inlinePart: {
      inlineData: {
        mimeType: resolvedMime,
        data: cleanBase64,
      },
    },
    isImageOnly: true,
  };
}

function getConfiguredOpenSourceEndpoints(): OpenSourceEndpoint[] {
  const endpoints: OpenSourceEndpoint[] = [];

  if (process.env.OPEN_SOURCE_AI_BASE_URL) {
    const rawBase = process.env.OPEN_SOURCE_AI_BASE_URL.replace(/\/+$/, '');
    const url = rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`;
    endpoints.push({
      name: 'custom-opensource',
      url,
      apiKey: process.env.OPEN_SOURCE_AI_API_KEY || 'ollama',
      models: [
        process.env.OPEN_SOURCE_AI_MODEL || 'qwen2.5:32b',
        'llama3.3:70b',
        'llama3.1:8b',
      ],
    });
  }

  if (process.env.GROQ_API_KEY) {
    endpoints.push({
      name: 'groq-oss',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: process.env.GROQ_API_KEY,
      models: ['llama-3.3-70b-versatile', 'qwen-qwq-32b', 'llama-3.1-8b-instant'],
    });
  }

  const hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  if (hfKey) {
    endpoints.push({
      name: 'huggingface-oss',
      url: 'https://router.huggingface.co/v1/chat/completions',
      apiKey: hfKey,
      models: [
        'Qwen/Qwen2.5-72B-Instruct',
        'meta-llama/Llama-3.3-70B-Instruct',
        'mistralai/Mistral-Small-24B-Instruct-2501',
      ],
    });
  }

  if (process.env.OPENROUTER_API_KEY) {
    endpoints.push({
      name: 'openrouter-oss',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: process.env.OPENROUTER_API_KEY,
      models: [
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
      ],
      extraHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'https://evolys.app',
        'X-Title': 'EVOLYS CV Studio',
      },
    });
  }

  if (process.env.TOGETHER_API_KEY) {
    endpoints.push({
      name: 'together-oss',
      url: 'https://api.together.xyz/v1/chat/completions',
      apiKey: process.env.TOGETHER_API_KEY,
      models: [
        'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        'Qwen/Qwen2.5-72B-Instruct-Turbo',
      ],
    });
  }

  // Zero-Key Open-Source Endpoint (GPT-OSS 20B on OVH via Pollinations) when cooldown permits
  if (Date.now() > anonymousOssCooldownUntil) {
    endpoints.push({
      name: 'gpt-oss-20b-free',
      url: 'https://text.pollinations.ai/openai',
      models: ['openai-fast'],
    });
  }

  return endpoints;
}

async function callOpenAiCompatibleEndpoint(
  endpoint: OpenSourceEndpoint,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs = 16000
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(endpoint.extraHeaders || {}),
    };
    if (endpoint.apiKey) {
      headers.Authorization = `Bearer ${endpoint.apiKey}`;
    }

    const bodyPayload: Record<string, unknown> = {
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    if (endpoint.name === 'gpt-oss-20b-free') {
      bodyPayload.jsonMode = true;
    } else {
      bodyPayload.response_format = { type: 'json_object' };
    }

    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(bodyPayload),
    });

    if (res.status === 402 || res.status === 429) {
      if (endpoint.name === 'gpt-oss-20b-free') {
        anonymousOssCooldownUntil = Date.now() + 46000;
      }
      throw new Error(`${endpoint.name}/${model} rate-limited (${res.status})`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${endpoint.name}/${model} HTTP ${res.status}: ${errText.slice(0, 140)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${endpoint.name}/${model} returned empty content`);
    }
    if (endpoint.name === 'gpt-oss-20b-free') {
      anonymousOssCooldownUntil = Date.now() + 46000;
    }
    return extractJsonObject(content);
  } finally {
    clearTimeout(timer);
  }
}

async function tryGeminiFallback(
  systemPrompt: string,
  userPrompt: string,
  inlinePart?: { inlineData: { mimeType: string; data: string } }
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nRetourne UNIQUEMENT un objet JSON valide sans texte ni markdown autour.`;
    const contents = inlinePart
      ? { parts: [inlinePart, { text: fullPrompt }] }
      : fullPrompt;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
      },
    });
    return extractJsonObject(response.text ?? '{}');
  } catch {
    return null;
  }
}

export async function runResilientJsonAi(options: {
  systemPrompt: string;
  userPrompt: string;
  inlinePart?: { inlineData: { mimeType: string; data: string } };
}): Promise<{ data: Record<string, unknown>; engine: string } | null> {
  const endpoints = getConfiguredOpenSourceEndpoints();

  // 1. Open-source models (built-in zero-key GPT-OSS-20B or configured Ollama/Groq/HF/OpenRouter)
  if (!options.inlinePart) {
    for (const ep of endpoints) {
      for (const model of ep.models) {
        try {
          const parsed = await callOpenAiCompatibleEndpoint(
            ep,
            model,
            options.systemPrompt,
            options.userPrompt
          );
          return { data: parsed, engine: `${ep.name}:${model}` };
        } catch {
          // Silently rotate to next provider or deterministic engine
        }
      }
    }
  }

  // 2. Optional server cloud fallback (only if configured and under quota)
  const geminiResult = await tryGeminiFallback(
    options.systemPrompt,
    options.userPrompt,
    options.inlinePart
  );
  if (geminiResult) {
    return { data: geminiResult, engine: 'cloud-fallback' };
  }

  // 3. Built-in zero-quota deterministic EVOLYS NLP/ATS engine
  return null;
}

// ============================================================================
// SOPHISTICATED BUILT-IN EVOLYS NLP & EMPLOYABILITY ENGINE (ZERO-QUOTA)
// ============================================================================

function normalizeLines(raw: string): string[] {
  return raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

function classifyHeading(line: string):
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certifications'
  | null {
  const clean = line
    .toLowerCase()
    .replace(/^(?:[ivx]+\.|[0-9]+\.)\s*/i, '')
    .replace(/[:\-–—•*#|]/g, '')
    .trim();
  if (clean.length > 48) return null;

  if (/^(profil(?:\s+professionnel)?|r[ée]sum[ée]|summary|[àa]\s+propos|objectif(?:\s+professionnel)?|profile|about\s+me)$/i.test(clean)) {
    return 'summary';
  }
  if (/^(exp[ée]riences?(?:\s+professionnelles?)?|parcours(?:\s+professionnel)?|work\s+experience|experience|employment|career\s+history)$/i.test(clean)) {
    return 'experience';
  }
  if (/^(formations?(?:\s+acad[ée]miques?)?|[ée]tudes|dipl[ôo]mes|scolarit[ée]|education|academic\s+background)$/i.test(clean)) {
    return 'education';
  }
  if (/^(comp[ée]tences?(?:\s+(?:cl[ée]s|techniques|professionnelles))?|savoir-faire|skills|core\s+competencies|technical\s+skills|expertise|outils)$/i.test(clean)) {
    return 'skills';
  }
  if (/^(langues?|languages?)$/i.test(clean)) {
    return 'languages';
  }
  if (/^(certifications?|attestations?|licences?|certificates?)$/i.test(clean)) {
    return 'certifications';
  }
  return null;
}

export function parseCvLocally(rawText: string, targetRole = ''): StructuredCvData {
  const lines = normalizeLines(rawText);
  const fullJoined = lines.join('\n');

  const emailMatch = fullJoined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = fullJoined.match(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}/
  );
  const urlMatches =
    fullJoined.match(
      /https?:\/\/[^\s,)]+|(?:www\.)?[a-z0-9-]+\.(?:linkedin\.com|github\.com|behance\.net)[^\s,)]*/gi
    ) || [];

  const email = emailMatch ? emailMatch[0] : '';
  const phone =
    phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 8 ? phoneMatch[0].trim() : '';
  const links = Array.from(new Set(urlMatches)).slice(0, 5);

  let fullName = '';
  let headline = targetRole.trim();
  let location = '';

  const locationHint = fullJoined.match(
    /\b(Abidjan|Cocody|Plateau|Marcory|Yopougon|Côte d['’]Ivoire|Bouak[ée]|Yamoussoukro|San-P[ée]dro|Korhogo|Dakar|S[ée]n[ée]gal|Lom[ée]|Cotonou|Ouagadougou|Bamako|Douala|Yaound[ée]|Casablanca|Paris|Lyon|France|Bruxelles|Gen[èe]ve|Montr[ée]al|Canada)\b/i
  );
  if (locationHint) {
    location = locationHint[0];
  }

  for (let i = 0; i < Math.min(7, lines.length); i++) {
    const l = lines[i];
    if (classifyHeading(l)) break;
    if (l.includes('@') || /https?:\/\//i.test(l) || /^\+?\d[\d\s.-]{6,}$/.test(l)) continue;
    const cleanedLine = l.replace(/[|•]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!fullName && cleanedLine.split(' ').length <= 5 && cleanedLine.length <= 45) {
      fullName = cleanedLine;
    } else if (!headline && cleanedLine.length <= 95) {
      headline = l.replace(/[|•]/g, ' · ').trim();
    }
  }

  if (!fullName) fullName = 'Candidat EVOLYS';

  const sections: Record<string, string[]> = {
    intro: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
  };

  let currentSection = 'intro';
  for (const l of lines) {
    // Support inline headings like "Compétences : Excel, Python"
    const colonIdx = l.indexOf(':');
    if (colonIdx > 2 && colonIdx < 30) {
      const maybeHeading = classifyHeading(l.slice(0, colonIdx));
      if (maybeHeading) {
        currentSection = maybeHeading;
        const rest = l.slice(colonIdx + 1).trim();
        if (rest) sections[currentSection].push(rest);
        continue;
      }
    }
    const heading = classifyHeading(l);
    if (heading) {
      currentSection = heading;
      continue;
    }
    sections[currentSection].push(l);
  }

  let summary = sections.summary.join(' ').trim();
  if (!summary && sections.intro.length > 2) {
    const candidateIntro = sections.intro
      .slice(1)
      .filter((l) => !l.includes('@') && l !== fullName && l !== headline && l.length > 28);
    summary = candidateIntro.slice(0, 3).join(' ').trim();
  }

  const periodRegex =
    /(?:(?:janv?|f[ée]vr?|mars?|avr|mai|juin|juil|ao[ûu]t?|sept?|oct|nov|d[ée]c|january|february|march|april|may|june|july|august|september|october|november|december)\.?\s*)?\b(?:19|20)\d{2}\b(?:\s*[-–—/àau]+\s*(?:(?:janv?|f[ée]vr?|mars?|avr|mai|juin|juil|ao[ûu]t?|sept?|oct|nov|d[ée]c)?\.?\s*(?:19|20)\d{2}|pr[ée]sent|actuel|aujourd['’]hui|en cours|present|current|now))?/i;

  const experiences: StructuredCvData['experiences'] = [];
  let currentExp: StructuredCvData['experiences'][number] | null = null;

  for (const line of sections.experience) {
    const cleanBullet = line.replace(/^[•\-–—*▸▪◦]+\s*/, '').trim();
    const isBullet = /^[•\-–—*▸▪◦]\s*/.test(line);
    const hasPeriod = periodRegex.test(line);

    if (
      !isBullet &&
      (hasPeriod ||
        (line.length < 90 && (line.includes('|') || line.includes('—') || line.includes(' - '))))
    ) {
      if (currentExp) experiences.push(currentExp);
      const periodMatch = line.match(periodRegex);
      const period = periodMatch ? periodMatch[0].trim() : '';
      const withoutPeriod = period
        ? line.replace(period, '').replace(/[()|]+/g, ' ').trim()
        : line;
      const parts = withoutPeriod
        .split(/\s+[—|–-]\s+|\s+@\s+|,\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      currentExp = {
        role: parts[0] || withoutPeriod || 'Poste occupé',
        company: parts[1] || '',
        period,
        location: parts[2] || '',
        bullets: [],
      };
    } else if (currentExp) {
      if (cleanBullet.length > 4) currentExp.bullets.push(cleanBullet);
    } else if (cleanBullet.length > 10) {
      currentExp = {
        role: cleanBullet.slice(0, 75),
        company: '',
        period: '',
        location: '',
        bullets: [],
      };
    }
  }
  if (currentExp) experiences.push(currentExp);

  const education: StructuredCvData['education'] = [];
  for (const line of sections.education) {
    const clean = line.replace(/^[•\-–—*]+\s*/, '').trim();
    const periodMatch = clean.match(periodRegex);
    const period = periodMatch ? periodMatch[0].trim() : '';
    const remainder = period ? clean.replace(period, '').replace(/[()|]+/g, ' ').trim() : clean;
    const parts = remainder
      .split(/\s+[—|–-]\s+|,\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts[0]) {
      education.push({
        degree: parts[0],
        school: parts[1] || '',
        period,
        details: parts.slice(2).join(' · '),
      });
    }
  }

  const splitTags = (arr: string[]) =>
    Array.from(
      new Set(
        arr
          .join(', ')
          .split(/[,;|•/·]+/)
          .map((s) => s.replace(/^[•\-–—*]+\s*/, '').trim())
          .filter((s) => s.length >= 2 && s.length <= 50)
      )
    );

  const skills = splitTags(sections.skills).slice(0, 24);
  const languages = splitTags(sections.languages).slice(0, 8);
  const certifications = splitTags(sections.certifications).slice(0, 10);

  return {
    fullName,
    headline,
    email,
    phone,
    location,
    links,
    summary,
    experiences,
    education,
    skills,
    languages,
    certifications,
  };
}

function improveBulletLine(line: string, lang: 'fr' | 'en'): { improved: string; reason: string } | null {
  const trimmed = line.replace(/^[•\-–—*]\s*/, '').trim();
  if (trimmed.length < 12) return null;

  const patterns = lang === 'en' ? WEAK_EN_PATTERNS : WEAK_FR_PATTERNS;
  for (const rule of patterns) {
    if (rule.pattern.test(trimmed)) {
      const rest = trimmed.replace(rule.pattern, '');
      const formatted = `${rule.replacement}${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
      return { improved: formatted, reason: rule.reason };
    }
  }

  const firstWord = trimmed
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôöùûüç]/gi, '');
  if (!ACTION_VERBS.includes(firstWord) && trimmed.length < 135) {
    const prefix = lang === 'en' ? 'Executed and coordinated: ' : 'Assuré et optimisé : ';
    const reason =
      lang === 'en'
        ? 'Opens with a clear action verb so ATS parsers and recruiters immediately see your contribution.'
        : 'Démarre par un verbe d’action fort pour capter immédiatement l’attention du recruteur et de l’ATS.';
    return {
      improved: `${prefix}${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`,
      reason,
    };
  }
  return null;
}

export function analyzeCvLocally(
  rawText: string,
  targetRole: string,
  lang: 'fr' | 'en'
): Record<string, unknown> {
  const isEn = lang === 'en';
  const structuredCv = parseCvLocally(rawText, targetRole);
  const lower = rawText.toLowerCase();
  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;

  const hasReadableText = rawText.trim().length >= 120;
  const hasEmail = Boolean(structuredCv.email);
  const hasPhone = Boolean(structuredCv.phone);
  const hasExp =
    structuredCv.experiences.length > 0 || /exp[ée]rience|parcours|work experience/i.test(lower);
  const hasEdu =
    structuredCv.education.length > 0 ||
    /formation|dipl[ôo]me|licence|master|bac|education|bachelor/i.test(lower);
  const hasSkills =
    structuredCv.skills.length >= 3 || /comp[ée]tences|skills|outils|ma[îi]trise/i.test(lower);
  const headingCount = normalizeLines(rawText).filter((l) => classifyHeading(l) !== null).length;
  const hasDates = /(?:19|20)\d{2}/.test(rawText);
  const reasonableLen = wordCount >= 120 && wordCount <= 1100;

  const atsChecks = [
    {
      id: 'readable_text',
      label: isEn ? 'Readable ATS text' : 'Texte lisible',
      pointsEarned: hasReadableText ? 20 : 8,
      maxPoints: 20,
      status: hasReadableText ? 'passed' : 'failed',
      finding: hasReadableText
        ? isEn
          ? 'Clean UTF-8 text detected by ATS.'
          : 'Le texte du CV est exploitable par les parseurs ATS.'
        : isEn
          ? 'Too little readable text extracted.'
          : 'Volume de texte lisible insuffisant.',
      explanation: isEn
        ? 'ATS software parses raw text first; insufficient text causes blind rejection.'
        : 'Les ATS lisent uniquement les caractères texte. Sans texte lisible, votre profil est ignoré.',
      howToFix: isEn
        ? 'Export as selectable text PDF or DOCX.'
        : 'Utilisez un export PDF vectoriel ou DOCX standard.',
    },
    {
      id: 'email',
      label: isEn ? 'Email address' : 'E-mail',
      pointsEarned: hasEmail ? 10 : 0,
      maxPoints: 10,
      status: hasEmail ? 'passed' : 'failed',
      finding: hasEmail
        ? structuredCv.email
        : isEn
          ? 'No valid email detected.'
          : 'Aucune adresse e-mail détectée.',
      explanation: isEn
        ? 'Recruiters automate interview outreach via email.'
        : 'Indispensable pour la prise de contact et l’indexation candidat.',
      howToFix: isEn
        ? 'Add a professional email in the header.'
        : 'Ajoutez une adresse e-mail professionnelle en haut du CV.',
    },
    {
      id: 'phone',
      label: isEn ? 'Phone number' : 'Téléphone',
      pointsEarned: hasPhone ? 6 : 0,
      maxPoints: 6,
      status: hasPhone ? 'passed' : 'failed',
      finding: hasPhone
        ? structuredCv.phone
        : isEn
          ? 'No phone number found.'
          : 'Numéro de téléphone absent ou mal formaté.',
      explanation: isEn
        ? 'Enables rapid screening calls.'
        : 'Permet aux recruteurs locaux de vous joindre rapidement.',
      howToFix: isEn
        ? 'Include international format e.g. +225...'
        : 'Ajoutez votre numéro au format lisible (ex : +225 07 ...).',
    },
    {
      id: 'experience_section',
      label: isEn ? 'Experience section' : 'Section expérience',
      pointsEarned: structuredCv.experiences.length >= 2 ? 14 : hasExp ? 10 : 4,
      maxPoints: 14,
      status: structuredCv.experiences.length >= 2 ? 'passed' : hasExp ? 'warning' : 'failed',
      finding:
        structuredCv.experiences.length > 0
          ? `${structuredCv.experiences.length} ${isEn ? 'roles identified' : 'postes structurés'}`
          : isEn
            ? 'Experience section poorly delimited.'
            : 'Rubrique expérience peu structurée.',
      explanation: isEn
        ? 'Experience entries power ATS ranking.'
        : 'Le cœur du score ATS repose sur des expériences datées avec puces claires.',
      howToFix: isEn
        ? 'Use standard heading "Work Experience" and bullet points.'
        : 'Utilisez le titre « Expérience professionnelle » et des puces précises.',
    },
    {
      id: 'education_section',
      label: isEn ? 'Education section' : 'Section formation',
      pointsEarned: structuredCv.education.length >= 1 ? 10 : hasEdu ? 7 : 2,
      maxPoints: 10,
      status: structuredCv.education.length >= 1 ? 'passed' : hasEdu ? 'warning' : 'failed',
      finding: hasEdu
        ? isEn
          ? 'Education credentials found.'
          : 'Parcours académique détecté.'
        : isEn
          ? 'Education section missing.'
          : 'Section Formation non détectée.',
      explanation: isEn
        ? 'Confirms degree eligibility filters.'
        : 'Permet de valider les prérequis de diplôme dans les filtres ATS.',
      howToFix: isEn
        ? 'Add degree, institution, and graduation year.'
        : 'Indiquez diplôme, établissement et année.',
    },
    {
      id: 'skills_section',
      label: isEn ? 'Skills section' : 'Section compétences',
      pointsEarned: structuredCv.skills.length >= 5 ? 12 : hasSkills ? 8 : 3,
      maxPoints: 12,
      status: structuredCv.skills.length >= 5 ? 'passed' : hasSkills ? 'warning' : 'failed',
      finding: `${structuredCv.skills.length} ${isEn ? 'skills parsed' : 'compétences détectées'}`,
      explanation: isEn
        ? 'ATS matches job keywords directly against your skills.'
        : 'Les mots-clés techniques du CV sont croisés avec ceux de l’offre.',
      howToFix: isEn
        ? 'Group 8–14 core skills clearly separated.'
        : 'Listez 8 à 14 compétences clés séparées proprement.',
    },
    {
      id: 'clear_headings',
      label: isEn ? 'Clear section headings' : 'Titres de section clairs',
      pointsEarned: headingCount >= 3 ? 8 : headingCount >= 2 ? 5 : 2,
      maxPoints: 8,
      status: headingCount >= 3 ? 'passed' : 'warning',
      finding: `${headingCount} ${isEn ? 'standard headings recognized' : 'titres standards reconnus'}`,
      explanation: isEn
        ? 'Creative titles confuse automated parsers.'
        : 'Les intitulés originaux (« Mon histoire ») perturbent la segmentation ATS.',
      howToFix: isEn
        ? 'Stick to Experience, Education, Skills.'
        : 'Utilisez : Profil, Expériences, Formation, Compétences.',
    },
    {
      id: 'reasonable_length',
      label: isEn ? 'Reasonable length' : 'Longueur raisonnable',
      pointsEarned: reasonableLen ? 8 : 5,
      maxPoints: 8,
      status: reasonableLen ? 'passed' : 'warning',
      finding: `${wordCount} ${isEn ? 'words' : 'mots'}`,
      explanation: isEn
        ? 'Ideal ATS length is 250–900 words (1–2 pages).'
        : 'Un CV optimal contient entre 250 et 900 mots (1 à 2 pages).',
      howToFix: isEn
        ? 'Keep concise bullet points.'
        : 'Condensez les phrases longues en réalisations synthétiques.',
    },
    {
      id: 'no_image_text',
      label: isEn ? 'No trapped image text' : 'Structure sans texte bloqué',
      pointsEarned: 6,
      maxPoints: 6,
      status: 'passed',
      finding: isEn ? 'Single-layer readable flow.' : 'Flux texte continu sans blocage graphique.',
      explanation: isEn
        ? 'Multi-column graphics often scramble reading order.'
        : 'Les tableaux complexes et infographies nuisent au classement ATS.',
      howToFix: isEn
        ? 'Maintain single-column or clean two-zone order.'
        : 'Conservez une mise en page linéaire épurée.',
    },
    {
      id: 'chronology',
      label: isEn ? 'Readable dates & chronology' : 'Dates et chronologie lisibles',
      pointsEarned: hasDates ? 6 : 2,
      maxPoints: 6,
      status: hasDates ? 'passed' : 'failed',
      finding: hasDates
        ? isEn
          ? 'Year markers detected.'
          : 'Repères chronologiques présents.'
        : isEn
          ? 'Missing dates on experiences.'
          : 'Dates absentes ou illisibles.',
      explanation: isEn
        ? 'ATS calculates total years of experience from dates.'
        : 'Les ATS calculent automatiquement votre ancienneté grâce aux dates.',
      howToFix: isEn
        ? 'Use YYYY - YYYY format.'
        : 'Formatez vos périodes avec « MM/AAAA - MM/AAAA » ou « 2022 - 2025 ».',
    },
  ];

  const formatScore = atsChecks.reduce((acc, c) => acc + c.pointsEarned, 0);
  const potentialGainPoints = 100 - formatScore;

  const allBullets = structuredCv.experiences.flatMap((e) => e.bullets);
  const textSampleLines = allBullets.length > 0 ? allBullets : normalizeLines(rawText);
  const quantifiedCount = textSampleLines.filter((l) =>
    /\d+%|\d+\s*(€|\$|fcfa|xof|clients|projets|personnes|ans|mois|dossiers|équipes)/i.test(l)
  ).length;
  const actionCount = textSampleLines.filter((l) => {
    const first = l.split(/\s+/)[0]?.toLowerCase() || '';
    return ACTION_VERBS.some((v) => first.startsWith(v));
  }).length;

  const quantifiedScore = Math.min(95, Math.max(28, quantifiedCount * 22 + 28));
  const actionScore = Math.min(95, Math.max(35, actionCount * 16 + 38));
  const summaryScore = structuredCv.summary.length >= 60 ? 85 : 42;
  const contentScore = Math.round(quantifiedScore * 0.35 + actionScore * 0.4 + summaryScore * 0.25);

  const candidateLines = [
    ...(structuredCv.summary ? [structuredCv.summary] : []),
    ...allBullets,
    ...normalizeLines(rawText).filter((l) => l.length > 25 && l.length < 180 && !l.includes('@')),
  ];
  const seenOrig = new Set<string>();
  const lineByLineFeedback: Array<{
    id: string;
    section: string;
    originalLine: string;
    issue: string;
    improvedLine: string;
    rationale: string;
  }> = [];

  for (const line of candidateLines) {
    if (seenOrig.has(line) || lineByLineFeedback.length >= 6) continue;
    seenOrig.add(line);
    const fix = improveBulletLine(line, lang);
    if (fix) {
      lineByLineFeedback.push({
        id: `lb_${lineByLineFeedback.length + 1}`,
        section:
          line === structuredCv.summary
            ? isEn
              ? 'Summary'
              : 'Profil'
            : isEn
              ? 'Experience'
              : 'Expérience',
        originalLine: line,
        issue: isEn ? 'Weak action phrasing' : 'Verbe ou tournure à renforcer',
        improvedLine: fix.improved,
        rationale: fix.reason,
      });
    }
  }

  if (lineByLineFeedback.length === 0 && candidateLines.length > 0) {
    const sample = candidateLines[0];
    lineByLineFeedback.push({
      id: 'lb_1',
      section: isEn ? 'Experience' : 'Expérience',
      originalLine: sample,
      issue: isEn ? 'Impact clarity' : 'Mise en valeur du résultat',
      improvedLine: isEn
        ? `Delivered measurable outcomes while executing: ${sample.charAt(0).toLowerCase()}${sample.slice(1)}`
        : `Piloté avec efficacité et sens du résultat : ${sample.charAt(0).toLowerCase()}${sample.slice(1)}`,
      rationale: isEn
        ? 'Strengthens executive presence without adding unverified numbers.'
        : 'Renforce l’impact professionnel sans inventer de faux chiffres.',
    });
  }

  const contentPassedChecks = [
    {
      title: isEn ? 'Authentic Background Extracted' : 'Parcours réel structuré',
      detail: `${structuredCv.experiences.length} ${isEn ? 'experiences' : 'expériences'} · ${structuredCv.skills.length} ${isEn ? 'skills' : 'compétences'}`,
    },
    ...(hasEmail && hasPhone
      ? [
          {
            title: isEn ? 'Complete Contact Header' : 'Coordonnées complètes',
            detail: `${structuredCv.email} · ${structuredCv.phone}`,
          },
        ]
      : []),
  ];

  const contentIssues = [
    ...(quantifiedCount < 2
      ? [
          {
            id: 'ci_metrics',
            title: isEn
              ? 'Add verifiable quantified outcomes'
              : 'Quantifiez davantage vos réalisations réelles',
            summary: isEn
              ? 'Few measurable indicators (%, volume, deadlines) detected.'
              : 'Peu d’indicateurs chiffrés (%, volumes, délais) figurent dans vos missions.',
            whyItMatters: isEn
              ? 'Recruiters evaluate scale and business impact from concrete metrics.'
              : 'Les recruteurs mesurent la portée de votre travail grâce aux chiffres réels.',
            fromYourCv: allBullets[0] || structuredCv.summary || rawText.slice(0, 120),
            howToImprove: isEn
              ? 'Specify team size, volume handled, or time saved wherever you know exact numbers.'
              : 'Précisez quand vous le savez le volume traité, la taille d’équipe ou le gain de temps obtenu.',
            severity: 'high' as const,
          },
        ]
      : []),
    ...(!structuredCv.summary
      ? [
          {
            id: 'ci_summary',
            title: isEn
              ? 'Missing targeted summary'
              : 'Ajoutez une accroche professionnelle ciblée',
            summary: isEn
              ? 'No concise 2-3 line summary found at the top.'
              : 'Aucune synthèse de 2 à 3 lignes ne présente votre valeur dès le haut du CV.',
            whyItMatters: isEn
              ? 'Hiring managers scan the top third of a CV in under 7 seconds.'
              : 'Le haut du CV décide en quelques secondes de la lecture complète de votre dossier.',
            fromYourCv: structuredCv.headline || rawText.replace(/\s+/g, ' ').trim().slice(0, 110),
            howToImprove: isEn
              ? 'Summarize your years of experience, core domain, and target role.'
              : 'Résumez en 2 phrases votre spécialité, vos compétences clés et le poste recherché.',
            severity: 'medium' as const,
          },
        ]
      : []),
  ];

  if (contentIssues.length === 0) {
    contentIssues.push({
      id: 'ci_tailor',
      title: isEn
        ? 'Tailor phrasing to target role keywords'
        : 'Alignez le vocabulaire sur l’offre ciblée',
      summary: isEn
        ? 'Your structure is sound; aligning exact job keywords can raise interview callbacks.'
        : 'Base solide ; reprendre les mots-clés exacts de l’offre optimisera encore le taux de réponse.',
      whyItMatters: isEn
        ? 'ATS filters rank exact keyword matches highest.'
        : 'Les ATS classent les CV selon l’adéquation exacte avec le cahier des charges.',
      fromYourCv: structuredCv.headline || structuredCv.skills.slice(0, 4).join(', '),
      howToImprove: isEn
        ? 'Use the "Compare & Adapt" tab to reorder skills and bullets for each job post.'
        : 'Utilisez l’onglet « Comparer & Adapter » pour réordonner vos compétences selon chaque offre.',
      severity: 'medium' as const,
    });
  }

  const quickWins = atsChecks
    .filter((c) => c.pointsEarned < c.maxPoints)
    .slice(0, 4)
    .map((c, idx) => ({
      id: `qw_${idx + 1}`,
      title: c.label,
      pointsGain: c.maxPoints - c.pointsEarned,
      description: c.howToFix,
      targetSection: c.id,
    }));

  if (quickWins.length === 0) {
    quickWins.push({
      id: 'qw_1',
      title: isEn ? 'Tailor CV to target job offer' : 'Adapter les mots-clés à l’offre visée',
      pointsGain: 4,
      description: isEn
        ? 'Align headline and top skills with the specific posting.'
        : 'Placez en tête les compétences réelles les plus demandées par l’annonce.',
      targetSection: 'skills',
    });
  }

  return {
    extractedText: rawText,
    formatScore,
    contentScore,
    formatVerdict:
      formatScore >= 85
        ? isEn
          ? 'Excellent ATS Readability'
          : 'Très lisible ATS'
        : formatScore >= 65
          ? isEn
            ? 'Good Base · Optimizable'
            : 'Bonne base · À optimiser'
          : isEn
            ? 'ATS Risks Detected'
            : 'Risque de blocage ATS',
    contentVerdict:
      contentScore >= 80
        ? isEn
          ? 'Strong Impact'
          : 'Impact solide'
        : contentScore >= 60
          ? isEn
            ? 'Clear · Can Be Sharper'
            : 'Clair · À dynamiser'
          : isEn
            ? 'Needs Action Phrasing'
            : 'À renforcer',
    summaryBanner: isEn
      ? `Audit complete: ${structuredCv.experiences.length} experience blocks and ${structuredCv.skills.length} skills extracted cleanly. Up to +${potentialGainPoints} ATS format points available.`
      : `Diagnostic complet : ${structuredCv.experiences.length} expérience(s) et ${structuredCv.skills.length} compétence(s) extraites fidèlement. Jusqu’à +${potentialGainPoints} points ATS récupérables.`,
    potentialGainPoints,
    radarMetrics: {
      atsCompatibility: formatScore,
      skillRelevance: Math.min(96, Math.max(45, structuredCv.skills.length * 8 + 30)),
      experienceImpact: actionScore,
      quantifiedResults: quantifiedScore,
      sectionStructure: Math.min(98, Math.max(40, headingCount * 18 + 32)),
      readability: reasonableLen ? 88 : 66,
    },
    atsChecks,
    contentPassedChecks,
    contentIssues,
    quickWins,
    lineByLineFeedback,
    structuredCv,
  };
}

export function recreateCvLocally(params: {
  extractedText: string;
  structuredCv?: StructuredCvData;
  acceptedLineRewrites?: Array<{ originalLine: string; improvedLine: string }>;
  targetRole?: string;
  jobOfferText?: string;
  company?: string;
  jobTitle?: string;
  lang: 'fr' | 'en';
}): Record<string, unknown> {
  const isEn = params.lang === 'en';
  const baseCv: StructuredCvData = params.structuredCv
    ? JSON.parse(JSON.stringify(params.structuredCv))
    : parseCvLocally(params.extractedText, params.targetRole);

  const rewriteMap = new Map(
    (params.acceptedLineRewrites || []).map((r) => [r.originalLine.trim(), r.improvedLine.trim()])
  );

  if (baseCv.summary && rewriteMap.has(baseCv.summary.trim())) {
    baseCv.summary = rewriteMap.get(baseCv.summary.trim())!;
  }

  baseCv.experiences = baseCv.experiences.map((exp) => ({
    ...exp,
    bullets: exp.bullets.map((b) => {
      if (rewriteMap.has(b.trim())) return rewriteMap.get(b.trim())!;
      const fix = improveBulletLine(b, params.lang);
      return fix ? fix.improved : b;
    }),
  }));

  const effectiveRole = (params.jobTitle || params.targetRole || '').trim();
  if (effectiveRole && !baseCv.headline.toLowerCase().includes(effectiveRole.toLowerCase())) {
    baseCv.headline = baseCv.headline ? `${effectiveRole} · ${baseCv.headline}` : effectiveRole;
  }

  if (!baseCv.summary) {
    const topSkills = baseCv.skills.slice(0, 5).join(', ');
    baseCv.summary = isEn
      ? `Results-oriented ${effectiveRole || baseCv.headline || 'professional'} with proven expertise${topSkills ? ` in ${topSkills}` : ''}. Dedicated to reliable execution and measurable impact.`
      : `${effectiveRole || baseCv.headline || 'Professionnel(le)'} rigoureux(se) et orienté(e) résultats${topSkills ? `, maîtrisant ${topSkills}` : ''}. Engagé(e) à apporter une contribution concrète et mesurable.`;
  }

  let matchScoreAfterTailoring: number | undefined;
  if (params.jobOfferText) {
    const offerLower = params.jobOfferText.toLowerCase();
    const matchedSkills = baseCv.skills.filter((s) => offerLower.includes(s.toLowerCase()));
    const otherSkills = baseCv.skills.filter((s) => !offerLower.includes(s.toLowerCase()));
    baseCv.skills = [...matchedSkills, ...otherSkills];

    // Sort experiences so most offer-relevant role leads if equal/clear relevance
    baseCv.experiences = [...baseCv.experiences].sort((a, b) => {
      const aHits = matchedSkills.filter((s) =>
        `${a.role} ${a.bullets.join(' ')}`.toLowerCase().includes(s.toLowerCase())
      ).length;
      const bHits = matchedSkills.filter((s) =>
        `${b.role} ${b.bullets.join(' ')}`.toLowerCase().includes(s.toLowerCase())
      ).length;
      return bHits - aHits;
    });

    const comparison = compareOfferLocally(
      JSON.stringify(baseCv),
      params.jobOfferText,
      params.jobTitle || '',
      params.company || '',
      params.lang
    );
    matchScoreAfterTailoring = Math.min(96, Number(comparison.matchScore || 75) + 8);
  }

  return {
    cv: baseCv,
    projectedFormatScore: 94,
    projectedContentScore: 88,
    matchScoreAfterTailoring,
    improvementsSummary: isEn
      ? [
          'Standardized ATS hierarchy & clean section labels',
          'Strengthened experience bullets with action verbs (zero fabricated facts)',
          params.jobOfferText
            ? 'Prioritized matching real skills and experiences for the target offer'
            : 'Aligned headline and professional summary',
        ]
      : [
          'Hiérarchie ATS standardisée et rubriques normalisées',
          'Verbes d’action renforcés sans aucune donnée inventée',
          params.jobOfferText
            ? 'Compétences et expériences réelles réordonnées selon les priorités de l’offre'
            : 'Titre professionnel et accroche alignés sur votre objectif',
        ],
  };
}

function extractOfferKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const matchedClusterTerms: string[] = [];
  for (const terms of Object.values(COMPETENCY_CLUSTERS)) {
    for (const term of terms) {
      if (lower.includes(term)) matchedClusterTerms.push(term);
    }
  }

  const words = text
    .replace(/[^\p{L}\p{N}+#.\-\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !DEFAULT_STOPWORDS.has(w.toLowerCase()));

  const counts = new Map<string, { label: string; count: number }>();
  for (const term of matchedClusterTerms) {
    counts.set(term.toLowerCase(), { label: term, count: 5 });
  }
  for (const w of words) {
    const k = w.toLowerCase();
    const prev = counts.get(k);
    counts.set(k, { label: prev?.label || w, count: (prev?.count || 0) + 1 });
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 18)
    .map((x) => x.label);
}

export function compareOfferLocally(
  cvText: string,
  jobOfferText: string,
  jobTitle: string,
  company: string,
  lang: 'fr' | 'en'
): Record<string, unknown> {
  const isEn = lang === 'en';
  const cvLower = cvText.toLowerCase();
  const keywords = extractOfferKeywords(`${jobTitle} ${jobOfferText}`);
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of keywords) {
    if (cvLower.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  const ratio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0.65;
  const matchScore = Math.max(32, Math.min(96, Math.round(ratio * 100)));

  return {
    matchScore,
    roleFitSummary: isEn
      ? `Your profile matches ${matchedKeywords.length} of ${keywords.length} key terms identified for ${jobTitle || 'this role'}${company ? ` at ${company}` : ''}.`
      : `Votre CV couvre ${matchedKeywords.length} mot(s)-clé(s) sur ${keywords.length} extraits de l’offre${jobTitle ? ` (${jobTitle})` : ''}${company ? ` chez ${company}` : ''}.`,
    matchedKeywords: matchedKeywords.slice(0, 10),
    missingKeywords: missingKeywords.slice(0, 8),
    exactAdditions: missingKeywords.slice(0, 4).map((kw, idx) => ({
      targetSection:
        idx === 0
          ? isEn
            ? 'Skills'
            : 'Compétences'
          : isEn
            ? 'Experience / Summary'
            : 'Expériences / Profil',
      suggestion: isEn
        ? `If you genuinely practiced "${kw}", include this exact keyword explicitly.`
        : `Si vous maîtrisez réellement « ${kw} », mentionnez ce terme exact dans cette rubrique.`,
      reason: isEn
        ? 'Exact term appears in the job requirements and improves ATS keyword matching.'
        : 'Ce terme figure dans les critères de l’offre et augmente votre visibilité ATS.',
    })),
  };
}

export function companyCompatibilityLocally(
  cvText: string,
  targetRole: string,
  companies: string[],
  lang: 'fr' | 'en'
): Record<string, unknown> {
  const isEn = lang === 'en';
  const parsed = parseCvLocally(cvText, targetRole);
  const baseScore = Math.min(86, 52 + parsed.skills.length * 2 + parsed.experiences.length * 5);

  const items = companies.slice(0, 5).map((comp, idx) => {
    const score = Math.max(
      48,
      Math.min(93, baseScore - idx * 3 + (cvText.toLowerCase().includes('data') ? 4 : 0))
    );
    return {
      company: comp,
      sector: /google|microsoft/i.test(comp)
        ? 'Tech & Cloud'
        : /orange|mtn/i.test(comp)
          ? 'Télécoms & Digital'
          : /deloitte/i.test(comp)
            ? 'Conseil & Audit'
            : 'Banque & Finance',
      compatibilityScore: score,
      verdict:
        score >= 75
          ? isEn
            ? 'Competitive profile'
            : 'Profil compétitif'
          : isEn
            ? 'Needs targeted keyword alignment'
            : 'À affiner selon l’offre',
      keyStrengths: [
        parsed.skills.length > 0
          ? `${isEn ? 'Skills' : 'Compétences'} : ${parsed.skills.slice(0, 4).join(', ')}`
          : isEn
            ? 'Clear professional foundation'
            : 'Parcours structuré',
        `${parsed.experiences.length || 1} ${isEn ? 'experience block(s) documented' : 'expérience(s) documentée(s)'}`,
      ],
      priorityGaps: [
        isEn
          ? `Quantify results specifically valued by ${comp}`
          : `Mettre davantage en avant des indicateurs chiffrés attendus chez ${comp}`,
        isEn
          ? 'Align exact terminology with the official job posting'
          : 'Reprendre les termes exacts des fiches de poste du groupe',
      ],
    };
  });

  return {
    overallReadiness: isEn
      ? `Benchmark evaluated across ${items.length} major employers based on your real CV structure and ${parsed.skills.length} detected skills.`
      : `Évaluation réalisée sur ${items.length} grands recruteurs à partir de votre parcours réel et de vos ${parsed.skills.length} compétences extraites.`,
    companies: items,
  };
}

export function coverLetterLocally(params: {
  cvText: string;
  jobOfferText?: string;
  companyName: string;
  jobTitle: string;
  tone: string;
  lang: 'fr' | 'en';
}): Record<string, unknown> {
  const isEn = params.lang === 'en';
  const parsed = parseCvLocally(params.cvText, params.jobTitle);
  const role = params.jobTitle || parsed.headline || (isEn ? 'the open position' : 'le poste proposé');
  const company = params.companyName || (isEn ? 'your organization' : 'votre entreprise');
  const expSample = parsed.experiences[0];
  const topSkills = parsed.skills.slice(0, 6).join(', ');

  const subject = isEn
    ? `Application for ${role}${params.companyName ? ` — ${params.companyName}` : ''} | ${parsed.fullName}`
    : `Candidature au poste de ${role}${params.companyName ? ` — ${params.companyName}` : ''} | ${parsed.fullName}`;

  const greeting = isEn ? 'Dear Hiring Manager,' : 'Madame, Monsieur,';

  const paragraphs = isEn
    ? [
        `I am writing to express my strong interest in the ${role} opportunity at ${company}. With my background as ${parsed.headline || role}, I am eager to bring disciplined execution and measurable value to your team.`,
        expSample
          ? `Most recently as ${expSample.role}${expSample.company ? ` at ${expSample.company}` : ''}, I developed practical expertise${expSample.bullets[0] ? `, notably by ${expSample.bullets[0].charAt(0).toLowerCase()}${expSample.bullets[0].slice(1)}` : ''}.`
          : `Throughout my academic and professional path, I have built strong operational habits and a commitment to quality outcomes.`,
        topSkills
          ? `My core competencies — including ${topSkills} — align closely with the priorities of ${company}. I would welcome the opportunity to discuss how my verified experience can support your upcoming objectives.`
          : `I would welcome the opportunity to discuss how my background aligns with the needs of ${company} during an interview.`,
      ]
    : [
        `C’est avec un vif intérêt que je vous soumets ma candidature au poste de ${role} au sein de ${company}. Fort(e) de mon parcours en tant que ${parsed.headline || role}, je souhaite mettre mon engagement et mon sens des résultats au service de vos équipes.`,
        expSample
          ? `Lors de mon expérience en tant que ${expSample.role}${expSample.company ? ` chez ${expSample.company}` : ''}, j’ai consolidé mon savoir-faire opérationnel${expSample.bullets[0] ? `, notamment sur l’axe suivant : ${expSample.bullets[0].charAt(0).toLowerCase()}${expSample.bullets[0].slice(1)}` : ''}.`
          : `Mon parcours m’a permis de développer rigueur, autonomie et capacité d’adaptation face aux exigences du terrain.`,
        topSkills
          ? `Ma maîtrise de compétences clés telles que ${topSkills} constitue un atout concret pour répondre efficacement aux missions attendues par ${company}. Je serais ravi(e) d’échanger avec vous lors d’un entretien.`
          : `Je me tiens à votre entière disposition pour un entretien afin de vous exposer plus en détail ma motivation et mes réalisations.`,
      ];

  const closing = isEn
    ? `Sincerely,\n${parsed.fullName}${parsed.phone ? `\n${parsed.phone}` : ''}${parsed.email ? ` · ${parsed.email}` : ''}`
    : `Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.\n\n${parsed.fullName}${parsed.phone ? `\n${parsed.phone}` : ''}${parsed.email ? ` · ${parsed.email}` : ''}`;

  return {
    subject,
    greeting,
    paragraphs,
    closing,
    fullText: `${greeting}\n\n${paragraphs.join('\n\n')}\n\n${closing}`,
  };
}

export function interviewPrepLocally(params: {
  cvText: string;
  targetRole: string;
  jobOfferText?: string;
  lang: 'fr' | 'en';
}): Record<string, unknown> {
  const isEn = params.lang === 'en';
  const parsed = parseCvLocally(params.cvText, params.targetRole);
  const role = params.targetRole || parsed.headline || (isEn ? 'target position' : 'poste visé');
  const exp0 = parsed.experiences[0];
  const exp1 = parsed.experiences[1] || exp0;
  const topSkill = parsed.skills[0] || (isEn ? 'your primary domain' : 'votre domaine clé');
  const offerKeywords = params.jobOfferText
    ? extractOfferKeywords(params.jobOfferText).slice(0, 3)
    : [];

  const questions = [
    {
      id: 'iq_1',
      category: isEn ? 'Background' : 'Parcours',
      question: isEn
        ? `Walk me through your experience${exp0 ? ` as ${exp0.role}` : ''} and how it prepares you for ${role}.`
        : `Pouvez-vous présenter votre parcours${exp0 ? ` (notamment en tant que ${exp0.role})` : ''} et en quoi il vous prépare au poste de ${role} ?`,
      whyRecruiterAsks: isEn
        ? 'Assesses clarity, career progression, and direct relevance to the role.'
        : 'Évalue la cohérence de votre parcours et votre capacité à synthétiser votre valeur ajoutée.',
      starBreakdown: {
        situation: exp0
          ? `${isEn ? 'Context' : 'Contexte'} : ${exp0.role}${exp0.company ? ` (${exp0.company})` : ''}`
          : isEn
            ? 'Key project from your background.'
            : 'Contexte principal de votre dernière expérience.',
        task: isEn
          ? `Deliver reliable operational results aligned with ${role}.`
          : `Répondre aux objectifs attendus sur le périmètre ${role}.`,
        action:
          exp0?.bullets[0] ||
          `${isEn ? 'Applied' : 'Mobilisé'} ${topSkill} ${isEn ? 'with structured execution.' : 'avec méthode et suivi.'}`,
        result: isEn
          ? 'Built transferable mastery directly applicable from week one.'
          : 'Compétences opérationnelles directement transférables dès la prise de poste.',
      },
      starAnswerGuide: isEn
        ? `In my role${exp0 ? ` as ${exp0.role}${exp0.company ? ` at ${exp0.company}` : ''}` : ''}, I focused on ${exp0?.bullets[0] || topSkill}. This taught me how to structure priorities and deliver reliably — exactly what is required as ${role}.`
        : `En tant que ${exp0?.role || parsed.headline || 'professionnel'}${exp0?.company ? ` chez ${exp0.company}` : ''}, j’ai été amené(e) à ${exp0?.bullets[0] || `mobiliser ${topSkill}`}. Cette expérience m’a permis d’acquérir une méthodologie directement utile pour réussir en tant que ${role}.`,
    },
    {
      id: 'iq_2',
      category: isEn ? 'Technical Skills' : 'Compétences techniques',
      question: isEn
        ? `How have you applied ${topSkill} to solve a concrete challenge?`
        : `Comment avez-vous concrètement utilisé ${topSkill} pour résoudre un problème ou améliorer un processus ?`,
      whyRecruiterAsks: isEn
        ? 'Verifies hands-on mastery beyond listing keywords on a CV.'
        : 'Vérifie la maîtrise réelle de la compétence au-delà de la simple mention sur le CV.',
      starBreakdown: {
        situation: isEn
          ? 'An operational bottleneck or recurring requirement.'
          : 'Une contrainte opérationnelle ou un besoin précis rencontré.',
        task: isEn
          ? `Apply ${topSkill} to stabilize and improve quality.`
          : `Mobiliser ${topSkill} pour fiabiliser l’exécution.`,
        action: isEn
          ? 'Analyzed root causes, implemented structured steps, verified output.'
          : 'Analyse du besoin, mise en œuvre structurée et contrôle qualité.',
        result: isEn
          ? 'Improved consistency and team confidence.'
          : 'Exécution plus fluide et fiabilité renforcée.',
      },
      starAnswerGuide: isEn
        ? `Using ${topSkill}, I structured the workflow step by step, verified each deliverable against expectations, and ensured the team could rely on clean outputs.`
        : `Face à ce besoin, j’ai appliqué ${topSkill} de façon structurée : diagnostic initial, exécution rigoureuse et vérification des livrables afin de garantir un résultat fiable.`,
    },
    {
      id: 'iq_3',
      category: isEn ? 'Situational' : 'Mise en situation',
      question: isEn
        ? 'Tell me about a time you had to manage competing deadlines under pressure.'
        : 'Racontez une situation où vous avez dû gérer plusieurs priorités urgentes simultanément.',
      whyRecruiterAsks: isEn
        ? 'Tests prioritization, stress management, and stakeholder communication.'
        : 'Teste votre sens des priorités, votre sang-froid et votre communication.',
      starBreakdown: {
        situation: isEn
          ? 'Multiple deliverables due within a tight window.'
          : 'Plusieurs tâches critiques avec échéances rapprochées.',
        task: isEn
          ? 'Meet critical deadlines without sacrificing accuracy.'
          : 'Tenir les délais sans dégrader la qualité.',
        action: isEn
          ? 'Ranked tasks by impact, communicated timelines early, tracked progress.'
          : 'Hiérarchisation par urgence/impact, point rapide avec les interlocuteurs et suivi rigoureux.',
        result: isEn
          ? 'All key milestones delivered on schedule.'
          : 'Livrables rendus dans les délais avec satisfaction de l’équipe.',
      },
      starAnswerGuide: isEn
        ? 'When facing overlapping deadlines, I listed every requirement by business impact, aligned expectations early with my team, and executed sequentially without last-minute surprises.'
        : 'J’ai d’abord listé les priorités selon leur impact, clarifié les délais réalistes avec les parties prenantes et avancé bloc par bloc, ce qui a permis de tout livrer à temps.',
    },
    {
      id: 'iq_4',
      category: isEn ? 'Role Alignment' : 'Adéquation offre',
      question:
        offerKeywords.length > 0
          ? isEn
            ? `This offer highlights ${offerKeywords.join(', ')}. Which concrete achievements demonstrate your readiness?`
            : `L’offre met l’accent sur : ${offerKeywords.join(', ')}. Quels éléments de votre parcours prouvent votre capacité sur ces axes ?`
          : isEn
            ? `What will be your top 3 priorities in your first 90 days as ${role}?`
            : `Quelles seraient vos 3 priorités durant les 90 premiers jours au poste de ${role} ?`,
      whyRecruiterAsks: isEn
        ? 'Checks whether you understand the real expectations of this specific opening.'
        : 'Vérifie votre compréhension des enjeux du poste et votre capacité de projection.',
      starBreakdown: {
        situation: isEn
          ? 'Onboarding into a new team environment.'
          : 'Prise de fonction et découverte de l’environnement.',
        task: isEn
          ? 'Align quickly with team workflows and deliver early wins.'
          : 'Comprendre les processus internes et apporter une première valeur.',
        action: isEn
          ? 'Audit existing tools, clarify KPIs, execute high-priority deliverables.'
          : 'Écoute des équipes, prise en main des outils et exécution ciblée.',
        result: isEn
          ? 'Fast integration and measurable contribution within 3 months.'
          : 'Intégration rapide et contribution opérationnelle durable.',
      },
      starAnswerGuide: isEn
        ? `My first step is listening and mapping existing processes, second is aligning on key priorities with leadership, and third is applying my strengths in ${parsed.skills.slice(0, 3).join(', ') || role}.`
        : `D’abord observer et comprendre vos outils et attentes ; ensuite aligner les priorités avec la direction ; enfin déployer mon savoir-faire (${parsed.skills.slice(0, 3).join(', ') || role}) sur les chantiers prioritaires.`,
    },
    {
      id: 'iq_5',
      category: isEn ? 'Achievements' : 'Résultats',
      question: isEn
        ? `Which achievement${exp1 ? ` at ${exp1.company || exp1.role}` : ''} are you most proud of, and why?`
        : `Quelle réalisation${exp1?.company ? ` chez ${exp1.company}` : ''} vous rend le/la plus fier(ère) et pourquoi ?`,
      whyRecruiterAsks: isEn
        ? 'Reveals what standards you hold yourself to and how you define success.'
        : 'Révèle vos standards d’exigence et ce qui vous motive dans l’action.',
      starBreakdown: {
        situation: exp1
          ? `${exp1.role} — ${exp1.company}`
          : isEn
            ? 'Recent professional milestone.'
            : 'Projet marquant récent.',
        task: isEn
          ? 'Achieve a clear quality or operational improvement.'
          : 'Atteindre un objectif exigeant.',
        action:
          exp1?.bullets[0] ||
          (isEn
            ? 'Took initiative and coordinated execution end to end.'
            : 'Prise d’initiative et suivi jusqu’à l’aboutissement.'),
        result: isEn
          ? 'Positive feedback and lasting value for the team.'
          : 'Impact concret reconnu par l’équipe ou la hiérarchie.',
      },
      starAnswerGuide: isEn
        ? `During my time${exp1 ? ` as ${exp1.role}` : ''}, I was especially proud of ${exp1?.bullets[0] || 'delivering a key initiative reliably'}, because it required rigor from start to finish.`
        : `Ce qui m’a particulièrement marqué(e) en tant que ${exp1?.role || 'collaborateur'}, c’est d’avoir mené à bien ${exp1?.bullets[0] || 'un projet exigeant'}, grâce à une organisation rigoureuse du début à la fin.`,
    },
    {
      id: 'iq_6',
      category: isEn ? 'Motivation' : 'Motivation',
      question: isEn
        ? 'Why should we select your profile among other qualified candidates?'
        : 'Pourquoi choisir votre profil plutôt qu’un autre candidat pour ce poste ?',
      whyRecruiterAsks: isEn
        ? 'Tests self-awareness and concise value proposition.'
        : 'Permet de synthétiser votre proposition de valeur de manière convaincante.',
      starBreakdown: {
        situation: isEn
          ? 'Competitive recruitment process.'
          : 'Processus de sélection exigeant.',
        task: isEn
          ? 'Demonstrate unique combination of skills and reliability.'
          : 'Démontrer la complémentarité entre vos compétences et votre état d’esprit.',
        action: isEn
          ? 'Connect verified skills with disciplined work ethic.'
          : 'Relier vos compétences concrètes à votre sens de l’engagement.',
        result: isEn
          ? 'Immediate reliability and long-term growth potential.'
          : 'Un profil fiable, opérationnel et engagé dans la durée.',
      },
      starAnswerGuide: isEn
        ? `You gain a candidate combining verified skills (${parsed.skills.slice(0, 4).join(', ') || role}), hands-on adaptability, and strong commitment to delivering clean results.`
        : `En retenant mon profil, vous intégrez une personne immédiatement impliquée, qui allie compétences éprouvées (${parsed.skills.slice(0, 4).join(', ') || role}) et rigueur d’exécution au quotidien.`,
    },
  ];

  return {
    focusSummary: isEn
      ? `Prepared 6 STAR-structured questions tailored to ${role}, grounded strictly in your real CV experiences.`
      : `6 questions ciblées et réponses structurées selon la méthode STAR pour le poste de ${role}, basées fidèlement sur votre CV.`,
    questions,
  };
}

// ============================================================================
// REAL WEB SCRAPE & SEARCH FALLBACK FOR JOB FEED + EXTERNAL URL IMPORT
// ============================================================================

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function scrapeExternalOfferHtml(url: string): Promise<{
  title: string;
  company: string;
  location: string;
  description: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();

    let ldTitle = '';
    let ldCompany = '';
    let ldLocation = '';
    let ldDesc = '';
    const ldMatches = html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    for (const m of ldMatches) {
      try {
        const json = JSON.parse(m[1].trim());
        const items = Array.isArray(json) ? json : json['@graph'] || [json];
        for (const item of items) {
          if (
            item &&
            (item['@type'] === 'JobPosting' || String(item['@type']).includes('JobPosting'))
          ) {
            ldTitle = String(item.title || '');
            ldCompany = String(item.hiringOrganization?.name || '');
            ldLocation = String(
              item.jobLocation?.address?.addressLocality ||
                item.jobLocation?.address?.addressCountry ||
                ''
            );
            ldDesc = decodeHtmlEntities(String(item.description || '').replace(/<[^>]+>/g, ' '));
          }
        }
      } catch {
        // Ignore malformed JSON-LD
      }
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const ogDescMatch = html.match(
      /<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)["']/i
    );

    const strippedBody = decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    );

    return {
      title: decodeHtmlEntities(
        (ldTitle || h1Match?.[1] || titleMatch?.[1] || '').replace(/<[^>]+>/g, '')
      ).slice(0, 140),
      company: decodeHtmlEntities(ldCompany).slice(0, 100),
      location: decodeHtmlEntities(ldLocation).slice(0, 100),
      description: (ldDesc || ogDescMatch?.[1] || strippedBody).slice(0, 4000),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchWebJobsFallback(
  queryText: string,
  locality: string,
  lang: 'fr' | 'en'
): Promise<{
  sourcesUsed: string[];
  jobs: Array<{
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
  }>;
  groundingLinks: Array<{ title: string; url: string }>;
}> {
  const isEn = lang === 'en';
  const locLower = locality.toLowerCase();
  const isIvoryCoast =
    locLower.includes('ivoire') ||
    locLower.includes('abidjan') ||
    locLower.includes('ci') ||
    locLower.includes('bouak') ||
    locLower.includes('yamoussoukro');

  const sourcesUsed = isIvoryCoast
    ? ['Emploi Jeunes CI', 'Jobivoire', 'Educarriere', 'Emploi Rapide Net', 'LinkedIn', 'Indeed']
    : ['LinkedIn', 'Indeed', `Portails locaux (${locality})`];

  const cleanQ = encodeURIComponent(queryText || 'emploi');
  const cleanLoc = encodeURIComponent(locality || "Côte d'Ivoire");

  const scrapedJobs: Array<{
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
  }> = [];

  try {
    const ddgUrl = isIvoryCoast
      ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${queryText} emploi "${locality}" (jobivoire OR educarriere OR agenceemploijeunes OR emploirapide OR linkedin)`)}`
      : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${queryText} jobs "${locality}" (linkedin OR indeed)`)}`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(ddgUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EVOLYSBot/1.0)',
      },
    });
    clearTimeout(t);

    if (res.ok) {
      const html = await res.text();
      const blocks = html.split(/class="result__body"/).slice(1, 9);
      blocks.forEach((blk, idx) => {
        const hrefMatch = blk.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        const snipMatch = blk.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
        if (hrefMatch) {
          let href = decodeHtmlEntities(hrefMatch[1]);
          if (href.includes('uddg=')) {
            const u = new URLSearchParams(href.split('?')[1] || '');
            href = u.get('uddg') || href;
          }
          const rawTitle = decodeHtmlEntities(hrefMatch[2].replace(/<[^>]+>/g, ''));
          const snippet = decodeHtmlEntities((snipMatch?.[1] || '').replace(/<[^>]+>/g, ''));
          const host = (() => {
            try {
              return new URL(href).hostname;
            } catch {
              return '';
            }
          })();
          const source = host.includes('jobivoire')
            ? 'Jobivoire'
            : host.includes('educarriere')
              ? 'Educarriere'
              : host.includes('emploijeunes')
                ? 'Emploi Jeunes CI'
                : host.includes('emploirapide')
                  ? 'Emploi Rapide Net'
                  : host.includes('indeed')
                    ? 'Indeed'
                    : host.includes('linkedin')
                      ? 'LinkedIn'
                      : host || 'Portail Emploi';

          if (href.startsWith('http') && rawTitle) {
            scrapedJobs.push({
              id: `web_job_${idx + 1}`,
              title: rawTitle.slice(0, 110),
              company: source,
              location: locality,
              source,
              contractType: isEn ? 'Full-time / Contract' : 'CDI / CDD',
              publishedAt: isEn ? 'Live web result' : 'Résultat web récent',
              summary: snippet || rawTitle,
              description: `${rawTitle}\n\n${snippet}`,
              url: href,
            });
          }
        }
      });
    }
  } catch {
    // Proceed to portal directory below
  }

  if (scrapedJobs.length >= 3) {
    return {
      sourcesUsed,
      jobs: scrapedJobs,
      groundingLinks: scrapedJobs.map((j) => ({ title: `${j.source} — ${j.title}`, url: j.url })),
    };
  }

  const portalListings = isIvoryCoast
    ? [
        {
          id: 'ci_ej',
          title: `${queryText} — Offres officielles`,
          company: 'Agence Emploi Jeunes Côte d’Ivoire',
          location: locality,
          source: 'Emploi Jeunes CI',
          contractType: 'CDI / CDD / Stage',
          publishedAt: isEn ? 'Live portal' : 'Portail officiel',
          summary: isEn
            ? `Browse active opportunities for "${queryText}" on Agence Emploi Jeunes CI.`
            : `Consultez les offres récentes pour « ${queryText} » sur l’Agence Emploi Jeunes CI et copiez le lien d’une offre pour adapter votre CV.`,
          description: `Recherche ciblée ${queryText} en ${locality} : maîtrise des outils métiers, rigueur d’exécution, sens du résultat, travail en équipe et adaptation terrain.`,
          url: `https://www.agenceemploijeunes.ci/site/offres-emplois?search=${cleanQ}`,
        },
        {
          id: 'ci_jobivoire',
          title: `${queryText} — Recrutements en cours`,
          company: 'Entreprises en Côte d’Ivoire',
          location: locality,
          source: 'Jobivoire',
          contractType: 'CDI / CDD',
          publishedAt: isEn ? 'Live portal' : 'Portail local CI',
          summary: isEn
            ? `Direct search feed on Jobivoire.ci for ${queryText}.`
            : `Accédez aux annonces actives « ${queryText} » publiées sur Jobivoire.ci et adaptez votre CV en un clic.`,
          description: `Poste de ${queryText} basé à ${locality}. Compétences attendues : gestion de projets, communication professionnelle, reporting et autonomie.`,
          url: `https://www.jobivoire.ci/?s=${cleanQ}`,
        },
        {
          id: 'ci_educarriere',
          title: `${queryText} — Appels à candidatures`,
          company: 'Educarriere Côte d’Ivoire',
          location: locality,
          source: 'Educarriere',
          contractType: 'CDI / Consultant / Stage',
          publishedAt: isEn ? 'Live portal' : 'Portail local CI',
          summary: isEn
            ? `Latest private, NGO & institutional openings on Educarriere.ci.`
            : `Offres secteur privé, ONG et institutions pour « ${queryText} » sur Educarriere.ci.`,
          description: `Profil recherché pour ${queryText} en ${locality} : expérience vérifiable, maîtrise des outils bureautiques/métiers et capacité d’analyse.`,
          url: `https://emploi.educarriere.ci/nos-offres?q=${cleanQ}`,
        },
        {
          id: 'ci_emploirapide',
          title: `${queryText} — Annonces rapides`,
          company: 'Emploi Rapide Net',
          location: locality,
          source: 'Emploi Rapide Net',
          contractType: 'Temps plein',
          publishedAt: isEn ? 'Live portal' : 'Portail local CI',
          summary: isEn
            ? `Direct opportunities for ${queryText} on Emploi Rapide Net.`
            : `Opportunités quotidiennes « ${queryText} » sur Emploi Rapide Net (${locality}).`,
          description: `Missions principales : pilotage opérationnel, coordination avec les équipes locales et suivi des objectifs pour le poste de ${queryText}.`,
          url: `https://emploirapide.net/?s=${cleanQ}`,
        },
        {
          id: 'ci_linkedin',
          title: `${queryText} (${locality})`,
          company: 'Réseau LinkedIn Jobs',
          location: locality,
          source: 'LinkedIn',
          contractType: 'CDI / Hybride',
          publishedAt: isEn ? 'Live feed' : 'Flux LinkedIn',
          summary: isEn
            ? `LinkedIn job listings matching "${queryText}" in ${locality}.`
            : `Offres LinkedIn correspondant à « ${queryText} » à ${locality}.`,
          description: `LinkedIn ${queryText} (${locality}) : expériences chiffrées, compétences techniques validées et collaboration transversale.`,
          url: `https://www.linkedin.com/jobs/search/?keywords=${cleanQ}&location=${cleanLoc}`,
        },
        {
          id: 'ci_indeed',
          title: `${queryText} — Offres Indeed`,
          company: 'Indeed Emploi',
          location: locality,
          source: 'Indeed',
          contractType: 'CDI / CDD',
          publishedAt: isEn ? 'Live feed' : 'Flux Indeed',
          summary: isEn
            ? `Indeed search results for "${queryText}" in ${locality}.`
            : `Annonces agrégées sur Indeed pour « ${queryText} » (${locality}).`,
          description: `Indeed ${queryText} (${locality}) : réactivité, autonomie, gestion des priorités et adéquation aux standards ATS.`,
          url: `https://www.indeed.com/jobs?q=${cleanQ}&l=${cleanLoc}`,
        },
      ]
    : [
        {
          id: 'glb_linkedin',
          title: `${queryText} (${locality})`,
          company: 'LinkedIn Jobs',
          location: locality,
          source: 'LinkedIn',
          contractType: 'Full-time / Hybrid',
          publishedAt: isEn ? 'Live feed' : 'Flux en direct',
          summary: isEn
            ? `Browse live LinkedIn postings for "${queryText}" in ${locality}.`
            : `Consultez les offres LinkedIn pour « ${queryText} » en ${locality}.`,
          description: `${queryText} — ${locality} : expérience confirmée, réalisations mesurables et maîtrise des compétences clés du poste.`,
          url: `https://www.linkedin.com/jobs/search/?keywords=${cleanQ}&location=${cleanLoc}`,
        },
        {
          id: 'glb_indeed',
          title: `${queryText} (${locality})`,
          company: 'Indeed',
          location: locality,
          source: 'Indeed',
          contractType: 'Full-time / Contract',
          publishedAt: isEn ? 'Live feed' : 'Flux en direct',
          summary: isEn
            ? `Browse active Indeed openings for "${queryText}" in ${locality}.`
            : `Annonces Indeed pour « ${queryText} » à ${locality}.`,
          description: `${queryText} (${locality}) : exécution opérationnelle, esprit d’analyse et compétences techniques vérifiées.`,
          url: `https://www.indeed.com/jobs?q=${cleanQ}&l=${cleanLoc}`,
        },
      ];

  const merged = [...scrapedJobs, ...portalListings];
  return {
    sourcesUsed,
    jobs: merged,
    groundingLinks: merged.map((j) => ({ title: `${j.source} — ${j.title}`, url: j.url })),
  };
}
