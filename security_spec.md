# EVOLYS CV Studio — Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: User profiles (`/users/{userId}`) contain email, phone, and billing metadata. No user can list `/users`, and only the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`) can read or mutate their own profile.
2. **Ownership & Master Gate**: Every CV document (`/users/{userId}/cvs/{cvId}`) and job application (`/users/{userId}/applications/{appId}`) must have `ownerUid == request.auth.uid`, a valid ID (`^[a-zA-Z0-9_-]+$`), and a valid parent `/users/{userId}` document verified via `exists()`.
3. **Self-Privilege Prevention**: On `UserProfile` creation, `plan` MUST start as `'trial'` and `subscriptionStatus` MUST start as `'trialing'`. Users cannot create an already-paid `'premium'` profile for free on registration without going through an explicit plan transition update, and immutable fields (`uid`, `createdAt`, `ownerUid`) can never be changed.
4. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
5. **Volumetric Bounds**: Every string field enforces strict `.size()` bounds matching `firebase-blueprint.json` to prevent resource exhaustion ("Denial of Wallet").

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read**: `get(/users/alice)` with `auth = null`.
2. **Cross-user PII read**: `get(/users/alice)` signed in as `bob`.
3. **Blanket user directory list**: `list(/users)` signed in as `alice`.
4. **Unverified email write**: `create(/users/alice)` with `email_verified: false`.
5. **Shadow / Ghost field injection**: `create(/users/alice)` including `{ isAdmin: true }`.
6. **Privilege escalation on signup**: `create(/users/alice)` setting `plan: "premium"` directly at creation.
7. **ID poisoning**: `create(/users/alice/cvs/<1500-char-id>)` or slash/symbol IDs.
8. **Cross-owner CV spoofing**: `create(/users/alice/cvs/cv1)` as `bob` or with `ownerUid: "bob"`.
9. **Immutable field mutation**: `update(/users/alice/cvs/cv1)` changing `ownerUid` or `createdAt`.
10. **Client timestamp forgery**: `create(/users/alice/cvs/cv1)` with hardcoded past `createdAt` instead of `request.time`.
11. **Value poisoning / oversized payload**: `update(/users/alice/applications/app1)` injecting a 100KB `notes` string.
12. **Status enum tampering**: `update(/users/alice/applications/app1)` setting `status: "hacked_status"`.
