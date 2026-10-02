# SafeBite PWA — Plan 5a: Data rights (export, account deletion, device cleanup)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member can export the household's data as JSON and delete their own account. Deletion anonymises their evidence and records, deletes their notes, and removes the whole household when they are the last member. It is safely repeatable, recovers from a lost response without guessing, and is proven by failure-injection and interleaving tests. The web app gains a device-cleanup registry that 5b builds on.

**Architecture:** A new server module `functions/src/account/` holds three callables (`deleteAccount`, `checkAccountDeletion`, `exportHousehold`) over pure or dependency-injected cores (`deletion.ts`, `receipts.ts`, `exportData.ts`). Deletion is a step runner keyed on an admin-only `accountDeletions/{uid}` record, with completion receipts under `accountDeletionReceipts/{sha256(requestId)}`. The discovery usage transaction re-checks membership. On the web, `web/src/device/cleanup.ts` is the cleanup registry with a `pendingClear` marker checked at start-up. `web/src/account/` holds the callables, the recovery mapping, the deletion flow and its screens, and the export section. `AuthProvider` gains a `deletionPending` state and a `canDeleteSignIn` flag on `notMember`.

**Tech Stack:** Vite 8.3, React 19, react-router 8, TypeScript strict, Vitest 5, Playwright 1.63 (Chromium only), Firebase JS SDK 12 (`@firebase/auth` 1.13.6), firebase-functions 7 (v2 API), firebase-admin 14.4.0, `@firebase/rules-unit-testing` 5, firebase-tools 14.27, Node 22.

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md`. **§3.8 is the binding design for this plan**, as amended at `e7ccdff` after `planning/audits/2026-10-01-plan-5a-design-review.md` and at `2ae1c9d` (recovery decided by the server). It covers the split, owner rulings 1–3, the data model, the `deleteAccount` steps, `checkAccountDeletion`, the discovery usage fix, `exportHousehold`, the client, empirical stops, tests, decisions and the deploy note. Also binding: §2.1 non-negotiable rules, §2.4 security model, §3.2 guardrails, §3.5/§3.7 read states and deletion protocol. Previous plan: `planning/plans/2026-09-24-safebite-pwa-04-collection.md`.

## Global Constraints

- Emulators only (`demo-safebite`). No `firebase deploy`, no `git push`, no billing or console changes, no access to the staging project `safebite-pilot-urfs3v`. The string `safebite-production-13ba1` must not appear in new files.
- Working directory is the worktree `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-05a-data-rights` on branch `worktree-pwa-05a-data-rights`. Never run anything in `/home/godja/Dev/AvaGF` itself.
- Every Firestore write from `web/` still goes through the records repository's transactional helpers; this plan adds **no** client Firestore writes. Never `window.confirm`/`alert`/`prompt` in `web/src`.
- Every new callable sets `region: "europe-west2"`, `maxInstances: 2`, `timeoutSeconds: 60` on the callable itself (the `onCall` snapshot rule, §3.6).
- Logs never contain names, note text, email addresses, `requestId` or receipt IDs. Log counts, steps and durations only.
- The reserved marker is `MARKER_UID = "former-member"` and `MARKER_NAME = "Former member"`, defined once in `functions/src/account/marker.ts`.
- Recent authentication: `auth_time` at most 300 seconds old (`RECENT_AUTH_SECONDS = 300`). Client deletion timeout 70 000 ms. Device cleaner timeout 5 000 ms. Receipt lifetime 7 days. Export size limit 8 000 000 bytes.
- Browser storage added by this plan, and only this: `localStorage["safebite.pendingClear"]`, `sessionStorage["safebite.deletionRequest"]`, `sessionStorage["safebite.accountDeleted"]`. Every access is wrapped in `try/catch`. Firestore persistence stays off.
- The client never infers deletion from an Auth error code and never calls `getIdToken(true)` after a deletion call has been sent (spec §3.8 Recovery; `@firebase/auth` maps a deleted user's refresh to `auth/user-token-expired` and signs the tab out).
- British spelling in UI copy. Existing testids stay unchanged.
- Line endings: every file this plan touches is LF.
- Node 22; TS strict. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ
  ```
  Implementers may see a different attribution reminder; use these lines.
- Emulator-backed runs (`npm run emu:test`, `npm run emu:e2e`) take one to three minutes, so give those shell commands a 10 minute timeout.
- Every task ends with `npm run typecheck` and `npm run test:unit` green, plus `npm run emu:test` when it touched `functions/` or `firestore.rules`, and `npm run emu:e2e` when it touched `web/e2e` or anything the browser suite exercises. State counts as "previous + N new"; never assert absolute totals in commit messages. Baseline at `ae13a20` (README): web unit 361, functions + rules 352, browser 42. Task 1 step 1 re-measures it.

## Verified facts (probed 2026-10-01 while writing this plan)

| Fact | Evidence | Consequence |
|---|---|---|
| A second password sign-in advances `auth_time` | Emulator probe: 1790882382 → 1790882384 | Reauthentication satisfies the recent-auth check |
| The Auth emulator changes `auth_time` on a plain token refresh; production does not | Same probe | The stale-token refusal is proven only by a handler unit test (Task 4) |
| After `deleteUser`, production refresh returns `USER_NOT_FOUND`, which `@firebase/auth` 1.13.6 maps to `auth/user-token-expired` (`index-*.js` line ~818); on that code or `user-disabled` the SDK signs the user out (`_logoutIfInvalidated`) | SDK source | No client logic reads Auth codes; recovery is server-decided; recovery UI must survive a reset reload |
| The Auth emulator answers `INVALID_REFRESH_TOKEN` after deletion (unmapped, so no automatic sign-out) | Emulator probe | Browser tests rely on the deleting tab's own sign-out for cross-tab reset |
| `auth.deleteUser` on a missing user throws `auth/user-not-found` | Emulator probe | Step 6 treats it as done |
| `recursiveDelete(households/h1)` with the parent document missing removes every descendant | Emulator probe: 0 left | Step 3b re-runs safely |
| `runTransaction(fn, { readOnly: true })` works in firebase-admin 14.4.0; a write inside it is refused | Emulator probe | Export uses a read-only transaction |

## Review Focus

1. **A reused or replayed `requestId`** (a retry that sends the same ID, or a second tab with the old ID) must not resurrect a finished receipt or attach a receipt to another UID. Test in Task 3: `startReceipt` on an existing receipt never changes its `status` or `uid`.
2. **A household holding a restaurant with more than ~400 claims** must not make the per-restaurant anonymisation transaction exceed Firestore's 500-write limit. Test in Task 4: a restaurant with 450 claims by the departing member is anonymised in chunks, and `step3At` is set only after every chunk.
3. **A clock-skewed `auth_time` in the future** (device or server clock drift) must not be rejected as stale or overflow the check. Test in Task 5: `requireRecentAuth(now + 30 s)` passes and `requireRecentAuth(now + 10 min)` fails.
4. **`sessionStorage`/`localStorage` throwing** (Safari private mode, blocked storage) must not crash deletion, recovery or start-up. Tests in Tasks 7 and 8: every accessor returns a safe default when storage throws.
5. **The member opening Settings → Delete account while offline**, or going offline mid-flow, gets the offline message and sends nothing. Tests in Tasks 8 and 9: the flow returns `offline` before reauthenticating, and the button is disabled, when `navigator.onLine === false`.

---

## File map

| Path | Responsibility |
|------|----------------|
| `firestore.rules` | `isMember` and the household read refuse the marker UID; `accountDeletions/{uid}` read-own; `accountDeletionReceipts` deny-all |
| `functions/test/rules.account.test.ts` (new) | Rules tests for the above |
| `functions/src/account/marker.ts` (new) | `MARKER_UID`, `MARKER_NAME` |
| `functions/src/membership.ts` (+test) | `requireMember` refuses `MARKER_UID` |
| `functions/src/seed-emulator.ts` (+test) | Refuses to seed `MARKER_UID` |
| `functions/src/discovery/search.ts` (+test) | Usage transaction re-checks membership |
| `functions/src/account/receipts.ts` (new) | `parseRequestId`, `receiptIdFor`, `startReceipt`, `markReceipt`, `checkReceipt` |
| `functions/src/account/deletion.ts` (new) | `runDeletion(deps, uid, receiptId)` step runner |
| `functions/src/account/recentAuth.ts` (new) | `requireRecentAuth(authTime, nowMs)` |
| `functions/src/account/exportData.ts` (new) | `buildExport(raw)` pure formatter, `readExport(db, uid)` read-only transaction |
| `functions/src/account/callables.ts` (new) | `deleteAccount`, `checkAccountDeletion`, `exportHousehold` |
| `functions/src/index.ts` | Exports the three callables |
| `functions/test/account.*.test.ts` (new) | Receipts, runner (emulator, with failure injection), recent auth, export, callables over HTTP |
| `web/src/api/callable.ts` (+test) | `callable` accepts `{ timeout }` |
| `web/src/device/cleanup.ts` (+test, new) | Registry, `clearDeviceData`, `pendingClear` marker |
| `web/src/device/registerCleaners.ts` (new) | The one place cleaners are registered (empty in 5a) |
| `web/src/device/DeviceClearingScreen.tsx` (+test, new) | Blocking start-up screen while the marker is set |
| `web/src/main.tsx` | Imports `registerCleaners`; checks the marker before loading the app |
| `web/src/auth/AuthProvider.tsx` (+test) | Awaits `clearDeviceData()` before `resetDocument()`; `deletionPending`; `notMember.canDeleteSignIn` |
| `web/src/auth/reauthenticate.ts` (+test, new) | Extracted from `changePassword.ts` |
| `web/src/auth/changePassword.ts` | Uses `reauthenticate` |
| `web/src/account/storage.ts` (+test, new) | Session keys for the deletion request and the deleted notice |
| `web/src/account/api.ts` (new) | Typed callables and `newRequestId()` |
| `web/src/account/recovery.ts` (+test, new) | `classifyCallError`, `recoveryView` |
| `web/src/account/deleteFlow.ts` (+test, new) | `deleteMyAccount`, `finishDeleted` |
| `web/src/account/DeletePasswordForm.tsx` (+test, new) | Password + submit + progress + outcome, shared by four screens |
| `web/src/account/DeletionRecoveryScreen.tsx` (+test, new) | Recovery after a lost response or a reset reload |
| `web/src/account/DeleteAccountPage.tsx` (+test, new) | `/settings/delete-account` |
| `web/src/account/DeletionPendingScreen.tsx` (new) | Sign-in during an unfinished deletion |
| `web/src/account/exportFile.ts` (+test, new) | `exportFileName`, `shareOrDownload` |
| `web/src/account/ExportSection.tsx` (+test, new) | Prepare, then Share or save |
| `web/src/App.tsx` | Recovery screen ahead of the gate; `deletionPending` |
| `web/src/AppShell.tsx` | Route `/settings/delete-account` |
| `web/src/pages/SettingsPage.tsx` (+test) | Export section and Delete account link |
| `web/src/auth/NotInvitedScreen.tsx` | **Delete this sign-in** when `canDeleteSignIn` |
| `web/src/auth/SignInScreen.tsx` | Shows the one-time deleted notice |
| `web/e2e/account-rest.ts` (new) | Restore seed accounts; read receipts, deletion records and household state |
| `web/e2e/account.spec.ts` (new) | Browser scenarios 1–7 |
| `web/playwright.config.ts`, `README.md` | Counts and the new feature |

---

### Task 1: Reserved marker and account rules

**Files:**
- Create: `functions/src/account/marker.ts`, `functions/test/rules.account.test.ts`
- Modify: `firestore.rules`, `functions/src/membership.ts`, `functions/test/membership.test.ts`, `functions/src/seed-emulator.ts`, `functions/test/seed-emulator.test.ts`

**Interfaces:**
- Produces: `MARKER_UID: "former-member"`, `MARKER_NAME: "Former member"` (both `export const`). Rules: `accountDeletions/{uid}` readable only by `uid`, never writable by clients; `accountDeletionReceipts/{id}` no client access; `isMember(hid)` and the household read are false for `request.auth.uid == 'former-member'`. `requireMember` throws `permission-denied` for that UID. `seedEmulator()` throws if any seed account uses it.

- [ ] **Step 1: Record the baseline**

Run: `npm run typecheck && npm run test:unit` then `npm run emu:test` (10 min timeout).
Expected: green. Write the three counts (web unit, functions + rules, and from `npm run emu:e2e` the browser count) into the task report. Later tasks state counts relative to these.

- [ ] **Step 2: Write the failing rules tests**

Create `functions/test/rules.account.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from "firebase/firestore";

const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-safebite",
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/home"), { name: "Home", memberIds: ["ava", "former-member"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/former-member"), { householdId: "home", displayName: "Former member" });
    await setDoc(doc(db, "accountDeletions/ava"), { householdId: "home", startedAt: Timestamp.now() });
    await setDoc(doc(db, "accountDeletionReceipts/abc"), { status: "started", uid: "ava" });
    await setDoc(doc(db, "households/home/restaurants/r1"), { name: "R", address: "A", createdBy: "ava", createdAt: Timestamp.now(), updatedAt: Timestamp.now(), version: 1, deleting: false });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("accountDeletions", () => {
  it("the owner can read their own record", async () => {
    await assertSucceeds(getDoc(doc(as("ava"), "accountDeletions/ava")));
  });
  it("nobody else can read it, signed in or not", async () => {
    await assertFails(getDoc(doc(as("bogdan"), "accountDeletions/ava")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "accountDeletions/ava")));
  });
  it("clients can never write it, not even the owner", async () => {
    await assertFails(setDoc(doc(as("ava"), "accountDeletions/ava"), { householdId: "home" }));
    await assertFails(deleteDoc(doc(as("ava"), "accountDeletions/ava")));
    await assertFails(setDoc(doc(as("bogdan"), "accountDeletions/bogdan"), { householdId: "home" }));
  });
});

describe("accountDeletionReceipts", () => {
  it("no client can read or write a receipt", async () => {
    await assertFails(getDoc(doc(as("ava"), "accountDeletionReceipts/abc")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "accountDeletionReceipts/abc")));
    await assertFails(setDoc(doc(as("ava"), "accountDeletionReceipts/new"), { status: "complete" }));
  });
});

describe("reserved marker UID", () => {
  it("is never treated as a member, even when listed in memberIds", async () => {
    await assertFails(getDoc(doc(as("former-member"), "households/home")));
    await assertFails(getDoc(doc(as("former-member"), "households/home/restaurants/r1")));
  });
  it("a real member listed alongside it still reads normally", async () => {
    await assertSucceeds(getDoc(doc(as("ava"), "households/home")));
    await assertSucceeds(getDoc(doc(as("ava"), "households/home/restaurants/r1")));
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm run emu:test` (10 min timeout).
Expected: FAIL in `rules.account.test.ts` — the owner read of `accountDeletions/ava` is denied, and the marker UID reads `households/home` successfully.

- [ ] **Step 4: Change the rules**

In `firestore.rules`, replace the body of `isMember`:

```
    // A member is a signed-in user listed in the household's memberIds.
    // memberIds is written only by the Admin SDK (seed script / owner), never by clients.
    // 'former-member' is the reserved anonymisation marker (spec §3.8) and never a member.
    function isMember(hid) {
      return signedIn() && request.auth.uid != 'former-member'
        && request.auth.uid in household(hid).data.memberIds;
    }
```

In `match /households/{hid}`, change the read rule to:

```
      allow read: if signedIn() && request.auth.uid != 'former-member' && request.auth.uid in resource.data.memberIds;
```

After the `match /users/{uid}` block, add:

```
    // Account deletion record (spec §3.8): admin-written; the owner reads it to offer
    // "Finish deleting your account" after an interrupted deletion.
    match /accountDeletions/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow write: if false;
    }

    // Completion receipts: read only through the checkAccountDeletion callable.
    match /accountDeletionReceipts/{receiptId} {
      allow read, write: if false;
    }
```

- [ ] **Step 5: Add the marker and refuse it on the server**

Create `functions/src/account/marker.ts`:

```ts
/**
 * Anonymisation marker (spec §3.8). Firebase UIDs are arbitrary strings, so this value is
 * reserved rather than impossible: requireMember, the rules and the emulator seed refuse it.
 */
export const MARKER_UID = "former-member";
export const MARKER_NAME = "Former member";
```

In `functions/src/membership.ts`, add `import { MARKER_UID } from "./account/marker";` and directly after the `unauthenticated` check:

```ts
  if (uid === MARKER_UID) {
    throw new HttpsError("permission-denied", "This account is not a household member.");
  }
```

In `functions/src/seed-emulator.ts`, add `import { MARKER_UID } from "./account/marker";` and as the first line of `seedEmulator()` after `assertEmulator()`:

```ts
  if (SEED_ACCOUNTS.some((a) => a.uid === MARKER_UID)) {
    throw new Error(`seed-emulator refuses the reserved UID ${MARKER_UID}.`);
  }
```

- [ ] **Step 6: Add the server-side tests**

Append to `functions/test/membership.test.ts`, following that file's existing setup (it seeds `users/` and `households/` with the Admin SDK and builds a `CallableRequest` by hand). The new case:

```ts
it("refuses the reserved marker UID even when it is listed as a member", async () => {
  const db = getFirestore();
  await db.doc("households/home").set({ name: "Home", memberIds: ["former-member"], createdAt: new Date() });
  await db.doc("users/former-member").set({ householdId: "home", displayName: "Former member" });
  await expect(requireMember(fakeRequest("former-member"))).rejects.toMatchObject({ code: "permission-denied" });
});
```

