# SafeBite PWA — Plan 1: Foundation and Household Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `web/` and `functions/` codebases, emulator-only Firebase config, household-membership security rules, a `whoami` callable, and a sign-in flow so that a pre-provisioned member sees the app shell and a non-member is refused — all proven by unit, rules, callable and Playwright tests running in CI.

**Architecture:** Vite + React + TypeScript SPA talks to Firebase Auth, Firestore and callable Cloud Functions (`europe-west2`, Node 22). Membership is admin-written data (`users/{uid}.householdId` and `households/{hid}.memberIds`) enforced by Firestore rules on the client side and by a `requireMember()` helper on the server side. All local work runs against Firebase emulators under the project ID `demo-safebite`.

**Tech Stack:** Node 22, TypeScript (strict), Vite 8, React 19, react-router 8, firebase JS SDK 12, firebase-functions 7, firebase-admin 14, @firebase/rules-unit-testing 5, Vitest 5, @testing-library/react 16, jsdom, Playwright 1.63, firebase-tools 15, GitHub Actions.

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md` (Part 2 is binding; Part 3.2 lists the guardrails below).

## Global Constraints

- Local Firebase project ID is exactly `demo-safebite`. The string `safebite-production-13ba1` must not appear in any new or modified file.
- Agents never run `firebase deploy`, `firebase use --add`, `git push`, or any command that contacts a real Firebase/Google project. Emulators only.
- No API keys, service-account JSON, or `.env` files with real values are committed. `.env.development` containing only `VITE_USE_EMULATORS=true` is allowed.
- Never import or adapt data from the legacy `scripts/seed-firestore.js`; its safety claims are invented.
- No numerical safety score in any new code.
- UI copy uses British spelling ("coeliac"). App name in UI: "SafeBite".
- Node `22`. TypeScript `"strict": true` in every tsconfig. `package-lock.json` committed for `./`, `web/`, `functions/`.
- Functions region: `europe-west2`. Emulator ports: Auth `9099`, Firestore `8080`, Functions `5001`, Emulator UI `4000`.
- Test accounts (emulator only): `ava@safebite.test` / `bogdan@safebite.test` (members of household `home`), `stranger@safebite.test` (no membership). Password for all three: `pilot-password-1`.
- Commit messages: conventional prefix (`chore:`, `feat:`, `test:`, `ci:`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Prerequisites the controller verifies before Task 1: `node --version` prints `v22.x`; `java -version` succeeds (JDK 21+ installed by the owner, action O2 in the spec); `git log --oneline -1` shows `a3403d1` (owner action O1: `git pull --ff-only`). If any is missing, stop and report; do not work around it.

---

## File map

| Path | Responsibility |
|------|---------------|
| `.gitignore` | add emulator data, `web/`/`functions/` build outputs, root `node_modules` |
| `.firebaserc` | `demo-safebite` default only |
| `firebase.json` | hosting (`web/dist`), functions (`functions`, nodejs22), firestore rules/indexes, emulator ports |
| `firestore.rules` | rewritten: `users`, `households` default-deny model |
| `firestore.indexes.json` | empty index set |
| `package.json` (root) | orchestration scripts; devDependency `firebase-tools` |
| `functions/package.json`, `tsconfig.json`, `vitest.config.mts` | functions package |
| `functions/src/membership.ts` | `requireMember(request)` → `Member` |
| `functions/src/index.ts` | admin init, global options, `whoami` callable |
| `functions/src/seed-emulator.ts` | emulator-only seed of 3 auth users + household docs |
| `functions/test/rules.test.ts` | rules tests |
| `functions/test/whoami.test.ts` | callable test via emulator HTTP |
| `web/` (Vite scaffold) | SPA |
| `web/.env.development` | `VITE_USE_EMULATORS=true` |
| `web/src/firebase.ts` | SDK init + emulator wiring |
| `web/src/auth/membership.ts` | `resolveMembership()` pure function |
| `web/src/auth/membership.test.ts` | unit tests |
| `web/src/auth/AuthProvider.tsx` | auth state + membership context |
| `web/src/auth/SignInScreen.tsx` | email/password form |
| `web/src/auth/NotInvitedScreen.tsx` | refusal screen with sign-out |
| `web/src/AppShell.tsx` | nav + placeholder routes; Settings shows `whoami` |
| `web/src/App.tsx`, `web/src/main.tsx` | composition |
| `web/e2e/auth.spec.ts`, `web/playwright.config.ts` | browser tests |
| `.github/workflows/ci.yml` | CI |
| `README.md` | add "Web app (PWA)" dev section |

---

### Task 1: Repository hygiene (single source of backend config)

**Files:**
- Delete (tracked): `.clang-module-cache/**` (untrack only, keep on disk), `SafeBite/.firebaserc`, `SafeBite/firebase.json`, `SafeBite/firestore.rules`, `SafeBite/firestore.indexes.json`, `SafeBite/scripts/**`, `scripts/**`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a repo where the only Firebase config lives at the root; later tasks overwrite root `firebase.json`, `.firebaserc`, `firestore.rules`.

- [ ] **Step 1: Confirm the duplicates are byte-identical before deleting**

Run:
```bash
cd /mnt/c/Dev/AvaGF
diff -q .firebaserc SafeBite/.firebaserc && diff -q firebase.json SafeBite/firebase.json && diff -q firestore.rules SafeBite/firestore.rules && diff -q firestore.indexes.json SafeBite/firestore.indexes.json && diff -rq scripts SafeBite/scripts && echo IDENTICAL
```
Expected: `IDENTICAL`. If any differ, stop and report DONE_WITH_CONCERNS listing the difference; do not delete.

- [ ] **Step 2: Untrack compiler caches and remove duplicates and the legacy seed**

```bash
git rm -r --cached .clang-module-cache
git rm -r SafeBite/.firebaserc SafeBite/firebase.json SafeBite/firestore.rules SafeBite/firestore.indexes.json SafeBite/scripts
git rm -r scripts
```

- [ ] **Step 3: Extend `.gitignore`**

Append to `.gitignore`:
```gitignore

# Compiler caches
.clang-module-cache/

# Web app / functions
node_modules/
web/dist/
web/test-results/
web/playwright-report/
functions/lib/
.emulator-data/
firebase-debug.log
firestore-debug.log
ui-debug.log
*.log
.env
.env.*
!.env.development
```

- [ ] **Step 4: Verify the tree**

Run:
```bash
git ls-files | grep -c '^\.clang-module-cache' ; git ls-files | grep -E '^(SafeBite/(\.firebaserc|firebase\.json|firestore|scripts)|scripts/)' | wc -l
```
Expected: `0` then `0`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: untrack compiler caches, remove duplicate Firebase config and legacy production seed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Emulator-only Firebase configuration and household security rules

**Files:**
- Modify: `.firebaserc`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`
- Create: `package.json` (root)

**Interfaces:**
- Produces: Firestore paths `users/{uid}` (`householdId: string`, `displayName: string`) and `households/{hid}` (`name: string`, `memberIds: string[]`, `createdAt: Timestamp`), both admin-write only; rule function `isMember(hid)`. Root npm scripts `emu:start`, `emu:test`, `emu:e2e`, `emu:seed` (the latter three become runnable after Tasks 3–7).

- [ ] **Step 1: Write `.firebaserc`**

```json
{
  "projects": {
    "default": "demo-safebite"
  }
}
```

- [ ] **Step 2: Write `firebase.json`**

```json
{
  "hosting": {
    "public": "web/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs22",
      "ignore": ["node_modules", ".git", "test", "*.log"]
    }
  ],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 3: Write `firestore.indexes.json`**

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 4: Write `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function household(hid) {
      return get(/databases/$(database)/documents/households/$(hid));
    }

    // A member is a signed-in user listed in the household's memberIds.
    // memberIds is written only by the Admin SDK (seed script / owner), never by clients.
    function isMember(hid) {
      return signedIn() && request.auth.uid in household(hid).data.memberIds;
    }

    match /users/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow write: if false;
    }

    match /households/{hid} {
      allow read: if isMember(hid);
      allow write: if false;
    }
  }
}
```

- [ ] **Step 5: Write root `package.json`**

```json
{
  "name": "safebite-root",
  "private": true,
  "description": "Orchestration scripts for the SafeBite PWA (web/ + functions/). Never deploys.",
  "engines": { "node": "22" },
  "scripts": {
    "typecheck": "npm --prefix functions run typecheck && npm --prefix web run typecheck",
    "build": "npm --prefix functions run build && npm --prefix web run build",
    "test:unit": "npm --prefix web test",
    "emu:start": "npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:start --only auth,firestore,functions --project demo-safebite",
    "emu:seed": "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/lib/seed-emulator.js",
    "emu:test": "npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec --only auth,firestore,functions --project demo-safebite \"npm --prefix functions test\"",
    "emu:e2e": "npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec --only auth,firestore,functions --project demo-safebite \"node functions/lib/seed-emulator.js && npm --prefix web run e2e\""
  },
  "devDependencies": {
    "firebase-tools": "^15.30.2"
  }
}
```

- [ ] **Step 6: Install and verify the CLI resolves the demo project**

```bash
cd /mnt/c/Dev/AvaGF && npm install && npx firebase use
```
Expected: output names `demo-safebite` as the active project. (`npm install` creates `package-lock.json`.)

- [ ] **Step 7: Verify the guardrail string is gone from tracked config**

```bash
git grep -l 'safebite-production-13ba1' -- ':!SafeBite/**' ':!docs/**' ':!*.md' ; echo "exit=$?"
```
Expected: no file names printed, `exit=1`.

- [ ] **Step 8: Commit**

```bash
git add .firebaserc firebase.json firestore.rules firestore.indexes.json package.json package-lock.json
git commit -m "chore: emulator-only Firebase config and household security rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Functions package scaffold with rules tests

**Files:**
- Create: `functions/package.json`, `functions/tsconfig.json`, `functions/vitest.config.mts`, `functions/src/index.ts` (placeholder export), `functions/test/rules.test.ts`

**Interfaces:**
- Consumes: `firestore.rules` and root scripts from Task 2.
- Produces: `functions/` builds to `functions/lib/`; `npm --prefix functions test` runs Vitest; rules test harness pattern (`initializeTestEnvironment` with `demo-safebite`, host `127.0.0.1:8080`) reused by later plans.

- [ ] **Step 1: Write `functions/package.json`**

```json
{
  "name": "safebite-functions",
  "private": true,
  "version": "0.1.0",
  "description": "SafeBite callable functions (europe-west2). Identity always derived from request.auth.",
  "main": "lib/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "firebase-admin": "^14.4.0",
    "firebase-functions": "^7.4.0"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^5.0.2",
    "@types/node": "^22.0.0",
    "firebase": "^12.19.0",
    "typescript": "^5.9.0",
    "vitest": "^5.0.1"
  }
}
```

- [ ] **Step 2: Write `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "node16",
    "moduleResolution": "node16",
    "lib": ["es2022"],
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `functions/vitest.config.mts`** (the `.mts` extension makes Node load it as ESM without a `"type"` field in package.json)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Generous: first callable invocation pays a 10-20 s cold-require cost when the repo
    // lives on a Windows-mounted path (/mnt/c). Real work still fails fast on assertion.
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: Write placeholder `functions/src/index.ts`**

```ts
// Callables are added in later tasks. This file must export at least one symbol
// so the functions emulator loads the codebase without error.
export const SAFEBITE_FUNCTIONS_VERSION = "0.1.0";
```

- [ ] **Step 5: Write the failing rules test `functions/test/rules.test.ts`**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-safebite";
const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/home"), {
      name: "Home",
      memberIds: ["ava", "bogdan"],
      createdAt: new Date(),
    });
    await setDoc(doc(db, "households/other"), {
      name: "Other",
      memberIds: ["stranger"],
      createdAt: new Date(),
    });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/bogdan"), { householdId: "home", displayName: "Bogdan" });
    await setDoc(doc(db, "users/stranger"), { householdId: "other", displayName: "Stranger" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("users/{uid}", () => {
  it("denies unauthenticated reads", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users/ava")));
  });

  it("allows a user to read their own document", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertSucceeds(getDoc(doc(db, "users/ava")));
  });

  it("denies reading another user's document, even a household member's", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(getDoc(doc(db, "users/bogdan")));
  });

  it("denies a user changing their own householdId", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(updateDoc(doc(db, "users/ava"), { householdId: "other" }));
  });

  it("denies creating a user document from the client", async () => {
    const db = env.authenticatedContext("newcomer").firestore();
    await assertFails(setDoc(doc(db, "users/newcomer"), { householdId: "home", displayName: "New" }));
  });
});

describe("households/{hid}", () => {
  it("allows a member to read their household", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertSucceeds(getDoc(doc(db, "households/home")));
  });

  it("denies a non-member reading the household", async () => {
    const db = env.authenticatedContext("stranger").firestore();
    await assertFails(getDoc(doc(db, "households/home")));
  });

  it("denies unauthenticated reads", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "households/home")));
  });

  it("denies a member adding someone to memberIds", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(updateDoc(doc(db, "households/home"), { memberIds: ["ava", "bogdan", "stranger"] }));
  });

  it("denies creating a household from the client", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(setDoc(doc(db, "households/mine"), { name: "Mine", memberIds: ["ava"], createdAt: new Date() }));
  });
});
```

- [ ] **Step 6: Install, build, and run the tests against the emulator**

```bash
cd /mnt/c/Dev/AvaGF/functions && npm install && npm run build && cd .. && npm run emu:test
```
Expected: emulators start, Vitest reports `10 passed`, emulators stop. If the Firestore emulator fails to start with a Java error, stop and report BLOCKED (owner prerequisite O2).

- [ ] **Step 7: Prove the tests bite — temporarily loosen a rule**

Edit `firestore.rules` to change the `users` read rule to `allow read: if signedIn();`, run `npm run emu:test`, and confirm "denies reading another user's document" FAILS. Revert the change (`git checkout firestore.rules`) and re-run; expect `10 passed`.

- [ ] **Step 8: Commit**

```bash
git add functions/package.json functions/package-lock.json functions/tsconfig.json functions/vitest.config.mts functions/src/index.ts functions/test/rules.test.ts
git commit -m "test: functions package scaffold and Firestore rules tests for household membership

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `requireMember` helper and `whoami` callable

**Files:**
- Create: `functions/src/membership.ts`, `functions/test/membership.test.ts`, `functions/test/emulator-helpers.ts`, `functions/test/whoami.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces:
  - `export interface Member { uid: string; householdId: string; displayName: string }`
  - `export async function requireMember(request: CallableRequest<unknown>): Promise<Member>` — throws `HttpsError('unauthenticated')` when no auth, `HttpsError('permission-denied')` when not a member.
  - Callable `whoami` (region `europe-west2`, no input) returning `Member`.
  - Test helpers `createEmulatorUser(uid, email, password)`, `signInForIdToken(email, password)`, `callFunction(name, data, idToken?)`, `warmUpFunctions(name?)` used by every later callable test (call `warmUpFunctions` first in each callable test file's `beforeAll`, hook timeout 300000).

- [ ] **Step 1: Write the failing unit test `functions/test/membership.test.ts`**

This runs against the Firestore emulator via the Admin SDK (the `emu:test` script sets `FIRESTORE_EMULATOR_HOST`).

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { requireMember } from "../src/membership";

function fakeRequest(uid?: string): CallableRequest<unknown> {
  return {
    data: {},
    rawRequest: {} as never,
    acceptsStreaming: false,
    auth: uid ? ({ uid, token: {} } as never) : undefined,
  } as CallableRequest<unknown>;
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Run via `npm run emu:test` so FIRESTORE_EMULATOR_HOST is set.");
  }
  if (getApps().length === 0) initializeApp({ projectId: "demo-safebite" });
});

beforeEach(async () => {
  const db = getFirestore();
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("households"));
  await db.doc("households/home").set({ name: "Home", memberIds: ["ava"], createdAt: new Date() });
  await db.doc("users/ava").set({ householdId: "home", displayName: "Ava" });
  await db.doc("users/orphan").set({ householdId: "home", displayName: "Orphan" }); // not in memberIds
  await db.doc("users/nohousehold").set({ displayName: "No Household" });
});

describe("requireMember", () => {
  it("returns the member for a listed household member", async () => {
    await expect(requireMember(fakeRequest("ava"))).resolves.toEqual({
      uid: "ava",
      householdId: "home",
      displayName: "Ava",
    });
  });

  it("throws unauthenticated when there is no auth", async () => {
    await expect(requireMember(fakeRequest())).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied when the user document is missing", async () => {
    await expect(requireMember(fakeRequest("ghost"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws permission-denied when the user has no householdId", async () => {
    await expect(requireMember(fakeRequest("nohousehold"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws permission-denied when the household does not list the user", async () => {
    await expect(requireMember(fakeRequest("orphan"))).rejects.toMatchObject({ code: "permission-denied" });
  });
});
```
- [ ] **Step 2: Run the unit test to verify it fails**

```bash
cd /mnt/c/Dev/AvaGF && npm run emu:test
```
Expected: rules tests pass; `membership.test.ts` fails with "Cannot find module '../src/membership'".

- [ ] **Step 3: Write `functions/src/membership.ts`**

```ts
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export interface Member {
  uid: string;
  householdId: string;
  displayName: string;
}

/**
 * Resolve the caller to a household member or throw.
 * Identity comes only from request.auth — never from request.data.
 */
