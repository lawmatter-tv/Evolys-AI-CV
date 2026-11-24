import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  ApplicationStatus,
  CandidateApplication,
  CvAnalysisResult,
  RecreatedCvResult,
  SavedCvHistoryItem,
  SubscriptionPlan,
  SubscriptionStatus,
  UserAccountProfile,
} from './types';

export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';

const app = initializeApp(firebaseConfig);
const resolvedDbId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-evolyscvstudio-e13bd49e-82e5-41bd-b60d-b1ce89be232b';

export const db = getFirestore(app, resolvedDbId);
export const auth = getAuth(app);

// Validate connection to Firestore on startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Strict in-memory Gmail OAuth access token cache (never written to localStorage/sessionStorage)
let cachedGmailAccessToken: string | null = null;
let isSigningIn = false;

export function getCachedGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function clearCachedGmailAccessToken(): void {
  cachedGmailAccessToken = null;
}

export function subscribeFirebaseAuth(
  onUserChanged: (user: User | null, gmailToken: string | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedGmailAccessToken = null;
      onUserChanged(null, null);
    } else if (!isSigningIn) {
      onUserChanged(user, cachedGmailAccessToken);
    }
  });
}

export async function signInWithGoogleAndGmail(): Promise<{
  user: User;
  gmailAccessToken: string | null;
}> {
  const provider = new GoogleAuthProvider();
  provider.addScope(GMAIL_COMPOSE_SCOPE);
  provider.setCustomParameters({ prompt: 'consent select_account' });

  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedGmailAccessToken = credential.accessToken;
    }
    return {
      user: result.user,
      gmailAccessToken: cachedGmailAccessToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function signInWithAppleAccount(): Promise<{ user: User }> {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    return { user: result.user };
  } finally {
    isSigningIn = false;
  }
}

export async function firebaseSignOut(): Promise<void> {
  cachedGmailAccessToken = null;
  await signOut(auth);
}

// Strip undefined properties recursively for Firestore Maps
function sanitizeForFirestore<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = sanitizeForFirestore(v);
      }
    }
    return out as T;
  }
  return val;
}

function clampStr(val: string | undefined, max: number): string {
  return (val || '').trim().slice(0, max);
}

function sanitizeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