(`fakeRequest(uid)` is the file's existing request builder.) Append to `functions/test/seed-emulator.test.ts`:

```ts
it("never seeds the reserved marker UID", async () => {
  const { SEED_ACCOUNTS } = await import("../src/seed-emulator");
  const { MARKER_UID } = await import("../src/account/marker");
  expect(SEED_ACCOUNTS.map((a) => a.uid)).not.toContain(MARKER_UID);
});
```

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:test` (10 min timeout).
Expected: PASS. Functions + rules = baseline + 9 new (7 rules, 2 server).

- [ ] **Step 8: Commit**

```bash
git add firestore.rules functions/src/account/marker.ts functions/src/membership.ts functions/src/seed-emulator.ts functions/test/rules.account.test.ts functions/test/membership.test.ts functions/test/seed-emulator.test.ts
git commit -m "feat(account): reserve the former-member marker and add deletion record rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 2: Discovery usage transaction re-checks membership (review P1-3)

**Files:**
- Modify: `functions/src/discovery/search.ts`, `functions/test/discovery.search.test.ts`

**Interfaces:**
- Consumes: `runSearch(deps, member, request)` and `usagePath(hid, now)` as they exist.
- Produces: the same signature. Inside the usage transaction the household document is read and the call refuses with `permission-denied` "This account is not a household member." when the household is missing or `memberIds` lacks `member.uid`. Nothing is written and the provider is not called after a refusal.

- [ ] **Step 1: Write the failing tests**

In `functions/test/discovery.search.test.ts`, the existing `beforeEach` clears `households`. Change it so the household exists for the existing tests, by adding after `db.doc(CONFIG_PATH).set(...)`:

```ts
  await db.doc("households/home").set({ name: "Home", memberIds: ["ava"], createdAt: new Date() });
```

Then append:

```ts
describe("runSearch — membership is re-checked inside the usage transaction (spec §3.8, review P1-3)", () => {
  it("refuses when the caller left the household after requireMember, writing nothing", async () => {
    const { provider, selection } = stubProvider();
    await db.doc("households/home").update({ memberIds: [] });
    await expect(runSearch(deps(selection), member, { kind: "destination", query: "x" }))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect((await db.doc(USAGE).get()).exists).toBe(false);
    expect(provider.searchText).not.toHaveBeenCalled();
  });

  it("refuses when the household was deleted, and never recreates its usage document", async () => {
    const { provider, selection } = stubProvider();
    await db.recursiveDelete(db.doc("households/home"));
    await expect(runSearch(deps(selection), member, { kind: "nearby", lat: 1, lng: 2 }))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect((await db.doc(USAGE).get()).exists).toBe(false);
    expect(provider.searchNearby).not.toHaveBeenCalled();
  });

  it("interleaving: a search paused after requireMember, then a last-member deletion, then the search resumes", async () => {
    // Models the auditor's reproduction: requireMember passed (member is in hand), the tree is
    // deleted while the request is paused, and only then does the usage transaction run.
    const { provider, selection } = stubProvider();
    await db.doc(USAGE).set({ searches: 1 });
    await db.recursiveDelete(db.doc("households/home")); // last-member step 3b
    await expect(runSearch(deps(selection), member, { kind: "destination", query: "x" }))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect((await db.collection("households/home/usage").get()).size).toBe(0);
    expect(provider.searchText).not.toHaveBeenCalled();
  });

  it("mirror case: a search that commits first leaves a usage document the tree deletion removes", async () => {
    const { selection } = stubProvider();
    await runSearch(deps(selection), member, { kind: "destination", query: "x" });
    expect((await db.doc(USAGE).get()).exists).toBe(true);
    await db.recursiveDelete(db.doc("households/home"));
    expect((await db.collection("households/home/usage").get()).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see the first three fail**

Run: `npm run emu:test` (10 min timeout).
Expected: the first three new tests FAIL (the search succeeds and writes usage); the mirror case passes.

- [ ] **Step 3: Re-check membership inside the transaction**

In `functions/src/discovery/search.ts`, replace the transaction body:

```ts
  const usageRef = deps.db.doc(usagePath(member.householdId, now));
  const householdRef = deps.db.doc(`households/${member.householdId}`);
  await deps.db.runTransaction(async (tx) => {
    // Membership is re-checked here, not only in requireMember: a request that passed that check
    // and paused must not recreate households/{hid}/usage after the member left or the household
    // was deleted (spec §3.8, review P1-3). Reads come before the write, as transactions require.
    const household = await tx.get(householdRef);
    const memberIds: unknown = household.get("memberIds");
    if (!household.exists || !Array.isArray(memberIds) || !memberIds.includes(member.uid)) {
      throw new HttpsError("permission-denied", "This account is not a household member.");
    }
    const snap = await tx.get(usageRef);
    const current = snap.get("searches");
    const searches = typeof current === "number" ? current : 0;
    if (searches >= config.cap) {
      throw new HttpsError("resource-exhausted", "Daily search limit reached.", { reason: "dailyCap" });
    }
    tx.set(usageRef, { searches: FieldValue.increment(1) }, { merge: true });
  });
```

Update the numbered comment above `runSearch`, so step 3 reads: "3. the usage transaction re-checks membership on the household document, then increments BEFORE the provider is called…".

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:test` (10 min timeout).
Expected: PASS, functions + rules = previous + 4. If `discovery.callables.test.ts` fails because its setup has no `households/home` document, add the same `households/home` seed to its setup. Its callers go through the seeded emulator accounts, so this is usually already present. Check before changing it.

- [ ] **Step 5: Commit**

```bash
git add functions/src/discovery/search.ts functions/test/discovery.search.test.ts
git commit -m "fix(discovery): re-check membership inside the usage transaction" -m "A search that passed requireMember and paused could recreate
households/{hid}/usage after a last-member deletion (Plan 5a review P1-3).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 3: Completion receipts

**Files:**
- Create: `functions/src/account/receipts.ts`, `functions/test/account.receipts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ReceiptStatus = "none" | "started" | "dataDeleted" | "complete";
  export const RECEIPT_TTL_MS: number; // 7 days
  export function parseRequestId(data: unknown): string;            // 43 base64url chars, else HttpsError invalid-argument
  export function receiptIdFor(requestId: string): string;          // sha256 hex (64 chars)
  export function startReceipt(db: Firestore, receiptId: string, uid: string, nowMs: number): Promise<void>;
  export function markReceipt(db: Firestore, receiptId: string, next: "dataDeleted" | "complete", nowMs: number): Promise<void>;
  export function checkReceipt(db: Firestore, auth: Pick<Auth, "getUser">, receiptId: string, nowMs: number): Promise<ReceiptStatus>;
  ```
  Document `accountDeletionReceipts/{receiptId}`: `{ status, uid? , updatedAt, expireAt }`; `uid` is removed in the write that sets `complete`.

- [ ] **Step 1: Write the failing tests**

Create `functions/test/account.receipts.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { checkReceipt, markReceipt, parseRequestId, receiptIdFor, startReceipt } from "../src/account/receipts";
import { createEmulatorUser, ensureAdminApp } from "./emulator-helpers";

const ID = "A".repeat(43);
const NOW = Date.parse("2026-10-01T12:00:00Z");
let db: Firestore;
const receipt = async (rid: string) => (await db.doc(`accountDeletionReceipts/${rid}`).get()).data();

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run emu:test`.");
  ensureAdminApp();
  db = getFirestore();
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("accountDeletionReceipts"));
});

describe("parseRequestId", () => {
  it("accepts exactly 43 base64url characters", () => {
    expect(parseRequestId({ requestId: "aZ09_-".padEnd(43, "x") })).toHaveLength(43);
  });
  it.each([undefined, null, [], {}, { requestId: 5 }, { requestId: "x".repeat(42) }, { requestId: "x".repeat(44) }, { requestId: "x".repeat(42) + "=" }, { requestId: "x".repeat(42) + "/" }])(
    "refuses %j", (data) => {
      expect(() => parseRequestId(data)).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    });
});

describe("receiptIdFor", () => {
  it("is a deterministic 64-character hex digest that does not contain the request id", () => {
    const rid = receiptIdFor(ID);
    expect(rid).toMatch(/^[0-9a-f]{64}$/);
    expect(receiptIdFor(ID)).toBe(rid);
    expect(rid).not.toContain(ID);
  });
});

describe("startReceipt", () => {
  it("creates a started receipt with the uid and a 7-day expiry", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    const r = await receipt("r1");
    expect(r).toMatchObject({ status: "started", uid: "ava-uid" });
    expect(r?.expireAt.toMillis()).toBe(NOW + 7 * 24 * 3600 * 1000);
  });
  it("a retry with the same request id and uid changes nothing (Review Focus 1)", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    await startReceipt(db, "r1", "ava-uid", NOW + 1000);
    expect(await receipt("r1")).toMatchObject({ status: "dataDeleted", uid: "ava-uid" });
  });
  it("refuses a request id already used by another uid, or already complete (Review Focus 1)", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    await expect(startReceipt(db, "r1", "bogdan-uid", NOW)).rejects.toMatchObject({ code: "invalid-argument" });
    await markReceipt(db, "r1", "complete", NOW);
    await expect(startReceipt(db, "r1", "ava-uid", NOW)).rejects.toMatchObject({ code: "invalid-argument" });
    expect((await receipt("r1"))?.status).toBe("complete");
  });
});

describe("markReceipt", () => {
  it("only moves forward, and removes the uid on complete", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    await markReceipt(db, "r1", "complete", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    const r = await receipt("r1");
    expect(r?.status).toBe("complete");
    expect(r).not.toHaveProperty("uid");
  });
  it("ignores a missing receipt rather than creating one", async () => {
    await markReceipt(db, "missing", "dataDeleted", NOW);
    expect(await receipt("missing")).toBeUndefined();
  });
});

describe("checkReceipt", () => {
  it("reports none for an unknown receipt", async () => {
    expect(await checkReceipt(db, getAuth(), "nope", NOW)).toBe("none");
  });
  it("reports started as is", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("started");
  });
  it("dataDeleted with the Auth user still present stays dataDeleted", async () => {
    await createEmulatorUser("receipt-uid", "receipt@safebite.test", "pilot-password-1");
    await startReceipt(db, "r1", "receipt-uid", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("dataDeleted");
    expect((await receipt("r1"))?.uid).toBe("receipt-uid");
  });
  it("dataDeleted with the Auth user gone is completed and the uid removed", async () => {
    await createEmulatorUser("receipt-uid", "receipt@safebite.test", "pilot-password-1");
    await getAuth().deleteUser("receipt-uid");
    await startReceipt(db, "r1", "receipt-uid", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("complete");
    const r = await receipt("r1");
    expect(r?.status).toBe("complete");
    expect(r).not.toHaveProperty("uid");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run emu:test` (10 min timeout).
Expected: FAIL — `Cannot find module '../src/account/receipts'`.

- [ ] **Step 3: Implement**

Create `functions/src/account/receipts.ts`:

```ts
import { createHash } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Completion receipts (spec §3.8). The client sends a fresh 256-bit requestId with each
 * deleteAccount call; the receipt lives under its SHA-256, so only the holder can look it up,
 * and it outlives the Auth record so a lost response can be resolved without guessing. The uid
 * is kept only until the receipt is complete, so checkReceipt can test whether the Auth record
 * still exists. A Firestore TTL policy on expireAt deletes receipts after 7 days.
 */
export type ReceiptStatus = "none" | "started" | "dataDeleted" | "complete";
export const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const REQUEST_ID = /^[A-Za-z0-9_-]{43}$/;
const ORDER: Record<Exclude<ReceiptStatus, "none">, number> = { started: 1, dataDeleted: 2, complete: 3 };

export function parseRequestId(data: unknown): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Expected an object.");
  }
  const requestId = (data as Record<string, unknown>).requestId;
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
    throw new HttpsError("invalid-argument", "requestId is malformed.");
  }
  return requestId;
}

export function receiptIdFor(requestId: string): string {
  return createHash("sha256").update(requestId).digest("hex");
}

function receiptRef(db: Firestore, receiptId: string): DocumentReference {
  return db.doc(`accountDeletionReceipts/${receiptId}`);
}

function stamps(nowMs: number) {
  return { updatedAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(nowMs + RECEIPT_TTL_MS) };
}

const isStatus = (v: unknown): v is Exclude<ReceiptStatus, "none"> => v === "started" || v === "dataDeleted" || v === "complete";

/**
 * Creates a `started` receipt. A retry with the same id by the same uid changes nothing; an id
 * held by another uid, or already complete, is refused, so a replayed id can never attach a
 * finished receipt to a different deletion.
 */
export async function startReceipt(db: Firestore, receiptId: string, uid: string, nowMs: number): Promise<void> {
  const ref = receiptRef(db, receiptId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.create(ref, { status: "started", uid, ...stamps(nowMs) });
      return;
    }
    if (snap.get("status") === "complete" || snap.get("uid") !== uid) {
      throw new HttpsError("invalid-argument", "requestId is malformed.");
    }
  });
}

/** Advances a receipt; never moves it backwards and never creates one. */
export async function markReceipt(db: Firestore, receiptId: string, next: "dataDeleted" | "complete", nowMs: number): Promise<void> {
  const ref = receiptRef(db, receiptId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current: unknown = snap.get("status");
    if (!snap.exists || !isStatus(current) || ORDER[current] >= ORDER[next]) return;
    tx.update(ref, { status: next, ...stamps(nowMs), ...(next === "complete" ? { uid: FieldValue.delete() } : {}) });
  });
}

/**
 * The only way a client learns a receipt's state. For dataDeleted it checks the Auth record
 * itself: the browser SDK cannot tell a deleted account from a revoked session (spec §3.8).
 */
export async function checkReceipt(db: Firestore, auth: Pick<Auth, "getUser">, receiptId: string, nowMs: number): Promise<ReceiptStatus> {
  const snap = await receiptRef(db, receiptId).get();
  const status: unknown = snap.get("status");
  if (!snap.exists || !isStatus(status)) return "none";
  if (status !== "dataDeleted") return status;
  const uid: unknown = snap.get("uid");
  if (typeof uid !== "string") return status;
  try {
    await auth.getUser(uid);
    return "dataDeleted";
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    await markReceipt(db, receiptId, "complete", nowMs);
    return "complete";
  }
}
```

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:test` (10 min timeout).
Expected: PASS, functions + rules = previous + 19 (2 + 9 `parseRequestId` cases, 1, 3, 2, 4 — count what Vitest reports).

- [ ] **Step 5: Commit**

```bash
git add functions/src/account/receipts.ts functions/test/account.receipts.test.ts
git commit -m "feat(account): completion receipts keyed by a hashed request id" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 4: Deletion step runner, with failure injection and interleavings

**Files:**
- Create: `functions/src/account/deletion.ts`, `functions/test/account.deletion.test.ts`

**Interfaces:**
- Consumes: `MARKER_UID`, `MARKER_NAME` (Task 1); `markReceipt` (Task 3).
- Produces:
  ```ts
  export type HookPoint = "step1" | "step2" | "step3" | "step3:restaurant" | "step4" | "step5" | "step6";
  export interface DeletionDeps {
    db: Firestore;
    auth: Pick<Auth, "deleteUser">;
    deleteTree: (ref: DocumentReference) => Promise<void>;
    now: () => number;
    hook?: (point: HookPoint) => Promise<void>; // test-only; awaited before each step
    chunk?: number;                              // claims/notes per anonymising transaction, default 200
  }
  export function runDeletion(deps: DeletionDeps, uid: string, receiptId: string): Promise<{ lastMember: boolean }>;
  ```
  It throws `HttpsError("permission-denied")` for a caller that is neither a member, nor has a record, nor lacks a `users` document. It resolves only after step 6 recorded `complete` on the receipt. The caller (Task 5) must have created the receipt with `startReceipt` first.

- [ ] **Step 1: Write the failing tests**

Create `functions/test/account.deletion.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { runDeletion, type DeletionDeps, type HookPoint } from "../src/account/deletion";
import { startReceipt } from "../src/account/receipts";
import { createEmulatorUser, ensureAdminApp } from "./emulator-helpers";

let db: Firestore;
const H = "households/home";
const T0 = Timestamp.fromDate(new Date("2026-09-01T10:00:00Z"));
const PW = "pilot-password-1";

function deps(over: Partial<DeletionDeps> = {}): DeletionDeps {
  return { db, auth: getAuth(), deleteTree: (ref: DocumentReference) => db.recursiveDelete(ref), now: () => Date.now(), ...over };
}

/** A hook that throws once at `point`, simulating a crash before that step. */
function crashBefore(point: HookPoint) {
  let fired = false;
  return async (p: HookPoint) => {
    if (p === point && !fired) { fired = true; throw new Error(`injected crash before ${point}`); }
  };
}

const get = async (path: string) => (await db.doc(path).get()).data();
const exists = async (path: string) => (await db.doc(path).get()).exists;
const authExists = async (uid: string) => getAuth().getUser(uid).then(() => true, () => false);

async function seedHousehold(memberIds: string[]) {
  await db.recursiveDelete(db.collection("households"));
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("accountDeletions"));
  await db.recursiveDelete(db.collection("accountDeletionReceipts"));
  await db.doc(H).set({ name: "Home", memberIds, createdAt: T0 });
  await db.doc("users/ava-uid").set({ householdId: "home", displayName: "Ava" });
  await db.doc("users/bogdan-uid").set({ householdId: "home", displayName: "Bogdan" });
  await createEmulatorUser("ava-uid", "ava@safebite.test", PW);
  await createEmulatorUser("bogdan-uid", "bogdan@safebite.test", PW);
  const base = { address: "1 Street", createdAt: T0, updatedAt: T0, version: 3, deleting: false };
  await db.doc(`${H}/restaurants/r1`).set({ name: "R1", createdBy: "ava-uid", ...base });
  await db.doc(`${H}/restaurants/r2`).set({ name: "R2", createdBy: "bogdan-uid", ...base });
  const claim = { kind: "gfMenu", value: "yes", detail: "Menu", source: { type: "ownVisit", label: "Visit" }, checkedAt: T0, createdAt: T0 };
  await db.doc(`${H}/restaurants/r1/claims/c1`).set({ ...claim, authorUid: "ava-uid", authorName: "Ava" });
  await db.doc(`${H}/restaurants/r1/claims/c2`).set({ ...claim, authorUid: "bogdan-uid", authorName: "Bogdan" });
  const note = { createdAt: T0, updatedAt: T0, version: 1 };
  await db.doc(`${H}/restaurants/r1/notes/n1`).set({ ...note, text: "Ava's note", authorUid: "ava-uid", authorName: "Ava" });
  await db.doc(`${H}/restaurants/r1/notes/n2`).set({ ...note, text: "Bogdan's note", authorUid: "bogdan-uid", authorName: "Bogdan" });
  await db.doc(`${H}/collection/r1`).set({ shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: T0, version: 2 });
  await db.doc(`${H}/usage/20261001`).set({ searches: 4 });
}

/** Everything a deletion of Ava (non-last) must leave behind. */
async function expectAvaGoneNonLast() {
  expect(await get(`${H}/restaurants/r1`)).toMatchObject({ createdBy: "former-member", version: 3, updatedAt: T0 });
  expect(await get(`${H}/restaurants/r2`)).toMatchObject({ createdBy: "bogdan-uid", version: 3 });
  expect(await get(`${H}/restaurants/r1/claims/c1`)).toMatchObject({ authorUid: "former-member", authorName: "Former member" });
  expect(await get(`${H}/restaurants/r1/claims/c2`)).toMatchObject({ authorUid: "bogdan-uid", authorName: "Bogdan" });
  expect(await exists(`${H}/restaurants/r1/notes/n1`)).toBe(false);
  expect(await get(`${H}/restaurants/r1/notes/n2`)).toMatchObject({ text: "Bogdan's note" });
  expect(await get(`${H}/collection/r1`)).toMatchObject({ updatedBy: "former-member", updatedByName: "Former member", version: 2, updatedAt: T0 });
  expect((await get(H))?.memberIds).toEqual(["bogdan-uid"]);
  expect(await exists("users/ava-uid")).toBe(false);
  expect(await exists("accountDeletions/ava-uid")).toBe(false);
  expect(await authExists("ava-uid")).toBe(false);
  expect(await authExists("bogdan-uid")).toBe(true);
  expect(await exists(`${H}/usage/20261001`)).toBe(true);
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run emu:test`.");
  ensureAdminApp();
  db = getFirestore();
});

beforeEach(async () => {
  await seedHousehold(["ava-uid", "bogdan-uid"]);
  await startReceipt(db, "rcpt", "ava-uid", Date.now());
});

describe("runDeletion — clean runs", () => {
  it("a non-last member: anonymised evidence, notes deleted, membership and account gone", async () => {
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: false });
    await expectAvaGoneNonLast();
    expect(await get("accountDeletionReceipts/rcpt")).toMatchObject({ status: "complete" });
    expect(await get("accountDeletionReceipts/rcpt")).not.toHaveProperty("uid");
  });

  it("the last member: the whole household tree is gone, usage included", async () => {
    await seedHousehold(["ava-uid"]);
    await startReceipt(db, "rcpt", "ava-uid", Date.now());
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: true });
    expect(await exists(H)).toBe(false);
    expect((await db.collection(`${H}/restaurants`).get()).size).toBe(0);
    expect((await db.collection(`${H}/usage`).get()).size).toBe(0);
    expect((await db.collection(`${H}/collection`).get()).size).toBe(0);
    expect(await authExists("ava-uid")).toBe(false);
  });

  it("refuses a users document whose uid is not in memberIds (admin-removed)", async () => {
    await db.doc(H).update({ memberIds: ["bogdan-uid"] });
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).rejects.toMatchObject({ code: "permission-denied" });
    expect(await exists("accountDeletions/ava-uid")).toBe(false);
    expect(await authExists("ava-uid")).toBe(true);
  });

  it("an Auth account with no users document and no record only deletes the Auth account", async () => {
    await db.doc("users/ava-uid").delete();
    await db.doc(H).update({ memberIds: ["bogdan-uid"] });
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: false });
    expect(await authExists("ava-uid")).toBe(false);
    expect(await get(`${H}/restaurants/r1/claims/c1`)).toMatchObject({ authorUid: "ava-uid" }); // untouched
  });

  it("anonymises a restaurant with 450 claims in chunks below the 500-write limit (Review Focus 2)", async () => {
    const batch = db.bulkWriter();
    for (let i = 0; i < 450; i++) {
      void batch.set(db.doc(`${H}/restaurants/r1/claims/bulk${i}`), { kind: "gfMenu", value: "yes", detail: "d", source: { type: "ownVisit", label: "v" }, checkedAt: T0, createdAt: T0, authorUid: "ava-uid", authorName: "Ava" });
    }
    await batch.close();
    await runDeletion(deps(), "ava-uid", "rcpt");
    const left = await db.collection(`${H}/restaurants/r1/claims`).where("authorUid", "==", "ava-uid").get();
    expect(left.size).toBe(0);
  });
});

describe("runDeletion — failure injection (review P1-1, P1-2)", () => {
  it.each(["step2", "step3", "step4", "step5", "step6"] as const)("a crash before %s never reports success early, and a retry converges", async (point) => {
    await expect(runDeletion(deps({ hook: crashBefore(point) }), "ava-uid", "rcpt")).rejects.toThrow(`injected crash before ${point}`);
    expect((await get("accountDeletionReceipts/rcpt"))?.status).not.toBe("complete");
    expect(await authExists("ava-uid")).toBe(true);
    if (point !== "step6") expect(await exists("accountDeletions/ava-uid")).toBe(true);
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: false });
    await expectAvaGoneNonLast();
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("complete");
  });

  it("before step 6 the receipt says dataDeleted", async () => {
    await expect(runDeletion(deps({ hook: crashBefore("step6") }), "ava-uid", "rcpt")).rejects.toThrow();
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("dataDeleted");
  });

  it("a tree deletion that removes the household document and then fails is retried in full", async () => {
    await seedHousehold(["ava-uid"]);
    await startReceipt(db, "rcpt", "ava-uid", Date.now());
    const failing = async (ref: DocumentReference) => { await ref.delete(); throw new Error("injected tree failure"); };
    await expect(runDeletion(deps({ deleteTree: failing }), "ava-uid", "rcpt")).rejects.toThrow("injected tree failure");
    expect(await exists(H)).toBe(false);
    expect((await get("accountDeletions/ava-uid"))?.step3At).toBeUndefined();
    expect((await db.collection(`${H}/restaurants`).get()).size).toBe(2); // descendants remain
    expect(await authExists("ava-uid")).toBe(true);
    await runDeletion(deps(), "ava-uid", "rcpt");
    expect((await db.collection(`${H}/restaurants`).get()).size).toBe(0);
    expect((await db.collection(`${H}/usage`).get()).size).toBe(0);
    expect(await authExists("ava-uid")).toBe(false);
  });
});