export async function requireMember(request: CallableRequest<unknown>): Promise<Member> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const householdId = userSnap.get("householdId");
  if (typeof householdId !== "string" || householdId.length === 0) {
    throw new HttpsError("permission-denied", "This account is not a household member.");
  }
  const householdSnap = await db.doc(`households/${householdId}`).get();
  const memberIds: unknown = householdSnap.get("memberIds");
  if (!Array.isArray(memberIds) || !memberIds.includes(uid)) {
    throw new HttpsError("permission-denied", "This account is not a household member.");
  }
  const displayName = userSnap.get("displayName");
  return {
    uid,
    householdId,
    displayName: typeof displayName === "string" ? displayName : "",
  };
}
```
- [ ] **Step 4: Run the unit test to verify it passes**

```bash
cd /mnt/c/Dev/AvaGF && npm run emu:test
```
Expected: `15 passed` (10 rules + 5 membership).

- [ ] **Step 5: Replace `functions/src/index.ts`**

```ts
import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { onCall } from "firebase-functions/v2/https";
import { requireMember, type Member } from "./membership";

initializeApp();

setGlobalOptions({
  region: "europe-west2",
  maxInstances: 2,
});

/** Returns the caller's household membership. Used by the web app's Settings screen. */
export const whoami = onCall<unknown, Promise<Member>>(async (request) => {
  return requireMember(request);
});
```
- [ ] **Step 6: Write `functions/test/emulator-helpers.ts`**

```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const PROJECT_ID = "demo-safebite";
export const REGION = "europe-west2";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";

