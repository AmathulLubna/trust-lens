# Firebase Migration Guide

## Current Architecture Summary

| Layer | Current (Convex) | Target (Firebase) |
|-------|------------------|-------------------|
| **Database** | Convex (real-time, serverless) | **Cloud Firestore** |
| **Auth** | `@convex-dev/auth` (email OTP + anonymous) | **Firebase Auth** (Email/Password, Anonymous, Phone, Google) |
| **API** | Convex queries/mutations/actions | **Firebase Cloud Functions (Callable HTTPS)** + **Client SDK** |
| **Real-time** | `useQuery` (auto-subscription) | `onSnapshot` listeners |
| **Scheduled jobs** | `ctx.scheduler.runAfter` | **Cloud Scheduler + Pub/Sub** or **Functions v2 schedule** |
| **Email** | Resend via Convex actions | **Resend / SendGrid / Firebase Extensions** |
| **File storage** | None yet | **Firebase Storage** (if needed) |

---

## Data Model Mapping (Convex → Firestore)

| Convex Table | Firestore Collection | Document ID | Key Indexes |
|--------------|---------------------|-------------|-------------|
| `users` (authTables) | `users` | `uid` (from Auth) | — |
| `callLogs` | `callLogs` | auto | `userId`, `startedAt` |
| `trustedCircle` | `trustedCircle` | auto | `userId` |
| `userSettings` | `userSettings` | `userId` (1:1) | — |
| `numberReports` | `numberReports` | auto | `number`, `userId` |
| `numberChecks` | `numberChecks` | auto | `userId`, `createdAt` |
| `messageChecks` | `messageChecks` | auto | `userId`, `createdAt` |

> **Tip**: Keep `userId` as the Firebase Auth `uid`. Firestore Security Rules will enforce ownership.

---

## Phase 1 — Firebase Project Setup

### 1.1 Create Firebase Project
```bash
# Install Firebase CLI
npm i -g firebase-tools

# Login & init
firebase login
firebase init
```
Select: **Firestore, Functions, Auth, Hosting (optional), Storage (optional)**

### 1.2 Enable Auth Providers
In Firebase Console → **Authentication → Sign-in method** enable:
- **Email/Password** (replaces email OTP)
- **Anonymous** (for guest sessions)
- **Phone** (optional, for future)
- **Google** (optional)

### 1.3 Firestore Security Rules (draft)
```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper: current user owns this document
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    // Users: read own, write own profile fields
    match /users/{userId} {
      allow read: if isOwner(userId);
      allow create: if isOwner(userId);
      allow update: if isOwner(userId) &&
        request.resource.data.keys().hasOnly(['name', 'image', 'email', 'role']);
    }

    // Call logs: user owns their logs
    match /callLogs/{logId} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }

    // Trusted circle: user owns their circle
    match /trustedCircle/{memberId} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }

    // User settings: 1:1 with user
    match /userSettings/{userId} {
      allow read, write: if isOwner(userId);
    }

    // Number reports: user owns their reports, but number is queryable
    match /numberReports/{reportId} {
      allow read: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }

    // Number checks & message checks: user owns theirs
    match /numberChecks/{checkId} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }
    match /messageChecks/{checkId} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }
  }
}
```

Deploy: `firebase deploy --only firestore:rules`

---

## Phase 2 — Backend: Cloud Functions (TypeScript)

### 2.1 Structure
```
functions/
├── src/
│   ├── index.ts              # Exports all callable functions
│   ├── auth/
│   │   ├── onUserCreate.ts   # Create userSettings, default circle
│   │   └── onUserDelete.ts   # Cleanup
│   ├── calls/
│   │   ├── listCalls.ts
│   │   ├── recordCall.ts
│   │   └── clearCalls.ts
│   ├── circle/
│   │   ├── listCircle.ts
│   │   ├── addMember.ts
│   │   ├── removeMember.ts
│   │   └── setNotify.ts
│   ├── settings/
│   │   ├── getSettings.ts
│   │   └── updateSettings.ts
│   ├── numbers/
│   │   ├── lookupNumber.ts   # Heuristic + Groq + community
│   │   ├── recordCheck.ts
│   │   ├── listChecks.ts
│   │   ├── reportNumber.ts
│   │   └── reportsForNumber.ts
│   ├── messages/
│   │   ├── checkMessage.ts
│   │   ├── listChecks.ts
│   │   └── recordCheck.ts
│   ├── analyze/
│   │   ├── groqVerdict.ts    # Voice + transcript analysis
│   │   └── groqTranscribe.ts # Whisper transcription
│   ├── alerts/
│   │   └── notifyCircle.ts   # Resend email (callable or scheduled)
│   └── utils/
│       ├── groq.ts
│       ├── numbers.ts        # Heuristic patterns, seed DB
│       └── trustlens.ts      # Verdict calibration
├── package.json
└── tsconfig.json
```