describe("runDeletion — interleavings (review P2-4)", () => {
  it("two calls from the same uid: the late one cannot recreate the record", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const paused = runDeletion(deps({ hook: async (p) => { if (p === "step1") await gate; } }), "ava-uid", "rcpt-b");
    await startReceipt(db, "rcpt-b", "ava-uid", Date.now());
    await runDeletion(deps(), "ava-uid", "rcpt");
    release();
    await expect(paused).resolves.toEqual({ lastMember: false });
    expect(await exists("accountDeletions/ava-uid")).toBe(false);
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("complete");
    expect((await get("accountDeletionReceipts/rcpt-b"))?.status).toBe("complete");
  });

  it("collection attribution changed by the other member mid-deletion is not overwritten", async () => {
    let edited = false;
    const hook = async (p: HookPoint) => {
      if (p === "step3:restaurant" && !edited) {
        edited = true;
        await db.doc(`${H}/collection/r1`).update({ updatedBy: "bogdan-uid", updatedByName: "Bogdan", version: 3 });
      }
    };
    await runDeletion(deps({ hook }), "ava-uid", "rcpt");
    expect(await get(`${H}/collection/r1`)).toMatchObject({ updatedBy: "bogdan-uid", updatedByName: "Bogdan", version: 3 });
  });

  it("two members deleting at once both finish, and exactly one is the last member", async () => {
    await startReceipt(db, "rcpt-bogdan", "bogdan-uid", Date.now());
    const [a, b] = await Promise.all([runDeletion(deps(), "ava-uid", "rcpt"), runDeletion(deps(), "bogdan-uid", "rcpt-bogdan")]);
    expect([a.lastMember, b.lastMember].filter(Boolean)).toHaveLength(1);
    expect(await exists(H)).toBe(false);
    expect((await db.collection(`${H}/restaurants`).get()).size).toBe(0);
    expect(await authExists("ava-uid")).toBe(false);
    expect(await authExists("bogdan-uid")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run emu:test` (10 min timeout).
Expected: FAIL — `Cannot find module '../src/account/deletion'`.

- [ ] **Step 3: Implement the runner**

Create `functions/src/account/deletion.ts`:

```ts
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { MARKER_NAME, MARKER_UID } from "./marker";
import { markReceipt } from "./receipts";

/**
 * Account deletion (spec §3.8). Each call starts at the first step whose completion is not
 * recorded on accountDeletions/{uid} and repeats that step in full, so a crash at any point
 * converges on retry. Membership leaves first (rules then deny the departing member everything),
 * the Auth record goes last, and the receipt reaches "complete" only after it is gone.
 */
export type HookPoint = "step1" | "step2" | "step3" | "step3:restaurant" | "step4" | "step5" | "step6";

export interface DeletionDeps {
  db: Firestore;
  auth: Pick<Auth, "deleteUser">;
  deleteTree: (ref: DocumentReference) => Promise<void>;
  now: () => number;
  /** Test-only: awaited before each step; may pause, or throw to simulate a crash. */
  hook?: (point: HookPoint) => Promise<void>;
  /** Claims and notes per anonymising transaction: 2 × chunk + 2 writes must stay under 500. */
  chunk?: number;
}

type Start = { kind: "record"; householdId: string } | { kind: "authOnly" };

const notMember = () => new HttpsError("permission-denied", "This account is not a household member.");

export async function runDeletion(deps: DeletionDeps, uid: string, receiptId: string): Promise<{ lastMember: boolean }> {
  const { db } = deps;
  const hook = deps.hook ?? (async () => {});
  const recordRef = db.doc(`accountDeletions/${uid}`);
  const userRef = db.doc(`users/${uid}`);

  // Step 1: decide the starting point inside one transaction, never from earlier reads, so a
  // second call from the same uid cannot recreate a record another call already finished.
  await hook("step1");
  const start = await db.runTransaction<Start>(async (tx) => {
    const record = await tx.get(recordRef);
    const householdIdOnRecord: unknown = record.get("householdId");
    if (record.exists && typeof householdIdOnRecord === "string") return { kind: "record", householdId: householdIdOnRecord };
    const user = await tx.get(userRef);
    if (!user.exists) return { kind: "authOnly" };
    const householdId: unknown = user.get("householdId");
    if (typeof householdId !== "string" || householdId.length === 0) throw notMember();
    const household = await tx.get(db.doc(`households/${householdId}`));
    const memberIds: unknown = household.get("memberIds");
    if (!Array.isArray(memberIds) || !memberIds.includes(uid)) throw notMember();
    tx.create(recordRef, { householdId, startedAt: FieldValue.serverTimestamp() });
    return { kind: "record", householdId };
  });

  let lastMember = false;
  if (start.kind === "record") {
    const householdRef = db.doc(`households/${start.householdId}`);

    // Step 2: leave the household; lastMember is decided once, in the same transaction.
    let record = (await recordRef.get()).data() ?? {};
    if (record.step2At === undefined) {
      await hook("step2");
      lastMember = await db.runTransaction(async (tx) => {
        const current = await tx.get(recordRef);
        if (current.get("step2At") !== undefined) return current.get("lastMember") === true;
        const household = await tx.get(householdRef);
        const ids: unknown = household.get("memberIds");
        const memberIds = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
        const remaining = memberIds.filter((x) => x !== uid);
        if (household.exists && remaining.length !== memberIds.length) tx.update(householdRef, { memberIds: remaining });
        const last = remaining.length === 0;
        tx.update(recordRef, { lastMember: last, step2At: FieldValue.serverTimestamp() });
        return last;
      });
    } else {
      lastMember = record.lastMember === true;
    }

    // Step 3: anonymise (others remain) or delete the whole tree (last member). Completion is
    // recorded only after the whole step succeeded; a missing household document proves nothing.
    record = (await recordRef.get()).data() ?? {};
    if (record.step3At === undefined) {
      await hook("step3");
      if (lastMember) await deps.deleteTree(householdRef);
      else await anonymise(deps, hook, start.householdId, uid);
      await recordRef.update({ step3At: FieldValue.serverTimestamp() });
    }

    // Step 4: the users document.
    if (record.step4At === undefined) {
      await hook("step4");
      await userRef.delete();
      await recordRef.update({ step4At: FieldValue.serverTimestamp() });
    }

    // Step 5: the record, then the receipt says the data is gone.
    await hook("step5");
    await recordRef.delete();
    await markReceipt(db, receiptId, "dataDeleted", deps.now());
  }

  // Step 6: the Auth record last; only now is the receipt complete.
  await hook("step6");
  try {
    await deps.auth.deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }
  await markReceipt(db, receiptId, "complete", deps.now());
  return { lastMember };
}

/**
 * One transaction per chunk per restaurant re-reads every document it changes, so it writes the
 * marker only where the field still equals the departing uid at commit time: an edit by the
 * other member in between keeps their own attribution (review P2-4). Never bumps version or
 * updatedAt, so a departure raises no edit conflicts.
 */
async function anonymise(deps: DeletionDeps, hook: (p: HookPoint) => Promise<void>, householdId: string, uid: string): Promise<void> {
  const { db } = deps;
  const chunk = deps.chunk ?? 200;
  const restaurants = await db.collection(`households/${householdId}/restaurants`).listDocuments();
  for (const restaurantRef of restaurants) {
    await hook("step3:restaurant");
    const stateRef = db.doc(`households/${householdId}/collection/${restaurantRef.id}`);
    for (;;) {
      const more = await db.runTransaction(async (tx) => {
        const claims = await tx.get(restaurantRef.collection("claims").where("authorUid", "==", uid).limit(chunk));
        const notes = await tx.get(restaurantRef.collection("notes").where("authorUid", "==", uid).limit(chunk));
        const restaurant = await tx.get(restaurantRef);
        const state = await tx.get(stateRef);
        for (const c of claims.docs) tx.update(c.ref, { authorUid: MARKER_UID, authorName: MARKER_NAME });
        for (const n of notes.docs) tx.delete(n.ref);
        if (restaurant.exists && restaurant.get("createdBy") === uid) tx.update(restaurantRef, { createdBy: MARKER_UID });
        if (state.exists && state.get("updatedBy") === uid) tx.update(stateRef, { updatedBy: MARKER_UID, updatedByName: MARKER_NAME });
        return claims.size === chunk || notes.size === chunk;
      });
      if (!more) break;
    }
  }
}
```

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:test` (10 min timeout).
Expected: PASS, functions + rules = previous + 14. If the concurrent-deletion test fails with contention (`ABORTED`) after the Admin SDK exhausted its retries, do not weaken the test. Raise `maxAttempts` on that runner's transactions (`db.runTransaction(fn, { maxAttempts: 10 })`) and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add functions/src/account/deletion.ts functions/test/account.deletion.test.ts
git commit -m "feat(account): resumable deletion runner with recorded step completion" -m "Membership leaves first, the Auth record last; each step's completion is
recorded only after it fully succeeded. Failure-injection and interleaving
tests cover review findings P1-1, P1-2 and P2-4.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 5: `deleteAccount` and `checkAccountDeletion` callables

**Files:**
- Create: `functions/src/account/recentAuth.ts`, `functions/src/account/callables.ts`, `functions/test/account.recentAuth.test.ts`, `functions/test/account.callables.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `runDeletion` (Task 4); `parseRequestId`, `receiptIdFor`, `startReceipt`, `checkReceipt` (Task 3); `MARKER_UID` (Task 1).
- Produces:
  - `requireRecentAuth(authTime: unknown, nowMs: number): void`, which throws `HttpsError("failed-precondition", …, { reason: "recentLogin" })`, and `RECENT_AUTH_SECONDS = 300`.
  - Callable `deleteAccount({ requestId })` → `{ deleted: true, lastMember: boolean }`. Errors: `unauthenticated`; `failed-precondition` with `details.reason === "recentLogin"`; `invalid-argument`; `permission-denied`.
  - Callable `checkAccountDeletion({ requestId })` → `{ status: "none" | "started" | "dataDeleted" | "complete" }`, with no sign-in needed.
  - A shared `CALLABLE_OPTIONS = { region: "europe-west2", maxInstances: 2, timeoutSeconds: 60 }`, exported from `callables.ts` for Task 6.

- [ ] **Step 1: Write the failing recent-auth tests**

Create `functions/test/account.recentAuth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RECENT_AUTH_SECONDS, requireRecentAuth } from "../src/account/recentAuth";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const sec = (ms: number) => Math.floor(ms / 1000);
const refused = expect.objectContaining({ code: "failed-precondition", details: { reason: "recentLogin" } });

describe("requireRecentAuth", () => {
  it("accepts an authentication within the window", () => {
    expect(() => requireRecentAuth(sec(NOW) - 10, NOW)).not.toThrow();
    expect(() => requireRecentAuth(sec(NOW) - RECENT_AUTH_SECONDS, NOW)).not.toThrow();
  });
  it("refuses an authentication older than five minutes (a token minted earlier and refreshed)", () => {
    expect(() => requireRecentAuth(sec(NOW) - RECENT_AUTH_SECONDS - 1, NOW)).toThrow(refused);
  });
  it("tolerates small clock skew into the future but not a large one (Review Focus 3)", () => {
    expect(() => requireRecentAuth(sec(NOW) + 30, NOW)).not.toThrow();
    expect(() => requireRecentAuth(sec(NOW) + 600, NOW)).toThrow(refused);
  });
  it.each([undefined, null, "1790882382", Number.NaN, Number.POSITIVE_INFINITY])("refuses a missing or malformed auth_time %j", (value) => {
    expect(() => requireRecentAuth(value, NOW)).toThrow(refused);
  });
});
```

- [ ] **Step 2: Write the failing callable tests**

Create `functions/test/account.callables.test.ts`. It uses its own UIDs and household, so the shared seed accounts other files use are never deleted.

```ts
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { callFunction, createEmulatorUser, ensureAdminApp, signInForIdToken, warmUpFunctions } from "./emulator-helpers";

const PW = "pilot-password-1";
const newRequestId = () => randomBytes(32).toString("base64url");

beforeAll(async () => {
  await warmUpFunctions("checkAccountDeletion");
  ensureAdminApp();
}, 300000);

beforeEach(async () => {
  const db = getFirestore();
  await db.recursiveDelete(db.doc("households/delhome"));
  await db.doc("households/delhome").set({ name: "Del", memberIds: ["del-a-uid", "del-b-uid"], createdAt: new Date() });
  await db.doc("users/del-a-uid").set({ householdId: "delhome", displayName: "Del A" });
  await db.doc("users/del-b-uid").set({ householdId: "delhome", displayName: "Del B" });
  await createEmulatorUser("del-a-uid", "del-a@safebite.test", PW);
  await createEmulatorUser("del-b-uid", "del-b@safebite.test", PW);
});

describe("deleteAccount", () => {
  it("refuses an unauthenticated call", async () => {
    const res = await callFunction("deleteAccount", { requestId: newRequestId() });
    expect(res.status).toBe(401);
  });

  it("refuses a malformed request id", async () => {
    const token = await signInForIdToken("del-a@safebite.test", PW);
    const res = await callFunction("deleteAccount", { requestId: "short" }, token);
    expect(res.body.error?.status).toBe("INVALID_ARGUMENT");
    expect(await getAuth().getUser("del-a-uid")).toBeTruthy();
  });

  it("deletes a member after a fresh sign-in, and the receipt then reports complete without a sign-in", async () => {
    const token = await signInForIdToken("del-a@safebite.test", PW);
    const requestId = newRequestId();
    const res = await callFunction("deleteAccount", { requestId }, token);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ deleted: true, lastMember: false });
    const check = await callFunction("checkAccountDeletion", { requestId });
    expect(check.body.result).toEqual({ status: "complete" });
    await expect(signInForIdToken("del-a@safebite.test", PW)).rejects.toThrow();
    expect((await getFirestore().doc("households/delhome").get()).get("memberIds")).toEqual(["del-b-uid"]);
  });
});

describe("checkAccountDeletion", () => {
  it("reports none for an unknown request id and never returns a uid", async () => {
    const res = await callFunction("checkAccountDeletion", { requestId: newRequestId() });
    expect(res.body.result).toEqual({ status: "none" });
    expect(JSON.stringify(res.body)).not.toContain("uid");
  });

  it("refuses a malformed request id", async () => {
    const res = await callFunction("checkAccountDeletion", { requestId: 42 });
    expect(res.body.error?.status).toBe("INVALID_ARGUMENT");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm run emu:test` (10 min timeout).
Expected: FAIL — `Cannot find module '../src/account/recentAuth'`, and the warm-up or calls return 404 because the callables do not exist yet.

- [ ] **Step 4: Implement**

Create `functions/src/account/recentAuth.ts`:

```ts
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Deletion needs a recent authentication (spec §3.8, ruling 2). The UI always reauthenticates
 * with the password first; the server checks only that auth_time is at most five minutes old, so
 * a fresh sign-in also passes. A small future skew is tolerated for clock drift.
 */
export const RECENT_AUTH_SECONDS = 300;
const FUTURE_SKEW_SECONDS = 60;

export function requireRecentAuth(authTime: unknown, nowMs: number): void {
  const now = nowMs / 1000;
  const ok =
    typeof authTime === "number" &&
    Number.isFinite(authTime) &&
    now - authTime <= RECENT_AUTH_SECONDS &&
    authTime - now <= FUTURE_SKEW_SECONDS;
  if (!ok) throw new HttpsError("failed-precondition", "Recent sign-in required.", { reason: "recentLogin" });
}
```

Create `functions/src/account/callables.ts`:

```ts
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { runDeletion } from "./deletion";
import { MARKER_UID } from "./marker";
import { requireRecentAuth } from "./recentAuth";
import { checkReceipt, parseRequestId, receiptIdFor, startReceipt, type ReceiptStatus } from "./receipts";

// Set on each callable, not via setGlobalOptions: onCall snapshots options at definition (§3.6).
export const CALLABLE_OPTIONS = { region: "europe-west2", maxInstances: 2, timeoutSeconds: 60 } as const;

/** Logs never carry names, emails, request ids or receipt ids (spec §3.8). */
export const deleteAccount = onCall<unknown, Promise<{ deleted: true; lastMember: boolean }>>(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (uid === MARKER_UID) throw new HttpsError("permission-denied", "This account is not a household member.");
  requireRecentAuth(request.auth?.token.auth_time, Date.now());
  const receiptId = receiptIdFor(parseRequestId(request.data));
  const db = getFirestore();
  const started = Date.now();
  await startReceipt(db, receiptId, uid, started);
  const { lastMember } = await runDeletion(
    { db, auth: getAuth(), deleteTree: (ref) => db.recursiveDelete(ref), now: () => Date.now() },
    uid,
    receiptId,
  );
  logger.info("account.delete", { outcome: "ok", lastMember, durationMs: Date.now() - started });
  return { deleted: true, lastMember };
});

/** No sign-in: a deleted account has none. Reveals nothing without the 256-bit request id. */
export const checkAccountDeletion = onCall<unknown, Promise<{ status: ReceiptStatus }>>(CALLABLE_OPTIONS, async (request) => {
  const receiptId = receiptIdFor(parseRequestId(request.data));
  return { status: await checkReceipt(getFirestore(), getAuth(), receiptId, Date.now()) };
});
```

Append to `functions/src/index.ts`:

```ts
export { checkAccountDeletion, deleteAccount } from "./account/callables";
```

- [ ] **Step 5: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:test` (10 min timeout).
Expected: PASS, functions + rules = previous + 14 (9 recent-auth, 5 callable).

- [ ] **Step 6: Commit**

```bash
git add functions/src/account/recentAuth.ts functions/src/account/callables.ts functions/src/index.ts functions/test/account.recentAuth.test.ts functions/test/account.callables.test.ts
git commit -m "feat(account): deleteAccount and checkAccountDeletion callables" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 6: `exportHousehold` callable

**Files:**
- Create: `functions/src/account/exportData.ts`, `functions/test/account.export.test.ts`
- Modify: `functions/src/account/callables.ts`, `functions/src/index.ts`

**Interfaces:**
- Consumes: `CALLABLE_OPTIONS` (Task 5), `MARKER_UID`, `MARKER_NAME` (Task 1).
- Produces:
  ```ts
  export const EXPORT_MAX_BYTES = 8_000_000;
  export interface HouseholdExport {
    format: "safebite-export"; formatVersion: 1; exportedAt: string; exportedBy: string;
    household: { name: string };
    restaurants: ExportRestaurant[];
  }
  export interface ExportRestaurant {
    name: string; address: string; phone?: string; website?: string; googlePlaceId?: string;
    createdByName: string; createdAt: string; updatedAt: string;
    shortlisted: boolean; visited: boolean; visitedOn?: string; listUpdatedByName?: string; listUpdatedAt?: string;
    evidence: Array<{ kind: string; value: string; detail: string; source: { type: string; label: string; url?: string }; checkedAt: string; expiresAt: string | null; authorName: string; createdAt: string }>;
    notes: Array<{ text: string; authorName: string; createdAt: string; updatedAt: string }>;
  }
  export function readExport(db: Firestore, uid: string, now: Date, maxBytes?: number): Promise<HouseholdExport>;
  ```
  Callable `exportHousehold({})` → `HouseholdExport`. Errors: `unauthenticated`, `permission-denied`, `resource-exhausted`. The web app treats the result as opaque JSON that it saves to a file (Task 10).

- [ ] **Step 1: Write the failing tests**

Create `functions/test/account.export.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { readExport } from "../src/account/exportData";
import { ensureAdminApp } from "./emulator-helpers";

let db: Firestore;
const H = "households/exp";
const NOW = new Date("2026-10-01T16:20:00Z");
const day = (d: string) => Timestamp.fromDate(new Date(`${d}T00:00:00Z`));
const at = (iso: string) => Timestamp.fromDate(new Date(iso));
const FORBIDDEN_KEYS = ["uid", "authorUid", "updatedBy", "createdBy", "email", "version", "deleting", "cleanupDone", "householdId", "memberIds"];

function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); allKeys(v, into); }
  return into;
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run emu:test`.");
  ensureAdminApp();
  db = getFirestore();
});

beforeEach(async () => {
  await db.recursiveDelete(db.doc(H));
  await db.doc(H).set({ name: "Export Home", memberIds: ["x-ava", "x-bogdan"], createdAt: NOW });
  await db.doc("users/x-ava").set({ householdId: "exp", displayName: "Ava" });
  await db.doc("users/x-bogdan").set({ householdId: "exp", displayName: "Bogdan" });
  await db.doc("users/x-stranger").set({ householdId: "elsewhere", displayName: "Stranger" });
  const base = { address: "1 Rua", createdAt: at("2026-09-01T10:00:00Z"), updatedAt: at("2026-09-02T10:00:00Z"), version: 2, deleting: false };
  await db.doc(`${H}/restaurants/r1`).set({ name: "Casa", phone: "+351 1", googlePlaceId: "gp1", createdBy: "former-member", ...base });
  await db.doc(`${H}/restaurants/r2`).set({ name: "Gone", createdBy: "x-ava", ...base, deleting: true });
  await db.doc(`${H}/restaurants/r1/claims/c1`).set({ kind: "separateFryer", value: "yes", detail: "Asked", source: { type: "restaurantStatement", label: "Phone", url: "https://casa.example" }, checkedAt: day("2026-04-01"), authorUid: "former-member", authorName: "Former member", createdAt: at("2026-04-01T09:00:00Z") });
  await db.doc(`${H}/restaurants/r1/claims/c2`).set({ kind: "gfMenu", value: "partial", detail: "Some", source: { type: "ownVisit", label: "Visit" }, checkedAt: day("2026-05-01"), expiresAt: day("2027-05-01"), authorUid: "x-bogdan", authorName: "Bogdan", createdAt: at("2026-05-01T09:00:00Z") });
  await db.doc(`${H}/restaurants/r1/notes/n1`).set({ text: "Lovely", authorUid: "x-ava", authorName: "Ava", createdAt: at("2026-05-03T19:00:00Z"), updatedAt: at("2026-05-03T19:00:00Z"), version: 1 });
  await db.doc(`${H}/collection/r1`).set({ shortlisted: true, visited: true, visitedOn: day("2026-05-03"), updatedBy: "x-bogdan", updatedByName: "Bogdan", updatedAt: at("2026-05-04T08:00:00Z"), version: 3 });
  await db.doc(`${H}/usage/20261001`).set({ searches: 2 });
});

describe("readExport", () => {
  it("produces the spec's shape, with names, calendar days and instants", async () => {
    const out = await readExport(db, "x-ava", NOW);
    expect(out).toEqual({
      format: "safebite-export", formatVersion: 1, exportedAt: "2026-10-01T16:20:00.000Z", exportedBy: "Ava",
      household: { name: "Export Home" },
      restaurants: [{
        name: "Casa", address: "1 Rua", phone: "+351 1", googlePlaceId: "gp1",
        createdByName: "Former member", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-02T10:00:00.000Z",
        shortlisted: true, visited: true, visitedOn: "2026-05-03", listUpdatedByName: "Bogdan", listUpdatedAt: "2026-05-04T08:00:00.000Z",
        evidence: [
          { kind: "separateFryer", value: "yes", detail: "Asked", source: { type: "restaurantStatement", label: "Phone", url: "https://casa.example" }, checkedAt: "2026-04-01", expiresAt: null, authorName: "Former member", createdAt: "2026-04-01T09:00:00.000Z" },
          { kind: "gfMenu", value: "partial", detail: "Some", source: { type: "ownVisit", label: "Visit" }, checkedAt: "2026-05-01", expiresAt: "2027-05-01", authorName: "Bogdan", createdAt: "2026-05-01T09:00:00.000Z" },
        ],
        notes: [{ text: "Lovely", authorName: "Ava", createdAt: "2026-05-03T19:00:00.000Z", updatedAt: "2026-05-03T19:00:00.000Z" }],
      }],
    });
  });

  it("contains no identity or internal field anywhere", async () => {
    const keys = allKeys(await readExport(db, "x-ava", NOW));
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
  });

  it("a restaurant without a collection document exports shortlisted and visited as false", async () => {
    await db.doc(`${H}/collection/r1`).delete();
    const [r] = (await readExport(db, "x-ava", NOW)).restaurants;
    expect(r).toMatchObject({ shortlisted: false, visited: false });
    expect(r).not.toHaveProperty("listUpdatedByName");
    expect(r).not.toHaveProperty("visitedOn");
  });

  it("a creator who is no longer a member is shown as Former member", async () => {
    await db.doc(`${H}/restaurants/r1`).update({ createdBy: "x-departed" });
    expect((await readExport(db, "x-ava", NOW)).restaurants[0].createdByName).toBe("Former member");
  });

  it("refuses a non-member and a member removed from memberIds, checked inside the transaction", async () => {
    await expect(readExport(db, "x-stranger", NOW)).rejects.toMatchObject({ code: "permission-denied" });
    await db.doc(H).update({ memberIds: ["x-bogdan"] });
    await expect(readExport(db, "x-ava", NOW)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("refuses an export over the size limit rather than truncating it", async () => {
    await expect(readExport(db, "x-ava", NOW, 200)).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run emu:test` (10 min timeout).
Expected: FAIL — `Cannot find module '../src/account/exportData'`.

- [ ] **Step 3: Implement**

Create `functions/src/account/exportData.ts`:

```ts
import type { DocumentData, Firestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { MARKER_NAME } from "./marker";

/** Household export (spec §3.8). Names, never UIDs or emails; nothing from Google but googlePlaceId. */
export const EXPORT_MAX_BYTES = 8_000_000;

export interface ExportEvidence {
  kind: string; value: string; detail: string;
  source: { type: string; label: string; url?: string };
  checkedAt: string; expiresAt: string | null; authorName: string; createdAt: string;
}
export interface ExportNote { text: string; authorName: string; createdAt: string; updatedAt: string }
export interface ExportRestaurant {
  name: string; address: string; phone?: string; website?: string; googlePlaceId?: string;
  createdByName: string; createdAt: string; updatedAt: string;
  shortlisted: boolean; visited: boolean; visitedOn?: string; listUpdatedByName?: string; listUpdatedAt?: string;
  evidence: ExportEvidence[]; notes: ExportNote[];
}
export interface HouseholdExport {
  format: "safebite-export"; formatVersion: 1; exportedAt: string; exportedBy: string;
  household: { name: string };
  restaurants: ExportRestaurant[];
}

const notMember = () => new HttpsError("permission-denied", "This account is not a household member.");
const instant = (t: Timestamp) => t.toDate().toISOString();
const day = (t: Timestamp) => t.toDate().toISOString().slice(0, 10);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const optional = <K extends string>(key: K, v: unknown): Partial<Record<K, string>> =>
  (typeof v === "string" && v.length > 0 ? ({ [key]: v } as Record<K, string>) : {});
const byCreated = (a: DocumentData, b: DocumentData) => (a.createdAt as Timestamp).toMillis() - (b.createdAt as Timestamp).toMillis();

function evidence(c: DocumentData): ExportEvidence {
  const source = (c.source ?? {}) as DocumentData;
  return {
    kind: str(c.kind), value: str(c.value), detail: str(c.detail),
    source: { type: str(source.type), label: str(source.label), ...optional("url", source.url) },
    checkedAt: day(c.checkedAt as Timestamp),
    expiresAt: c.expiresAt ? day(c.expiresAt as Timestamp) : null,
    authorName: str(c.authorName), createdAt: instant(c.createdAt as Timestamp),
  };
}

/**
 * Everything is read in one read-only transaction, membership included, so the file is a
 * consistent snapshot of a household the caller belonged to at that instant.
 */
export async function readExport(db: Firestore, uid: string, now: Date, maxBytes = EXPORT_MAX_BYTES): Promise<HouseholdExport> {
  return db.runTransaction(async (tx) => {
    const user = await tx.get(db.doc(`users/${uid}`));
    const householdId: unknown = user.get("householdId");
    if (typeof householdId !== "string" || householdId.length === 0) throw notMember();
    const household = await tx.get(db.doc(`households/${householdId}`));
    const memberIds: unknown = household.get("memberIds");
    if (!household.exists || !Array.isArray(memberIds) || !memberIds.includes(uid)) throw notMember();

    const names = new Map<string, string>();
    for (const id of memberIds.filter((x): x is string => typeof x === "string")) {
      const name: unknown = (await tx.get(db.doc(`users/${id}`))).get("displayName");
      if (typeof name === "string" && name.length > 0) names.set(id, name);
    }
    const nameOf = (id: unknown) => (typeof id === "string" ? names.get(id) : undefined) ?? MARKER_NAME;

    const states = new Map<string, DocumentData>();
    for (const s of (await tx.get(db.collection(`households/${householdId}/collection`))).docs) states.set(s.id, s.data());

    const restaurants: ExportRestaurant[] = [];
    for (const r of (await tx.get(db.collection(`households/${householdId}/restaurants`))).docs) {
      const d = r.data();
      if (d.deleting === true) continue;
      const claims = (await tx.get(r.ref.collection("claims"))).docs.map((c) => c.data()).sort(byCreated);
      const notes = (await tx.get(r.ref.collection("notes"))).docs.map((n) => n.data()).sort(byCreated);
      const state = states.get(r.id);
      restaurants.push({
        name: str(d.name), address: str(d.address),
        ...optional("phone", d.phone), ...optional("website", d.website), ...optional("googlePlaceId", d.googlePlaceId),
        createdByName: nameOf(d.createdBy), createdAt: instant(d.createdAt as Timestamp), updatedAt: instant(d.updatedAt as Timestamp),
        shortlisted: state?.shortlisted === true, visited: state?.visited === true,
        ...(state?.visitedOn ? { visitedOn: day(state.visitedOn as Timestamp) } : {}),
        ...(state ? { listUpdatedByName: str(state.updatedByName), listUpdatedAt: instant(state.updatedAt as Timestamp) } : {}),
        evidence: claims.map(evidence),
        notes: notes.map((n) => ({ text: str(n.text), authorName: str(n.authorName), createdAt: instant(n.createdAt as Timestamp), updatedAt: instant(n.updatedAt as Timestamp) })),
      });
    }
    restaurants.sort((a, b) => a.name.localeCompare(b.name));

    const out: HouseholdExport = {
      format: "safebite-export", formatVersion: 1, exportedAt: now.toISOString(), exportedBy: nameOf(uid),
      household: { name: str(household.get("name")) },
      restaurants,
    };
    if (Buffer.byteLength(JSON.stringify(out), "utf8") > maxBytes) {
      throw new HttpsError("resource-exhausted", "The export is too large to download in one file.");
    }
    return out;
  }, { readOnly: true });
}
```

Append to `functions/src/account/callables.ts`:

```ts
import { readExport, type HouseholdExport } from "./exportData";

export const exportHousehold = onCall<unknown, Promise<HouseholdExport>>(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (uid === MARKER_UID) throw new HttpsError("permission-denied", "This account is not a household member.");
  const started = Date.now();
  const out = await readExport(getFirestore(), uid, new Date());
  logger.info("account.export", { outcome: "ok", restaurants: out.restaurants.length, durationMs: Date.now() - started });
  return out;
});
```

Move the new `import` line to the top of the file with the other imports. In `functions/src/index.ts`, change the account export line to:

```ts
export { checkAccountDeletion, deleteAccount, exportHousehold } from "./account/callables";
```

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:test` (10 min timeout).
Expected: PASS, functions + rules = previous + 6.

- [ ] **Step 5: Commit**

```bash
git add functions/src/account/exportData.ts functions/src/account/callables.ts functions/src/index.ts functions/test/account.export.test.ts
git commit -m "feat(account): exportHousehold callable in one read-only transaction" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 7: Device cleanup registry, start-up marker, reset wiring

**Files:**
- Create: `web/src/device/cleanup.ts`, `web/src/device/cleanup.test.ts`, `web/src/device/registerCleaners.ts`, `web/src/device/DeviceClearingScreen.tsx`, `web/src/device/DeviceClearingScreen.test.tsx`
- Modify: `web/src/main.tsx`, `web/src/auth/AuthProvider.tsx`, `web/src/auth/AuthProvider.test.tsx`, `web/src/api/callable.ts`, `web/src/api/callable.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // web/src/device/cleanup.ts
  export interface DeviceCleaner { name: string; clear(): Promise<void> }
  export const PENDING_CLEAR_KEY = "safebite.pendingClear";
  export const CLEANER_TIMEOUT_MS = 5_000;
  export function registerDeviceCleaner(cleaner: DeviceCleaner): void;   // same name twice registers once
  export function clearDeviceData(): Promise<{ failed: string[] }>;      // never throws
  export function pendingClear(): boolean;                               // false when storage throws
  export function _resetDeviceCleanersForTests(): void;
  // web/src/device/DeviceClearingScreen.tsx
  export function DeviceClearingScreen(props: { onCleared: () => void }): JSX.Element;
  // web/src/api/callable.ts
  export function callable<Req, Res>(name: string, options?: { timeout?: number }): (data: Req) => Promise<Res>;
  ```
  `AuthProvider` awaits `clearDeviceData()` (whatever its result) before `resetDocument()`. `main.tsx` imports `./device/registerCleaners` first, and renders `DeviceClearingScreen` instead of loading the app while `pendingClear()` is true.

- [ ] **Step 1: Write the failing registry tests**

Create `web/src/device/cleanup.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLEANER_TIMEOUT_MS, PENDING_CLEAR_KEY, _resetDeviceCleanersForTests, clearDeviceData, pendingClear, registerDeviceCleaner } from "./cleanup";

beforeEach(() => {
  _resetDeviceCleanersForTests();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("clearDeviceData", () => {
  it("runs every cleaner, clears the marker on success and reports no failures", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    registerDeviceCleaner({ name: "a", clear: a });
    registerDeviceCleaner({ name: "b", clear: b });
    registerDeviceCleaner({ name: "a", clear: a }); // duplicate name: ignored
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(pendingClear()).toBe(false);
  });

  it("with no cleaners (5a) it succeeds immediately", async () => {
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(localStorage.getItem(PENDING_CLEAR_KEY)).toBeNull();
  });

  it("names a failing cleaner, still runs the others, never throws, and leaves the marker set", async () => {
    const ok = vi.fn(async () => {});
    registerDeviceCleaner({ name: "broken", clear: async () => { throw new Error("nope"); } });
    registerDeviceCleaner({ name: "ok", clear: ok });
    await expect(clearDeviceData()).resolves.toEqual({ failed: ["broken"] });
    expect(ok).toHaveBeenCalled();
    expect(pendingClear()).toBe(true);
  });

  it("a cleaner that throws synchronously is reported, not propagated", async () => {
    registerDeviceCleaner({ name: "sync", clear: () => { throw new Error("sync"); } });
    await expect(clearDeviceData()).resolves.toEqual({ failed: ["sync"] });
  });

  it("a hanging cleaner times out after 5 s and is reported", async () => {
    vi.useFakeTimers();
    registerDeviceCleaner({ name: "hang", clear: () => new Promise<void>(() => {}) });
    const result = clearDeviceData();
    await vi.advanceTimersByTimeAsync(CLEANER_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ failed: ["hang"] });
    expect(pendingClear()).toBe(true);
  });

  it("storage that throws does not break clearing or the marker check (Review Focus 4)", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    const c = vi.fn(async () => {});
    registerDeviceCleaner({ name: "c", clear: c });
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(c).toHaveBeenCalled();
    expect(pendingClear()).toBe(false);
  });
});
```

Create `web/src/device/DeviceClearingScreen.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { clearDeviceData } = vi.hoisted(() => ({ clearDeviceData: vi.fn() }));
vi.mock("./cleanup", () => ({ clearDeviceData }));

import { DeviceClearingScreen } from "./DeviceClearingScreen";

afterEach(() => vi.clearAllMocks());

describe("DeviceClearingScreen", () => {
  it("blocks while clearing, then hands over when nothing failed", async () => {
    clearDeviceData.mockResolvedValue({ failed: [] });
    const onCleared = vi.fn();
    render(<DeviceClearingScreen onCleared={onCleared} />);
    expect(screen.getByTestId("device-clearing")).toHaveTextContent("Clearing data from this device");
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
  });

  it("on failure shows the message and Try again, and nothing else", async () => {
    clearDeviceData.mockResolvedValueOnce({ failed: ["offline-store"] }).mockResolvedValueOnce({ failed: [] });
    const onCleared = vi.fn();
    render(<DeviceClearingScreen onCleared={onCleared} />);
    expect(await screen.findByTestId("device-clear-failed")).toHaveTextContent("Some data on this device couldn't be cleared.");
    expect(onCleared).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("device-clear-retry"));
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix web test -- src/device`
Expected: FAIL — `Failed to resolve import "./cleanup"`.

- [ ] **Step 3: Implement the registry and the screen**

Create `web/src/device/cleanup.ts`:

```ts
/**
 * Device cleanup registry (spec §3.8). Every store that keeps household data on the device
 * registers a cleaner (5b adds the IndexedDB copy). clearDeviceData runs on every account change
 * and after account deletion. The pendingClear marker is set before the cleaners run and removed
 * only when all succeeded; start-up refuses to render anything while it is set, so a failed or
 * interrupted clear can never expose a previous account's data.
 */
export interface DeviceCleaner {
  name: string;
  clear(): Promise<void>;
}

export const PENDING_CLEAR_KEY = "safebite.pendingClear";
export const CLEANER_TIMEOUT_MS = 5_000;

const cleaners: DeviceCleaner[] = [];

export function registerDeviceCleaner(cleaner: DeviceCleaner): void {
  if (!cleaners.some((c) => c.name === cleaner.name)) cleaners.push(cleaner);
}

export function _resetDeviceCleanersForTests(): void {
  cleaners.length = 0;
}

function setMarker(on: boolean): void {
  try {
    if (on) localStorage.setItem(PENDING_CLEAR_KEY, "1");
    else localStorage.removeItem(PENDING_CLEAR_KEY);
  } catch {
    // Storage blocked (private mode): nothing can persist there either, so there is nothing to guard.
  }
}

export function pendingClear(): boolean {
  try {
    return localStorage.getItem(PENDING_CLEAR_KEY) === "1";
  } catch {
    return false;
  }
}

function withTimeout(run: () => Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve()
      .then(run)
      .then(
        () => { clearTimeout(timer); resolve(); },
        (err: unknown) => { clearTimeout(timer); reject(err); },
      );
  });
}

export async function clearDeviceData(): Promise<{ failed: string[] }> {
  setMarker(true);
  const outcomes = await Promise.all(
    cleaners.map(async (c) => {
      try {
        await withTimeout(() => c.clear(), CLEANER_TIMEOUT_MS);
        return null;
      } catch {
        return c.name;
      }
    }),
  );
  const failed = outcomes.filter((n): n is string => n !== null);
  if (failed.length === 0) setMarker(false);
  return { failed };
}
```

Create `web/src/device/registerCleaners.ts`:

```ts
/**
 * The one place device cleaners are registered, imported by main.tsx before anything else so the
 * start-up marker check can run them. Plan 5a registers none (nothing persists before 5b); Plan 5b
 * registers its IndexedDB store here.
 */
export {};
```

Create `web/src/device/DeviceClearingScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { clearDeviceData } from "./cleanup";

/** Shown at start-up while the pendingClear marker is set; renders nothing of the app. */
export function DeviceClearingScreen({ onCleared }: { onCleared: () => void }) {
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    setFailed(false);
    void clearDeviceData().then(({ failed: names }) => {
      if (names.length === 0) onCleared();
      else setFailed(true);
    });
  }, [onCleared]);
  useEffect(run, [run]);
  return (
    <main className="screen" data-testid="device-clearing">
      {failed ? (
        <>
          <p role="alert" data-testid="device-clear-failed">Some data on this device couldn't be cleared.</p>
          <button type="button" data-testid="device-clear-retry" onClick={run}>Try again</button>
        </>
      ) : (
        <p>Clearing data from this device…</p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Wire start-up**

In `web/src/main.tsx`, add as the first import line `import "./device/registerCleaners";`, and add `import { pendingClear } from "./device/cleanup";` and `import { DeviceClearingScreen } from "./device/DeviceClearingScreen";`. Replace the `else { … }` branch with:

```tsx
} else {
  const startApp = () => {
    void import("./App")
      .then(({ default: App }) => {
        root.render(
          <StrictMode>
            <App />
          </StrictMode>,
        );
        registerServiceWorker();
      })
      .catch(() => root.render(<LoadFailedScreen />));
  };
  // A previous clear failed or was interrupted (spec §3.8): finish it before the app, and any
  // stored copy, can render.
  if (pendingClear()) root.render(<DeviceClearingScreen onCleared={startApp} />);
  else startApp();
}
```

- [ ] **Step 5: Wire the reset path (test first)**

In `web/src/auth/AuthProvider.test.tsx`, add next to the `resetDocument` mock:

```ts
const { clearDeviceData } = vi.hoisted(() => ({ clearDeviceData: vi.fn() }));
vi.mock("../device/cleanup", () => ({ clearDeviceData }));
```

In `beforeEach`, add `clearDeviceData.mockReset(); clearDeviceData.mockResolvedValue({ failed: [] });`. The existing assertions `expect(resetDocument).toHaveBeenCalledTimes(1)` (around lines 110 and 126) now run after an awaited promise, so wrap each one in `await waitFor(() => …)`. The `not.toHaveBeenCalled` assertions stay as they are. Append:

```tsx
it("clears device data before resetting, and resets even when clearing failed", async () => {
  let finish!: (v: { failed: string[] }) => void;
  clearDeviceData.mockReturnValue(new Promise((r) => (finish = r)));
  getDocMock.mockImplementation(async (path: string) =>
    path === "users/u1" ? snap({ householdId: "home", displayName: "Ava" }) : snap({ memberIds: ["u1"] }));
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"member"'));
  listeners[0](null);
  await waitFor(() => expect(clearDeviceData).toHaveBeenCalledTimes(1));
  expect(resetDocument).not.toHaveBeenCalled();
  finish({ failed: ["store"] });
  await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
});
```

In `web/src/auth/AuthProvider.tsx`, import `clearDeviceData` from `../device/cleanup` and change the reset branch to:

```ts
      if (previous !== null && (user === null || user.uid !== previous)) {
        generationRef.current += 1;
        setState({ status: "resetting" });
        // Device data goes first (spec §3.8). The reset proceeds whatever the result: a failure
        // leaves the pendingClear marker set, and the next start finishes the job before rendering.
        void clearDeviceData().finally(() => resetDocument());
        return;
      }
```

- [ ] **Step 6: Give `callable` a timeout option (test first)**

Append to the `describe("callable")` block in `web/src/api/callable.test.ts`:

```ts
  it("passes a timeout through when given, and nothing otherwise", () => {
    httpsCallableMock.mockReturnValue(async () => ({ data: null }));
    callable("slow", { timeout: 70_000 });
    expect(httpsCallableMock).toHaveBeenLastCalledWith({ app: "fake" }, "slow", { timeout: 70_000 });
    callable("plain");
    expect(httpsCallableMock).toHaveBeenLastCalledWith({ app: "fake" }, "plain");
  });
```

In `web/src/api/callable.ts`, replace `callable`:

```ts
/** A typed callable that resolves to the response data (not the SDK's `{ data }` wrapper). */
export function callable<Req, Res>(name: string, options?: { timeout?: number }): (data: Req) => Promise<Res> {
  const call = options ? httpsCallable<Req, Res>(functions, name, options) : httpsCallable<Req, Res>(functions, name);
  return async (data: Req) => (await call(data)).data;
}
```

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:e2e` (10 min timeout; the reset path is exercised by the existing cross-tab scenarios).
Expected: PASS. Web unit = previous + 10. Browser count unchanged.

- [ ] **Step 8: Commit**

```bash
git add web/src/device web/src/main.tsx web/src/auth/AuthProvider.tsx web/src/auth/AuthProvider.test.tsx web/src/api/callable.ts web/src/api/callable.test.ts
git commit -m "feat(device): cleanup registry with a pending-clear marker checked at start-up" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 8: Deletion flow logic (reauthentication, storage, recovery mapping)

**Files:**
- Create: `web/src/auth/reauthenticate.ts`, `web/src/auth/reauthenticate.test.ts`, `web/src/account/storage.ts`, `web/src/account/storage.test.ts`, `web/src/account/api.ts`, `web/src/account/recovery.ts`, `web/src/account/recovery.test.ts`, `web/src/account/deleteFlow.ts`, `web/src/account/deleteFlow.test.ts`
- Modify: `web/src/auth/changePassword.ts`

**Interfaces:**
- Consumes: `callable` with `{ timeout }` and `clearDeviceData` (Task 7); `resetDocument` (existing).
- Produces:
  ```ts
  // auth/reauthenticate.ts
  export type ReauthResult = "ok" | "wrongCurrent" | "tooManyRequests" | "offline" | "failed";
  export function reauthenticate(password: string): Promise<ReauthResult>;
  // account/storage.ts — every accessor swallows storage errors
  export const DELETION_REQUEST_KEY = "safebite.deletionRequest";
  export const ACCOUNT_DELETED_KEY = "safebite.accountDeleted";
  export type DeletedNotice = "ok" | "clearFailed";
  export function readDeletionRequest(): string | null;
  export function writeDeletionRequest(requestId: string): void;
  export function clearDeletionRequest(): void;
  export function writeDeletedNotice(notice: DeletedNotice): void;
  export function takeDeletedNotice(): DeletedNotice | null; // reads and removes
  // account/api.ts
  export type ReceiptStatus = "none" | "started" | "dataDeleted" | "complete";
  export const DELETE_TIMEOUT_MS = 70_000;
  export const deleteAccountCall: (d: { requestId: string }) => Promise<{ deleted: true; lastMember: boolean }>;
  export const checkAccountDeletionCall: (d: { requestId: string }) => Promise<{ status: ReceiptStatus }>;
  export function newRequestId(): string; // 43 base64url chars from 32 random bytes
  // account/recovery.ts
  export type CallErrorKind = "lost" | "recentLogin" | "permission" | "failed";
  export function classifyCallError(err: unknown): CallErrorKind;
  export type CheckResult = { ok: true; status: ReceiptStatus } | { ok: false };
  export type RecoveryView = "success" | "unfinishedSignedIn" | "unfinishedSignedOut" | "uncertain";
  export function recoveryView(check: CheckResult, signedIn: boolean): RecoveryView;
  export function checkDeletion(requestId: string): Promise<CheckResult>; // never throws
  // account/deleteFlow.ts
  export type DeleteOutcome =
    | { kind: "deleted" }
    | { kind: "reauth"; result: Exclude<ReauthResult, "ok"> }
    | { kind: "recentLogin" } | { kind: "permission" } | { kind: "failed" }
    | { kind: "lost"; requestId: string };
  export function deleteMyAccount(password: string): Promise<DeleteOutcome>;
  export function finishDeleted(): Promise<void>; // clear device → notice → clear key → sign out → reset
  ```

- [ ] **Step 1: Extract reauthentication (test first)**

Create `web/src/auth/reauthenticate.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  reauthenticateWithCredential: vi.fn(),
  credential: vi.fn((email: string, password: string) => ({ email, password })),
  currentUser: { email: "ava@safebite.test" } as { email: string | null } | null,
}));
vi.mock("../firebase", () => ({ get auth() { return { currentUser: f.currentUser }; } }));
vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: f.credential },
  reauthenticateWithCredential: f.reauthenticateWithCredential,
}));