export function ensureAdminApp(): void {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
}

export async function createEmulatorUser(uid: string, email: string, password: string): Promise<void> {
  ensureAdminApp();
  const auth = getAuth();
  try {
    await auth.deleteUser(uid);
  } catch {
    // user did not exist
  }
  await auth.createUser({ uid, email, password, emailVerified: true });
}

export async function signInForIdToken(email: string, password: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`emulator sign-in failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { idToken: string };
  return body.idToken;
}

export interface CallResult {
  status: number;
  body: { result?: unknown; error?: { status?: string; message?: string } };
}

export async function callFunction(name: string, data: unknown, idToken?: string): Promise<CallResult> {
  const res = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  return { status: res.status, body: (await res.json()) as CallResult["body"] };
}

/**
 * Pings a callable once so the Functions emulator's runtime worker finishes its
 * cold `require()` of `functions/lib` + `firebase-admin` before timed tests run.
 * On a Windows-mounted path (WSL's /mnt/c) that cold require can take over a minute.
 * Retries on connection errors every 2 s; resolves on any HTTP response.
 */
export async function warmUpFunctions(name = "whoami"): Promise<void> {
  const url = `http://${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}/${name}`;
  for (;;) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
```
- [ ] **Step 7: Write the failing callable test `functions/test/whoami.test.ts`**

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import { callFunction, createEmulatorUser, ensureAdminApp, signInForIdToken, warmUpFunctions } from "./emulator-helpers";

const PASSWORD = "pilot-password-1";

beforeAll(async () => {
  // Pay the emulator's cold worker start here, outside any single test's timeout budget.
  await warmUpFunctions("whoami");

  ensureAdminApp();
  const db = getFirestore();
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("households"));
  await db.doc("households/home").set({ name: "Home", memberIds: ["ava-uid"], createdAt: new Date() });
  await db.doc("users/ava-uid").set({ householdId: "home", displayName: "Ava" });
  await createEmulatorUser("ava-uid", "ava@safebite.test", PASSWORD);
  await createEmulatorUser("stranger-uid", "stranger@safebite.test", PASSWORD);
}, 300000);

describe("whoami callable", () => {
  it("returns membership for a member", async () => {
    const token = await signInForIdToken("ava@safebite.test", PASSWORD);
    const res = await callFunction("whoami", {}, token);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava" });
  });

  it("rejects an unauthenticated call", async () => {
    const res = await callFunction("whoami", {});
    expect(res.status).toBe(401);
    expect(res.body.error?.status).toBe("UNAUTHENTICATED");
  });

  it("rejects a signed-in non-member", async () => {
    const token = await signInForIdToken("stranger@safebite.test", PASSWORD);
    const res = await callFunction("whoami", {}, token);
    expect(res.status).toBe(403);
    expect(res.body.error?.status).toBe("PERMISSION_DENIED");
  });
});
```
- [ ] **Step 8: Run all functions tests**

```bash
cd /mnt/c/Dev/AvaGF && npm run emu:test
```
Expected: `18 passed` (10 rules + 5 membership + 3 whoami). If the functions emulator logs "No functions found", confirm `functions/lib/index.js` exists (build ran) and `firebase.json` points `source` at `functions`.
- [ ] **Step 9: Commit**

```bash
git add functions/src functions/test
git commit -m "feat(functions): requireMember helper and whoami callable with emulator tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Emulator-only seed script

**Files:**
- Create: `functions/src/seed-emulator.ts`, `functions/test/seed-emulator.test.ts`

**Interfaces:**
- Consumes: Auth/Firestore emulators; data shapes from Task 2.
- Produces: `functions/lib/seed-emulator.js` (run by root `emu:seed` and `emu:e2e`), exporting `seedEmulator(): Promise<void>` and `SEED_ACCOUNTS`. Seeded state: Auth users `ava-uid`/`ava@safebite.test`, `bogdan-uid`/`bogdan@safebite.test`, `stranger-uid`/`stranger@safebite.test`, all with password `pilot-password-1`; `households/home` with `memberIds: ["ava-uid","bogdan-uid"]`; `users/ava-uid`, `users/bogdan-uid`. No `users/stranger-uid` document.

- [ ] **Step 1: Write the failing test `functions/test/seed-emulator.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { ensureAdminApp } from "./emulator-helpers";
import { SEED_ACCOUNTS, seedEmulator } from "../src/seed-emulator";

describe("seedEmulator", () => {
  it("creates the three accounts and one household, idempotently", async () => {
    ensureAdminApp();
    await seedEmulator();
    await seedEmulator(); // second run must not throw

    const auth = getAuth();
    for (const account of SEED_ACCOUNTS) {
      const user = await auth.getUser(account.uid);
      expect(user.email).toBe(account.email);
    }

    const db = getFirestore();
    const home = await db.doc("households/home").get();
    expect(home.get("memberIds")).toEqual(["ava-uid", "bogdan-uid"]);
    expect((await db.doc("users/ava-uid").get()).get("displayName")).toBe("Ava");
    expect((await db.doc("users/bogdan-uid").get()).get("householdId")).toBe("home");
    expect((await db.doc("users/stranger-uid").get()).exists).toBe(false);
  });

  it("refuses to run when emulator hosts are not set", async () => {
    const saved = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    try {
      await expect(seedEmulator()).rejects.toThrow(/emulator/i);
    } finally {
      process.env.FIRESTORE_EMULATOR_HOST = saved;
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /mnt/c/Dev/AvaGF && npm run emu:test
```
Expected: `seed-emulator.test.ts` fails with "Cannot find module '../src/seed-emulator'".

- [ ] **Step 3: Write `functions/src/seed-emulator.ts`**

```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export interface SeedAccount {
  uid: string;
  email: string;
  displayName: string;
  householdId: string | null;
}

export const SEED_PASSWORD = "pilot-password-1";

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { uid: "ava-uid", email: "ava@safebite.test", displayName: "Ava", householdId: "home" },
  { uid: "bogdan-uid", email: "bogdan@safebite.test", displayName: "Bogdan", householdId: "home" },
  { uid: "stranger-uid", email: "stranger@safebite.test", displayName: "Stranger", householdId: null },
];

function assertEmulator(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "seed-emulator refuses to run: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must both be set. This script never targets a real project.",
    );
  }
}

/** Seed emulator-only accounts and household membership. Safe to run repeatedly. */
export async function seedEmulator(): Promise<void> {
  assertEmulator();
  if (getApps().length === 0) initializeApp({ projectId: "demo-safebite" });
  const auth = getAuth();
  const db = getFirestore();

  for (const account of SEED_ACCOUNTS) {
    try {
      await auth.getUser(account.uid);
      await auth.updateUser(account.uid, { email: account.email, password: SEED_PASSWORD, displayName: account.displayName });
    } catch {
      await auth.createUser({
        uid: account.uid,
        email: account.email,
        password: SEED_PASSWORD,
        displayName: account.displayName,
        emailVerified: true,
      });
    }
  }

  const members = SEED_ACCOUNTS.filter((a) => a.householdId === "home");
  await db.doc("households/home").set({
    name: "Home",
    memberIds: members.map((a) => a.uid),
    createdAt: new Date(),
  });
  for (const account of members) {
    await db.doc(`users/${account.uid}`).set({ householdId: "home", displayName: account.displayName });
  }
  await db.doc("users/stranger-uid").delete();
}

if (require.main === module) {
  seedEmulator()
    .then(() => {
      console.log("Emulator seeded: ava@safebite.test, bogdan@safebite.test (members), stranger@safebite.test (not a member).");
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run the tests**

```bash
cd /mnt/c/Dev/AvaGF && npm run emu:test
```
Expected: `20 passed`.

- [ ] **Step 5: Verify the standalone script works and refuses without emulators**

```bash
cd /mnt/c/Dev/AvaGF && npm run build --prefix functions && node functions/lib/seed-emulator.js; echo "exit=$?"
```
Expected: error message containing "refuses to run", `exit=1` (no emulator env vars set in this shell).

- [ ] **Step 6: Commit**

```bash
git add functions/src/seed-emulator.ts functions/test/seed-emulator.test.ts
git commit -m "feat(functions): emulator-only seed for pilot accounts and household

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Web scaffold, Firebase wiring, and membership resolver

**Files:**
- Create: `web/` via Vite scaffold; then `web/.env.development`, `web/src/firebase.ts`, `web/src/auth/membership.ts`, `web/src/auth/membership.test.ts`, `web/src/vite-env.d.ts` (overwrite scaffold's)
- Modify: `web/package.json` (scripts + deps), `web/vite.config.ts`, `web/tsconfig.app.json` (if the scaffold's `include` excludes tests, keep tests included)

**Interfaces:**
- Produces:
  - `web/src/firebase.ts` exporting `app`, `auth`, `db`, `functions` (region `europe-west2`), wired to emulators when `import.meta.env.VITE_USE_EMULATORS === "true"`.
  - `web/src/auth/membership.ts`:
    ```ts
    export type Membership =
      | { kind: "member"; householdId: string; displayName: string }
      | { kind: "notMember" };
    export function resolveMembership(uid: string, userDoc: Record<string, unknown> | undefined, householdDoc: Record<string, unknown> | undefined): Membership;
    ```
  - npm scripts in `web/`: `dev`, `build`, `typecheck`, `test`, `e2e` (e2e added in Task 8).

- [ ] **Step 1: Scaffold with Vite**

```bash
cd /mnt/c/Dev/AvaGF && npm create vite@latest web -- --template react-ts
cd web && npm install
```
If the scaffolder asks extra questions (experimental rolldown-vite, install-and-start), answer **No** to each.
Expected: `web/` contains `index.html`, `src/App.tsx`, `src/main.tsx`, `vite.config.ts`, `tsconfig*.json`, `package.json`. Delete `web/src/App.css`, `web/src/assets/react.svg`, and `web/public/vite.svg` (they are replaced in Task 7).

- [ ] **Step 2: Add dependencies**

```bash
cd /mnt/c/Dev/AvaGF/web && npm install firebase@^12.19.0 react-router@^8.4.0
npm install -D vitest@^5.0.1 jsdom@^30.1.0 @testing-library/react@^16.3.3 @testing-library/jest-dom@^6.6.0 @testing-library/user-event@^14.6.0 @playwright/test@^1.63.0
```

- [ ] **Step 3: Set `web/package.json` scripts**

Replace the `scripts` block with:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "typecheck": "tsc -b",
  "preview": "vite preview",
  "test": "vitest run",
  "e2e": "playwright test"
}
```
Remove the `lint` script and ESLint devDependencies if the scaffold added them (keep the toolchain minimal; linting is not part of this plan).

- [ ] **Step 4: Write `web/vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
});
```

Create `web/src/test-setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Write `web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 6: Write `web/.env.development`**

```
VITE_USE_EMULATORS=true
```

- [ ] **Step 7: Write `web/src/firebase.ts`**

```ts
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// Real values are supplied by the owner for staging via environment variables.
// The defaults below only work with the emulators (project demo-safebite).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "localhost",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-safebite",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "demo-app-id",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west2");

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

if (usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
```

- [ ] **Step 8: Write the failing unit test `web/src/auth/membership.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { resolveMembership } from "./membership";

describe("resolveMembership", () => {
  const household = { name: "Home", memberIds: ["ava-uid", "bogdan-uid"] };

  it("is a member when the user doc names a household that lists the uid", () => {
    expect(resolveMembership("ava-uid", { householdId: "home", displayName: "Ava" }, household)).toEqual({
      kind: "member",
      householdId: "home",
      displayName: "Ava",
    });
  });

  it("is not a member when there is no user doc", () => {
    expect(resolveMembership("stranger-uid", undefined, undefined)).toEqual({ kind: "notMember" });
  });

  it("is not a member when the user doc has no householdId", () => {
    expect(resolveMembership("x", { displayName: "X" }, household)).toEqual({ kind: "notMember" });
  });

  it("is not a member when the household doc is missing", () => {
    expect(resolveMembership("ava-uid", { householdId: "home", displayName: "Ava" }, undefined)).toEqual({ kind: "notMember" });
  });

  it("is not a member when the household does not list the uid", () => {
    expect(resolveMembership("orphan", { householdId: "home", displayName: "O" }, household)).toEqual({ kind: "notMember" });
  });

  it("falls back to an empty displayName", () => {
    expect(resolveMembership("ava-uid", { householdId: "home" }, household)).toEqual({
      kind: "member",
      householdId: "home",
      displayName: "",
    });
  });
});
```

- [ ] **Step 9: Run to verify it fails**

```bash
cd /mnt/c/Dev/AvaGF/web && npm test
```
Expected: FAIL, "Failed to resolve import ./membership".

- [ ] **Step 10: Write `web/src/auth/membership.ts`**

```ts
export type Membership =
  | { kind: "member"; householdId: string; displayName: string }
  | { kind: "notMember" };

/**
 * Pure membership resolution, mirroring the Firestore rule `isMember(hid)`.
 * Both documents are admin-written; the client only reads them.
 */
export function resolveMembership(
  uid: string,
  userDoc: Record<string, unknown> | undefined,
  householdDoc: Record<string, unknown> | undefined,
): Membership {
  const householdId = userDoc?.householdId;
  if (typeof householdId !== "string" || householdId.length === 0) return { kind: "notMember" };
  const memberIds = householdDoc?.memberIds;
  if (!Array.isArray(memberIds) || !memberIds.includes(uid)) return { kind: "notMember" };
  const displayName = userDoc?.displayName;
  return {
    kind: "member",
    householdId,
    displayName: typeof displayName === "string" ? displayName : "",
  };
}
```

- [ ] **Step 11: Run unit tests, typecheck, and build**

```bash
cd /mnt/c/Dev/AvaGF/web && npm test && npm run typecheck && npm run build
```
Expected: `6 passed`; typecheck clean; `web/dist/index.html` produced.

- [ ] **Step 12: Commit**

```bash
cd /mnt/c/Dev/AvaGF && git add web
git commit -m "feat(web): Vite scaffold, Firebase emulator wiring, membership resolver

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Auth provider, sign-in, not-invited, and app shell

**Files:**
- Create: `web/src/auth/AuthProvider.tsx`, `web/src/auth/AuthProvider.test.tsx`, `web/src/auth/SignInScreen.tsx`, `web/src/auth/NotInvitedScreen.tsx`, `web/src/AppShell.tsx`, `web/src/pages/DiscoverPage.tsx`, `web/src/pages/SavedPage.tsx`, `web/src/pages/SettingsPage.tsx`, `web/src/styles.css`
- Modify: `web/src/App.tsx`, `web/src/main.tsx`, `web/index.html`

**Interfaces:**
- Consumes: `auth`, `db`, `functions` from `web/src/firebase.ts`; `resolveMembership` from Task 6; callable `whoami` from Task 4.
- Produces:
  ```ts
  export type AuthState =
    | { status: "loading" }
    | { status: "signedOut" }
    | { status: "notMember"; email: string | null }
    | { status: "member"; uid: string; email: string | null; householdId: string; displayName: string };
  export function useAuth(): { state: AuthState; signIn(email: string, password: string): Promise<void>; signOut(): Promise<void> };
  ```
  Routes: `/discover`, `/saved`, `/settings`; `/` redirects to `/discover`. `data-testid`s: `signin-form`, `signin-email`, `signin-password`, `signin-submit`, `signin-error`, `not-invited`, `signout`, `nav-discover`, `nav-saved`, `nav-settings`, `whoami`.

- [ ] **Step 1: Write the failing provider test `web/src/auth/AuthProvider.test.tsx`**

Firebase modules are mocked so this test needs no emulator.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listeners, getDocMock } = vi.hoisted(() => ({
  listeners: [] as Array<(user: unknown) => void>,
  getDocMock: vi.fn(),
}));

vi.mock("../firebase", () => ({ auth: {}, db: {}, functions: {}, usingEmulators: true }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    listeners.push(cb);
    return () => {};
  },
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  getDoc: (ref: { path: string }) => getDocMock(ref.path),
}));

import { AuthProvider, useAuth } from "./AuthProvider";

function Probe() {
  const { state } = useAuth();
  return <div data-testid="state">{JSON.stringify(state)}</div>;
}

function snap(data: Record<string, unknown> | undefined) {
  return { exists: () => data !== undefined, data: () => data };
}

beforeEach(() => {
  listeners.length = 0;
  getDocMock.mockReset();
});

describe("AuthProvider", () => {
  it("starts loading, then reports signedOut when there is no user", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId("state")).toHaveTextContent('"loading"');
    listeners[0](null);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"signedOut"'));
  });

  it("reports member when user and household docs agree", async () => {
    getDocMock.mockImplementation(async (path: string) => {
      if (path === "users/ava-uid") return snap({ householdId: "home", displayName: "Ava" });
      if (path === "households/home") return snap({ name: "Home", memberIds: ["ava-uid"] });
      return snap(undefined);
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"status":"member"'));
    expect(screen.getByTestId("state")).toHaveTextContent('"householdId":"home"');
  });

  it("reports notMember when the user doc is missing", async () => {
    getDocMock.mockImplementation(async () => snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "stranger-uid", email: "stranger@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
  });

  it("reports notMember when reading the household is denied by rules", async () => {
    getDocMock.mockImplementation(async (path: string) => {
      if (path === "users/x") return snap({ householdId: "home", displayName: "X" });
      throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "x", email: null });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /mnt/c/Dev/AvaGF/web && npm test
```
Expected: FAIL, cannot resolve `./AuthProvider`.

- [ ] **Step 3: Write `web/src/auth/AuthProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { resolveMembership } from "./membership";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "notMember"; email: string | null }
  | { status: "member"; uid: string; email: string | null; householdId: string; displayName: string };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readDoc(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const snapshot = await getDoc(doc(db, path));
    return snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined;
  } catch {
    // A permission-denied read is the rules saying "not a member". Any other read failure is
    // treated the same way for safety; the user can sign out and retry.
    return undefined;
  }
}

async function stateForUser(user: User): Promise<AuthState> {
  const userDoc = await readDoc(`users/${user.uid}`);
  const householdId = userDoc?.householdId;
  const householdDoc = typeof householdId === "string" ? await readDoc(`households/${householdId}`) : undefined;
  const membership = resolveMembership(user.uid, userDoc, householdDoc);
  if (membership.kind === "member") {
    return { status: "member", uid: user.uid, email: user.email, householdId: membership.householdId, displayName: membership.displayName };
  }
  return { status: "notMember", email: user.email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const mine = ++generation;
      if (!user) {
        setState({ status: "signedOut" });
        return;
      }
      setState({ status: "loading" });
      void stateForUser(user).then((next) => {
        if (mine === generation) setState(next);
      });
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 4: Run the provider tests**

```bash
cd /mnt/c/Dev/AvaGF/web && npm test
```
Expected: `10 passed` (6 membership + 4 provider).

- [ ] **Step 5: Write `web/src/auth/SignInScreen.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";

function messageFor(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "No connection. Check your network and try again.";
    default:
      return "Sign-in failed. Try again.";
  }
}

export function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(messageFor((err as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <h1>SafeBite</h1>
      <p>Private gluten-free restaurant research. Sign in with your invited account.</p>
      <form data-testid="signin-form" onSubmit={onSubmit}>
        <label>
          Email
          <input data-testid="signin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input data-testid="signin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button data-testid="signin-submit" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p role="alert" data-testid="signin-error">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Write `web/src/auth/NotInvitedScreen.tsx`**

```tsx
import { useAuth } from "./AuthProvider";

export function NotInvitedScreen() {
  const { state, signOut } = useAuth();
  const email = state.status === "notMember" ? state.email : null;
  return (
    <main className="screen" data-testid="not-invited">
      <h1>Not invited</h1>
      <p>
        {email ? <>The account <strong>{email}</strong> is signed in, but it is not a member of this household.</> : <>This account is not a member of this household.</>}
      </p>
      <p>SafeBite is private. Membership is set up by the household owner, not from this screen.</p>
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
```

- [ ] **Step 7: Write the three placeholder pages**

`web/src/pages/DiscoverPage.tsx`:
```tsx
export function DiscoverPage() {
  return (
    <section>
      <h2>Discover</h2>
      <p>Search for a destination to find restaurants. Coming in the next release.</p>
    </section>
  );
}
```

`web/src/pages/SavedPage.tsx`:
```tsx
export function SavedPage() {
  return (
    <section>
      <h2>Saved</h2>
      <p>Your shared shortlist will appear here.</p>
    </section>
  );
}
```

`web/src/pages/SettingsPage.tsx`:
```tsx
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useAuth } from "../auth/AuthProvider";

interface WhoAmI {
  uid: string;
  householdId: string;
  displayName: string;
}

export function SettingsPage() {
  const { state, signOut } = useAuth();
  const [whoami, setWhoami] = useState<WhoAmI | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const call = httpsCallable<unknown, WhoAmI>(functions, "whoami");
    call({})
      .then((res) => setWhoami(res.data))
      .catch(() => setError("Could not confirm membership with the server."));
  }, []);

  return (
    <section>
      <h2>Settings</h2>
      {state.status === "member" && <p>Signed in as {state.email}</p>}
      {whoami && (
        <p data-testid="whoami">
          Server confirms: {whoami.displayName} in household “{whoami.householdId}”.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}
```

- [ ] **Step 8: Write `web/src/AppShell.tsx`**

```tsx
import { NavLink, Navigate, Route, Routes } from "react-router";
import { DiscoverPage } from "./pages/DiscoverPage";
import { SavedPage } from "./pages/SavedPage";
import { SettingsPage } from "./pages/SettingsPage";

export function AppShell() {
  return (
    <div className="shell">
      <header className="shell-header">
        <h1>SafeBite</h1>
      </header>
      <main className="shell-main">
        <Routes>
          <Route path="/" element={<Navigate to="/discover" replace />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/discover" replace />} />
        </Routes>
      </main>
      <nav className="shell-nav" aria-label="Main">
        <NavLink data-testid="nav-discover" to="/discover">Discover</NavLink>
        <NavLink data-testid="nav-saved" to="/saved">Saved</NavLink>
        <NavLink data-testid="nav-settings" to="/settings">Settings</NavLink>
      </nav>
    </div>
  );
}
```

- [ ] **Step 9: Write `web/src/App.tsx` and `web/src/main.tsx`**

`web/src/App.tsx`:
```tsx
import { BrowserRouter } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SignInScreen } from "./auth/SignInScreen";
import { NotInvitedScreen } from "./auth/NotInvitedScreen";
import { AppShell } from "./AppShell";

function Gate() {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <main className="screen"><p>Loading…</p></main>;
    case "signedOut":
      return <SignInScreen />;
    case "notMember":
      return <NotInvitedScreen />;
    case "member":
      return <AppShell />;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 10: Write `web/src/styles.css` and update `web/index.html`**

`web/src/styles.css`:
```css
:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  --gap: 1rem;
}
body { margin: 0; }
.screen { max-width: 28rem; margin: 0 auto; padding: calc(var(--gap) * 2) var(--gap); }
.screen form { display: grid; gap: var(--gap); }
.screen label { display: grid; gap: 0.25rem; }
.screen input { font-size: 1rem; padding: 0.6rem; }
.screen button, .shell button { font-size: 1rem; padding: 0.7rem 1rem; }
[role="alert"] { color: #b00020; }
.shell { display: grid; grid-template-rows: auto 1fr auto; min-height: 100dvh; }
.shell-header { padding: var(--gap); padding-top: calc(var(--gap) + env(safe-area-inset-top, 0px)); }
.shell-header h1 { margin: 0; font-size: 1.25rem; }
.shell-main { padding: 0 var(--gap); }
.shell-nav { display: flex; justify-content: space-around; border-top: 1px solid #8884; padding: 0.5rem 0; padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px)); }
.shell-nav a { text-decoration: none; padding: 0.5rem 1rem; }
.shell-nav a.active { font-weight: 700; }
```

`web/index.html` `<head>` must contain, replacing the scaffold's title and viewport:
```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>SafeBite</title>
```

- [ ] **Step 11: Typecheck, unit test, build**

```bash
cd /mnt/c/Dev/AvaGF/web && npm run typecheck && npm test && npm run build
```
Expected: clean typecheck, `10 passed`, build succeeds.

- [ ] **Step 12: Commit**

```bash
cd /mnt/c/Dev/AvaGF && git add web
git commit -m "feat(web): auth gate with sign-in, not-invited screen, and app shell

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Playwright browser tests against the emulators

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: seeded accounts from Task 5; `data-testid`s from Task 7; root script `emu:e2e` from Task 2.
- Produces: `npm run emu:e2e` (root) runs the browser suite headless in Chromium.

- [ ] **Step 1: Install the Chromium browser for Playwright**

```bash
cd /mnt/c/Dev/AvaGF/web && npx playwright install --with-deps chromium
```
Expected: Chromium downloaded. If `--with-deps` needs sudo and is refused, run `npx playwright install chromium` and report the missing system libraries as a concern.

- [ ] **Step 2: Write `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  // Pixel 7 is a Chromium mobile profile; only Chromium is installed in this plan.
  // Real iPhone/Safari behaviour is checked manually in the acceptance pass (Plan 5).
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: Write `web/e2e/auth.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "pilot-password-1";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("signed-out visitor sees the sign-in form and nothing else", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
});

test("wrong password shows an error and stays signed out", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("signin-email").fill("ava@safebite.test");
  await page.getByTestId("signin-password").fill("not-the-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("signin-error")).toContainText("incorrect");
  await expect(page.getByTestId("signin-form")).toBeVisible();
});

test("a member signs in, sees the shell, and the server confirms membership", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await expect(page.getByTestId("nav-discover")).toBeVisible();
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("whoami")).toContainText("Ava");
  await expect(page.getByTestId("whoami")).toContainText("home");
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible();
});

test("a signed-in non-member is refused and can sign out", async ({ page }) => {
  await signIn(page, "stranger@safebite.test");
  await expect(page.getByTestId("not-invited")).toBeVisible();
  await expect(page.getByTestId("not-invited")).toContainText("stranger@safebite.test");
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible();
});

test("switching accounts on the same device never shows the previous member's shell", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await expect(page.getByTestId("nav-discover")).toBeVisible();
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("signout").click();
  await signIn(page, "stranger@safebite.test");
  await expect(page.getByTestId("not-invited")).toBeVisible();
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
});
```

- [ ] **Step 4: Run the suite**

```bash
cd /mnt/c/Dev/AvaGF && npm run emu:e2e
```
Expected: emulators start, seed prints "Emulator seeded", Playwright reports `5 passed`, emulators stop.

- [ ] **Step 5: Prove the tests bite**

Temporarily change `NotInvitedScreen.tsx` to render `<AppShell />`-style nav (or simply change `data-testid="not-invited"` to `"not-invited-x"`), run `npm run emu:e2e`, confirm the non-member test FAILS, revert with `git checkout web/src/auth/NotInvitedScreen.tsx`, and re-run to `5 passed`.

- [ ] **Step 6: Commit**

```bash
cd /mnt/c/Dev/AvaGF && git add web/playwright.config.ts web/e2e
git commit -m "test(web): Playwright auth flows against Firebase emulators

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: CI workflow and developer documentation

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (add a "Web app (PWA)" section; do not delete Swift content)

**Interfaces:**
- Consumes: every root script from Task 2; Playwright from Task 8.
- Produces: CI on push and pull request to `main` running typecheck, unit tests, emulator-backed functions tests, browser tests and production builds.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  web-and-functions:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      CI: "true"
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: |
            package-lock.json
            web/package-lock.json
            functions/package-lock.json

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"

      - name: Install dependencies
        run: |
          npm ci
          npm ci --prefix web
          npm ci --prefix functions

      - name: Typecheck
        run: npm run typecheck

      - name: Unit tests (web)
        run: npm run test:unit

      - name: Cache Firebase emulators
        uses: actions/cache@v4
        with:
          path: ~/.cache/firebase/emulators
          key: firebase-emulators-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Functions + rules tests (emulators)
        run: npm run emu:test

      - name: Install Playwright Chromium
        run: cd web && npx playwright install --with-deps chromium

      - name: Browser tests (emulators)
        run: npm run emu:e2e

      - name: Production build
        run: npm run build

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: web/playwright-report
          if-no-files-found: ignore
```

- [ ] **Step 2: Validate the workflow file locally**

```bash
cd /mnt/c/Dev/AvaGF && npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo YAML_OK
```
Expected: `YAML_OK`. (Actual CI execution happens after the owner pushes; the agent does not push.)

- [ ] **Step 3: Add the README section**

Append to `README.md`:
````markdown

## Web app (PWA) — private pilot

The active codebase is the web app in `web/` with callable functions in
`functions/`. The Swift project under `SafeBite/` is kept as a reference only.

### Prerequisites

- Node 22, npm 10
- Java 21+ (Firebase emulators)
- `npm ci` in `./`, `web/`, and `functions/`

### Local development (emulators only)

```bash
npm run emu:start            # terminal 1: Auth, Firestore, Functions emulators (project demo-safebite)
npm run emu:seed             # terminal 2, once: creates ava@safebite.test / bogdan@safebite.test (members)
                             #                and stranger@safebite.test (not a member); password pilot-password-1
npm --prefix web run dev     # terminal 2: http://127.0.0.1:5173
```

Emulator UI: http://127.0.0.1:4000

### Tests

```bash
npm run typecheck   # both packages
npm run test:unit   # web unit tests (no emulator)
npm run emu:test    # functions + Firestore rules tests (starts emulators)
npm run emu:e2e     # Playwright browser tests (starts emulators, seeds, runs Vite)
```

### Guardrails

- Local work targets the emulator-only project `demo-safebite`. Nothing here deploys.
- Membership (`users/{uid}`, `households/{hid}`) is written only with the Admin SDK; there is no sign-up.
- Never reuse the legacy seed data from git history; its safety claims were invented.
````

- [ ] **Step 4: Full verification run**

```bash
cd /mnt/c/Dev/AvaGF && npm run typecheck && npm run test:unit && npm run emu:test && npm run emu:e2e && npm run build
```
Expected: all green: typecheck clean; web `10 passed`; functions `20 passed`; Playwright `5 passed`; `web/dist/` and `functions/lib/` built.

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Dev/AvaGF && git add .github/workflows/ci.yml README.md
git commit -m "ci: GitHub Actions for typecheck, unit, emulator and browser tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Controller notes (for the subagent-driven-development session)

- **Branch:** create a worktree/branch `pwa-01-foundation` from `main` after owner action O1 (`a3403d1` present). Never implement on `main`.
- **Model selection:** Tasks 1, 2, 5 and 9 are transcription → cheapest tier. Tasks 3, 4, 6, 8 → mid tier. Task 7 → standard tier (multi-file React integration). Task reviewers: mid tier; final whole-branch review: most capable.
- **Environment check before Task 1:** `node --version`, `java -version`, `git log --oneline -1`. Missing Java is a BLOCKED, not a workaround.
- **Known emulator quirk:** the Functions emulator needs `functions/lib/` built; every root `emu:*` script builds first. If a test suite sees `ECONNREFUSED 127.0.0.1:5001`, the build failed — read the build output before re-dispatching.
- **Windows/WSL note:** the repo sits on `/mnt/c`. `npm install` there is slow but works; if Playwright cannot launch Chromium, install with `--with-deps` from a shell where `sudo` is available and report.
- **Acceptance for this plan** (checked in the final review): a member signs in and sees the shell; a non-member is refused; rules tests prove non-members cannot read household data; `whoami` derives identity from auth only; CI file exists and validates; no file contains `safebite-production-13ba1`; no legacy seed data present.

## Self-review record

- Spec coverage (Part 2 items this plan owns): architecture skeleton ✅ (T2–T7); security model `isMember` + `requireMember` ✅ (T2, T4); pre-provisioned accounts / no sign-up ✅ (T5, T7); emulator-only local dev ✅ (T2); testing strategy layers ✅ (T3, T4, T6, T8, T9). Discovery, evidence, collection, offline, export, deletion are owned by Plans 2–5, not this plan.
- Placeholder scan: no TBD/TODO; every code step includes the code; every test step includes the command and expected result.
- Type consistency: `Member {uid, householdId, displayName}` (T4) matches `WhoAmI` (T7) and seed docs (T5); `Membership` union (T6) consumed by `AuthProvider` (T7); `data-testid`s in T7 match T8; root script names in T2 match T9 CI and README.