### 2.2 Example: `functions/src/calls/recordCall.ts`
```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

export const recordCall = onCall<RecordCallArgs>(async (request) => {
  // 1. Auth check
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const userId = request.auth.uid;

  // 2. Validate input (use Zod or manual)
  const data = request.data;
  // ...validation...

  // 3. Write to Firestore
  const ref = await db.collection("callLogs").add({
    userId,
    callerName: data.callerName ?? null,
    callerNumber: data.callerNumber ?? null,
    channel: data.channel,
    startedAt: data.startedAt,
    endedAt: data.endedAt ?? null,
    durationSec: data.durationSec,
    verdict: data.verdict,
    riskScore: data.riskScore,
    voiceScore: data.voiceScore ?? null,
    behaviorScore: data.behaviorScore ?? null,
    flags: data.flags,
    transcript: data.transcript ?? null,
    notifiedCircle: data.notifiedCircle ?? false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 4. If notifiedCircle, trigger alert (fire-and-forget)
  if (data.notifiedCircle) {
    // Option A: Call another callable function
    // await notifyCircle({ userId, callId: ref.id, ... });
    // Option B: Write to "alerts" collection → Cloud Function trigger
    await db.collection("alertQueue").add({ userId, callId: ref.id, ... });
  }

  return { id: ref.id };
});
```

### 2.3 Scheduled / Background Jobs
For `ctx.scheduler.runAfter` → use **Firestore triggers** or **Cloud Tasks**:
- Write to `alertQueue` collection → `onCreate` trigger sends emails
- Or use `firebase-functions/v2/scheduler` for periodic cleanup

---

## Phase 3 — Frontend Migration

### 3.1 New Dependencies
```bash
# Remove Convex
npm uninstall convex @convex-dev/auth @convex-dev/auth/server

# Add Firebase
npm i firebase firebase-admin  # admin only in functions/
npm i -D firebase-tools firebase-functions-test  # for testing
```

### 3.2 Firebase Client Config (`src/lib/firebase.ts`)
```typescript
import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Emulators for local dev
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
}
```

### 3.3 Auth Hook (`src/hooks/use-auth.ts`)
```typescript
import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  User,
  signInAnonymously,
  signOut as firebaseSignOut
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        // Auto sign-in anonymously for guest access
        await signInAnonymously(auth);
      } else {
        setUser(u);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signOut = () => firebaseSignOut(auth);

  return { user, loading, isAuthenticated: !!user, signOut };
}
```

### 3.4 Data Hooks — Replace `useQuery` / `useMutation`

**Pattern: Custom hooks wrapping Firestore + Callable Functions**

```typescript
// src/hooks/useCalls.ts
import { useEffect, useState } from "react";
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "./use-auth";

export function useCalls() {
  const { user, loading: authLoading } = useAuth();
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) { setCalls([]); setLoading(false); return; }

    const q = query(
      collection(db, "callLogs"),
      where("userId", "==", user.uid),
      orderBy("startedAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() } as CallLog)));
      setLoading(false);
    });
    return unsub;
  }, [user, authLoading]);

  const recordCall = httpsCallable<RecordCallArgs, { id: string }>(functions, "recordCall");
  const clearCalls = httpsCallable(functions, "clearCalls");

  return { calls, loading, recordCall, clearCalls };
}
```

```typescript
// src/hooks/useCircle.ts
export function useCircle() {
  const { user } = useAuth();
  const [members, setMembers] = useState<CircleMember[]>([]);

  useEffect(() => {
    if (!user) { setMembers([]); return; }
    const q = query(collection(db, "trustedCircle"), where("userId", "==", user.uid));
    return onSnapshot(q, (snap) =>
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [user]);

  const addMember = httpsCallable<AddMemberArgs, { id: string }>(functions, "addCircleMember");
  const removeMember = httpsCallable<{ memberId: string }, void>(functions, "removeCircleMember");
  const setNotify = httpsCallable<{ memberId: string; notifyOnFlag: boolean }, void>(functions, "setCircleNotify");

  return { members, addMember, removeMember, setNotify };
}
```

---

## Phase 4 — Auth Migration Details

| Convex Auth | Firebase Auth |
|-------------|---------------|
| `ConvexAuthProvider` | `onAuthStateChanged` listener |
| `useConvexAuth()` | Custom `useAuth()` hook |
| `signIn` (email OTP) | `signInWithEmailAndPassword` / `sendSignInLinkToEmail` |
| `signOut` | `signOut(auth)` |
| Anonymous | `signInAnonymously(auth)` |
| `isAuthenticated` | `!!auth.currentUser` |

**Email OTP → Email Link (Passwordless)**:
```typescript
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";

await sendSignInLinkToEmail(auth, email, {
  url: `${window.location.origin}/auth/callback`,
  handleCodeInApp: true,
});

// In /auth/callback page:
if (isSignInWithEmailLink(auth, window.location.href)) {
  await signInWithEmailLink(auth, email, window.location.href);
}
```