import { reauthenticate } from "./reauthenticate";

const err = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  f.currentUser = { email: "ava@safebite.test" };
  f.reauthenticateWithCredential.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("reauthenticate", () => {
  it("reauthenticates the current user with their email and the given password", async () => {
    await expect(reauthenticate("pw")).resolves.toBe("ok");
    expect(f.credential).toHaveBeenCalledWith("ava@safebite.test", "pw");
  });
  it("is offline without a request when the browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(reauthenticate("pw")).resolves.toBe("offline");
    expect(f.reauthenticateWithCredential).not.toHaveBeenCalled();
  });
  it("fails without a signed-in user with an email", async () => {
    f.currentUser = null;
    await expect(reauthenticate("pw")).resolves.toBe("failed");
  });
  it.each([
    ["auth/invalid-credential", "wrongCurrent"], ["auth/wrong-password", "wrongCurrent"],
    ["auth/too-many-requests", "tooManyRequests"], ["auth/network-request-failed", "offline"], ["auth/other", "failed"],
  ])("maps %s to %s", async (code, result) => {
    f.reauthenticateWithCredential.mockRejectedValue(err(code));
    await expect(reauthenticate("pw")).resolves.toBe(result);
  });
});
```

Create `web/src/auth/reauthenticate.ts`:

```ts
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "../firebase";

/** Password re-entry shared by change password and account deletion (spec §3.7, §3.8). */
export type ReauthResult = "ok" | "wrongCurrent" | "tooManyRequests" | "offline" | "failed";

export async function reauthenticate(password: string): Promise<ReauthResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const user = auth.currentUser;
  if (!user || !user.email) return "failed";
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return "ok";
  } catch (err) {
    switch ((err as { code?: string }).code) {
      case "auth/invalid-credential":
      case "auth/wrong-password": return "wrongCurrent";
      case "auth/too-many-requests": return "tooManyRequests";
      case "auth/network-request-failed": return "offline";
      default: return "failed";
    }
  }
}
```

In `web/src/auth/changePassword.ts`, delete `reauthFailure`, import `reauthenticate` from `./reauthenticate`, drop `EmailAuthProvider` and `reauthenticateWithCredential` from the `firebase/auth` import, and replace the first `try`/`catch` in `changePassword` with:

```ts
  const reauth = await reauthenticate(current);
  if (reauth !== "ok") return reauth; // never attempt the update after a failed reauthentication
```

Keep the existing offline and `!user.email` checks above it unchanged. The existing `changePassword.test.ts` must pass unmodified, which proves the extraction kept behaviour.

- [ ] **Step 2: Write the failing storage, recovery and flow tests**

Create `web/src/account/storage.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDeletionRequest, readDeletionRequest, takeDeletedNotice, writeDeletedNotice, writeDeletionRequest } from "./storage";

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe("account storage", () => {
  it("round-trips the deletion request id", () => {
    writeDeletionRequest("id-1");
    expect(readDeletionRequest()).toBe("id-1");
    clearDeletionRequest();
    expect(readDeletionRequest()).toBeNull();
  });
  it("the deleted notice is shown once", () => {
    writeDeletedNotice("clearFailed");
    expect(takeDeletedNotice()).toBe("clearFailed");
    expect(takeDeletedNotice()).toBeNull();
  });
  it("ignores an unknown notice value", () => {
    sessionStorage.setItem("safebite.accountDeleted", "weird");
    expect(takeDeletedNotice()).toBeNull();
  });
  it("never throws when storage is blocked (Review Focus 4)", () => {
    for (const m of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, m).mockImplementation(() => { throw new Error("blocked"); });
    }
    expect(() => writeDeletionRequest("x")).not.toThrow();
    expect(readDeletionRequest()).toBeNull();
    expect(() => clearDeletionRequest()).not.toThrow();
    expect(() => writeDeletedNotice("ok")).not.toThrow();
    expect(takeDeletedNotice()).toBeNull();
  });
});
```

Create `web/src/account/recovery.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("./api", () => ({ checkAccountDeletionCall: check }));

import { checkDeletion, classifyCallError, recoveryView } from "./recovery";

const fnErr = (code: string, details?: unknown) => Object.assign(new Error(code), { code: `functions/${code}`, details });

describe("classifyCallError", () => {
  it.each(["deadline-exceeded", "unavailable", "internal", "unknown", "aborted", "data-loss"])("%s is a lost response", (code) => {
    expect(classifyCallError(fnErr(code))).toBe("lost");
  });
  it("an error that is not a functions error is treated as lost (we cannot know it never ran)", () => {
    expect(classifyCallError(new TypeError("Failed to fetch"))).toBe("lost");
  });
  it("recentLogin is recognised by its details reason", () => {
    expect(classifyCallError(fnErr("failed-precondition", { reason: "recentLogin" }))).toBe("recentLogin");
    expect(classifyCallError(fnErr("failed-precondition"))).toBe("failed");
  });
  it("definite refusals", () => {
    expect(classifyCallError(fnErr("permission-denied"))).toBe("permission");
    for (const code of ["invalid-argument", "unauthenticated", "not-found", "resource-exhausted", "already-exists", "out-of-range", "unimplemented"]) {
      expect(classifyCallError(fnErr(code))).toBe("failed");
    }
  });
  it("never reads an Auth error code as anything but lost", () => {
    expect(classifyCallError(Object.assign(new Error(), { code: "auth/user-token-expired" }))).toBe("lost");
  });
});

describe("recoveryView (spec §3.8 Recovery table)", () => {
  it.each([
    [{ ok: true, status: "complete" }, true, "success"], [{ ok: true, status: "complete" }, false, "success"],
    [{ ok: true, status: "started" }, true, "unfinishedSignedIn"], [{ ok: true, status: "dataDeleted" }, true, "unfinishedSignedIn"], [{ ok: true, status: "none" }, true, "unfinishedSignedIn"],
    [{ ok: true, status: "started" }, false, "unfinishedSignedOut"], [{ ok: true, status: "dataDeleted" }, false, "unfinishedSignedOut"], [{ ok: true, status: "none" }, false, "unfinishedSignedOut"],
    [{ ok: false }, true, "uncertain"], [{ ok: false }, false, "uncertain"],
  ] as const)("%j signedIn=%s → %s", (result, signedIn, view) => {
    expect(recoveryView(result, signedIn)).toBe(view);
  });
});

describe("checkDeletion", () => {
  it("wraps the status, and turns any failure into ok: false", async () => {
    check.mockResolvedValueOnce({ status: "complete" });
    await expect(checkDeletion("id")).resolves.toEqual({ ok: true, status: "complete" });
    check.mockRejectedValueOnce(new Error("offline"));
    await expect(checkDeletion("id")).resolves.toEqual({ ok: false });
    check.mockResolvedValueOnce({ status: "bogus" });
    await expect(checkDeletion("id")).resolves.toEqual({ ok: false });
  });
});
```

Create `web/src/account/deleteFlow.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  reauthenticate: vi.fn(),
  deleteAccountCall: vi.fn(),
  clearDeviceData: vi.fn(),
  signOut: vi.fn(),
  resetDocument: vi.fn(),
  getIdToken: vi.fn(),
  order: [] as string[],
}));
vi.mock("../auth/reauthenticate", () => ({ reauthenticate: m.reauthenticate }));
vi.mock("./api", () => ({ deleteAccountCall: m.deleteAccountCall, newRequestId: () => "R".repeat(43) }));
vi.mock("../device/cleanup", () => ({ clearDeviceData: m.clearDeviceData }));
vi.mock("../auth/resetDocument", () => ({ resetDocument: m.resetDocument }));
vi.mock("firebase/auth", () => ({ signOut: m.signOut }));
vi.mock("../firebase", () => ({ get auth() { return { currentUser: { getIdToken: m.getIdToken } }; } }));

import { deleteMyAccount } from "./deleteFlow";
import { readDeletionRequest, takeDeletedNotice } from "./storage";

const fnErr = (code: string, details?: unknown) => Object.assign(new Error(code), { code: `functions/${code}`, details });

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  m.order.length = 0;
  m.reauthenticate.mockImplementation(async () => { m.order.push("reauth"); return "ok"; });
  m.getIdToken.mockImplementation(async () => { m.order.push("token"); return "t"; });
  m.deleteAccountCall.mockImplementation(async () => { m.order.push("call"); return { deleted: true, lastMember: false }; });
  m.clearDeviceData.mockImplementation(async () => { m.order.push("clear"); return { failed: [] }; });
  m.signOut.mockImplementation(async () => { m.order.push("signOut"); });
  m.resetDocument.mockImplementation(() => { m.order.push("reset"); });
});
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

describe("deleteMyAccount", () => {
  it("offline: nothing is sent, not even reauthentication (Review Focus 5)", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "reauth", result: "offline" });
    expect(m.reauthenticate).not.toHaveBeenCalled();
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });

  it("a wrong password sends nothing", async () => {
    m.reauthenticate.mockResolvedValue("wrongCurrent");
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "reauth", result: "wrongCurrent" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
    expect(readDeletionRequest()).toBeNull();
  });

  it("success: reauth → fresh token → call → clear device → sign out → reset; the token is never refreshed after the call", async () => {
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "deleted" });
    expect(m.order).toEqual(["reauth", "token", "call", "clear", "signOut", "reset"]);
    expect(m.getIdToken).toHaveBeenCalledWith(true);
    expect(m.deleteAccountCall).toHaveBeenCalledWith({ requestId: "R".repeat(43) });
    expect(takeDeletedNotice()).toBe("ok");
    expect(readDeletionRequest()).toBeNull();
  });

  it("the request id is stored before the call is sent", async () => {
    m.deleteAccountCall.mockImplementation(async () => { expect(readDeletionRequest()).toBe("R".repeat(43)); return { deleted: true, lastMember: false }; });
    await deleteMyAccount("pw");
  });

  it("success with failed device clearing is reported separately", async () => {
    m.clearDeviceData.mockResolvedValue({ failed: ["store"] });
    await deleteMyAccount("pw");
    expect(takeDeletedNotice()).toBe("clearFailed");
  });

  it("a lost response keeps the request id for recovery and does not sign out", async () => {
    m.deleteAccountCall.mockRejectedValue(fnErr("deadline-exceeded"));
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "lost", requestId: "R".repeat(43) });
    expect(readDeletionRequest()).toBe("R".repeat(43));
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.getIdToken).toHaveBeenCalledTimes(1);
  });

  it.each([
    [fnErr("failed-precondition", { reason: "recentLogin" }), "recentLogin"],
    [fnErr("permission-denied"), "permission"],
    [fnErr("invalid-argument"), "failed"],
  ] as const)("a definite refusal clears the request id: %s", async (error, kind) => {
    m.deleteAccountCall.mockRejectedValue(error);
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind });
    expect(readDeletionRequest()).toBeNull();
  });

  it("a token refresh failing before the call sends nothing", async () => {
    m.getIdToken.mockRejectedValue(new Error("network"));
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "failed" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm --prefix web test -- src/account src/auth/reauthenticate`
Expected: FAIL for the account files: `Failed to resolve import "./storage"` (and `./recovery`, `./deleteFlow`). `reauthenticate.test.ts` passes once Step 1's file exists.

- [ ] **Step 4: Implement**

Create `web/src/account/storage.ts`:

```ts
/**
 * Per-tab session keys for account deletion (spec §3.8). Survive this tab's reset reload; never
 * shared across tabs; every access tolerates blocked storage.
 */
export const DELETION_REQUEST_KEY = "safebite.deletionRequest";
export const ACCOUNT_DELETED_KEY = "safebite.accountDeleted";
export type DeletedNotice = "ok" | "clearFailed";

function get(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function set(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* blocked: in-document recovery still works */ }
}
function remove(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* blocked */ }
}

export const readDeletionRequest = () => get(DELETION_REQUEST_KEY);
export const writeDeletionRequest = (requestId: string) => set(DELETION_REQUEST_KEY, requestId);
export const clearDeletionRequest = () => remove(DELETION_REQUEST_KEY);
export const writeDeletedNotice = (notice: DeletedNotice) => set(ACCOUNT_DELETED_KEY, notice);

export function takeDeletedNotice(): DeletedNotice | null {
  const value = get(ACCOUNT_DELETED_KEY);
  remove(ACCOUNT_DELETED_KEY);
  return value === "ok" || value === "clearFailed" ? value : null;
}
```

Create `web/src/account/api.ts`:

```ts
import { callable } from "../api/callable";

export type ReceiptStatus = "none" | "started" | "dataDeleted" | "complete";

/** Longer than the function's 60 s timeout (spec §3.8). */
export const DELETE_TIMEOUT_MS = 70_000;

export const deleteAccountCall = callable<{ requestId: string }, { deleted: true; lastMember: boolean }>("deleteAccount", { timeout: DELETE_TIMEOUT_MS });
export const checkAccountDeletionCall = callable<{ requestId: string }, { status: ReceiptStatus }>("checkAccountDeletion", { timeout: 20_000 });

/** 32 random bytes as base64url without padding: 43 characters, the server's accepted format. */
export function newRequestId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```

Create `web/src/account/recovery.ts`:

```ts
import { checkAccountDeletionCall, type ReceiptStatus } from "./api";

/**
 * Lost-response recovery (spec §3.8). Anything that does not prove the server refused is "lost",
 * resolved by the receipt. Auth error codes are never read: the SDK reports a deleted account and
 * a revoked session with the same code.
 */
export type CallErrorKind = "lost" | "recentLogin" | "permission" | "failed";

const REFUSALS = new Set(["invalid-argument", "unauthenticated", "not-found", "resource-exhausted", "already-exists", "out-of-range", "unimplemented"]);

export function classifyCallError(err: unknown): CallErrorKind {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !code.startsWith("functions/")) return "lost";
  const name = code.slice("functions/".length);
  if (name === "permission-denied") return "permission";
  if (name === "failed-precondition") {
    const reason = ((err as { details?: { reason?: unknown } }).details ?? {}).reason;
    return reason === "recentLogin" ? "recentLogin" : "failed";
  }
  return REFUSALS.has(name) ? "failed" : "lost";
}

export type CheckResult = { ok: true; status: ReceiptStatus } | { ok: false };
export type RecoveryView = "success" | "unfinishedSignedIn" | "unfinishedSignedOut" | "uncertain";

export function recoveryView(check: CheckResult, signedIn: boolean): RecoveryView {
  if (!check.ok) return "uncertain";
  if (check.status === "complete") return "success";
  return signedIn ? "unfinishedSignedIn" : "unfinishedSignedOut";
}

const STATUSES: readonly ReceiptStatus[] = ["none", "started", "dataDeleted", "complete"];

export async function checkDeletion(requestId: string): Promise<CheckResult> {
  try {
    const { status } = await checkAccountDeletionCall({ requestId });
    return STATUSES.includes(status) ? { ok: true, status } : { ok: false };
  } catch {
    return { ok: false };
  }
}
```

Create `web/src/account/deleteFlow.ts`:

```ts
import { signOut } from "firebase/auth";
import { reauthenticate, type ReauthResult } from "../auth/reauthenticate";
import { resetDocument } from "../auth/resetDocument";
import { clearDeviceData } from "../device/cleanup";
import { auth } from "../firebase";
import { deleteAccountCall, newRequestId } from "./api";
import { classifyCallError } from "./recovery";
import { clearDeletionRequest, writeDeletedNotice, writeDeletionRequest } from "./storage";

export type DeleteOutcome =
  | { kind: "deleted" }
  | { kind: "reauth"; result: Exclude<ReauthResult, "ok"> }
  | { kind: "recentLogin" }
  | { kind: "permission" }
  | { kind: "failed" }
  | { kind: "lost"; requestId: string };

/**
 * Spec §3.8 sequence: reauthenticate, refresh the token so the server sees the new auth_time,
 * store a fresh request id, call. After the call is sent the token is never refreshed again: for
 * a deleted account the SDK would report a revoked session and sign the tab out mid-recovery.
 */
export async function deleteMyAccount(password: string): Promise<DeleteOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "reauth", result: "offline" };
  const reauth = await reauthenticate(password);
  if (reauth !== "ok") return { kind: "reauth", result: reauth };
  const user = auth.currentUser;
  if (!user) return { kind: "failed" };
  try {
    await user.getIdToken(true);
  } catch {
    return { kind: "failed" };
  }
  const requestId = newRequestId();
  writeDeletionRequest(requestId);
  try {
    await deleteAccountCall({ requestId });
  } catch (err) {
    const kind = classifyCallError(err);
    if (kind === "lost") return { kind: "lost", requestId };
    clearDeletionRequest();
    return { kind };
  }
  await finishDeleted();
  return { kind: "deleted" };
}