export async function getOrCreateFirestoreUserProfile(
  user: User,
  authMethod: 'google' | 'apple' = 'google',
  defaultLocality = "Côte d'Ivoire"
): Promise<UserAccountProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: String(data.uid || user.uid),
        firstName: String(data.firstName || ''),
        lastName: String(data.lastName || ''),
        email: String(data.email || user.email || ''),
        phone: String(data.phone || ''),
        authMethod: (data.authMethod as UserAccountProfile['authMethod']) || authMethod,
        locality: String(data.locality || defaultLocality),
        plan: (data.plan as SubscriptionPlan) || 'trial',
        subscriptionStatus: (data.subscriptionStatus as SubscriptionStatus) || 'trialing',
        trialStartedAt: String(data.trialStartedAt || new Date().toISOString()),
        trialEndsAt: String(data.trialEndsAt || new Date(Date.now() + 7 * 86400000).toISOString()),
        stripeCustomerId: data.stripeCustomerId ? String(data.stripeCustomerId) : undefined,
      };
    }

    const displayName = (user.displayName || '').trim();
    const parts = displayName.split(/\s+/).filter(Boolean);
    const firstName = clampStr(parts[0] || 'Membre', 100);
    const lastName = clampStr(parts.slice(1).join(' ') || 'EVOLYS', 100);
    const now = new Date();
    const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const profilePayload = {
      uid: user.uid,
      firstName,
      lastName,
      email: clampStr(user.email || `${user.uid}@evolys.local`, 200),
      phone: clampStr(user.phoneNumber || '', 40),
      authMethod,
      locality: clampStr(defaultLocality, 120),
      plan: 'trial' as const,
      subscriptionStatus: 'trialing' as const,
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, profilePayload);

    return {
      uid: user.uid,
      firstName,
      lastName,
      email: profilePayload.email,
      phone: profilePayload.phone,
      authMethod,
      locality: profilePayload.locality,
      plan: 'trial',
      subscriptionStatus: 'trialing',
      trialStartedAt: profilePayload.trialStartedAt,
      trialEndsAt: profilePayload.trialEndsAt,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateFirestoreUserPlan(
  uid: string,
  plan: SubscriptionPlan,
  subscriptionStatus: SubscriptionStatus,
  stripeCustomerId?: string
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const updateData: Record<string, unknown> = {
      plan,
      subscriptionStatus,
      updatedAt: serverTimestamp(),
    };
    if (stripeCustomerId) {
      updateData.stripeCustomerId = clampStr(stripeCustomerId, 120);
    }
    await updateDoc(doc(db, 'users', uid), updateData);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreUserLocality(uid: string, locality: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      locality: clampStr(locality, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveCvToFirestore(
  uid: string,
  item: SavedCvHistoryItem
): Promise<void> {
  const cvId = sanitizeDocId(item.id);
  const path = `users/${uid}/cvs/${cvId}`;
  try {
    const ref = doc(db, 'users', uid, 'cvs', cvId);
    const existingSnap = await getDoc(ref);
    const sanitizedAnalysis = sanitizeForFirestore<CvAnalysisResult>(item.analysis);
    const sanitizedRecreated = item.recreated
      ? sanitizeForFirestore<RecreatedCvResult>(item.recreated)
      : undefined;

    if (existingSnap.exists()) {
      const updatePayload: Record<string, unknown> = {
        targetRole: clampStr(item.targetRole, 160),
        formatScore: Math.max(0, Math.min(100, Math.round(item.formatScore))),
        contentScore: Math.max(0, Math.min(100, Math.round(item.contentScore))),
        analyzedAt: clampStr(item.analyzedAt, 50),
        analysis: sanitizedAnalysis,
        updatedAt: serverTimestamp(),
      };
      if (sanitizedRecreated) {
        updatePayload.recreated = sanitizedRecreated;
      }
      await updateDoc(ref, updatePayload);
    } else {
      const createPayload: Record<string, unknown> = {
        id: cvId,
        ownerUid: uid,
        fileName: clampStr(item.fileName || 'CV.pdf', 200),
        candidateName: clampStr(item.candidateName || '', 160),
        targetRole: clampStr(item.targetRole || '', 160),
        formatScore: Math.max(0, Math.min(100, Math.round(item.formatScore))),
        contentScore: Math.max(0, Math.min(100, Math.round(item.contentScore))),
        analyzedAt: clampStr(item.analyzedAt, 50),
        analysis: sanitizedAnalysis,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (sanitizedRecreated) {
        createPayload.recreated = sanitizedRecreated;
      }
      await setDoc(ref, createPayload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function listCvsFromFirestore(uid: string): Promise<SavedCvHistoryItem[]> {
  const path = `users/${uid}/cvs`;
  try {
    const q = query(
      collection(db, 'users', uid, 'cvs'),
      where('ownerUid', '==', uid),
      orderBy('analyzedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        fileName: String(data.fileName || ''),
        candidateName: String(data.candidateName || ''),
        targetRole: String(data.targetRole || ''),
        formatScore: Number(data.formatScore || 0),
        contentScore: Number(data.contentScore || 0),
        analyzedAt: String(data.analyzedAt || ''),
        analysis: data.analysis as CvAnalysisResult,
        recreated: data.recreated as RecreatedCvResult | undefined,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveApplicationToFirestore(
  uid: string,
  appItem: CandidateApplication
): Promise<void> {
  const appId = sanitizeDocId(appItem.id);
  const path = `users/${uid}/applications/${appId}`;
  try {
    const payload: Record<string, unknown> = {
      id: appId,
      ownerUid: uid,
      candidateName: clampStr(appItem.candidateName || 'Candidat', 160),
      company: clampStr(appItem.company || 'Entreprise', 160),
      jobTitle: clampStr(appItem.jobTitle || 'Poste', 200),
      status: appItem.status,
      appliedDate: clampStr(appItem.appliedDate, 40),
      atsScoreSnapshot: Math.max(0, Math.min(100, Math.round(appItem.atsScoreSnapshot || 0))),
      notes: clampStr(appItem.notes || '', 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (appItem.recipientEmail) {
      payload.recipientEmail = clampStr(appItem.recipientEmail, 200);
    }
    if (appItem.coverLetterSnapshot) {
      payload.coverLetterSnapshot = clampStr(appItem.coverLetterSnapshot, 15000);
    }
    if (appItem.gmailMessageId) {
      payload.gmailMessageId = clampStr(appItem.gmailMessageId, 160);
    }
    await setDoc(doc(db, 'users', uid, 'applications', appId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateApplicationStatusInFirestore(
  uid: string,
  appId: string,
  status: ApplicationStatus,
  notes?: string
): Promise<void> {
  const cleanId = sanitizeDocId(appId);
  const path = `users/${uid}/applications/${cleanId}`;
  try {
    const updatePayload: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (notes !== undefined) {
      updatePayload.notes = clampStr(notes, 1000);
    }
    await updateDoc(doc(db, 'users', uid, 'applications', cleanId), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteApplicationFromFirestore(uid: string, appId: string): Promise<void> {
  const cleanId = sanitizeDocId(appId);
  const path = `users/${uid}/applications/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'applications', cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function listApplicationsFromFirestore(uid: string): Promise<CandidateApplication[]> {
  const path = `users/${uid}/applications`;
  try {
    const q = query(
      collection(db, 'users', uid, 'applications'),
      where('ownerUid', '==', uid),
      orderBy('appliedDate', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        candidateName: String(data.candidateName || ''),
        company: String(data.company || ''),
        jobTitle: String(data.jobTitle || ''),
        recipientEmail: data.recipientEmail ? String(data.recipientEmail) : undefined,
        status: data.status as ApplicationStatus,
        appliedDate: String(data.appliedDate || ''),
        atsScoreSnapshot: Number(data.atsScoreSnapshot || 0),
        notes: String(data.notes || ''),
        coverLetterSnapshot: data.coverLetterSnapshot
          ? String(data.coverLetterSnapshot)
          : undefined,
        gmailMessageId: data.gmailMessageId ? String(data.gmailMessageId) : undefined,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}