---

## Phase 5 — Environment Variables

### `.env.local` (Client)
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# AI Keys (used in Functions, not client)
# GROQ_API_KEY=
# GEMINI_API_KEY=
# RESEND_API_KEY=
```

### `functions/.env` (Server-only, via Firebase Config)
```bash
firebase functions:config:set groq.key="YOUR_KEY" resend.key="YOUR_KEY" gemini.key="YOUR_KEY"
```
In Functions: `process.env.GROQ_API_KEY` or `functions.config().groq.key`

---

## Phase 6 — Cleanup & Delete

### Files to **DELETE**:
```
src/convex/                    # Entire directory
src/hooks/use-auth.ts          # Replace with Firebase version
src/components/RequireAuth.tsx # Replace with Firebase auth guard
convex.json                    # Convex config
```

### Files to **CREATE/REPLACE**:
```
src/lib/firebase.ts            # Firebase client init
src/hooks/use-auth.ts          # Firebase auth hook
src/hooks/useCalls.ts          # Firestore real-time + callable
src/hooks/useCircle.ts         # ...
src/hooks/useSettings.ts       # ...
src/hooks/useNumbers.ts        # ...
src/hooks/useMessages.ts       # ...
functions/                     # Entire Cloud Functions project
firestore.rules                # Security rules
firestore.indexes.json         # Composite indexes
```

### `package.json` changes:
```json
{
  "dependencies": {
    "firebase": "^10.x",
    // REMOVE: "convex", "@convex-dev/auth"
  },
  "devDependencies": {
    "firebase-tools": "^13.x",
    "firebase-functions-test": "^3.x"
  }
}
```

---

## Phase 7 — Testing Strategy

### Local Emulators
```bash
# Terminal 1: Functions + Firestore + Auth emulators
firebase emulators:start --only functions,firestore,auth

# Terminal 2: Vite dev server
npm run dev
```
Set `VITE_USE_EMULATORS=true` in `.env.local`

### Unit Tests (Functions)
```typescript
// functions/test/calls.test.ts
import { test } from "firebase-functions-test";
import { recordCall } from "../src/calls/recordCall";

test("recordCall writes callLog for authenticated user", async () => {
  const wrap = test().wrap(recordCall);
  const result = await wrap({
    data: { ...validCallData },
    auth: { uid: "test-user" }
  });
  expect(result.id).toBeDefined();
});
```

---

## Migration Checklist

| Task | Status |
|------|--------|
| [ ] Create Firebase project & enable Auth providers | |
| [ ] Write Firestore security rules & deploy | |
| [ ] Set up Cloud Functions project (TypeScript) | |
| [ ] Migrate each Convex function → Callable HTTPS function | |
| [ ] Port heuristic logic (`lib/numbers.ts`, `lib/trustlens.ts`, `lib/groq.ts`) to Functions | |
| [ ] Implement `onUserCreate` trigger for default settings | |
| [ ] Implement alert queue + email trigger (Resend) | |
| [ ] Create `src/lib/firebase.ts` client config | |
| [ ] Rewrite `useAuth` hook for Firebase | |
| [ ] Create data hooks (`useCalls`, `useCircle`, `useSettings`, `useNumbers`, `useMessages`) | |
| [ ] Update all dashboard components to use new hooks | |
| [ ] Replace `ConvexAuthProvider` + `RequireAuth` with Firebase equivalents | |
| [ ] Update `main.tsx` imports & providers | |
| [ ] Configure environment variables (client + Functions) | |
| [ ] Test locally with emulators | |
| [ ] Deploy: `firebase deploy` | |
| [ ] Verify production & delete Convex deployment | |

---

## Key Gotchas

| Issue | Solution |
|-------|----------|
| **Convex real-time = zero-config** | Firestore needs explicit `onSnapshot` in each hook |
| **Convex auth = JWT in header** | Firebase Callable Functions auto-attach `request.auth` |
| **Convex `ctx.scheduler`** | Use Firestore `onCreate` triggers or Cloud Scheduler |
| **Convex internal queries** | Call other callable functions or use Admin SDK in same function |
| **Groq/Resend API keys** | Store in Functions config, never in client bundle |
| **Composite indexes** | Firestore requires explicit indexes for multi-field queries (`firestore.indexes.json`) |
| **Offline support** | Firestore SDK caches automatically; Convex does not |

---

## Recommended Incremental Approach

1. **Week 1**: Firebase project + Auth + Firestore rules + `useAuth` hook
2. **Week 2**: Migrate `callLogs` + `trustedCircle` + `userSettings` (core CRUD)
3. **Week 3**: Migrate `numberLookup` + `analyze` (Groq/Whisper logic in Functions)
4. **Week 4**: Migrate `numberReports`, `messageChecks`, alerts/email
5. **Week 5**: E2E testing, emulator CI, production deploy