/** The server confirmed deletion. Device data first; a clearing failure is reported separately. */
export async function finishDeleted(): Promise<void> {
  const { failed } = await clearDeviceData();
  writeDeletedNotice(failed.length === 0 ? "ok" : "clearFailed");
  clearDeletionRequest();
  try {
    await signOut(auth);
  } catch {
    // Already signed out (the SDK may have done it); the explicit reset below still runs.
  }
  resetDocument();
}
```

- [ ] **Step 5: Run everything**

Run: `npm run typecheck && npm run test:unit`.
Expected: PASS. Web unit = previous + the new cases Vitest reports (about 45). `changePassword.test.ts` is unchanged and green.

- [ ] **Step 6: Commit**

```bash
git add web/src/auth/reauthenticate.ts web/src/auth/reauthenticate.test.ts web/src/auth/changePassword.ts web/src/account
git commit -m "feat(account): deletion flow with server-decided recovery" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 9: Deletion screens and auth states

**Files:**
- Create: `web/src/account/DeletePasswordForm.tsx` (+`.test.tsx`), `web/src/account/DeletionRecoveryScreen.tsx` (+`.test.tsx`), `web/src/account/DeleteAccountPage.tsx` (+`.test.tsx`), `web/src/account/DeletionPendingScreen.tsx`, `web/src/account/deletedNotice.ts`
- Modify: `web/src/auth/AuthProvider.tsx` (+test), `web/src/App.tsx`, `web/src/AppShell.tsx`, `web/src/auth/NotInvitedScreen.tsx`, `web/src/auth/SignInScreen.tsx`, `web/src/pages/SettingsPage.tsx` (+test)

**Interfaces:**
- Consumes: `deleteMyAccount`, `finishDeleted`, `DeleteOutcome` (Task 8); `checkDeletion`, `recoveryView` (Task 8); `readDeletionRequest`, `clearDeletionRequest`, `takeDeletedNotice` (Task 8); `resetDocument`.
- Produces:
  - `AuthState` gains `{ status: "deletionPending"; email: string | null }`, and `notMember` gains `canDeleteSignIn: boolean` (true when there is no `users/{uid}` document and no deletion record).
  - `DeletePasswordForm({ submitLabel, testid })`: password field `${testid}-password`, submit `${testid}-submit`, progress `delete-progress`, outcome `delete-outcome` with `data-kind`. On a lost response it reloads the tab (`resetDocument()`); the top-level recovery screen takes over because the request id is in `sessionStorage`.
  - `DeletionRecoveryScreen({ requestId, onDismiss })` with testids `recovery-checking`, `recovery-success`, `recovery-unfinished`, `recovery-signin`, `recovery-uncertain`, `recovery-check-again`, `recovery-signout`.
  - Route `/settings/delete-account`; Settings link testid `delete-account-link`.
  - Sign-in notice testid `signin-deleted-notice`.

- [ ] **Step 1: AuthProvider states (test first)**

In `web/src/auth/AuthProvider.test.tsx`, every existing test whose `getDocMock` answers by path must answer `accountDeletions/<uid>` with `snap(undefined)`. Check each `mockImplementation`; any that returns a document for "every other path" would now report `deletionPending`. Append:

```tsx
it("a non-member with an unfinished deletion record is deletionPending", async () => {
  getDocMock.mockImplementation(async (path: string) => (path === "accountDeletions/u1" ? snap({ householdId: "home" }) : snap(undefined)));
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"deletionPending"'));
});

it("canDeleteSignIn is true only without a users document and without a record", async () => {
  getDocMock.mockImplementation(async () => snap(undefined));
  const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"canDeleteSignIn":true'));
  unmount();
  getDocMock.mockImplementation(async (path: string) => (path === "users/u2" ? snap({ householdId: "home", displayName: "X" }) : snap(undefined)));
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[1]({ uid: "u2", email: "b@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"canDeleteSignIn":false'));
});

it("an offline failure reading the record is the error state, not notMember", async () => {
  getDocMock.mockImplementation(async (path: string) => {
    if (path.startsWith("accountDeletions/")) throw Object.assign(new Error("x"), { code: "unavailable" });
    return snap(undefined);
  });
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"error"'));
});
```

In `web/src/auth/AuthProvider.tsx`, extend `AuthState`:

```ts
  | { status: "notMember"; email: string | null; canDeleteSignIn: boolean }
  | { status: "deletionPending"; email: string | null }
```

and end `stateForUser` with:

```ts
  if (membership.kind === "member") {
    return { status: "member", uid: user.uid, email: user.email, householdId: membership.householdId, displayName: membership.displayName };
  }
  // An interrupted account deletion (spec §3.8): the owner may read their own record.
  const record = await readDoc(`accountDeletions/${user.uid}`);
  if (record !== undefined) return { status: "deletionPending", email: user.email };
  return { status: "notMember", email: user.email, canDeleteSignIn: userDoc === undefined };
```

Update the `notMember` email read in `NotInvitedScreen` if TypeScript asks.

- [ ] **Step 2: Write the failing component tests**

Create `web/src/account/DeletePasswordForm.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ deleteMyAccount: vi.fn(), resetDocument: vi.fn() }));
vi.mock("./deleteFlow", () => ({ deleteMyAccount: m.deleteMyAccount }));
vi.mock("../auth/resetDocument", () => ({ resetDocument: m.resetDocument }));

import { DeletePasswordForm } from "./DeletePasswordForm";

beforeEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: true }));
afterEach(() => vi.clearAllMocks());

const submit = async (pw = "pilot-password-1") => {
  await userEvent.type(screen.getByTestId("del-password"), pw);
  await userEvent.click(screen.getByTestId("del-submit"));
};

describe("DeletePasswordForm", () => {
  it("asks for the password before doing anything", async () => {
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await userEvent.click(screen.getByTestId("del-submit"));
    expect(screen.getByTestId("delete-outcome")).toHaveTextContent("Enter your password.");
    expect(m.deleteMyAccount).not.toHaveBeenCalled();
  });

  it("shows the non-dismissable progress screen while deleting", async () => {
    m.deleteMyAccount.mockReturnValue(new Promise(() => {}));
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await submit();
    expect(screen.getByTestId("delete-progress")).toHaveTextContent("Deleting your account… keep this page open");
    expect(screen.queryByTestId("del-submit")).toBeNull();
  });

  it.each([
    [{ kind: "reauth", result: "wrongCurrent" }, "That isn't your current password."],
    [{ kind: "reauth", result: "tooManyRequests" }, "Too many attempts. Wait a few minutes and try again."],
    [{ kind: "reauth", result: "offline" }, "You are offline. Connect and try again."],
    [{ kind: "recentLogin" }, "For security, enter your password again."],
    [{ kind: "permission" }, "This account can't be deleted here."],
    [{ kind: "failed" }, "Couldn't delete your account. Try again."],
  ])("outcome %j shows its message and keeps the form", async (outcome, text) => {
    m.deleteMyAccount.mockResolvedValue(outcome);
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await submit();
    await waitFor(() => expect(screen.getByTestId("delete-outcome")).toHaveTextContent(text));
    expect(screen.getByTestId("del-submit")).toBeEnabled();
    expect(m.resetDocument).not.toHaveBeenCalled();
  });

  it("a lost response reloads the tab so the recovery screen takes over", async () => {
    m.deleteMyAccount.mockResolvedValue({ kind: "lost", requestId: "R" });
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await submit();
    await waitFor(() => expect(m.resetDocument).toHaveBeenCalledTimes(1));
  });

  it("is disabled while offline (Review Focus 5)", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    expect(screen.getByTestId("del-submit")).toBeDisabled();
    expect(screen.getByTestId("delete-offline")).toHaveTextContent("You are offline");
  });
});
```

Create `web/src/account/DeletionRecoveryScreen.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  checkDeletion: vi.fn(),
  finishDeleted: vi.fn(),
  signOut: vi.fn(),
  currentUser: null as unknown,
}));
vi.mock("./recovery", async (orig) => ({ ...(await orig<typeof import("./recovery")>()), checkDeletion: m.checkDeletion }));
vi.mock("./deleteFlow", () => ({ finishDeleted: m.finishDeleted, deleteMyAccount: vi.fn() }));
vi.mock("firebase/auth", () => ({ signOut: m.signOut }));
vi.mock("../firebase", () => ({ get auth() { return { currentUser: m.currentUser, authStateReady: async () => {} }; } }));
vi.mock("../auth/resetDocument", () => ({ resetDocument: vi.fn() }));

import { DeletionRecoveryScreen } from "./DeletionRecoveryScreen";
import { readDeletionRequest, writeDeletionRequest } from "./storage";

afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); m.currentUser = null; });

describe("DeletionRecoveryScreen", () => {
  it("complete: finishes deleting (device clear, notice, sign out)", async () => {
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen requestId="R" onDismiss={vi.fn()} />);
    expect(screen.getByTestId("recovery-checking")).toBeInTheDocument();
    await waitFor(() => expect(m.finishDeleted).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("recovery-success")).toHaveTextContent("Your account has been deleted.");
  });

  it("unfinished and signed in: offers Finish deleting with a password", async () => {
    m.currentUser = { uid: "u" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    render(<DeletionRecoveryScreen requestId="R" onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-unfinished")).toHaveTextContent("Your account deletion didn't finish.");
    expect(screen.getByTestId("finish-submit")).toHaveTextContent("Finish deleting");
  });

  it("unfinished and signed out: Sign in clears the key and dismisses", async () => {
    writeDeletionRequest("R");
    m.checkDeletion.mockResolvedValue({ ok: true, status: "dataDeleted" });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen requestId="R" onDismiss={onDismiss} />);
    await userEvent.click(await screen.findByTestId("recovery-signin"));
    expect(readDeletionRequest()).toBeNull();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("uncertain: Check again repeats only the check, without a password", async () => {
    m.checkDeletion.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen requestId="R" onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-uncertain")).toHaveTextContent("We couldn't confirm whether your account was deleted.");
    expect(screen.queryByRole("textbox")).toBeNull();
    await userEvent.click(screen.getByTestId("recovery-check-again"));
    await waitFor(() => expect(m.finishDeleted).toHaveBeenCalledTimes(1));
    expect(m.checkDeletion).toHaveBeenCalledTimes(2);
  });

  it("uncertain: Sign out clears the key", async () => {
    writeDeletionRequest("R");
    m.currentUser = { uid: "u" };
    m.checkDeletion.mockResolvedValue({ ok: false });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen requestId="R" onDismiss={onDismiss} />);
    await userEvent.click(await screen.findByTestId("recovery-signout"));
    expect(readDeletionRequest()).toBeNull();
    expect(m.signOut).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

Create `web/src/account/DeleteAccountPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getDoc: vi.fn() }));
vi.mock("../firebase", () => ({ db: {}, auth: {} }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, path: string) => ({ path }), getDoc: m.getDoc }));
vi.mock("../records/useMember", () => ({ useMember: () => ({ uid: "u", householdId: "home", displayName: "Ava" }) }));
vi.mock("./DeletePasswordForm", () => ({ DeletePasswordForm: ({ submitLabel }: { submitLabel: string }) => <button>{submitLabel}</button> }));

import { DeleteAccountPage } from "./DeleteAccountPage";

const page = () => render(<MemoryRouter><DeleteAccountPage /></MemoryRouter>);

describe("DeleteAccountPage", () => {
  it("with another member: notes deleted, evidence kept as Former member, Export first link", async () => {
    m.getDoc.mockResolvedValue({ exists: () => true, get: () => ["u", "other"] });
    page();
    expect(await screen.findByTestId("delete-consequence")).toHaveTextContent("Restaurants and evidence you added stay with the household, shown as 'Former member'.");
    expect(screen.getByTestId("export-first")).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
  });

  it("as the only member: everything is deleted", async () => {
    m.getDoc.mockResolvedValue({ exists: () => true, get: () => ["u"] });
    page();
    expect(await screen.findByTestId("delete-consequence")).toHaveTextContent("Everything in the household is deleted.");
  });

  it("if the household cannot be read it shows the normal text", async () => {
    m.getDoc.mockRejectedValue(new Error("offline"));
    page();
    expect(await screen.findByTestId("delete-consequence")).toHaveTextContent("Your sign-in and your notes are deleted.");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm --prefix web test -- src/account src/auth/AuthProvider`
Expected: FAIL — the three component modules cannot be resolved; the new AuthProvider cases fail on the missing states.

- [ ] **Step 4: Implement the components**

Create `web/src/account/DeletePasswordForm.tsx`:

```tsx
import { useEffect, useState, type SubmitEvent } from "react";
import { resetDocument } from "../auth/resetDocument";
import { deleteMyAccount, type DeleteOutcome } from "./deleteFlow";

const MESSAGES: Record<string, string> = {
  wrongCurrent: "That isn't your current password.",
  tooManyRequests: "Too many attempts. Wait a few minutes and try again.",
  offline: "You are offline. Connect and try again.",
  reauthFailed: "Couldn't check your password. Try again.",
  recentLogin: "For security, enter your password again.",
  permission: "This account can't be deleted here.",
  failed: "Couldn't delete your account. Try again.",
  empty: "Enter your password.",
};

function messageKey(outcome: Exclude<DeleteOutcome, { kind: "deleted" } | { kind: "lost" }>): string {
  if (outcome.kind === "reauth") return outcome.result === "failed" ? "reauthFailed" : outcome.result;
  return outcome.kind;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

/** Password, submit, progress and outcome; shared by every screen that deletes the account (spec §3.8). */
export function DeletePasswordForm({ submitLabel, testid }: { submitLabel: string; testid: string }) {
  const online = useOnline();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ key: string } | null>(null);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length === 0) { setMessage({ key: "empty" }); return; }
    setMessage(null);
    setBusy(true);
    const outcome = await deleteMyAccount(password);
    if (outcome.kind === "deleted") return; // finishDeleted is resetting the tab
    if (outcome.kind === "lost") { resetDocument(); return; } // the recovery screen takes over after the reload
    setBusy(false);
    setPassword("");
    setMessage({ key: messageKey(outcome) });
  }

  if (busy) {
    return <p className="screen" role="status" data-testid="delete-progress">Deleting your account… keep this page open.</p>;
  }
  return (
    <form onSubmit={onSubmit} data-testid={`${testid}-form`}>
      <label>
        Current password
        <input data-testid={`${testid}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {!online && <p data-testid="delete-offline">You are offline. Connect to delete your account.</p>}
      <button data-testid={`${testid}-submit`} type="submit" disabled={!online}>{submitLabel}</button>
      {message && <p role="alert" data-testid="delete-outcome" data-kind={message.key}>{MESSAGES[message.key]}</p>}
    </form>
  );
}
```

Create `web/src/account/DeletionRecoveryScreen.tsx`:

```tsx
import { signOut } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { auth } from "../firebase";
import { DeletePasswordForm } from "./DeletePasswordForm";
import { finishDeleted } from "./deleteFlow";
import { checkDeletion, recoveryView, type RecoveryView } from "./recovery";
import { clearDeletionRequest } from "./storage";

/**
 * Rendered ahead of every auth state while sessionStorage holds a deletion request id (spec §3.8),
 * so it survives the reset reload any sign-out causes. Only the server's receipt decides.
 */
export function DeletionRecoveryScreen({ requestId, onDismiss }: { requestId: string; onDismiss: () => void }) {
  const [view, setView] = useState<RecoveryView | "checking">("checking");

  const check = useCallback(() => {
    setView("checking");
    void (async () => {
      const result = await checkDeletion(requestId);
      await auth.authStateReady();
      const next = recoveryView(result, auth.currentUser !== null);
      setView(next);
      if (next === "success") await finishDeleted();
    })();
  }, [requestId]);
  useEffect(check, [check]);

  const leave = async () => {
    clearDeletionRequest();
    if (auth.currentUser) await signOut(auth).catch(() => {});
    onDismiss();
  };

  return (
    <main className="screen">
      <h1>Account deletion</h1>
      {view === "checking" && <p data-testid="recovery-checking">Checking whether your account was deleted…</p>}
      {view === "success" && <p data-testid="recovery-success">Your account has been deleted.</p>}
      {view === "unfinishedSignedIn" && (
        <section data-testid="recovery-unfinished">
          <p>Your account deletion didn't finish.</p>
          <DeletePasswordForm submitLabel="Finish deleting" testid="finish" />
        </section>
      )}
      {view === "unfinishedSignedOut" && (
        <section data-testid="recovery-unfinished">
          <p>Your account deletion didn't finish. Sign in to finish it.</p>
          <button type="button" data-testid="recovery-signin" onClick={() => { clearDeletionRequest(); onDismiss(); }}>Sign in</button>
        </section>
      )}
      {view === "uncertain" && (
        <section data-testid="recovery-uncertain">
          <p>We couldn't confirm whether your account was deleted.</p>
          <p>If this doesn't clear, sign in again. If your account still exists, you'll be offered to finish deleting it.</p>
          <button type="button" data-testid="recovery-check-again" onClick={check}>Check again</button>
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
    </main>
  );
}
```

Create `web/src/account/DeleteAccountPage.tsx`:

```tsx
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { db } from "../firebase";
import { useMember } from "../records/useMember";
import { DeletePasswordForm } from "./DeletePasswordForm";

/** The text is advisory: the server's step 2 transaction decides who is last (spec §3.8). */
export function DeleteAccountPage() {
  const { householdId } = useMember();
  const [onlyMember, setOnlyMember] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    getDoc(doc(db, `households/${householdId}`))
      .then((snap) => {
        const ids: unknown = snap.exists() ? snap.get("memberIds") : undefined;
        if (live) setOnlyMember(Array.isArray(ids) && ids.length === 1);
      })
      .catch(() => { if (live) setOnlyMember(false); });
    return () => { live = false; };
  }, [householdId]);

  return (
    <section>
      <h2>Delete account</h2>
      {onlyMember !== null && (
        <p data-testid="delete-consequence">
          {onlyMember
            ? "You are the only member. Everything in the household is deleted."
            : "Your sign-in and your notes are deleted. Restaurants and evidence you added stay with the household, shown as 'Former member'."}
        </p>
      )}
      <p>This cannot be undone. <Link to="/settings" data-testid="export-first">Export first</Link></p>
      <DeletePasswordForm submitLabel="Delete my account" testid="delete" />
    </section>
  );
}
```

Create `web/src/account/DeletionPendingScreen.tsx`:

```tsx
import { useAuth } from "../auth/AuthProvider";
import { DeletePasswordForm } from "./DeletePasswordForm";

export function DeletionPendingScreen() {
  const { signOut } = useAuth();
  return (
    <main className="screen" data-testid="deletion-pending">
      <h1>Finish deleting your account</h1>
      <p>Your account deletion didn't finish. Enter your password to finish it.</p>
      <DeletePasswordForm submitLabel="Finish deleting your account" testid="pending" />
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
```

Create `web/src/account/deletedNotice.ts`:

```ts
import { takeDeletedNotice, type DeletedNotice } from "./storage";

/** Read once per document: React StrictMode runs state initialisers twice, and the read removes the key. */
let cached: DeletedNotice | null | undefined;
export function deletedNoticeOnce(): DeletedNotice | null {
  if (cached === undefined) cached = takeDeletedNotice();
  return cached;
}
```

- [ ] **Step 5: Wire the app**

`web/src/App.tsx`: import `useState`, `readDeletionRequest` from `./account/storage`, `DeletionRecoveryScreen`, and `DeletionPendingScreen`. Add the case to `Gate`:

```tsx
    case "deletionPending":
      return <DeletionPendingScreen />;
```

Add above `App`:

```tsx
/** A deletion request id in this tab means recovery comes before anything else (spec §3.8). */
function Root() {
  const [pending, setPending] = useState(() => readDeletionRequest());
  if (pending) return <DeletionRecoveryScreen requestId={pending} onDismiss={() => setPending(null)} />;
  return <Gate />;
}
```

and render `<Root />` instead of `<Gate />` inside `<AuthProvider>`.

`web/src/AppShell.tsx`: import `DeleteAccountPage` and add, before the `/settings` route:

```tsx
          <Route path="/settings/delete-account" element={<DeleteAccountPage />} />
```

`web/src/pages/SettingsPage.tsx`: import `Link` from `react-router` and add before the sign-out button:

```tsx
      <p><Link to="/settings/delete-account" data-testid="delete-account-link">Delete account</Link></p>
```

`SettingsPage.test.tsx` must render inside a `MemoryRouter` now; wrap its `render(...)` calls if it does not already. Add one assertion that `delete-account-link` points to `/settings/delete-account`.

`web/src/auth/NotInvitedScreen.tsx`: import `useState` and `DeletePasswordForm`; read `const canDelete = state.status === "notMember" && state.canDeleteSignIn;` and add before the sign-out button:

```tsx
      {canDelete && (
        <section>
          {open ? (
            <DeletePasswordForm submitLabel="Delete this sign-in" testid="delete-signin" />
          ) : (
            <button type="button" data-testid="delete-signin-open" onClick={() => setOpen(true)}>Delete this sign-in</button>
          )}
        </section>
      )}
```

with `const [open, setOpen] = useState(false);`.

`web/src/auth/SignInScreen.tsx`: import `deletedNoticeOnce` and add `const [notice] = useState(deletedNoticeOnce);`, then as the first child of `<main>` after the `<h1>`:

```tsx
      {notice && (
        <p role="status" data-testid="signin-deleted-notice">
          {notice === "ok" ? "Your account has been deleted." : "Your account has been deleted. Some data on this device couldn't be cleared."}
        </p>
      )}
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:e2e` (10 min timeout). The not-invited and sign-in screens change, and every browser scenario must stay green.
Expected: PASS. Web unit = previous + the new cases. Browser unchanged.

- [ ] **Step 7: Commit**

```bash
git add web/src/account web/src/auth web/src/App.tsx web/src/AppShell.tsx web/src/pages/SettingsPage.tsx web/src/pages/SettingsPage.test.tsx
git commit -m "feat(account): delete account page, recovery and pending screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 10: Export section (prepare, then share or save)

**Files:**
- Create: `web/src/account/exportFile.ts` (+`.test.ts`), `web/src/account/ExportSection.tsx` (+`.test.tsx`)
- Modify: `web/src/account/api.ts`, `web/src/pages/SettingsPage.tsx`, `web/src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `callable` with `{ timeout }` (Task 7), `DELETE_TIMEOUT_MS` (Task 8).
- Produces:
  ```ts
  // account/api.ts
  export const exportHouseholdCall: (d: Record<string, never>) => Promise<unknown>;
  // account/exportFile.ts
  export function exportFileName(now: Date): string;   // safebite-export-YYYY-MM-DD.json (local date)
  export type ShareResult = "shared" | "cancelled" | "downloaded";
  export function shareOrDownload(file: File, download?: (file: File) => void): Promise<ShareResult>;
  export function downloadFile(file: File): void;
  ```
  `ExportSection` testids: `export-prepare`, `export-share`, `export-download`, `export-status` (`data-state` = `idle | preparing | ready | offline | failed | tooLarge`), `export-warning`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/account/exportFile.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportFileName, shareOrDownload } from "./exportFile";

const file = () => new File(["{}"], "safebite-export-2026-10-01.json", { type: "application/json" });
const setNav = (share?: unknown, canShare?: unknown) => {
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
};
const named = (name: string) => Object.assign(new Error(name), { name });

afterEach(() => setNav(undefined, undefined));

describe("exportFileName", () => {
  it("uses the local calendar date", () => {
    expect(exportFileName(new Date(2026, 9, 1, 23, 30))).toBe("safebite-export-2026-10-01.json");
  });
});

describe("shareOrDownload", () => {
  it("shares the file when files can be shared", async () => {
    const share = vi.fn(async () => {});
    setNav(share, () => true);
    const download = vi.fn();
    await expect(shareOrDownload(file(), download)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] });
    expect(download).not.toHaveBeenCalled();
  });
  it("a cancelled share sheet is silent: no download", async () => {
    setNav(vi.fn(async () => { throw named("AbortError"); }), () => true);
    const download = vi.fn();
    await expect(shareOrDownload(file(), download)).resolves.toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });
  it("NotAllowedError (activation lost) falls back to a download", async () => {
    setNav(vi.fn(async () => { throw named("NotAllowedError"); }), () => true);
    const download = vi.fn();
    await expect(shareOrDownload(file(), download)).resolves.toBe("downloaded");
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("without file sharing it downloads", async () => {
    setNav(undefined, undefined);
    const download = vi.fn();
    await expect(shareOrDownload(file(), download)).resolves.toBe("downloaded");
    setNav(vi.fn(), () => false);
    await expect(shareOrDownload(file(), download)).resolves.toBe("downloaded");
  });
});
```

Create `web/src/account/ExportSection.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ call: vi.fn(), shareOrDownload: vi.fn(), downloadFile: vi.fn() }));
vi.mock("./api", () => ({ exportHouseholdCall: m.call }));
vi.mock("./exportFile", async (orig) => ({ ...(await orig<typeof import("./exportFile")>()), shareOrDownload: m.shareOrDownload, downloadFile: m.downloadFile }));

import { ExportSection } from "./ExportSection";

const fnErr = (code: string) => Object.assign(new Error(code), { code: `functions/${code}` });
const state = () => screen.getByTestId("export-status").getAttribute("data-state");

beforeEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: true }));
afterEach(() => vi.clearAllMocks());

describe("ExportSection", () => {
  it("warns that the file contains both members' notes", () => {
    render(<ExportSection />);
    expect(screen.getByTestId("export-warning")).toHaveTextContent("both members' notes");
  });

  it("two taps: Prepare never shares; Share or save is a separate tap with the built file", async () => {
    m.call.mockResolvedValue({ format: "safebite-export", restaurants: [] });
    m.shareOrDownload.mockResolvedValue("shared");
    render(<ExportSection />);
    await userEvent.click(screen.getByTestId("export-prepare"));
    await waitFor(() => expect(state()).toBe("ready"));
    expect(m.shareOrDownload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("export-share"));
    const [shared] = m.shareOrDownload.mock.calls[0] as [File];
    expect(shared.name).toMatch(/^safebite-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await shared.text())).toMatchObject({ format: "safebite-export" });
  });

  it("Download instead downloads without the share sheet", async () => {
    m.call.mockResolvedValue({});
    render(<ExportSection />);
    await userEvent.click(screen.getByTestId("export-prepare"));
    await userEvent.click(await screen.findByTestId("export-download"));
    expect(m.downloadFile).toHaveBeenCalledTimes(1);
    expect(m.shareOrDownload).not.toHaveBeenCalled();
  });

  it("offline: nothing is called", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<ExportSection />);
    await userEvent.click(screen.getByTestId("export-prepare"));
    expect(state()).toBe("offline");
    expect(m.call).not.toHaveBeenCalled();
  });

  it.each([[fnErr("resource-exhausted"), "tooLarge"], [fnErr("internal"), "failed"]])("a failure shows its state: %s", async (error, expected) => {
    m.call.mockRejectedValue(error);
    render(<ExportSection />);
    await userEvent.click(screen.getByTestId("export-prepare"));
    await waitFor(() => expect(state()).toBe(expected));
    expect(screen.queryByTestId("export-share")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix web test -- src/account/export src/account/ExportSection`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Append to `web/src/account/api.ts`:

```ts
/** The household export (spec §3.8); saved verbatim, so the client treats it as opaque JSON. */
export const exportHouseholdCall = callable<Record<string, never>, unknown>("exportHousehold", { timeout: DELETE_TIMEOUT_MS });
```

Create `web/src/account/exportFile.ts`:

```ts
const pad = (n: number) => String(n).padStart(2, "0");

export function exportFileName(now: Date): string {
  return `safebite-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type ShareResult = "shared" | "cancelled" | "downloaded";

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Called from a fresh tap (spec §3.8, review P2-5): canShare is a capability check only, the tap
 * supplies the activation. A cancelled sheet is silent; a refused share falls back to a download.
 */
export async function shareOrDownload(file: File, download: (file: File) => void = downloadFile): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return "shared";
    } catch (err) {
      if ((err as { name?: unknown }).name === "AbortError") return "cancelled";
    }
  }
  download(file);
  return "downloaded";
}
```

Create `web/src/account/ExportSection.tsx`:

```tsx
import { useState } from "react";
import { exportHouseholdCall } from "./api";
import { downloadFile, exportFileName, shareOrDownload } from "./exportFile";

type State = "idle" | "preparing" | "ready" | "offline" | "failed" | "tooLarge";

const TEXT: Record<Exclude<State, "idle" | "ready">, string> = {
  preparing: "Preparing your export…",
  offline: "You are offline. Connect and try again.",
  failed: "Couldn't prepare the export. Try again.",
  tooLarge: "The export is too large to download in one file.",
};

/** Settings → Export household data. The file lives in component state only and is dropped on unmount. */
export function ExportSection() {
  const [state, setState] = useState<State>("idle");
  const [file, setFile] = useState<File | null>(null);

  async function prepare() {
    if (navigator.onLine === false) { setState("offline"); return; }
    setState("preparing");
    setFile(null);
    try {
      const data = await exportHouseholdCall({});
      setFile(new File([JSON.stringify(data, null, 2)], exportFileName(new Date()), { type: "application/json" }));
      setState("ready");
    } catch (err) {
      setState((err as { code?: string }).code === "functions/resource-exhausted" ? "tooLarge" : "failed");
    }
  }

  return (
    <section data-testid="export-section">
      <h3>Export household data</h3>
      <p data-testid="export-warning">The file contains both members' notes and leaves the app once you share or save it.</p>
      <button type="button" data-testid="export-prepare" disabled={state === "preparing"} onClick={() => void prepare()}>Prepare export</button>
      <p data-testid="export-status" data-state={state} role="status">
        {state === "ready" ? "Your export is ready." : state === "idle" ? "" : TEXT[state]}
      </p>
      {state === "ready" && file && (
        <>
          <button type="button" data-testid="export-share" onClick={() => void shareOrDownload(file)}>Share or save export</button>
          <button type="button" data-testid="export-download" onClick={() => downloadFile(file)}>Download instead</button>
        </>
      )}
    </section>
  );
}
```

In `web/src/pages/SettingsPage.tsx`, import `ExportSection` and render `<ExportSection />` after `<ChangePasswordForm />`. In `SettingsPage.test.tsx`, mock `../account/ExportSection` to `() => <div data-testid="export-section" />` and assert that it renders.

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run test:unit`.
Expected: PASS, web unit = previous + 12.

- [ ] **Step 5: Commit**

```bash
git add web/src/account web/src/pages/SettingsPage.tsx web/src/pages/SettingsPage.test.tsx
git commit -m "feat(account): household export as prepare, then share or save" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 11: Browser scenarios, README and the full gate

**Files:**
- Create: `web/e2e/account-rest.ts`, `web/e2e/account.spec.ts`
- Modify: `web/playwright.config.ts` (scenario count in the comment), `README.md`

**Interfaces:**
- Consumes: every testid named in Tasks 9 and 10; `clearRecords`, `seedRestaurant`, `seedClaim`, `seedNote`, `listNoteIds`, `listRestaurantIds` (`emulator-rest.ts`); `passwordAccepted`, `setPasswordViaAdmin` (`auth-rest.ts`).
- Produces: `restoreSeedAccounts(request)`, `setMemberIds(request, ids)`, `householdExists(request)`, `seedDeletionRecord(request, uid)` in `account-rest.ts`. Every scenario restores the seed accounts afterwards, so the other spec files are unaffected.

- [ ] **Step 1: Write the helpers**

Create `web/e2e/account-rest.ts`:

```ts
import type { APIRequestContext } from "@playwright/test";
import { setPasswordViaAdmin } from "./auth-rest";

/**
 * Emulator-only (127.0.0.1, project demo-safebite) helpers for the account-deletion scenarios.
 * Deletion removes real emulator accounts, so every scenario restores the seed afterwards.
 */
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-safebite";
const FS = "http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents";
const HEADERS = { Authorization: "Bearer owner", "Content-Type": "application/json" };
export const PASSWORD = "pilot-password-1";
const SEED = [
  { uid: "ava-uid", email: "ava@safebite.test", name: "Ava" },
  { uid: "bogdan-uid", email: "bogdan@safebite.test", name: "Bogdan" },
] as const;

const s = (v: string) => ({ stringValue: v });

async function put(request: APIRequestContext, path: string, fields: Record<string, unknown>): Promise<void> {
  const res = await request.patch(`${FS}/${path}`, { headers: HEADERS, data: { fields } });
  if (!res.ok()) throw new Error(`put ${path}: ${res.status()} ${await res.text()}`);
}

export async function setMemberIds(request: APIRequestContext, ids: string[]): Promise<void> {
  await put(request, "households/home", {
    name: s("Home"),
    memberIds: { arrayValue: { values: ids.map(s) } },
    createdAt: { timestampValue: "2026-09-01T00:00:00Z" },
  });
}

export async function restoreSeedAccounts(request: APIRequestContext): Promise<void> {
  for (const a of SEED) {
    const res = await request.post(`${AUTH}/accounts`, {
      headers: HEADERS,
      data: { localId: a.uid, email: a.email, password: PASSWORD, displayName: a.name, emailVerified: true },
    });
    if (!res.ok()) {
      const text = await res.text();
      if (!text.includes("DUPLICATE")) throw new Error(`restore ${a.uid}: ${res.status()} ${text}`);
      await setPasswordViaAdmin(request, a.uid, PASSWORD);
    }
    await put(request, `users/${a.uid}`, { householdId: s("home"), displayName: s(a.name) });
    await request.delete(`${FS}/accountDeletions/${a.uid}`, { headers: HEADERS });
  }
  await setMemberIds(request, SEED.map((a) => a.uid));
}

export async function householdExists(request: APIRequestContext): Promise<boolean> {
  return (await request.get(`${FS}/households/home`, { headers: HEADERS })).status() === 200;
}

/** An interrupted deletion after step 2: the record exists and the uid has left memberIds. */
export async function seedDeletionRecord(request: APIRequestContext, uid: string): Promise<void> {
  await put(request, `accountDeletions/${uid}`, {
    householdId: s("home"),
    lastMember: { booleanValue: false },
    startedAt: { timestampValue: "2026-10-01T10:00:00Z" },
    step2At: { timestampValue: "2026-10-01T10:00:01Z" },
  });
}
```

- [ ] **Step 2: Write the scenarios**

Create `web/e2e/account.spec.ts`:

```ts
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { passwordAccepted } from "./auth-rest";
import { PASSWORD, householdExists, restoreSeedAccounts, seedDeletionRecord, setMemberIds } from "./account-rest";
import { clearRecords, listNoteIds, listRestaurantIds, seedClaim, seedNote, seedRestaurant } from "./emulator-rest";

const DELETE_URL = "**/europe-west2/deleteAccount";

// Deletion calls can hit a cold Functions worker; the client allows 70 s.
test.setTimeout(120_000);

test.beforeAll(async ({ request }) => {
  // Warm the new callables' worker outside any scenario's budget (any response will do).
  for (const name of ["checkAccountDeletion", "exportHousehold", "deleteAccount"]) {
    await request.post(`http://127.0.0.1:5001/demo-safebite/europe-west2/${name}`, { data: { data: { requestId: "x" } }, timeout: 120_000 }).catch(() => {});
  }
});

test.beforeEach(async ({ request }) => {
  await restoreSeedAccounts(request);
  await clearRecords(request);
});
test.afterEach(async ({ request }) => {
  await restoreSeedAccounts(request);
  await clearRecords(request);
});

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
}

async function deleteFromSettings(page: Page) {
  await page.goto("/settings");
  await page.getByTestId("delete-account-link").click();
  await expect(page.getByTestId("delete-consequence")).toBeVisible();
  await page.getByTestId("delete-password").fill(PASSWORD);
  await page.getByTestId("delete-submit").click();
}

test("1: Ava deletes her account; Bogdan sees her evidence as Former member and her notes are gone", async ({ page, request }) => {
  await seedRestaurant(request, "r1", { name: "Casa Teste" });
  await seedClaim(request, "r1", "c1");
  await seedNote(request, "r1", "n1", { authorUid: "ava-uid" });
  await seedNote(request, "r1", "n2", { authorUid: "bogdan-uid" });
  await signIn(page, "ava@safebite.test");
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toHaveText("Your account has been deleted.", { timeout: 90_000 });
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(false);
  expect(await listNoteIds(request, "r1")).toEqual(["n2"]);
  await signIn(page, "bogdan@safebite.test");
  await page.goto("/restaurants/r1");
  await expect(page.getByTestId("claim-c1")).toContainText("by Former member");
});

test("2: the last member's deletion removes the household", async ({ page, request }) => {
  await seedRestaurant(request, "r1");
  await setMemberIds(request, ["ava-uid"]);
  await signIn(page, "ava@safebite.test");
  await page.goto("/settings/delete-account");
  await expect(page.getByTestId("delete-consequence")).toContainText("Everything in the household is deleted.");
  await page.getByTestId("delete-password").fill(PASSWORD);
  await page.getByTestId("delete-submit").click();
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
  expect(await householdExists(request)).toBe(false);
  expect(await listRestaurantIds(request)).toEqual([]);
});

test("3: a response lost after the server finished is resolved by the receipt as success", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await page.route(DELETE_URL, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch({ timeout: 90_000 }); // the server runs the whole deletion
    await route.abort("failed");            // the browser never sees the answer
  });
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
});

test("4: a request that never reached the server shows 'didn't finish', and Finish deleting completes it", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await page.route(DELETE_URL, (route) => (route.request().method() === "POST" ? route.abort("failed") : route.continue()));
  await deleteFromSettings(page);
  await expect(page.getByTestId("recovery-unfinished")).toContainText("didn't finish", { timeout: 60_000 });
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(true);
  await page.unroute(DELETE_URL);
  await page.getByTestId("finish-password").fill(PASSWORD);
  await page.getByTestId("finish-submit").click();
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
});

test("5: signing in during an interrupted deletion offers Finish deleting your account", async ({ page, request }) => {
  await setMemberIds(request, ["bogdan-uid"]);
  await seedDeletionRecord(request, "ava-uid");
  await page.goto("/");
  await page.getByTestId("signin-email").fill("ava@safebite.test");
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("deletion-pending")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("pending-password").fill(PASSWORD);
  await page.getByTestId("pending-submit").click();
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(false);
});

test("6: deleting in one tab resets a second tab without test navigation", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  const other = await context.newPage();
  await other.goto("/restaurants");
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
  await other.evaluate(() => { (window as unknown as { marker: number }).marker = 1; });
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
  await expect(other.getByTestId("signin-form")).toBeVisible({ timeout: 30_000 });
  expect(await other.evaluate(() => (window as unknown as { marker?: number }).marker)).toBeUndefined();
});

test("7: export downloads a JSON file with the household's records", async ({ page, request }) => {
  await seedRestaurant(request, "r1", { name: "Casa Export" });
  await seedClaim(request, "r1", "c1");
  // Chromium on Linux has no file share; remove it explicitly so the fallback path is deterministic.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
  await signIn(page, "bogdan@safebite.test");
  await page.goto("/settings");
  await page.getByTestId("export-prepare").click();
  await expect(page.getByTestId("export-status")).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  const download = page.waitForEvent("download");
  await page.getByTestId("export-share").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^safebite-export-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(readFileSync(await file.path(), "utf8"));
  expect(json).toMatchObject({ format: "safebite-export", formatVersion: 1, exportedBy: "Bogdan" });
  expect(json.restaurants.map((r: { name: string }) => r.name)).toEqual(["Casa Export"]);
  expect(json.restaurants[0].evidence[0]).toMatchObject({ kind: "gfMenu", authorName: "Ava" });
});
```

If `nav-settings` is not the Settings tab's testid, use the existing one from `web/src/AppShell.tsx`. Look at it rather than guessing.

- [ ] **Step 3: Run the browser suite**

Run: `npm run emu:e2e` (10 min timeout).
Expected: PASS, browser = previous + 7. If scenario 3 fails because the aborted response still reaches the page, record what the page received (trace) and stop. Do not weaken the assertion. The plan's assumption is that `route.abort` after `route.fetch` delivers a network error, so the client classifies the call as lost.

- [ ] **Step 4: Run the stress gate**

Run: `npm run emu:e2e:stress` (10 min timeout; raise to 30 min if needed).
Expected: every repeat green, retries 0. Report the counts.

- [ ] **Step 5: Update README and the Playwright comment**

In `README.md`'s web section, add after the change-password paragraph:

```markdown
**Your data (Plan 5a).** Settings → *Export household data* prepares a JSON file with every record, its evidence, the shortlist and visit state, and notes, with author names (never IDs or emails). A second tap shares or saves it. *Delete account* asks for your password, then removes your sign-in and your notes; restaurants and evidence you added stay with the household as "Former member". If you are the last member, the whole household is deleted. An interrupted deletion can always be finished, and the app never reports success until the server confirms it.
```

Update the three test counts in the README sentence ("`npm run test:unit` currently reports …") and the stress line ("N browser scenarios × 3 repeats"), plus the scenario count in `web/playwright.config.ts`'s `globalTimeout` comment, to the measured numbers. Add to the deploy notes list:

```markdown
- Deploy order (spec §3.8): rules and functions first (`deleteAccount`, `checkAccountDeletion`, `exportHousehold`, and the amended discovery usage transaction), then hosting. Set the receipt TTL once: `gcloud firestore fields ttls update expireAt --collection-group=accountDeletionReceipts --enable-ttl --project <pilot>`.
```

- [ ] **Step 6: The full gate**

Run, in order (10 min timeout each): `npm run typecheck`, `npm run test:unit`, `npm run emu:test`, `npm run emu:e2e`, `npm --prefix web run build:e2e && npm --prefix web run e2e:boot-guard && npm --prefix web run e2e:preview && npm --prefix web run e2e:upgrade`, and the guardrail greps:

```bash
git grep -n "safebite-production-13ba1" -- . ':!web/src/config/firebaseEnv.ts' ':!web/src/config/firebaseEnv.test.ts'
git grep -nE "window\.(confirm|alert|prompt)|\b(alert|confirm|prompt)\(" -- web/src
git grep -nE "getIdToken\(true\)" -- web/src ':!*.test.ts' ':!*.test.tsx'
```

Expected: everything green. The first grep prints nothing; the second prints nothing; the third prints exactly one line, in `web/src/account/deleteFlow.ts` (before the call is sent).

- [ ] **Step 7: Commit**

```bash
git add web/e2e/account-rest.ts web/e2e/account.spec.ts web/playwright.config.ts README.md
git commit -m "test(account): browser scenarios for deletion, recovery and export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

## Spec coverage

| §3.8 requirement | Task |
|---|---|
| Reserved marker; rules for `accountDeletions` and receipts | 1 |
| Discovery usage transaction re-checks membership (P1-3) | 2 |
| Receipts, `checkAccountDeletion` completing `dataDeleted` via `getUser` | 3, 5 |
| Steps 1–6, recorded completion, re-run tree deletion, chunked anonymisation, conditional re-check (P1-1, P1-2, P2-4) | 4 |
| Recent authentication (5 min, skew) | 5 |
| Export: read-only transaction with membership inside, names, exclusions, size limit | 6 |
| Cleanup registry, 5 s timeout, `pendingClear` marker, start-up block, reset ordering | 7 |
| Reauthentication, request id in `sessionStorage`, no token refresh after the call, server-decided recovery | 8 |
| Delete page, recovery screen ahead of the gate, `deletionPending`, **Delete this sign-in**, one-time notice | 9 |
| Export as two taps with download fallback (P2-5) | 10 |
| Browser scenarios 1–7, deploy note (TTL) | 11 |
| Empirical stops 1, 2, 4, 5 | Answered in "Verified facts" |
| Empirical stop 3 (other tab after refresh failure) | Production: SDK source (Verified facts). Emulator: covered only through the deleting tab's own sign-out (scenario 6) |
| Empirical stop 6 (TTL policy on the pilot) | Deploy time, owner-run; command in README (Task 11) |

---

## Addendum: implementation-audit corrections (Tasks 12–14)

**Why:** `planning/audits/2026-10-02-plan-5a-implementation-audit.md` (at `4bde68e`) found three defects. **P1-1:** recovery deletes whichever account is signed in. **P2-2:** some completed deletions leave a receipt at `started` forever. **P2-3:** a missing or expired receipt reads as "didn't finish". The binding design is spec §3.8 as amended at `dc30ae5`. Global Constraints above still apply. Two constraint lines change:

- The client never infers deletion from an Auth error code, and never calls `getIdToken(true)` once a deletion call has been sent. *Unchanged.*
- New: every deletion is bound to one UID end to end. The screen passes `expectedUid`; `deleteMyAccount` pins the `auth.currentUser` object it started with; the saved request is `{ requestId, uid }`; the server refuses `expectedUid !== request.auth.uid` with `permission-denied`, `details.reason === "accountChanged"`.

Baseline at `dc30ae5`: web unit 452, functions + rules 427, browser 49.

### Task 12: Server — bind the call to its UID; reconcile every receipt

**Files:**
- Modify: `functions/src/account/receipts.ts`, `functions/src/account/deletion.ts`, `functions/src/account/callables.ts`
- Test: `functions/test/account.receipts.test.ts`, `functions/test/account.deletion.test.ts`, `functions/test/account.callables.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // receipts.ts
  export function parseDeleteRequest(data: unknown): { requestId: string; expectedUid: string }; // invalid-argument otherwise
  // checkReceipt keeps its signature; it now reconciles "started" and "dataDeleted" (below)
  // deletion.ts
  export type HookPoint = "step1" | "step2" | "step3" | "step3:restaurant" | "step4" | "step5" | "step6" | "step6:afterAuth";
  ```
  `deleteAccount({ requestId, expectedUid })` refuses a mismatch with `HttpsError("permission-denied", "The signed-in account changed.", { reason: "accountChanged" })`. It does this after the `unauthenticated` and marker checks and before `requireRecentAuth`, `startReceipt` or any data access.

- [ ] **Step 1: Write the failing tests**

Append to `functions/test/account.receipts.test.ts`, inside `describe("checkReceipt")`:

```ts
  it("started, Auth gone, no users doc and no record: reconciled to complete (implementation audit P2-2)", async () => {
    await createEmulatorUser("receipt-uid", "receipt@safebite.test", "pilot-password-1");
    await startReceipt(db, "r1", "receipt-uid", NOW);
    await getAuth().deleteUser("receipt-uid");
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("complete");
    expect(await receipt("r1")).not.toHaveProperty("uid");
  });
  it("started, Auth gone but users doc present: stays started (Auth absence alone proves nothing)", async () => {
    await createEmulatorUser("receipt-uid", "receipt@safebite.test", "pilot-password-1");
    await db.doc("users/receipt-uid").set({ householdId: "h", displayName: "R" });
    await startReceipt(db, "r1", "receipt-uid", NOW);
    await getAuth().deleteUser("receipt-uid");
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("started");
    await db.doc("users/receipt-uid").delete();
  });
  it("dataDeleted, Auth gone but deletion record present: stays dataDeleted", async () => {
    await createEmulatorUser("receipt-uid", "receipt@safebite.test", "pilot-password-1");
    await db.doc("accountDeletions/receipt-uid").set({ householdId: "h" });
    await startReceipt(db, "r1", "receipt-uid", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    await getAuth().deleteUser("receipt-uid");
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("dataDeleted");
    await db.doc("accountDeletions/receipt-uid").delete();
  });
```

The existing test "reports started as is" relies on a receipt whose Auth user may not exist. With reconciliation, a missing Auth user, `users` doc and record would correctly make it `complete`. Make it establish its own state: create the Auth user first and use that uid (auditor re-review):

```ts
  it("reports started as is while the account still exists", async () => {
    await createEmulatorUser("receipt-uid", "receipt@safebite.test", "pilot-password-1");
    await startReceipt(db, "r1", "receipt-uid", NOW);
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("started");
  });
```

Add to the same file:

```ts
describe("parseDeleteRequest", () => {
  it("accepts a request id and an expected uid", () => {
    expect(parseDeleteRequest({ requestId: ID, expectedUid: "ava-uid" })).toEqual({ requestId: ID, expectedUid: "ava-uid" });
  });
  it.each([{ requestId: ID }, { requestId: ID, expectedUid: "" }, { requestId: ID, expectedUid: 5 }, { requestId: ID, expectedUid: "x".repeat(129) }, { expectedUid: "a" }])(
    "refuses %j", (data) => {
      expect(() => parseDeleteRequest(data)).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    });
});
```

Add `parseDeleteRequest` to that file's import from `../src/account/receipts`.

Append to `functions/test/account.deletion.test.ts`. The file's existing helpers are `deps`, `get`, `exists`, `authExists`, `seedHousehold` and `expectAvaGoneNonLast`; `rcpt` is started in `beforeEach`:

```ts
describe("runDeletion — receipts always reconcile (implementation audit P2-2)", () => {
  const crashAfterAuth = async (p: HookPoint) => { if (p === "step6:afterAuth") throw new Error("injected crash after Auth deletion"); };

  it("member path: crash after Auth deletion, before complete → checkReceipt completes it", async () => {
    await expect(runDeletion(deps({ hook: crashAfterAuth }), "ava-uid", "rcpt")).rejects.toThrow("after Auth deletion");
    expect(await authExists("ava-uid")).toBe(false);
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("dataDeleted");
    expect(await checkReceipt(db, getAuth(), "rcpt", Date.now())).toBe("complete");
  });

  // Auth-only fixtures are real states (auditor re-review): a never-provisioned account, and a real
  // deletion interrupted after step 5. Never strip membership by hand while contributions remain.
  it("Auth-only path, never-provisioned account: dataDeleted before Auth deletion; a crash after it still completes", async () => {
    await createEmulatorUser("lone-uid", "lone@safebite.test", PW);
    await startReceipt(db, "rcpt-lone", "lone-uid", Date.now());
    await expect(runDeletion(deps({ hook: crashAfterAuth }), "lone-uid", "rcpt-lone")).rejects.toThrow("after Auth deletion");
    expect((await get("accountDeletionReceipts/rcpt-lone"))?.status).toBe("dataDeleted");
    expect(await checkReceipt(db, getAuth(), "rcpt-lone", Date.now())).toBe("complete");
  });

  it("Auth-only path after a real deletion interrupted after step 5: the retry and the original receipt both complete", async () => {
    await expect(runDeletion(deps({ hook: crashBefore("step6") }), "ava-uid", "rcpt")).rejects.toThrow();
    expect(await exists("accountDeletions/ava-uid")).toBe(false);
    expect(await exists("users/ava-uid")).toBe(false);
    await startReceipt(db, "rcpt-retry", "ava-uid", Date.now());
    await expect(runDeletion(deps({ hook: crashAfterAuth }), "ava-uid", "rcpt-retry")).rejects.toThrow("after Auth deletion");
    expect((await get("accountDeletionReceipts/rcpt-retry"))?.status).toBe("dataDeleted");
    expect(await checkReceipt(db, getAuth(), "rcpt-retry", Date.now())).toBe("complete");
    expect(await checkReceipt(db, getAuth(), "rcpt", Date.now())).toBe("complete");
    await expectAvaGoneNonLast();
  });

  it("an older request interrupted mid-deletion reconciles once a newer request finishes", async () => {
    await expect(runDeletion(deps({ hook: crashBefore("step3") }), "ava-uid", "rcpt")).rejects.toThrow();
    await startReceipt(db, "rcpt-new", "ava-uid", Date.now());
    await runDeletion(deps(), "ava-uid", "rcpt-new");
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("started");
    expect(await checkReceipt(db, getAuth(), "rcpt", Date.now())).toBe("complete");
    expect(await checkReceipt(db, getAuth(), "rcpt-new", Date.now())).toBe("complete");
  });
});
```

Add `checkReceipt` to that file's import from `../src/account/receipts`.

In the same file, in the 300-restaurant test, replace both `Date.now()` timing reads with `performance.now()`. This host's wall clock steps backwards (audit minor). Keep the 30 000 ms bound.

In `functions/test/account.callables.test.ts`, change the successful call to send `{ requestId, expectedUid: "del-a-uid" }`. Then add:

```ts
  it("refuses an expectedUid that is not the signed-in account, before any receipt or data change", async () => {
    const token = await signInForIdToken("del-a@safebite.test", PW);
    const requestId = newRequestId();
    const res = await callFunction("deleteAccount", { requestId, expectedUid: "del-b-uid" }, token);
    expect(res.body.error?.status).toBe("PERMISSION_DENIED");
    expect(JSON.stringify(res.body)).toContain("accountChanged");
    expect((await callFunction("checkAccountDeletion", { requestId })).body.result).toEqual({ status: "none" });
    expect(await getAuth().getUser("del-a-uid")).toBeTruthy();
    expect(await getAuth().getUser("del-b-uid")).toBeTruthy();
    expect((await getFirestore().doc("households/delhome").get()).get("memberIds")).toEqual(["del-a-uid", "del-b-uid"]);
  });
```

`HttpsError` details appear in the callable's JSON error body as `error.details`. If the emulator puts them elsewhere, assert on the field where they actually appear, and say so in the report.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run emu:test` (10 min timeout).
Expected:
- the new receipts tests fail, because `started` is returned unreconciled and `parseDeleteRequest` is missing;
- the new deletion tests fail on the unknown hook or the `started` status;
- the mismatch test fails, because the call deletes `del-a`.

- [ ] **Step 3: Implement**

In `functions/src/account/receipts.ts`, add:

```ts
/** deleteAccount request (spec §3.8, amended after the implementation audit P1-1). */
export function parseDeleteRequest(data: unknown): { requestId: string; expectedUid: string } {
  const requestId = parseRequestId(data);
  const expectedUid = (data as Record<string, unknown>).expectedUid;
  if (typeof expectedUid !== "string" || expectedUid.length === 0 || expectedUid.length > 128) {
    throw new HttpsError("invalid-argument", "expectedUid is malformed.");
  }
  return { requestId, expectedUid };
}
```

Then replace the body of `checkReceipt` after the `isStatus` guard:

```ts
  if (status === "complete") return status;
  const uid: unknown = snap.get("uid");
  if (typeof uid !== "string") return status;
  // Reconcile from server state (implementation audit P2-2): complete only when the Auth record is
  // gone AND the users document and deletion record are gone. Step 4 deletes users/{uid} only
  // after the data steps recorded completion and step 5 deletes the record after that, so the three
  // together prove the household data was handled. Auth absence alone proves nothing.
  const [authGone, userDoc, record] = await Promise.all([
    auth.getUser(uid).then(
      () => false,
      (err: unknown) => {
        if ((err as { code?: string }).code === "auth/user-not-found") return true;
        throw err;
      },
    ),
    db.doc(`users/${uid}`).get(),
    db.doc(`accountDeletions/${uid}`).get(),
  ]);
  if (authGone && !userDoc.exists && !record.exists) {
    await markReceipt(db, receiptId, "complete", nowMs);
    return "complete";
  }
  return status;
```

Update the `checkReceipt` doc comment to match.

In `functions/src/account/deletion.ts`:
- add `"step6:afterAuth"` to `HookPoint`;
- immediately before `await hook("step6")`, add:
  ```ts
  // The Auth-only path proves steps 4 and 5 already ran (or the account was never provisioned):
  // record that before Auth deletion, as the record path does (implementation audit P2-2).
  if (start.kind === "authOnly") await markReceipt(db, receiptId, "dataDeleted", deps.now());
  ```
- between the `deleteUser` try/catch and the final `markReceipt(... "complete" ...)`, add `await hook("step6:afterAuth");`.

In `functions/src/account/callables.ts` `deleteAccount`, import `parseDeleteRequest`. Replace `const receiptId = receiptIdFor(parseRequestId(request.data));` and its position so the start of the handler reads:

```ts
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (uid === MARKER_UID) throw new HttpsError("permission-denied", "This account is not a household member.");
  const { requestId, expectedUid } = parseDeleteRequest(request.data);
  // A guard, never a grant: authority comes only from the verified token (implementation audit P1-1).
  if (expectedUid !== uid) throw new HttpsError("permission-denied", "The signed-in account changed.", { reason: "accountChanged" });
  requireRecentAuth(request.auth?.token.auth_time, Date.now());
  const receiptId = receiptIdFor(requestId);
```

Remove the now-unused `parseRequestId` import there only if nothing else in the file uses it; `checkAccountDeletion` still does.

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:test` (10 min timeout).
Expected: PASS; functions + rules = 427 + the new tests. Every earlier deletion and receipt test stays green unchanged, apart from the `Date.now` → `performance.now` swap.

- [ ] **Step 5: Commit**

```bash
git add functions/src/account functions/test/account.receipts.test.ts functions/test/account.deletion.test.ts functions/test/account.callables.test.ts
git commit -m "fix(account): bind deleteAccount to its uid and reconcile every receipt" -m "Implementation audit P1-1 (server half) and P2-2.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 13: Web — a UID-bound request, a pinned account, recovery that refuses other accounts

One task in two parts: the logic (part A) changes signatures that the screens (part B) consume, so the task is committed once, green, at the end of part B.

#### Part A: logic

**Files:**
- Modify: `web/src/account/storage.ts`, `web/src/account/api.ts`, `web/src/account/recovery.ts`, `web/src/account/deleteFlow.ts`, `web/src/auth/reauthenticate.ts`
- Test: `web/src/account/storage.test.ts`, `web/src/account/recovery.test.ts`, `web/src/account/deleteFlow.test.ts`, `web/src/auth/reauthenticate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // storage.ts
  export interface DeletionRequest { requestId: string; uid: string | null } // uid null = no owner (legacy bare id or malformed)
  export function readDeletionRequest(): DeletionRequest | null;
  export function writeDeletionRequest(request: { requestId: string; uid: string }): void; // JSON
  // reauthenticate.ts
  export function reauthenticate(password: string, user?: User | null): Promise<ReauthResult>; // default auth.currentUser
  // api.ts
  export const deleteAccountCall: (d: { requestId: string; expectedUid: string }) => Promise<{ deleted: true; lastMember: boolean }>;
  // recovery.ts
  export type CallErrorKind = "lost" | "recentLogin" | "permission" | "accountChanged" | "failed";
  export type RecoveryView = "success" | "otherAccount" | "confirmationUnavailable" | "unfinishedSignedIn" | "unfinishedSignedOut" | "uncertain";
  export function recoveryView(check: CheckResult, requestUid: string | null, currentUid: string | null): RecoveryView;
  // deleteFlow.ts
  export type DeleteOutcome = … | { kind: "accountChanged" } | { kind: "deletedOtherAccount" };
  export function deleteMyAccount(password: string, expectedUid: string): Promise<DeleteOutcome>;
  export type FinishResult = "finished" | "otherAccount";
  export function finishDeleted(requestUid: string | null): Promise<FinishResult>; // null = act only if signed out
  ```
  `deletedOtherAccount` means the server confirmed the request's deletion, but another account is now current. Nothing was signed out and no notice was written (auditor re-review).

- [ ] **Step 1: Write the failing tests**

`web/src/account/storage.test.ts`: replace the round-trip test, and add:

```ts
  it("round-trips a request bound to its uid", () => {
    writeDeletionRequest({ requestId: "id-1", uid: "ava-uid" });
    expect(readDeletionRequest()).toEqual({ requestId: "id-1", uid: "ava-uid" });
    clearDeletionRequest();
    expect(readDeletionRequest()).toBeNull();
  });
  it("a legacy bare id or malformed value has no owner", () => {
    sessionStorage.setItem("safebite.deletionRequest", "R".repeat(43));
    expect(readDeletionRequest()).toEqual({ requestId: "R".repeat(43), uid: null });
    sessionStorage.setItem("safebite.deletionRequest", JSON.stringify({ requestId: "x", uid: "" }));
    expect(readDeletionRequest()).toEqual({ requestId: JSON.stringify({ requestId: "x", uid: "" }), uid: null });
  });
```

Update the blocked-storage test to call `writeDeletionRequest({ requestId: "x", uid: "u" })`.

`web/src/account/recovery.test.ts`: replace the `recoveryView` table with:

```ts
describe("recoveryView (spec §3.8 Recovery table, amended after the implementation audit)", () => {
  const ok = (status: string) => ({ ok: true, status }) as const;
  it.each([
    [{ ok: false }, "ava", "ava", "uncertain"],
    [{ ok: false }, "ava", null, "uncertain"],
    [ok("complete"), "ava", null, "success"],
    [ok("complete"), "ava", "ava", "success"],
    [ok("complete"), "ava", "bogdan", "otherAccount"],
    [ok("started"), "ava", "bogdan", "otherAccount"],
    [ok("none"), "ava", "bogdan", "otherAccount"],
    [ok("none"), "ava", "ava", "confirmationUnavailable"],
    [ok("none"), "ava", null, "confirmationUnavailable"],
    [ok("started"), "ava", "ava", "unfinishedSignedIn"],
    [ok("dataDeleted"), "ava", "ava", "unfinishedSignedIn"],
    [ok("started"), "ava", null, "unfinishedSignedOut"],
    [ok("dataDeleted"), "ava", null, "unfinishedSignedOut"],
    // A request with no owner (legacy) never shows a delete form.
    [ok("started"), null, "ava", "confirmationUnavailable"],
    [ok("started"), null, null, "confirmationUnavailable"],
    [ok("complete"), null, "ava", "confirmationUnavailable"],
    [ok("complete"), null, null, "success"],
  ] as const)("%j request=%s current=%s → %s", (check, requestUid, currentUid, view) => {
    expect(recoveryView(check, requestUid, currentUid)).toBe(view);
  });
});
```

and add to `describe("classifyCallError")`:

```ts
  it("an accountChanged refusal is recognised by its details reason", () => {
    expect(classifyCallError(fnErr("permission-denied", { reason: "accountChanged" }))).toBe("accountChanged");
    expect(classifyCallError(fnErr("permission-denied"))).toBe("permission");
  });
```

`web/src/auth/reauthenticate.test.ts`: add

```ts
  it("reauthenticates the user it is given, not whoever is current", async () => {
    const given = { email: "given@safebite.test" };
    await expect(reauthenticate("pw", given as never)).resolves.toBe("ok");
    expect(f.credential).toHaveBeenCalledWith("given@safebite.test", "pw");
    expect(f.reauthenticateWithCredential).toHaveBeenCalledWith(given, expect.anything());
  });
```

`web/src/account/deleteFlow.test.ts`:
- The existing `../firebase` mock returns a new `currentUser` object on every access, which an identity check would reject. Replace it with a stable, swappable object:
  ```ts
  const m = vi.hoisted(() => ({ …existing fields…, current: null as unknown }));
  vi.mock("../firebase", () => ({ get auth() { return { currentUser: m.current }; } }));
  ```
- In `beforeEach`, set `m.current = { uid: "ava-uid", getIdToken: m.getIdToken }`.
- Change every `deleteMyAccount("pw")` to `deleteMyAccount("pw", "ava-uid")`, and every expected call body to `{ requestId: "R".repeat(43), expectedUid: "ava-uid" }`.
- The request-id capture test now expects `{ requestId: "R".repeat(43), uid: "ava-uid" }` from `readDeletionRequest()`.
- The mocked `reauthenticate` receives the user, so assert `toHaveBeenCalledWith("pw", m.current)`.

Then add:

```ts
  it("refuses when the current account is not the expected one, sending nothing", async () => {
    await expect(deleteMyAccount("pw", "bogdan-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(m.reauthenticate).not.toHaveBeenCalled();
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });

  it("refuses when the account changes during reauthentication (another tab signed in)", async () => {
    m.reauthenticate.mockImplementation(async () => { m.current = { uid: "bogdan-uid", getIdToken: m.getIdToken }; return "ok"; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(m.getIdToken).not.toHaveBeenCalled();
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
    expect(readDeletionRequest()).toBeNull();
  });

  it("refuses when the account changes during the token refresh", async () => {
    m.getIdToken.mockImplementation(async () => { m.current = { uid: "bogdan-uid", getIdToken: m.getIdToken }; return "t"; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
    expect(readDeletionRequest()).toBeNull();
  });

  it("the same uid in a different user object (re-sign-in) is also a change", async () => {
    m.reauthenticate.mockImplementation(async () => { m.current = { uid: "ava-uid", getIdToken: m.getIdToken }; return "ok"; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });

  it("another account becomes current during the callable: deleted, but that account is untouched (auditor re-review)", async () => {
    m.deleteAccountCall.mockImplementation(async () => { m.order.push("call"); m.current = { uid: "bogdan-uid", getIdToken: m.getIdToken }; return { deleted: true, lastMember: false }; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "deletedOtherAccount" });
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.resetDocument).not.toHaveBeenCalled();
    expect(takeDeletedNotice()).toBeNull();
    expect(readDeletionRequest()).toBeNull();
  });

  it("another account becomes current during device cleanup: no sign-out, no notice", async () => {
    m.clearDeviceData.mockImplementation(async () => { m.current = { uid: "bogdan-uid", getIdToken: m.getIdToken }; return { failed: [] }; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "deletedOtherAccount" });
    expect(m.clearDeviceData).toHaveBeenCalled();
    expect(m.signOut).not.toHaveBeenCalled();
    expect(takeDeletedNotice()).toBeNull();
  });

  it("finishDeleted(null) acts only when nobody is signed in", async () => {
    await expect(finishDeleted(null)).resolves.toBe("otherAccount");
    expect(m.signOut).not.toHaveBeenCalled();
    m.current = null;
    await expect(finishDeleted(null)).resolves.toBe("finished");
    expect(m.resetDocument).toHaveBeenCalled();
  });

  it("a server accountChanged refusal clears the request", async () => {
    m.deleteAccountCall.mockRejectedValue(fnErr("permission-denied", { reason: "accountChanged" }));
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(readDeletionRequest()).toBeNull();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix web test -- src/account src/auth/reauthenticate`
Expected: FAIL. Types and signatures do not match, and the new cases fail.

- [ ] **Step 3: Implement**

`web/src/account/storage.ts`: replace the three deletion-request helpers:

```ts
/** A deletion request is bound to the account it was sent for (spec §3.8, implementation audit P1-1). */
export interface DeletionRequest { requestId: string; uid: string | null }

export function readDeletionRequest(): DeletionRequest | null {
  const raw = get(DELETION_REQUEST_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { requestId?: unknown; uid?: unknown };
    if (typeof value.requestId === "string" && typeof value.uid === "string" && value.uid.length > 0) {
      return { requestId: value.requestId, uid: value.uid };
    }
  } catch {
    // An older build saved the bare id.
  }
  return { requestId: raw, uid: null }; // no owner: recovery never offers a delete form
}
export const writeDeletionRequest = (request: { requestId: string; uid: string }) =>
  set(DELETION_REQUEST_KEY, JSON.stringify({ requestId: request.requestId, uid: request.uid }));
export const clearDeletionRequest = () => remove(DELETION_REQUEST_KEY);
```

`web/src/auth/reauthenticate.ts`: change the signature to `reauthenticate(password: string, user: User | null = auth.currentUser)`, import `type User` from `firebase/auth`, and delete the `const user = auth.currentUser;` line.

`web/src/account/api.ts`: change the `deleteAccountCall` request type to `{ requestId: string; expectedUid: string }`.

`web/src/account/recovery.ts`:
- Add `"accountChanged"` to `CallErrorKind`.
- In `classifyCallError`, replace the `permission-denied` line with:
  ```ts
  if (name === "permission-denied") {
    const reason = ((err as { details?: { reason?: unknown } }).details ?? {}).reason;
    return reason === "accountChanged" ? "accountChanged" : "permission";
  }
  ```
- Replace `RecoveryView` and `recoveryView`:
  ```ts
  export type RecoveryView = "success" | "otherAccount" | "confirmationUnavailable" | "unfinishedSignedIn" | "unfinishedSignedOut" | "uncertain";

  /**
   * Spec §3.8 Recovery table (amended after the implementation audit P1-1, P2-3). Only the request's
   * own account can ever see a delete form; a missing receipt is never read as "unfinished".
   */
  export function recoveryView(check: CheckResult, requestUid: string | null, currentUid: string | null): RecoveryView {
    if (!check.ok) return "uncertain";
    if (requestUid === null) return check.status === "complete" && currentUid === null ? "success" : "confirmationUnavailable";
    if (currentUid !== null && currentUid !== requestUid) return "otherAccount";
    if (check.status === "complete") return "success";
    if (check.status === "none") return "confirmationUnavailable";
    return currentUid === null ? "unfinishedSignedOut" : "unfinishedSignedIn";
  }
  ```

`web/src/account/deleteFlow.ts`: add `| { kind: "accountChanged" }` to `DeleteOutcome`, then replace `deleteMyAccount`:

```ts
/**
 * Spec §3.8 sequence, bound to one account (implementation audit P1-1). The user object captured at
 * the start must still be auth.currentUser, with the expected uid, after reauthentication, after
 * the token refresh and right before the call: the callable sends whatever token is current then.
 * After the call is sent the token is never refreshed again.
 */
export async function deleteMyAccount(password: string, expectedUid: string): Promise<DeleteOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "reauth", result: "offline" };
  const user = auth.currentUser;
  if (!user || user.uid !== expectedUid) return { kind: "accountChanged" };
  const unchanged = () => auth.currentUser === user && user.uid === expectedUid;
  const reauth = await reauthenticate(password, user);
  if (reauth !== "ok") return { kind: "reauth", result: reauth };
  if (!unchanged()) return { kind: "accountChanged" };
  try {
    await user.getIdToken(true);
  } catch {
    return { kind: "failed" };
  }
  if (!unchanged()) return { kind: "accountChanged" };
  const requestId = newRequestId();
  writeDeletionRequest({ requestId, uid: expectedUid });
  try {
    await deleteAccountCall({ requestId, expectedUid });
  } catch (err) {
    const kind = classifyCallError(err);
    if (kind === "lost") return { kind: "lost", requestId };
    clearDeletionRequest();
    return { kind };
  }
  await finishDeleted();
  return { kind: "deleted" };
}
```

Replace `finishDeleted` (import `finishDeleted` into the test file alongside `deleteMyAccount`):

```ts
export type FinishResult = "finished" | "otherAccount";

/**
 * The server confirmed deletion of requestUid's account. Completion acts only for that account
 * (auditor re-review, 2026-10-02): if a different account is current before or after the device
 * cleanup, it is never signed out and no deleted notice is written. requestUid null (a request
 * with no owner) acts only when nobody is signed in.
 */
export async function finishDeleted(requestUid: string | null): Promise<FinishResult> {
  const ours = () => {
    const current = auth.currentUser?.uid ?? null;
    return current === null || current === requestUid;
  };
  if (!ours()) { clearDeletionRequest(); return "otherAccount"; }
  const { failed } = await clearDeviceData(); // device data goes either way
  if (!ours()) { clearDeletionRequest(); return "otherAccount"; }
  writeDeletedNotice(failed.length === 0 ? "ok" : "clearFailed");
  clearDeletionRequest();
  if (auth.currentUser !== null) {
    try {
      await signOut(auth); // the current account is requestUid's: checked synchronously above
    } catch {
      // Already signed out; the explicit reset below still runs.
    }
  }
  resetDocument();
  return "finished";
}
```

In `deleteMyAccount`, replace the two lines after the call's `try`/`catch` with:

```ts
  return (await finishDeleted(expectedUid)) === "finished" ? { kind: "deleted" } : { kind: "deletedOtherAccount" };
```

The write and the call are synchronous with respect to each other: there is no `await` between the last `unchanged()` check and `deleteAccountCall`, apart from `newRequestId` and `writeDeletionRequest`, which are synchronous. Keep it that way.

#### Part B: screens (same task)

**Files:**
- Modify: `web/src/auth/AuthProvider.tsx` (+test), `web/src/account/DeletePasswordForm.tsx` (+test), `web/src/account/DeletionRecoveryScreen.tsx` (+test), `web/src/account/DeleteAccountPage.tsx` (+test), `web/src/account/DeletionPendingScreen.tsx`, `web/src/auth/NotInvitedScreen.tsx`, `web/src/App.tsx`

**Interfaces:**
- Consumes: part A's `DeletionRequest`, `recoveryView(check, requestUid, currentUid)`, `deleteMyAccount(password, expectedUid)` and `DeleteOutcome.accountChanged`.
- Produces:
  - `AuthState`: `notMember` and `deletionPending` gain `uid: string`.
  - `DeletePasswordForm({ submitLabel, testid, expectedUid })`, with `expectedUid` required.
  - `DeletionRecoveryScreen({ request: DeletionRequest, onDismiss })`.
  - New testids: `recovery-other-account`, `recovery-unavailable`, `recovery-continue`. The `delete-outcome` `data-kind` gains `accountChanged`.

- [ ] **Step 4: Write the failing screen tests**

`AuthProvider.test.tsx`: the `deletionPending` and `canDeleteSignIn` cases also assert `'"uid":"u1"'` (and `"u2"`) in the state JSON.

`DeletePasswordForm.test.tsx`:
- Render with `expectedUid="ava-uid"` throughout, and assert `m.deleteMyAccount` was called with `("pilot-password-1", "ava-uid")`.
- Add the outcome `[{ kind: "accountChanged" }, "The signed-in account changed. Nothing was deleted."]` to the `it.each` table.
- Add a test: when `deleteMyAccount` resolves `{ kind: "deletedOtherAccount" }`, `delete-other-account` shows its copy and does not contain "Nothing was deleted". Clicking `delete-other-continue` calls `resetDocument`.
- In `DeletionRecoveryScreen.test.tsx`, the existing "complete: finishes deleting" test mocks `finishDeleted` resolving `"finished"` and asserts it was called with `"ava-uid"`.
- The two in-place-recovery cases mock `readDeletionRequest` to return `null`, then `{ requestId: "OTHER", uid: "ava-uid" }`. They assert the rendered `DeletionRecoveryScreen` receives `{ requestId: <lost id>, uid: "ava-uid" }`. The reload case returns `{ requestId: <lost id>, uid: "ava-uid" }`.

`DeletionRecoveryScreen.test.tsx`:
- Pass `request={{ requestId: "R", uid: "ava-uid" }}` and set `m.currentUser = { uid: "ava-uid", email: "ava@x" }` where the old tests set a current user.
- The `unfinished`/signed-out case uses status `dataDeleted` with no current user, and its copy assertion is "Sign in to that account to finish it."
- Add:

```tsx
  it("another account signed in: no delete form; Continue clears the key and dismisses (implementation audit P1-1)", async () => {
    writeDeletionRequest({ requestId: "R", uid: "ava-uid" });
    m.currentUser = { uid: "bogdan-uid", email: "bogdan@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={onDismiss} />);
    expect(await screen.findByTestId("recovery-other-account")).toHaveTextContent("This deletion request belongs to another account. Nothing will be deleted from this one.");
    expect(screen.queryByTestId("finish-password")).toBeNull();
    expect(m.finishDeleted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("recovery-continue"));
    expect(readDeletionRequest()).toBeNull();
    expect(onDismiss).toHaveBeenCalled();
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("a complete receipt with another account signed in neither signs them out nor says deleted", async () => {
    m.currentUser = { uid: "bogdan-uid", email: "bogdan@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-other-account")).toBeInTheDocument();
    expect(m.finishDeleted).not.toHaveBeenCalled();
    expect(screen.queryByTestId("recovery-success")).toBeNull();
  });

  it("none: confirmation unavailable — never 'didn't finish', no delete form (implementation audit P2-3)", async () => {
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "none" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    const view = await screen.findByTestId("recovery-unavailable");
    expect(view).toHaveTextContent("We can't confirm what happened to this deletion request. The confirmation may have expired.");
    expect(view).not.toHaveTextContent("didn't finish");
    expect(screen.queryByTestId("finish-password")).toBeNull();
  });

  it("complete, then another account becomes current during cleanup: Other account with the confirmed line, no sign-out (auditor re-review)", async () => {
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    m.finishDeleted.mockResolvedValue("otherAccount");
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-other-account")).toBeInTheDocument();
    expect(screen.getByTestId("recovery-confirmed")).toHaveTextContent("That account's deletion is confirmed.");
    expect(m.finishDeleted).toHaveBeenCalledWith("ava-uid");
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("a request with no owner never shows a delete form", async () => {
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: null }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("finish-password")).toBeNull();
  });
```

`DeleteAccountPage.test.tsx`: the `DeletePasswordForm` mock asserts it receives `expectedUid="u"` (the mocked `useMember` uid).

- [ ] **Step 5: Run them to see them fail**

Run: `npm --prefix web test -- src/account src/auth`
Expected: FAIL on the new props, views and state fields.

- [ ] **Step 6: Implement the screens**

- `AuthProvider.tsx`: add `uid: string` to the `notMember` and `deletionPending` members of `AuthState`. In `stateForUser`, return `{ status: "deletionPending", uid: user.uid, email: user.email }` and `{ status: "notMember", uid: user.uid, email: user.email, canDeleteSignIn: userDoc === undefined }`.
- `DeletePasswordForm.tsx`:
  - Add the required prop `expectedUid: string` and call `deleteMyAccount(password, expectedUid)`.
  - Add `accountChanged: "The signed-in account changed. Nothing was deleted."` to `MESSAGES`. This applies only to refusals before or at the call.
  - On `deletedOtherAccount`, render `<section data-testid="delete-other-account">`. It contains "The account this request was for has been deleted. You're now signed in as a different account, which was not changed." and a **Continue** button (`data-testid="delete-other-continue"`) that calls `resetDocument()`. Never show "Nothing was deleted" here.
  - The lost branch becomes `if (readDeletionRequest()?.requestId === outcome.requestId) resetDocument(); else setLostRequestId(outcome.requestId);`.
  - The in-place screen renders `<DeletionRecoveryScreen request={{ requestId: lostRequestId, uid: expectedUid }} onDismiss={() => resetDocument()} />`.
- `DeleteAccountPage.tsx`: `const { householdId, uid } = useMember();` and pass `expectedUid={uid}`.
- `DeletionPendingScreen.tsx`: read `state` from `useAuth()`. When `state.status === "deletionPending"`, render the form with `expectedUid={state.uid}`; otherwise render nothing of the form.
- `NotInvitedScreen.tsx`: pass `expectedUid={state.uid}` (inside the existing `canDelete` branch, where `state.status === "notMember"`).
- `App.tsx` `Root`: `pending` is a `DeletionRequest | null`; render `<DeletionRecoveryScreen request={pending} onDismiss={() => setPending(null)} />`.
- `DeletionRecoveryScreen.tsx`:
  - Change the props to `{ request: DeletionRequest; onDismiss }`.
  - In `check`, after `await auth.authStateReady()`: `const current = auth.currentUser; const next = recoveryView(result, request.uid, current?.uid ?? null);`, then set the email from `current`.
  - Keep `const [confirmed, setConfirmed] = useState(false)`, and set it to `result.ok && result.status === "complete"`.
  - When `next === "success"`, call `finishDeleted(request.uid)`. If it returns `"otherAccount"`, set the view to `"otherAccount"`; `confirmed` stays true.
  - In the `otherAccount` view, render `<p data-testid="recovery-confirmed">That account's deletion is confirmed.</p>` when `confirmed`.
  - Add `const proceed = () => { clearDeletionRequest(); onDismiss(); };`.
  - New views:

```tsx
      {view === "otherAccount" && (
        <section data-testid="recovery-other-account">
          <p>This deletion request belongs to another account. Nothing will be deleted from this one.</p>
          <button type="button" data-testid="recovery-continue" onClick={proceed}>Continue as this account</button>
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
      {view === "confirmationUnavailable" && (
        <section data-testid="recovery-unavailable">
          <p>We can't confirm what happened to this deletion request. The confirmation may have expired.</p>
          <button type="button" data-testid="recovery-continue" onClick={proceed}>Continue</button>
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
```

  - In `unfinishedSignedIn`, render `<DeletePasswordForm submitLabel="Finish deleting" testid="finish" expectedUid={request.uid!} />`. `recoveryView` returns this view only when `request.uid` equals the signed-in UID, so the non-null assertion is sound. Comment it so.
  - Change the `unfinishedSignedOut` copy to "Your account deletion didn't finish. Sign in to that account to finish it."
  - Remove the uncertain view's sentence "If your account still exists, you'll be offered to finish deleting it." It promises an outcome the screen cannot guarantee. Keep "If this doesn't clear, sign in again."

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:e2e` (10 min timeout).
Expected: unit tests green. In the browser suite, **scenario 4 now fails as designed.** A request that never reached the server leaves no receipt, which is now "confirmation unavailable", not "didn't finish". Task 14 updates it. Every other scenario must pass.

- [ ] **Step 8: Commit**

```bash
git add web/src
git commit -m "fix(account): bind deletion and recovery to one account; a missing receipt is unknown" -m "Implementation audit P1-1 (client) and P2-3.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 14: Browser regression, scenario 4, README and the full gate

**Files:**
- Modify: `web/e2e/account.spec.ts`, `web/e2e/account-rest.ts`, `web/playwright.config.ts` (count comment), `README.md`

**Interfaces:**
- Produces: `seedReceipt(request, requestId, uid, status)` in `account-rest.ts`. It writes `accountDeletionReceipts/{sha256(requestId)}` with `{ status, uid, updatedAt, expireAt }`. `expireAt` is 7 days ahead; compute the hash with `node:crypto`.

- [ ] **Step 1: Add the helper**

```ts
import { createHash } from "node:crypto";

export async function seedReceipt(request: APIRequestContext, requestId: string, uid: string, status: "started" | "dataDeleted"): Promise<void> {
  const id = createHash("sha256").update(requestId).digest("hex");
  await put(request, `accountDeletionReceipts/${id}`, {
    status: s(status),
    uid: s(uid),
    updatedAt: { timestampValue: new Date().toISOString() },
    expireAt: { timestampValue: new Date(Date.now() + 7 * 86_400_000).toISOString() },
  });
}
```

Clean up in `restoreSeedAccounts`: also delete any `accountDeletionReceipts` documents. List them with `GET ${FS}/accountDeletionReceipts?pageSize=300` and delete each.

- [ ] **Step 2: Add the cross-account regression and update scenario 4**

```ts
test("8: an interrupted request for Ava never deletes Bogdan, who is signed in (implementation audit P1-1)", async ({ page, request }) => {
  // Ava's deletion stopped after step 2: she has left memberIds and her record exists.
  await setMemberIds(request, ["bogdan-uid"]);
  await seedDeletionRecord(request, "ava-uid");
  const requestId = "A".repeat(43);
  await seedReceipt(request, requestId, "ava-uid", "started");
  await signIn(page, "bogdan@safebite.test");
  await page.evaluate((id) => sessionStorage.setItem("safebite.deletionRequest", JSON.stringify({ requestId: id, uid: "ava-uid" })), requestId);
  await page.reload();
  await expect(page.getByTestId("recovery-other-account")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("finish-password")).toHaveCount(0);
  expect(await passwordAccepted(request, "bogdan@safebite.test", PASSWORD)).toBe(true);
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(true);
  expect(await householdExists(request)).toBe(true);
  await page.getByTestId("recovery-continue").click();
  await expect(page.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
});
```

Replace scenario 4's body after `deleteFromSettings(page)`:

```ts
  // Nothing reached the server, so there is no receipt: the screen must not claim either outcome.
  await expect(page.getByTestId("recovery-unavailable")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("recovery-unavailable")).not.toContainText("didn't finish");
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(true);
  await page.unroute(DELETE_URL);
  await page.getByTestId("recovery-continue").click();
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
```

Rename scenario 4 to `"4: a request that never reached the server is 'confirmation unavailable', and deleting again works"`.

- [ ] **Step 3: README**

Update the three test counts and the stress line to the measured numbers. In the "Your data (Plan 5a)" paragraph, change "An interrupted deletion can always be finished" to "An interrupted deletion can be finished by the account it belongs to". Update the `web/playwright.config.ts` scenario count.

- [ ] **Step 4: The full gate**

Run every command in Task 11 Step 6, including the stress run (30 min timeout), plus `npm run emu:e2e:stress`. The guardrail grep for `getIdToken(true)` must still print exactly one line, in `web/src/account/deleteFlow.ts`.

Known host issues: backwards clock steps, `ERR_NETWORK_CHANGED`, socket hang-ups in seed restore, and boot-guard port stalls. Record any you hit and rerun once. A deterministic failure is never "host".

- [ ] **Step 5: Commit**

```bash
git add web/e2e/account.spec.ts web/e2e/account-rest.ts web/playwright.config.ts README.md
git commit -m "test(account): cross-account recovery regression; scenario 4 for a missing receipt" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

### Addendum spec coverage

| Audit finding | Task |
|---|---|
| P1-1 server guard (`expectedUid`) | 12 |
| P1-1 pinned account across reauth, token and call; UID-bound saved request | 13A |
| P1-1 recovery refuses other accounts; every delete form names its account | 13B |
| P1-1 browser reproduction as a permanent regression | 14 |
| P2-2 `dataDeleted` before Auth deletion on every path; reconciliation of `started`/`dataDeleted` | 12 |
| P2-3 `none` → confirmation unavailable | 13, 14 |
| Re-review: completion (sign-out, deleted notice) only for the request's account, switches during the call and during cleanup, direct and via recovery | 13 |
| Re-review: receipt tests establish their own Auth state; real Auth-only fixtures | 12 |
| Minors: monotonic clock in the 300-restaurant test, README counts, logging wording (spec) | 12, 14, spec `dc30ae5` |

---

## Addendum 2: completion without sign-out (Tasks 15–16)

**Why:** `planning/audits/2026-10-02-plan-5a-final-review.md` (at `d1981af`) reproduced a P2 three times. With Bogdan's sign-in already queued in the deletion tab's Firebase Auth queue, `finishDeleted`'s `signOut(auth)` is queued behind it, and Bogdan is signed out and shown "Your account has been deleted". The binding design is spec §3.8 at `604ebb4`, Delete account page step 4. Completion **never calls `signOut`**. A device-wide deleted-session record (`safebite.deletedUids`) keeps the deleted account out of the app, and signing in replaces the session.

All earlier Global Constraints and addendum constraints still apply, with one more browser storage key: `localStorage["safebite.deletedUids"]`, mirrored to `sessionStorage`, with every access wrapped in try/catch. Baseline at `604ebb4`: web unit 481, functions + rules 441, browser 50.

### Task 15: Web — deleted-session record, `deletedSession` state, no sign-out in completion

**Files:**
- Create: `web/src/account/deletedSessions.ts`, `web/src/account/deletedSessions.test.ts`
- Modify: `web/src/account/deleteFlow.ts` (+test), `web/src/account/storage.ts` (+test), `web/src/account/deletedNotice.ts`, `web/src/auth/AuthProvider.tsx` (+test), `web/src/auth/SignInScreen.tsx`, `web/src/App.tsx`, `web/src/account/DeleteAccountPage.tsx` (+test)

**Interfaces:**
- Produces:
  ```ts
  // account/deletedSessions.ts
  export const DELETED_UIDS_KEY = "safebite.deletedUids";
  export const MAX_DELETED_UIDS = 10;
  export function deletedUids(): string[];               // union of localStorage and sessionStorage; never throws
  export function isDeletedUid(uid: string): boolean;
  export function recordDeletedUid(uid: string): void;   // newest first, deduplicated, at most 10, written to both stores
  export function forgetDeletedUid(uid: string): void;
  // account/storage.ts — the notice flag is bound to an account
  export interface DeletedNotice { kind: "ok" | "clearFailed"; uid: string | null }
  export function writeDeletedNotice(notice: DeletedNotice): void;
  export function takeDeletedNotice(): DeletedNotice | null;      // reads and removes; legacy plain values → null
  export function discardDeletedNoticeUnlessFor(uid: string): void; // removes a flag naming any other uid
  // auth/AuthProvider.tsx
  // AuthState gains { status: "deletedSession"; uid: string; email: string | null }
  ```
  `finishDeleted(requestUid)` keeps its signature and return type but never calls `signOut`. The `App` gate renders `SignInScreen` for `deletedSession`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/account/deletedSessions.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETED_UIDS_KEY, deletedUids, forgetDeletedUid, isDeletedUid, recordDeletedUid } from "./deletedSessions";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe("deleted-session record", () => {
  it("records newest first, deduplicates, keeps at most 10, and writes both stores", () => {
    for (let i = 0; i < 12; i++) recordDeletedUid(`u${i}`);
    recordDeletedUid("u5");
    expect(deletedUids()).toHaveLength(10);
    expect(deletedUids()[0]).toBe("u5");
    expect(JSON.parse(localStorage.getItem(DELETED_UIDS_KEY)!)).toEqual(JSON.parse(sessionStorage.getItem(DELETED_UIDS_KEY)!));
    expect(isDeletedUid("u0")).toBe(false);
  });
  it("forgets a uid", () => {
    recordDeletedUid("ava-uid");
    forgetDeletedUid("ava-uid");
    expect(isDeletedUid("ava-uid")).toBe(false);
  });
  it("reads the union, so a tab whose localStorage is blocked still knows", () => {
    sessionStorage.setItem(DELETED_UIDS_KEY, JSON.stringify(["ava-uid"]));
    localStorage.setItem(DELETED_UIDS_KEY, JSON.stringify(["other"]));
    expect(new Set(deletedUids())).toEqual(new Set(["ava-uid", "other"]));
  });
  it("ignores malformed values and never throws when storage is blocked (Review Focus 4)", () => {
    localStorage.setItem(DELETED_UIDS_KEY, "{not json");
    sessionStorage.setItem(DELETED_UIDS_KEY, JSON.stringify([1, "", "ok"]));
    expect(deletedUids()).toEqual(["ok"]);
    for (const m of ["getItem", "setItem"] as const) vi.spyOn(Storage.prototype, m).mockImplementation(() => { throw new Error("blocked"); });
    expect(() => recordDeletedUid("x")).not.toThrow();
    expect(deletedUids()).toEqual([]);
  });
});
```

`web/src/account/storage.test.ts`:
- Change the notice tests to the object form:
  ```ts
  it("the deleted notice is bound to an account and shown once", () => {
    writeDeletedNotice({ kind: "clearFailed", uid: "ava-uid" });
    expect(takeDeletedNotice()).toEqual({ kind: "clearFailed", uid: "ava-uid" });
    expect(takeDeletedNotice()).toBeNull();
  });
  it("a legacy plain notice value is ignored", () => {
    sessionStorage.setItem("safebite.accountDeleted", "ok");
    expect(takeDeletedNotice()).toBeNull();
  });
  it("discardDeletedNoticeUnlessFor removes a flag for any other account", () => {
    writeDeletedNotice({ kind: "ok", uid: "ava-uid" });
    discardDeletedNoticeUnlessFor("ava-uid");
    expect(sessionStorage.getItem("safebite.accountDeleted")).not.toBeNull();
    discardDeletedNoticeUnlessFor("bogdan-uid");
    expect(takeDeletedNotice()).toBeNull();
  });
  ```
- Update the blocked-storage test to call `writeDeletedNotice({ kind: "ok", uid: "u" })`.

`web/src/account/deleteFlow.test.ts`:
- Mock `./deletedSessions` with `recordDeletedUid: m.recordDeletedUid`, where `recordDeletedUid: vi.fn((uid: string) => m.order.push(\`record:${uid}\`))` is added to `m`.
- The success-order test now expects `["reauth", "token", "call", "clear", "record:ava-uid", "reset"]`, and `expect(m.signOut).not.toHaveBeenCalled()`.
- The notice assertion becomes `expect(takeDeletedNotice()).toEqual({ kind: "ok", uid: "ava-uid" })`, and similarly for `clearFailed`.
- The ordering-at-sign-out test is replaced by an ordering-at-reset test. The `resetDocument` mock records `readDeletionRequest()`, the raw notice flag and `m.recordDeletedUid.mock.calls` when it runs, and the test asserts the request is null, the notice names `ava-uid` and the UID is recorded.
- The two `deletedOtherAccount` tests also assert `m.recordDeletedUid` was not called.
- In the "another account during cleanup" test, `m.clearDeviceData` is still called; in the "during the callable" test, it is not called.
- Add:
  ```ts
  it("finishDeleted never calls signOut (final review P2)", async () => {
    await finishDeleted("ava-uid");
    m.current = null;
    await finishDeleted(null);
    expect(m.signOut).not.toHaveBeenCalled();
  });
  ```
- `finishDeleted(null)` with nobody signed in writes the notice `{ kind: "ok", uid: null }` and records nothing.

`web/src/auth/AuthProvider.test.tsx`:
- Mock `../account/deletedSessions` with a controllable `isDeletedUid` (default `() => false`) and a `forgetDeletedUid` spy.
- Mock `../account/storage`'s `discardDeletedNoticeUnlessFor` as a spy, and keep everything else real via `importOriginal`.
- Add:

```tsx
it("a recorded deleted uid resolves deletedSession without any membership read (final review P2)", async () => {
  isDeletedUid.mockImplementation((uid: string) => uid === "u1");
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"deletedSession"'));
  expect(getDocMock).not.toHaveBeenCalled();
});

it("a storage event recording the current uid resets this tab; another uid does not", async () => {
  getDocMock.mockImplementation(async (path: string) =>
    path === "users/u1" ? snap({ householdId: "home", displayName: "Ava" }) : snap({ memberIds: ["u1"] }));
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"member"'));
  isDeletedUid.mockImplementation((uid: string) => uid === "someone-else");
  window.dispatchEvent(new StorageEvent("storage", { key: "safebite.deletedUids" }));
  await new Promise((r) => setTimeout(r, 0));
  expect(resetDocument).not.toHaveBeenCalled();
  isDeletedUid.mockImplementation((uid: string) => uid === "u1");
  window.dispatchEvent(new StorageEvent("storage", { key: "safebite.deletedUids" }));
  await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
});

it("resolving any account discards a notice flag that names a different account", async () => {
  getDocMock.mockImplementation(async (path: string) =>
    path === "users/u2" ? snap({ householdId: "home", displayName: "B" }) : snap({ memberIds: ["u2"] }));
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u2", email: "b@x" });
  await waitFor(() => expect(discardDeletedNoticeUnlessFor).toHaveBeenCalledWith("u2"));
});
```

`web/src/account/DeleteAccountPage.test.tsx`:
- Mock `../auth/AuthProvider`'s `useAuth` to return `{ state: { status: "member", email: "ava@safebite.test" } }`.
- Assert `screen.getByTestId("delete-account-email")` has the text "Deleting the account ava@safebite.test".

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix web test -- src/account src/auth`
Expected: FAIL. The new module is missing, the signatures differ, `signOut` is still called, and there is no `deletedSession` state.

- [ ] **Step 3: Implement**

Create `web/src/account/deletedSessions.ts`:

```ts
/**
 * Device-wide record of accounts this device has seen deleted (spec §3.8 step 4, amended after the
 * final review). Completion never signs out: Firebase signOut queues a "no user" update that can
 * land after another tab's queued sign-in and remove it. A deleted account's session instead stays
 * recognised here and is kept out of the app; signing in replaces it. Mirrored into
 * sessionStorage for a tab whose localStorage is blocked; readers take the union.
 */
export const DELETED_UIDS_KEY = "safebite.deletedUids";
export const MAX_DELETED_UIDS = 10;

type Store = "localStorage" | "sessionStorage";
const STORES: readonly Store[] = ["localStorage", "sessionStorage"];

function read(store: Store): string[] {
  try {
    const raw = window[store].getItem(DELETED_UIDS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  } catch {
    return [];
  }
}

function write(list: string[]): void {
  for (const store of STORES) {
    try { window[store].setItem(DELETED_UIDS_KEY, JSON.stringify(list)); } catch { /* blocked */ }
  }
}

export function deletedUids(): string[] {
  return [...new Set([...read("localStorage"), ...read("sessionStorage")])];
}

export function isDeletedUid(uid: string): boolean {
  return deletedUids().includes(uid);
}

export function recordDeletedUid(uid: string): void {
  write([uid, ...deletedUids().filter((x) => x !== uid)].slice(0, MAX_DELETED_UIDS));
}

export function forgetDeletedUid(uid: string): void {
  write(deletedUids().filter((x) => x !== uid));
}
```

The union read after a write can briefly order differently from the stores. Keep `recordDeletedUid`'s newest-first order: it rebuilds from the union and writes both.

`web/src/account/storage.ts`: replace the notice helpers.

```ts
export interface DeletedNotice { kind: "ok" | "clearFailed"; uid: string | null }

export const writeDeletedNotice = (notice: DeletedNotice) => set(ACCOUNT_DELETED_KEY, JSON.stringify(notice));

function parseNotice(raw: string | null): DeletedNotice | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as { kind?: unknown; uid?: unknown };
    if ((v.kind === "ok" || v.kind === "clearFailed") && (v.uid === null || (typeof v.uid === "string" && v.uid.length > 0))) {
      return { kind: v.kind, uid: v.uid };
    }
  } catch {
    // legacy plain value
  }
  return null;
}

export function takeDeletedNotice(): DeletedNotice | null {
  const notice = parseNotice(get(ACCOUNT_DELETED_KEY));
  remove(ACCOUNT_DELETED_KEY);
  return notice;
}

/** A notice belongs to one account: resolving any other account discards it (final review P2). */
export function discardDeletedNoticeUnlessFor(uid: string): void {
  const notice = parseNotice(get(ACCOUNT_DELETED_KEY));
  if (notice && notice.uid !== uid) remove(ACCOUNT_DELETED_KEY);
}
```

Delete the old `DeletedNotice` string type. `deletedNotice.ts` keeps `deletedNoticeOnce()`, now returning `DeletedNotice | null`.

`web/src/account/deleteFlow.ts`:
- Remove the `signOut` import and import `recordDeletedUid`.
- Replace the success tail of `finishDeleted`:

```ts
  if (!ours()) { clearDeletionRequest(); return "otherAccount"; }
  if (requestUid !== null) recordDeletedUid(requestUid);
  writeDeletedNotice({ kind: failed.length === 0 ? "ok" : "clearFailed", uid: requestUid });
  clearDeletionRequest();
  // Never signOut here (final review P2): signOut queues a "no user" update that can remove another
  // account whose sign-in is already queued. The record keeps this deleted session out of the app.
  resetDocument();
  return "finished";
```

Update the doc comment.

`web/src/auth/AuthProvider.tsx`:
- Add `| { status: "deletedSession"; uid: string; email: string | null }` to `AuthState`.
- In `stateForUser`, first line:
  ```ts
  if (isDeletedUid(user.uid)) return { status: "deletedSession", uid: user.uid, email: user.email };
  ```
- After any non-`deletedSession` state resolves for a user (in `resolveForUser`'s `.then`, when `mine === generationRef.current`), call `discardDeletedNoticeUnlessFor(user.uid)`.
- In the auth `useEffect`, add a `storage` listener and remove it in the cleanup:
  ```ts
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DELETED_UIDS_KEY) return;
    const uid = lastUidRef.current;
    if (uid === null || !isDeletedUid(uid)) return;
    generationRef.current += 1;
    setState({ status: "resetting" });
    void clearDeviceData().finally(() => resetDocument());
  };
  window.addEventListener("storage", onStorage);
  ```
- `signIn` becomes:
  ```ts
  const signIn = useCallback(async (email: string, password: string) => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    // A successful sign-in proves the account exists (e.g. re-created by an admin): forget it, then
    // re-resolve in case the listener already resolved deletedSession for it.
    if (isDeletedUid(user.uid)) { forgetDeletedUid(user.uid); resolveForUser(user); }
  }, [resolveForUser]);
  ```

`web/src/App.tsx`: in `Gate`, add `case "deletedSession": return <SignInScreen deletedUid={state.uid} />;`.

`web/src/auth/SignInScreen.tsx`:
- Accept an optional `deletedUid?: string` and import `isDeletedUid`.
- The notice to show is:
  ```ts
  const flag = useState(deletedNoticeOnce)[0];
  const notice = deletedUid !== undefined
    ? { kind: flag && flag.uid === deletedUid ? flag.kind : "ok" }
    : flag && (flag.uid === null || isDeletedUid(flag.uid)) ? { kind: flag.kind } : null;
  ```
- Render as before from `notice.kind`.

`web/src/account/DeleteAccountPage.tsx`: read `const { state } = useAuth();` and render, above the form:
```tsx
<p data-testid="delete-account-email">Deleting the account {state.status === "member" ? state.email : ""}</p>
```

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run test:unit`, then `npm run emu:e2e` (10 min timeout).
Expected:
- unit tests green;
- browser 50/50 green: the deletion scenarios still end on `signin-deleted-notice`, because the reloaded tab resolves `deletedSession`;
- scenario 6's second tab resets through the `storage` event.

If scenario 6 fails, check that the deletion tab writes `localStorage` before its own reload. Do not reintroduce `signOut`.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "fix(account): completion never signs out; deleted sessions are recognised" -m "Final review P2: a sign-in already queued in Firebase Auth could be signed out by completion.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 16: The queued sign-in regression, and the full gate

**Files:**
- Modify: `web/e2e/account.spec.ts`, `web/playwright.config.ts` (count comment), `README.md`

**Interfaces:**
- Consumes: Task 15's behaviour, and the reproducer `planning/audits/plan-5a-review-probes/signout.spec.cjs` (read it first).

- [ ] **Step 1: Port the reproducer as scenarios 9 and 10**

Add to `web/e2e/account.spec.ts`, adapting the probe:

```ts
// Scenario 9 drives Firebase Auth's internal operations queue (auth.queue, _updateCurrentUser),
// pinned to @firebase/auth 1.13.6, to put Bogdan's sign-in ahead of completion deterministically.
// The app code under test is unmodified.
test("9: completion never signs out a sign-in that was already queued (final review P2)", async ({ page, context, request }) => {
  await signIn(page, "ava@safebite.test");
  const other = await context.newPage();
  await other.goto("/restaurants");
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });

  let serverDone!: () => void;
  const completed = new Promise<void>((r) => (serverDone = r));
  let sendResponse!: () => void;
  const released = new Promise<void>((r) => (sendResponse = r));
  await page.route(DELETE_URL, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch({ timeout: 90_000 });
    await page.evaluate(async () => {
      const { auth } = await import("/src/firebase.ts");
      const w = window as unknown as { queued: (string | null)[]; release: () => void };
      w.queued = [];
      (auth as unknown as { queue: (f: () => Promise<void>) => void }).queue(() => new Promise<void>((r) => (w.release = r)));
      const a = auth as unknown as { _updateCurrentUser: (u: { uid: string } | null, s?: boolean) => Promise<void> };
      const update = a._updateCurrentUser.bind(auth);
      a._updateCurrentUser = (u, s) => { w.queued.push(u?.uid ?? null); return update(u, s); };
    });
    serverDone();
    await released;
    await route.fulfill({ response });
  });
  await page.goto("/settings/delete-account");
  await page.getByTestId("delete-password").fill(PASSWORD);
  await page.getByTestId("delete-submit").click();
  await completed;
  await other.evaluate(async (pw) => {
    const { auth } = await import("/src/firebase.ts");
    const { signInWithEmailAndPassword } = await import("/node_modules/.vite/deps/firebase_auth.js");
    await signInWithEmailAndPassword(auth, "bogdan@safebite.test", pw);
  }, PASSWORD);
  await page.waitForFunction(() => (window as unknown as { queued: (string | null)[] }).queued.includes("bogdan-uid"));
  sendResponse();
  // Completion reloads the deletion tab; a null update must never be queued behind Bogdan's.
  await expect(page.getByTestId("nav-settings")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("signin-deleted-notice")).toHaveCount(0);
  // The other tab reloads on its own Ava→Bogdan switch; wait for it to settle before reading its session.
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 30_000 });
  const otherUid = await other.evaluate(async () => (await import("/src/firebase.ts")).auth.currentUser?.uid ?? null);
  expect(otherUid).toBe("bogdan-uid");
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(false);
  expect(await passwordAccepted(request, "bogdan@safebite.test", PASSWORD)).toBe(true);
  expect(await householdExists(request)).toBe(true);
});
```

Port the probe's control test as scenario 10: the same queued switch with no deletion keeps Bogdan, and no notice is shown. Keep its assertions.

Two dev-server paths may differ in this repo: the Vite optimised-deps path for `firebase/auth`, and whether `/src/firebase.ts` is importable from the page. If either does, find the working equivalent with the dev server running (for example `/@id/firebase/auth`), use it, and say so in the report. The page must call the real SDK `signInWithEmailAndPassword`.

Before relying on scenario 9, prove it is a real regression test. Temporarily reintroduce `await signOut(auth)` in `finishDeleted`, run scenario 9 alone, and record the failure: `otherUid` is null, or the notice is shown. Then restore the code. This mirrors the reviewer's RED.

- [ ] **Step 2: README and counts**

Update the browser count and stress line in `README.md`, and the scenario count in `web/playwright.config.ts`. In the "Your data" paragraph, add: "Finishing a deletion never signs anyone out; a deleted account's session is recognised and shown the sign-in screen."

- [ ] **Step 3: The full gate**

Run every command in Task 11 Step 6, including `npm run emu:e2e:stress` (30 min timeout). The `getIdToken(true)` grep must still print exactly one line. Add one guardrail grep, `git grep -n "signOut(" -- web/src/account/deleteFlow.ts`, which must print nothing.

Known host issues: backwards clock steps, `ERR_NETWORK_CHANGED`, socket hang-ups in seed restore, boot-guard port stalls, and "Loading…" stalls in untouched files. Record any you hit and rerun once. A deterministic failure is never "host".

- [ ] **Step 4: Commit**

```bash
git add web/e2e/account.spec.ts web/playwright.config.ts README.md
git commit -m "test(account): a sign-in queued before completion survives it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

### Addendum 2 coverage

| Final-review item | Task |
|---|---|
| P2: completion signs out a queued sign-in → completion never calls `signOut`; deleted-session record; `deletedSession` state; storage-event reset; notice bound to its UID | 15 |
| P2 permanent regression (real SDK, queued sign-in) plus control; RED by reintroducing `signOut` | 16 |
| Non-blocking: the delete page names its account | 15 |
| Spec "device data is cleared either way" aligned (not cleared when another account is current) | spec `604ebb4` |
