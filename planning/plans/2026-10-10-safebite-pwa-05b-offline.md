# SafeBite PWA — Plan 5b: Offline reading

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member who opts in on a device keeps a current, read-only copy of the household's restaurants, evidence, shortlist/visited state and notes in IndexedDB. The app opens and reads from that copy with no connection, including when the signal drops while the app is already open. The copy is isolated by account and household, cleared on sign-out, opt-out and confirmed loss of access, and never written back by a stale refresh.

**Architecture:** A Firebase-free `web/src/offline/` package holds the IndexedDB store (`store.ts`), cross-tab signals (`signals.ts`), the per-document copy session (`session.ts`), the read-source wrapper (`withCopy.ts`) and the write gate (`writeAccess.ts`). Firebase-dependent pieces are kept apart: server-pinned reads (`serverReads.ts`), the refresher (`refresher.ts`, `refreshTriggers.ts`) and the membership check (`auth/membershipCheck.ts`). `AuthProvider` gains the `offlineMember` state, timeout and late-answer handling, retries, household-move handling and early opening from the saved account. The record watchers fall back to the copy whenever the server cannot answer. The 5a pending-clear marker becomes one key per run.

**Tech Stack:** Vite 8.3, React 19, react-router 8, TypeScript strict, Vitest 5 (jsdom; `// @vitest-environment node` for IndexedDB store tests), `fake-indexeddb` (new web dev dependency), Playwright 1.63 (Chromium only), Firebase JS SDK 12.19 (`@firebase/auth` 1.13.6, `@firebase/firestore` 4.17.2), firebase-tools 14.27, Node 22.

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md`. **§3.9 is the binding design for this plan**, approved at `7528c18` after two design reviews (`planning/audits/2026-10-10-plan-5b-design-review.md`, `planning/audits/2026-10-10-plan-5b-design-review-2.md`) and a third owner pass. It covers the owner rulings 1–8, what the copy holds, the data model, units, server reads, read source, cross-tab invalidation, write access, startup and `offlineMember`, refresh, screens, error handling, the 5a carry-overs, empirical stops 1–5, tests, decisions and the deploy note. Also binding: §2.1 non-negotiable rules, §2.4 security model, §3.2 guardrails, §3.5/§3.7 read states, §3.8 device cleanup registry and Auth persistence gate. Previous plan: `planning/plans/2026-10-01-safebite-pwa-05a-data-rights.md`.

## Global Constraints

- Emulators only (`demo-safebite`). No `firebase deploy`, no `git push`, no billing or console changes, no access to the staging project `safebite-pilot-urfs3v`. The string `safebite-production-13ba1` must not appear in new files.
- Working directory is the worktree `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-05b-offline` on branch `worktree-pwa-05b-offline`. Never run anything in `/home/godja/Dev/AvaGF` itself.
- No changes to `firestore.rules`, `firestore.indexes.json` or `functions/`. No collection-group rule. This plan adds **no** Firestore writes; every write still goes through `write()` in `web/src/records/repository.ts`.
- `web/src/offline/{types,store,signals,eligibility,session,withCopy,writeAccess}.ts` must import nothing from `firebase/*`, `../firebase` or any module that imports them (spec §3.9 Units, review P2-5). `device/registerCleaners.ts` imports `offline/store.ts` statically.
- Server reads are pinned: `getDocFromServer` / `getDocsFromServer` only, for the membership read and every refresh read. Any snapshot with `metadata.fromCache === true` in a refresh is refused.
- Constants (one definition each, in `web/src/offline/types.ts`): `COPY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000`, `STALE_BANNER_MS = 7 * 24 * 60 * 60 * 1000`, `REFRESH_INTERVAL_MS = 15 * 60 * 1000`, `ELIGIBILITY_CHECK_MS = 60 * 1000`, `EARLY_OPEN_MS = 3000`; in `web/src/auth/membershipCheck.ts`: `MEMBERSHIP_TIMEOUT_MS = 6000`.
- IndexedDB database `safebite-offline`, version 1, stores exactly: `meta`, `restaurants`, `claims`, `collection`, `notes`, `optIn`, `control`. BroadcastChannel name `safebite-offline`. Browser storage keys added: `safebite.pendingClear.<token>` (localStorage). The legacy `safebite.pendingClear` key is still honoured. Every storage access is wrapped in `try/catch`.
- The offline cleaner (`offlineCopy`) touches only the `safebite-offline` database. It never touches `safebite.authCleanup.*`, `safebite.deletedUids`, `firebaseLocalStorageDb` or any other key.
- UI copy is exactly as in spec §3.9 "Screens and wording"; British spelling. Existing test IDs stay unchanged; new test IDs are listed per task.
- Never `window.confirm`/`alert`/`prompt` in `web/src` (the opt-out confirmation is an in-page two-step control).
- Line endings LF. Node 22; TS strict. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ
  ```
  Implementers may see a different attribution reminder; use these lines.
- Emulator-backed runs (`npm run emu:test`, `npm run emu:e2e`) take several minutes; give those shell commands a 10 minute timeout.
- Every task ends with `npm run typecheck` and `npm run test:unit` green, plus `npm run emu:e2e` when it touched `web/e2e` or anything the browser suite exercises. State counts as "previous + N new"; never assert absolute totals in commit messages. Baseline at `c2d1324` (README): web unit 529, functions + rules 441, browser 58. Task 1 step 1 re-measures it.

## Verified facts (checked while writing the spec and this plan)

| Fact | Evidence | Consequence |
|---|---|---|
| Default-source `getDocs` resolves from the memory cache when offline; it rejects only with `source: "server"` | `@firebase/firestore` 4.17.2 `common-CLMydGSF.esm.js:26727` | Refresh and membership reads are server-pinned (Task 5, Task 8) |
| Default-source `getDoc` rejects offline only when the document is absent from the cache | same file `:26690` | Persistence-off is not enough; pin to server |
| Auth's request timeout is 5 s when `navigator.onLine === false`, otherwise 30 s (`Delay(30000, 60000)`; `isMobile` is Cordova/React Native only) | `@firebase/auth` 1.13.6 `index-4NFEPWkC.js:644–661, 881` | Early opening (Task 7); stop 1 measures the stall |
| On `auth/network-request-failed` during start-up reload the SDK keeps the stored user | same file `:2874–2886` | `offlineMember` is reachable; stop 2 proves it with an expired token |
| `records/types.ts` imports nothing from Firebase | file header | The store can reuse `Restaurant`, `Claim`, `CollectionState`, `Note` |
| `RestaurantFormPage` derives `offline` only from the edit-mode subscription; `ClaimFormPage` has no offline gate | `RestaurantFormPage.tsx:79`, `ClaimFormPage.tsx:128` | Task 10's write gate |
| The rules check membership with one `get()` of the household per request | `firestore.rules:16–18` | Refresh cost counts one extra read per query (stop 5) |

## Review Focus

1. **A restaurant deleted on the server while this device was away** must disappear from the copy at the next full refresh, not linger forever. Test in Task 8: the refresher writes a copy without a restaurant that the server no longer returns, and its claims, notes and collection entry go too.
2. **The member flips the switch on → off → on quickly while the first download is still reading** must never end with the copy from the first run written after the opt-out. Test in Task 8: a paused first run, then `setOptIn(false)` + `clearCopy()`, then release → result `cleared` and no `meta`.
3. **A large household (300 restaurants, long notes, emoji and non-Latin names)** must round-trip through one `replaceCopy` transaction intact and in order. Test in Task 3.
4. **Notes read from the copy** must keep the newest-first order the live listener uses (`orderBy("createdAt", "desc")`). Test in Task 9.
5. **The device clock jumping backwards or far forwards** must not make an expired copy usable or crash age formatting. Tests in Task 4 (`copyUsable` with a future `membershipCheckedAt` and with `now` before it) and Task 11 (banner with a negative age shows the plain banner).

---

## File map

| Path | Responsibility |
|------|----------------|
| `web/package.json`, `web/package-lock.json` | `fake-indexeddb` dev dependency (Task 3) |
| `web/src/device/cleanup.ts` (+test) | Per-run pending-clear keys; `pendingClearKeys()`, `retirePendingClearKeys(keys)` |
| `web/src/device/DeviceClearingScreen.tsx` (+test) | Captures keys before clearing, retires only those, re-checks the gate |
| `web/src/auth/SignInScreen.tsx` (+test) | Drops the stale "couldn't be cleared" notice when no pending key remains |
| `web/src/offline/types.ts` (new) | Shared types and constants |
| `web/src/offline/signals.ts` (+test, new) | BroadcastChannel and `storage`-event invalidation signals |
| `web/src/offline/store.ts` (+test, new) | IndexedDB copy: token, replace, partial replace, membership check, clear, opt-in, cleaner |
| `web/src/offline/eligibility.ts` (+test, new) | `copyUsable(...)`, age helpers |
| `web/src/device/registerCleaners.ts` (+`.test.tsx`) | Registers `offlineCopyCleaner`; module-graph guard; start-up clear wipes the copy |
| `web/e2e/offline-store.spec.ts` (new) | Empirical stop 4: cross-tab serialisation |
| `web/src/offline/session.ts` (+test, new) | Copy session, serving counter, denial hook, `loadUsableCopy`, invalidation watch |
| `web/src/auth/membershipCheck.ts` (+test, new) | Server-pinned membership read and its classification |
| `web/src/offline/decide.ts` (+test, new) | `decideNoAnswer`, `prepareMemberCopy` (start-up table, household move) |
| `web/src/auth/AuthProvider.tsx` (+test) | `offlineMember`, timeout/late answer, retries, household move, early opening, refresher start |
| `web/src/account/persistedSession.ts` (+`persistedSession.read.test.ts`) | `readPersistedUid()` for early opening |
| `web/src/offline/early.ts` (+test, new) | Early-opening conditions |
| `web/src/records/useMember.ts` (+test), `web/src/App.tsx` | Accept `offlineMember` |
| `web/src/offline/serverReads.ts` (+test, new) | Server-pinned household and restaurant reads with stats |
| `web/src/offline/refresher.ts` (+test, new) | Single-flight full/partial refresh, status store, pause hook |
| `web/src/offline/refreshTriggers.ts` (+test, new) | `online`, visibility, 15-minute timer |
| `web/src/records/repository.ts`, `collection.ts`, `notes.ts` (+tests) | `source`/`cacheMiss` on snapshots, write observer, watchers wrapped by `withCopy` |
| `web/src/offline/withCopy.ts` (+test, new) | Snapshot-provenance read source |
| `web/src/offline/hooks.ts` (new) | `useCopyServing()`, `useCopyMode()` |
| `web/src/records/useWatch.ts` (+test) | Re-subscribe on copy-session mode change without a loading flash |
| `web/src/records/ReadStateNotice.tsx` (+test) | Silent for copy-sourced offline state |
| `web/src/offline/writeAccess.ts` (+test, new) | `canWrite()`, `useWriteAccess()`, `useConnectivity()` |
| `web/src/offline/WriteBlockedNotice.tsx` (new) | "Adding and editing need a connection." |
| `web/src/records/{RestaurantsPage,RestaurantFormPage,ClaimFormPage,RestaurantDetailPage}.tsx` (+tests) | Write gates; empty-copy text |
| `web/src/discover/DiscoverPage.tsx` (+test) | Offline search message; add-to-records gate |
| `web/src/pages/{SettingsPage,ChangePasswordForm}.tsx`, `web/src/account/ExportSection.tsx` (+tests) | Offline section placement; `whoami` suppression; online-only actions gated |
| `web/src/offline/format.ts` (+test, new) | `formatCopyTime` ("10 Oct, 14:32") |
| `web/src/offline/OfflineSection.tsx` (+test, new) | Settings → Offline copy |
| `web/src/offline/CopyBanner.tsx` (+test, new) | Shell banner, amber after 7 days; household-changed notice |
| `web/src/AppShell.tsx` | Renders `CopyBanner` |
| `web/src/styles.css` | Banner, amber variant, offline section |
| `web/e2e/offline-harness.html` (new), `web/e2e/offline-rest.ts` (new) | Harness page and REST helpers for offline scenarios |
| `web/e2e/offline.spec.ts`, `web/e2e/offline-isolation.spec.ts` (new) | Browser scenarios 1–14 |
| `planning/audits/plan-5b-probes/` (new) | Empirical stops 1, 2 and 5 probe specs and results |
| `planning/acceptance/iphone-acceptance.md` (new) | Real-iPhone acceptance steps for 5b (5c extends it) |
| `planning/audits/2026-10-10-plan-5b-execution-ledger.md` (new) | Execution ledger |
| `README.md`, `web/playwright.config.ts` | Test counts |

---
### Task 1: Baseline and empirical stops 1–2 (offline timing, expired-token restore)

Prove the two SDK behaviours the startup design rests on before any product code. Spec §3.9 "Empirical stops" 1 and 2. Stop 3 (iPhone storage) is owner-run after deploy (Task 14 records it); stop 4 is proven in Task 3; stop 5 in Task 8.

**Files:**
- Create: `planning/audits/plan-5b-probes/stop-1-2.spec.ts` (kept as evidence; run from a temporary copy in `web/e2e/`)
- Create: `planning/audits/plan-5b-probes/results.md`
- Create: `planning/audits/2026-10-10-plan-5b-execution-ledger.md`

**Interfaces:**
- Consumes: the existing harness page `web/e2e/auth-harness.html` and the dev-server module paths `/src/account/authPersistence.ts`, `/src/firebase.ts`, `/node_modules/.vite/deps/firebase_auth.js`, `/node_modules/.vite/deps/firebase_firestore.js` (as `web/e2e/auth-persistence.spec.ts` does).
- Produces: measured numbers that confirm or change `MEMBERSHIP_TIMEOUT_MS = 6000` and `EARLY_OPEN_MS = 3000`, recorded in `results.md` and the ledger.

- [ ] **Step 1: Measure the baseline**

Run (10 minute timeout each):
```bash
npm run typecheck
npm run test:unit 2>&1 | grep -E "Test Files|Tests "
npm run emu:test 2>&1 | grep -E "Test Files|Tests "
npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"
```
Expected: clean; 529 unit; 441 functions + rules; 58 browser. Write them into the ledger (Step 6). If any differ, record the real numbers and use them as the baseline.

- [ ] **Step 2: Write the probe spec**

Create `planning/audits/plan-5b-probes/stop-1-2.spec.ts`:

```ts
// Plan 5b empirical stops 1 and 2. Run from a temporary copy in web/e2e/ (see Task 1); kept here as evidence.
import { expect, test, type Page, type Route } from "@playwright/test";

const EMULATOR = /127\.0\.0\.1:(9099|8080|5001)\//;
const KEY = "firebase:authUser:demo-api-key:[DEFAULT]";
type Mode = "airplane" | "stall";

async function signInOnHarness(page: Page): Promise<string> {
  await page.goto("/e2e/auth-harness.html");
  return page.evaluate(async () => {
    (window as any).__SAFEBITE_BUILD__ = false;
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    await (await load("/src/account/authPersistence.ts")).prepareAuthPersistence();
    const { auth } = await load("/src/firebase.ts");
    const { signInWithEmailAndPassword } = await load("/node_modules/.vite/deps/firebase_auth.js");
    const cred = await signInWithEmailAndPassword(auth, "ava@safebite.test", "pilot-password-1");
    return cred.user.uid as string;
  });
}

async function cutEmulators(page: Page, mode: Mode): Promise<Route[]> {
  const held: Route[] = [];
  await page.route(EMULATOR, (route) => {
    if (mode === "airplane") return route.abort("internetdisconnected");
    held.push(route); // never fulfilled: a stalled connection
  });
  if (mode === "airplane") {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      window.dispatchEvent(new Event("offline"));
    });
  }
  return held;
}

async function startAndMeasure(page: Page) {
  return page.evaluate(async () => {
    (window as any).__SAFEBITE_BUILD__ = false;
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const t0 = performance.now();
    await (await load("/src/account/authPersistence.ts")).prepareAuthPersistence();
    const { auth, db } = await load("/src/firebase.ts");
    const { onAuthStateChanged } = await load("/node_modules/.vite/deps/firebase_auth.js");
    const first = await new Promise<{ uid: string | null; ms: number }>((resolve) => {
      const stop = onAuthStateChanged(auth, (user: { uid: string } | null) => {
        stop();
        resolve({ uid: user?.uid ?? null, ms: Math.round(performance.now() - t0) });
      });
    });
    const { doc, getDocFromServer } = await load("/node_modules/.vite/deps/firebase_firestore.js");
    const t1 = performance.now();
    let code = "ok";
    try {
      await Promise.race([
        getDocFromServer(doc(db, "users", first.uid ?? "none")),
        new Promise((_, reject) => setTimeout(() => reject({ code: "probe-timeout-60s" }), 60_000)),
      ]);
    } catch (err) {
      code = (err as { code?: string }).code ?? String(err);
    }
    return { first, readMs: Math.round(performance.now() - t1), code };
  });
}

test.setTimeout(240_000);

for (const mode of ["airplane", "stall"] as const) {
  test(`stop 1 (${mode}): time to first auth callback and to the server membership read's failure`, async ({ page, context }) => {
    const uid = await signInOnHarness(page);
    const next = await context.newPage();
    await page.close(); // only one document holds the SDK from here on
    await next.goto("/e2e/auth-harness.html");
    await cutEmulators(next, mode);
    const result = await startAndMeasure(next);
    console.log(`STOP1 ${mode} ${JSON.stringify(result)}`);
    expect(result.first.uid).toBe(uid); // the saved sign-in is restored without the network
  });
}

test("stop 2: an expired saved token restores offline and refreshes on reconnection", async ({ page, context }) => {
  const uid = await signInOnHarness(page);
  const next = await context.newPage();
  await page.close(); // the signing-in document must not rewrite the token we age below
  await next.goto("/e2e/auth-harness.html");
  // Age the stored token past its expiry, as if the device had been closed for over an hour.
  await next.evaluate((key) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("firebaseLocalStorageDb");
    open.onsuccess = () => {
      const tx = open.result.transaction("firebaseLocalStorage", "readwrite");
      const store = tx.objectStore("firebaseLocalStorage");
      const get = store.get(key);
      get.onsuccess = () => {
        const record = get.result;
        record.value.stsTokenManager.expirationTime = Date.now() - 60_000;
        store.put(record);
      };
      tx.oncomplete = () => { open.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), KEY);
  await cutEmulators(next, "airplane");
  const restored = await startAndMeasure(next);
  expect(restored.first.uid).toBe(uid);
  await next.waitForTimeout(10_000);
  const still = await next.evaluate(async () => (await import(/* @vite-ignore */ "/src/firebase.ts")).auth.currentUser?.uid ?? null);
  expect(still).toBe(uid); // not signed out by the failed refresh
  await next.unroute(EMULATOR);
  await next.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    window.dispatchEvent(new Event("online"));
  });
  const token = await next.evaluate(async () => {
    const { auth } = await import(/* @vite-ignore */ "/src/firebase.ts");
    return (await auth.currentUser.getIdToken()).length;
  });
  expect(token).toBeGreaterThan(100);
  console.log(`STOP2 ok uid-kept=${still === uid}`);
});
```

- [ ] **Step 3: Run the probes**

```bash
cp planning/audits/plan-5b-probes/stop-1-2.spec.ts web/e2e/zz-probe-5b.spec.ts
node tooling/ensure-secret-local.mjs && npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:exec --only auth,firestore,functions --project demo-safebite "node functions/lib/seed-emulator.js && npm --prefix web run e2e -- zz-probe-5b.spec.ts --retries=0" 2>&1 | tee /tmp/plan-5b-stops-1-2.log | grep -E "STOP1|STOP2|passed|failed"
rm web/e2e/zz-probe-5b.spec.ts
```
Expected: three tests pass. `STOP1 airplane` shows `first.ms` under ~6000 and `code` `"unavailable"`. `STOP1 stall` shows `first.ms` roughly 30 000 (the Auth request timeout) and `code` `"unavailable"` or `"probe-timeout-60s"`. `STOP2 ok uid-kept=true`.

**Stop condition:** if stop 2 fails (the user is signed out or `first.uid` is null), stop and report to the controller with the log — `offlineMember` cannot be built as designed. If the airplane-mode `first.ms` exceeds 6000, record it; Task 6 then also shows the waiting copy from the moment the app starts, not after the timeout.

- [ ] **Step 4: Record the results**

Create `planning/audits/plan-5b-probes/results.md` with a table: probe, mode, `first.ms`, `readMs`, `code`, and the consequence: "MEMBERSHIP_TIMEOUT_MS stays 6000 / changes to N", "EARLY_OPEN_MS stays 3000 (a stall delays the first auth callback by ~Ns)", "stop 2 holds". Name the log path `/tmp/plan-5b-stops-1-2.log` and the commit.

- [ ] **Step 5: Confirm nothing else changed**

Run: `git status --short`
Expected: only the three planning files are new; `web/e2e/` is unchanged.

- [ ] **Step 6: Start the ledger and commit**

Create `planning/audits/2026-10-10-plan-5b-execution-ledger.md`:

```markdown
# Plan 5b execution ledger

Plan: `planning/plans/2026-10-10-safebite-pwa-05b-offline.md`. Spec: §3.9 at `7528c18`.
Branch `worktree-pwa-05b-offline`, base `c2d1324`.

## Baseline

| Suite | Count |
|---|---|
| Web unit | <measured> |
| Functions + rules | <measured> |
| Browser | <measured> |

## Empirical stops

| Stop | Result | Consequence |
|---|---|---|
| 1 offline timing | see `plan-5b-probes/results.md` | <one line> |
| 2 expired-token restore | <holds / fails> | <one line> |
| 3 iPhone storage | owner-run after deploy | — |
| 4 cross-tab serialisation | Task 3 | — |
| 5 refresh read cost | Task 8 | — |

## Ledger
```

Replace each `<…>` with the measured value before committing (they are values to fill from Steps 1 and 3, not text to keep).

```bash
git add planning/audits/plan-5b-probes planning/audits/2026-10-10-plan-5b-execution-ledger.md
git commit -m "test(probe): Plan 5b empirical stops 1–2 — offline timing and expired-token restore

<one line per stop with the measured numbers>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 2: 5a carry-overs — per-run pending-clear keys, captured start-up retirement, stale notice

Spec §3.9 "Carried from Plan 5a" (review P3-8, R2-3). Must land before any cleaner is registered.

**Files:**
- Modify: `web/src/device/cleanup.ts`
- Modify: `web/src/device/DeviceClearingScreen.tsx`
- Modify: `web/src/auth/SignInScreen.tsx`
- Test: `web/src/device/cleanup.test.ts`, `web/src/device/DeviceClearingScreen.test.tsx`, `web/src/auth/SignInScreen.test.tsx`

**Interfaces:**
- Produces (in `device/cleanup.ts`):
  - `PENDING_CLEAR_KEY = "safebite.pendingClear"` (legacy, unchanged name, still honoured)
  - `PENDING_CLEAR_PREFIX = "safebite.pendingClear."`
  - `pendingClearKeys(): string[]` — every legacy or per-run key present
  - `pendingClear(): boolean` — `pendingClearKeys().length > 0` (signature unchanged)
  - `retirePendingClearKeys(keys: readonly string[]): void`
  - `clearDeviceData(): Promise<{ failed: string[] }>` (signature unchanged; now writes and removes only its own key)

- [ ] **Step 1: Write the failing cleanup tests**

Append to `web/src/device/cleanup.test.ts` (update the import line to add `PENDING_CLEAR_PREFIX`, `pendingClearKeys`, `retirePendingClearKeys`):

```ts
describe("per-run pending-clear keys (spec §3.9, review P3-8)", () => {
  it("each run writes its own key and removes only that key on success", async () => {
    let seen: string[] = [];
    registerDeviceCleaner({ name: "spy", clear: async () => { seen = pendingClearKeys(); } });
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.startsWith(PENDING_CLEAR_PREFIX)).toBe(true);
    expect(pendingClearKeys()).toEqual([]);
  });

  it("two concurrent runs: the failing run's key survives the other run's success", async () => {
    let calls = 0;
    registerDeviceCleaner({ name: "flaky", clear: async () => { calls += 1; if (calls === 1) throw new Error("first run fails"); } });
    const [a, b] = await Promise.all([clearDeviceData(), clearDeviceData()]);
    expect(a).toEqual({ failed: ["flaky"] });
    expect(b).toEqual({ failed: [] });
    expect(pendingClear()).toBe(true);
    expect(pendingClearKeys()).toHaveLength(1);
  });

  it("honours and retires the legacy marker", () => {
    localStorage.setItem(PENDING_CLEAR_KEY, "1");
    expect(pendingClear()).toBe(true);
    retirePendingClearKeys(pendingClearKeys());
    expect(pendingClear()).toBe(false);
  });

  it("retiring a captured set leaves keys written afterwards", () => {
    localStorage.setItem(`${PENDING_CLEAR_PREFIX}old`, "1");
    const captured = pendingClearKeys();
    localStorage.setItem(`${PENDING_CLEAR_PREFIX}new`, "1");
    retirePendingClearKeys(captured);
    expect(pendingClearKeys()).toEqual([`${PENDING_CLEAR_PREFIX}new`]);
  });

  it("blocked storage never throws: no keys, nothing pending", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => retirePendingClearKeys(["x"])).not.toThrow();
    return expect(clearDeviceData()).resolves.toEqual({ failed: [] });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm --prefix web exec vitest run src/device/cleanup.test.ts`
Expected: FAIL — `pendingClearKeys` is not exported.

- [ ] **Step 3: Implement the keys**

In `web/src/device/cleanup.ts`, replace `PENDING_CLEAR_KEY`'s block, `setMarker`, `pendingClear` and `clearDeviceData` with:

```ts
/** Legacy single marker from 5a builds; still honoured and retired. */
export const PENDING_CLEAR_KEY = "safebite.pendingClear";
/** One key per clearing run (spec §3.9, review P3-8): one run's success can never hide another's failure. */
export const PENDING_CLEAR_PREFIX = "safebite.pendingClear.";
export const CLEANER_TIMEOUT_MS = 5_000;

function newRunKey(): string {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return PENDING_CLEAR_PREFIX + token;
}

function writeKey(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Storage blocked (private mode): nothing can persist there either, so there is nothing to guard.
  }
}

/** Every pending key present now: the legacy marker and every run's own key. */
export function pendingClearKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k === PENDING_CLEAR_KEY || k.startsWith(PENDING_CLEAR_PREFIX));
  } catch {
    return [];
  }
}

export function pendingClear(): boolean {
  return pendingClearKeys().length > 0;
}

/** Removes exactly the given keys; keys written later by another run are left for that run. */
export function retirePendingClearKeys(keys: readonly string[]): void {
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // blocked: the key stays and start-up clears again
    }
  }
}
```

and

```ts
export async function clearDeviceData(): Promise<{ failed: string[] }> {
  const key = newRunKey();
  writeKey(key);
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
  if (failed.length === 0) retirePendingClearKeys([key]);
  return { failed };
}
```

Update the module comment's "pendingClear marker" sentence to "pending-clear keys (one per run)".

- [ ] **Step 4: Run the cleanup tests**

Run: `npm --prefix web exec vitest run src/device/cleanup.test.ts`
Expected: PASS (existing + 5 new).

- [ ] **Step 5: Write the failing start-up screen tests**

In `web/src/device/DeviceClearingScreen.test.tsx`, change the mock to keep the real key helpers:

```ts
const { clearDeviceData } = vi.hoisted(() => ({ clearDeviceData: vi.fn() }));
vi.mock("./cleanup", async (importOriginal) => ({ ...(await importOriginal<typeof import("./cleanup")>()), clearDeviceData }));
```

add `beforeEach(() => localStorage.clear());` (import `beforeEach`), and append:

```ts
describe("captured key retirement (review R2-3)", () => {
  it("retires only the keys present when it started, then clears again for a key written meanwhile", async () => {
    localStorage.setItem("safebite.pendingClear.first", "1");
    let round = 0;
    clearDeviceData.mockImplementation(async () => {
      round += 1;
      if (round === 1) localStorage.setItem("safebite.pendingClear.second", "1"); // another tab starts clearing
      return { failed: [] };
    });
    const onCleared = vi.fn();
    render(<DeviceClearingScreen onCleared={onCleared} />);
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
    expect(round).toBe(2);
    expect(localStorage.getItem("safebite.pendingClear.first")).toBeNull();
    expect(localStorage.getItem("safebite.pendingClear.second")).toBeNull();
  });

  it("a key that keeps reappearing ends on the failure screen, not an endless loop", async () => {
    clearDeviceData.mockImplementation(async () => {
      localStorage.setItem(`safebite.pendingClear.${Math.random()}`, "1");
      return { failed: [] };
    });
    const onCleared = vi.fn();
    render(<DeviceClearingScreen onCleared={onCleared} />);
    expect(await screen.findByTestId("device-clear-failed")).toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
    expect(clearDeviceData).toHaveBeenCalledTimes(3);
  });

  it("a failed run leaves every key in place", async () => {
    localStorage.setItem("safebite.pendingClear.first", "1");
    clearDeviceData.mockResolvedValue({ failed: ["offlineCopy"] });
    render(<DeviceClearingScreen onCleared={vi.fn()} />);
    expect(await screen.findByTestId("device-clear-failed")).toBeInTheDocument();
    expect(localStorage.getItem("safebite.pendingClear.first")).toBe("1");
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `npm --prefix web exec vitest run src/device/DeviceClearingScreen.test.tsx`
Expected: FAIL — the first new test calls `onCleared` after one round while `second` remains.

- [ ] **Step 7: Implement captured retirement**

Replace the body of `DeviceClearingScreen` in `web/src/device/DeviceClearingScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { clearDeviceData, pendingClear, pendingClearKeys, retirePendingClearKeys } from "./cleanup";

/** Rounds before giving up when other tabs keep starting clears (each round re-captures). */
const MAX_ROUNDS = 3;

/**
 * Shown at start-up while any pending-clear key is set; renders nothing of the app. Each round
 * captures the keys present before it runs and, on success, retires only those (spec §3.9,
 * review R2-3). A key written meanwhile by another tab's run survives and is covered by the next
 * round, so the gate is re-checked before the app opens.
 */
export function DeviceClearingScreen({ onCleared }: { onCleared: () => void }) {
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    setFailed(false);
    void (async () => {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const captured = pendingClearKeys();
        const { failed: names } = await clearDeviceData();
        if (names.length > 0) { setFailed(true); return; }
        retirePendingClearKeys(captured);
        if (!pendingClear()) { onCleared(); return; }
      }
      setFailed(true);
    })();
  }, [onCleared]);
  useEffect(run, [run]);
```

Keep the existing JSX return unchanged.

- [ ] **Step 8: Run the screen tests**

Run: `npm --prefix web exec vitest run src/device/DeviceClearingScreen.test.tsx`
Expected: PASS (2 existing + 3 new). The existing first test now runs one round: no key was present, the run succeeds, `pendingClear()` is false.

- [ ] **Step 9: Write the failing stale-notice tests**

In `web/src/auth/SignInScreen.test.tsx`, in `beforeEach` add `localStorage.clear();`. In the existing test "deletedSession with a matching flag shows the flag's kind", add `localStorage.setItem("safebite.pendingClear.run", "1");` before `render`. Append:

```ts
describe("stale clearFailed notice (5a ledger)", () => {
  it("shows the plain deleted notice once no pending-clear key remains", () => {
    m.flag = { kind: "clearFailed", uid: "ava" };
    render(<SignInScreen deletedUid="ava" />);
    expect(screen.getByTestId("signin-deleted-notice")).toHaveTextContent(OK);
    expect(screen.getByTestId("signin-deleted-notice")).not.toHaveTextContent("couldn't be cleared");
  });

  it("keeps the failure wording while a key is pending (legacy marker included)", () => {
    m.flag = { kind: "clearFailed", uid: "ava" };
    localStorage.setItem("safebite.pendingClear", "1");
    render(<SignInScreen deletedUid="ava" />);
    expect(screen.getByTestId("signin-deleted-notice")).toHaveTextContent(FAILED);
  });
});
```

- [ ] **Step 10: Run them to see them fail**

Run: `npm --prefix web exec vitest run src/auth/SignInScreen.test.tsx`
Expected: FAIL — the first new test still shows the failure wording.

- [ ] **Step 11: Implement**

In `web/src/auth/SignInScreen.tsx` add `import { pendingClear } from "../device/cleanup";` and, where `notice` is rendered, derive the kind:

```tsx
  // A clearFailed notice is stale once a later clear succeeded (no pending key remains; 5a ledger).
  const noticeKind = notice && notice.kind === "clearFailed" && !pendingClear() ? "ok" : notice?.kind;
```

and render `noticeKind === "ok" ? "Your account has been deleted." : "Your account has been deleted. Some data on this device couldn't be cleared."` in place of the existing `notice.kind === "ok" ? …` expression.

- [ ] **Step 12: Run the web suite and typecheck**

Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 10 new, all passing.

- [ ] **Step 13: Run the browser suite**

Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: 58 passed (account deletion scenarios exercise `clearDeviceData`).

- [ ] **Step 14: Commit**

```bash
git add web/src/device web/src/auth/SignInScreen.tsx web/src/auth/SignInScreen.test.tsx
git commit -m "fix(device): one pending-clear key per run; start-up retires only captured keys

Carried from Plan 5a (spec §3.9, reviews P3-8 and R2-3): concurrent clears can
no longer mask a failure, the start-up screen retires only the keys it captured
and re-checks the gate (bounded to 3 rounds), and the sign-in notice drops the
stale 'couldn't be cleared' wording once no key remains. Legacy marker honoured.
Web unit: previous + 10.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 3: The device copy — types, signals, IndexedDB store, cleaner registration (stop 4)

Spec §3.9 "Data model", "Units" 1, "Refresh" step 3, "Cleanup wins", review P2-4, P2-5, P3-13, R2-2. No UI yet.

**Files:**
- Modify: `web/package.json`, `web/package-lock.json` (dev dependency `fake-indexeddb`)
- Create: `web/src/offline/types.ts`
- Create: `web/src/offline/signals.ts`, `web/src/offline/signals.test.ts`
- Create: `web/src/offline/store.ts`, `web/src/offline/store.test.ts`
- Modify: `web/src/device/registerCleaners.ts`; Create: `web/src/device/registerCleaners.test.tsx`
- Create: `web/e2e/offline-harness.html`, `web/e2e/offline-store.spec.ts`

**Interfaces:**
- Consumes: `DeviceCleaner` type and `PENDING_CLEAR_KEY`/`PENDING_CLEAR_PREFIX` from `device/cleanup.ts` (Task 2); `Restaurant`, `Claim`, `CollectionState`, `Note` from `records/types.ts`.
- Produces (`offline/types.ts`): constants listed in Global Constraints plus `COPY_DB_NAME = "safebite-offline"`, `COPY_DB_VERSION = 1`; types `CopyMeta`, `CopyData`, `RestaurantData`, `CopyToken`, `CopyIdentity`, `ReplaceResult`, `ReadCopyResult` exactly as in Step 3.
- Produces (`offline/signals.ts`): `OFFLINE_CHANNEL`, `announceInvalidation(): void`, `onInvalidation(cb: () => void): () => void`.
- Produces (`offline/store.ts`): `readToken(): Promise<CopyToken>`, `readMeta(): Promise<CopyMeta | null>`, `readCopy(id: CopyIdentity): Promise<ReadCopyResult>`, `replaceCopy(id: CopyIdentity & { displayName: string }, expected: CopyToken, data: CopyData, now: number): Promise<ReplaceResult>`, `replaceRestaurant(id: CopyIdentity, expected: CopyToken, rid: string, data: RestaurantData | null): Promise<ReplaceResult>`, `recordMembershipCheck(id: CopyIdentity, now: number): Promise<void>`, `clearCopy(): Promise<void>`, `getOptIn(uid: string): Promise<boolean>`, `setOptIn(uid: string, enabled: boolean): Promise<void>`, `clearAllOptIns(): Promise<void>`, `offlineCopyCleaner: DeviceCleaner`.

- [ ] **Step 1: Add the test dependency**

Run: `npm --prefix web install --save-dev fake-indexeddb@6`
Expected: `web/package.json` gains `"fake-indexeddb": "^6.x.y"` and the lockfile updates. Record the resolved version in the ledger. Then run `node -e "require('/home/godja/Dev/AvaGF/.claude/worktrees/pwa-05b-offline/web/node_modules/fake-indexeddb/package.json').version"` to confirm it installed.

- [ ] **Step 2: Write the types**

Create `web/src/offline/types.ts`:

```ts
import type { Claim, CollectionState, Note, Restaurant } from "../records/types";

/**
 * Offline copy (spec §3.9). Firebase-free: this module, store.ts, signals.ts, eligibility.ts,
 * session.ts, withCopy.ts and writeAccess.ts must never import firebase/* or ../firebase, so the
 * cleaner can be registered before §3.8's Auth persistence gate runs (review P2-5).
 */
export const COPY_DB_NAME = "safebite-offline";
export const COPY_DB_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
export const COPY_MAX_AGE_MS = 30 * DAY_MS;
export const STALE_BANNER_MS = 7 * DAY_MS;
export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
export const ELIGIBILITY_CHECK_MS = 60 * 1000;
export const EARLY_OPEN_MS = 3000;

export interface CopyIdentity { uid: string; householdId: string }

export interface CopyMeta {
  uid: string;
  householdId: string;
  displayName: string;
  /** Counts replacements; every full or partial replacement checks and increments it (review R2-2). */
  revision: number;
  /** Last complete download (ms). A partial refresh never changes it. */
  downloadedAt: number;
  /** Last server-confirmed membership (ms). Renews the 30-day window. */
  membershipCheckedAt: number;
  complete: true;
}

export interface CopyData {
  /** Ordered by name, as the live `orderBy("name")` query. */
  restaurants: Restaurant[];
  claims: Record<string, Claim[]>;
  collection: Record<string, CollectionState>;
  /** Newest first per restaurant, as the live `orderBy("createdAt", "desc")` query. */
  notes: Record<string, Note[]>;
}

export interface RestaurantData {
  restaurant: Restaurant;
  claims: Claim[];
  notes: Note[];
  state: CollectionState | null;
}

/** Captured before a refresh's server reads; enforced inside the replacing transaction. */
export interface CopyToken { epoch: number; revision: number }

export type ReplaceResult =
  | "written"
  | "stale" // another tab replaced the copy since this token was read
  | "cleared" // the copy was cleared since this token was read (epoch changed, or the database was evicted)
  | "optedOut"
  | "otherCopy" // meta names another account or household
  | "noCopy" // a partial replacement needs an existing complete copy
  | "storageFull"
  | "unavailable";

export type ReadCopyResult =
  | { kind: "copy"; meta: CopyMeta; data: CopyData }
  | { kind: "none" }
  | { kind: "malformed" };
```

- [ ] **Step 3: Write the failing signal tests**

Create `web/src/offline/signals.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceInvalidation, onInvalidation } from "./signals";

afterEach(() => vi.restoreAllMocks());

describe("offline signals", () => {
  it("delivers an invalidation announced elsewhere in the browser", async () => {
    const cb = vi.fn();
    const stop = onInvalidation(cb);
    announceInvalidation();
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    stop();
  });

  it("treats a pending-clear key appearing in another tab as an invalidation", () => {
    const cb = vi.fn();
    const stop = onInvalidation(cb);
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear.abc", newValue: "1" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear", newValue: "1" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear.abc", newValue: null })); // removal: not a signal
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.deletedUids", newValue: "[]" }));
    expect(cb).toHaveBeenCalledTimes(2);
    stop();
  });

  it("never throws when BroadcastChannel is missing", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    expect(() => announceInvalidation()).not.toThrow();
    const stop = onInvalidation(vi.fn());
    expect(() => stop()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/signals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the signals**

Create `web/src/offline/signals.ts`:

```ts
import { PENDING_CLEAR_KEY, PENDING_CLEAR_PREFIX } from "../device/cleanup";

/** Cross-tab invalidation of the offline copy (spec §3.9 "Cross-tab invalidation", review R2-5). */
export const OFFLINE_CHANNEL = "safebite-offline";

export function announceInvalidation(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(OFFLINE_CHANNEL);
    channel.postMessage({ type: "invalidated" });
    channel.close();
  } catch {
    // Not available: resume and pre-read checks still catch the change.
  }
}

/** Calls `cb` when another tab clears the copy, opts out, finds access revoked, or starts a device clear. */
export function onInvalidation(cb: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(OFFLINE_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if ((event.data as { type?: unknown } | null)?.type === "invalidated") cb();
      };
    } catch {
      channel = null;
    }
  }
  const onStorage = (event: StorageEvent) => {
    const key = event.key;
    if (key === null || event.newValue === null) return;
    if (key === PENDING_CLEAR_KEY || key.startsWith(PENDING_CLEAR_PREFIX)) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
```

Run: `npm --prefix web exec vitest run src/offline/signals.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Write the failing store tests**

Create `web/src/offline/store.test.ts`:

```ts
// @vitest-environment node
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Claim, CollectionState, Note, Restaurant } from "../records/types";
import {
  clearCopy, getOptIn, offlineCopyCleaner, readCopy, readMeta, readToken, recordMembershipCheck,
  replaceCopy, replaceRestaurant, setOptIn,
} from "./store";
import type { CopyData, RestaurantData } from "./types";

const ID = { uid: "ava-uid", householdId: "home" };
const WHO = { ...ID, displayName: "Ava" };
const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);

function restaurant(id: string, name = `Place ${id}`): Restaurant {
  return { id, name, address: "1 Test Street", createdBy: "ava-uid", createdAt: new Date(T0), updatedAt: new Date(T0), version: 1, deleting: false };
}
function claim(id: string, checkedAt = "2026-09-01"): Claim {
  return { id, kind: "gfMenu", value: "yes", detail: "", source: { type: "restaurantStatement", label: "Phone" }, checkedAt, authorUid: "ava-uid", authorName: "Ava", createdAt: new Date(T0) };
}
function note(id: string, at: number, text = `Note ${id}`): Note {
  return { id, text, authorUid: "ava-uid", authorName: "Ava", createdAt: new Date(at), updatedAt: new Date(at), version: 1 };
}
const state: CollectionState = { shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: new Date(T0), version: 1 };

function household(...ids: string[]): CopyData {
  const data: CopyData = { restaurants: [], claims: {}, collection: {}, notes: {} };
  for (const id of ids) {
    data.restaurants.push(restaurant(id));
    data.claims[id] = [claim(`${id}-c1`)];
    data.notes[id] = [note(`${id}-n1`, T0)];
    data.collection[id] = state;
  }
  return data;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await setOptIn("ava-uid", true);
});
afterEach(() => vi.restoreAllMocks());

describe("replaceCopy and readCopy", () => {
  it("round-trips a household for the same account and household only", async () => {
    await expect(replaceCopy(WHO, await readToken(), household("a", "b"), T0)).resolves.toBe("written");
    const got = await readCopy(ID);
    expect(got.kind).toBe("copy");
    if (got.kind !== "copy") return;
    expect(got.meta).toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava", revision: 1, downloadedAt: T0, membershipCheckedAt: T0, complete: true });
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["a", "b"]);
    expect(got.data.claims.a![0]!.checkedAt).toBe("2026-09-01");
    expect(got.data.restaurants[0]!.createdAt).toEqual(new Date(T0));
    await expect(readCopy({ uid: "bogdan-uid", householdId: "home" })).resolves.toEqual({ kind: "none" });
    await expect(readCopy({ uid: "ava-uid", householdId: "other" })).resolves.toEqual({ kind: "none" });
  });

  it("refuses without an opt-in for the account", async () => {
    await setOptIn("ava-uid", false);
    await expect(replaceCopy(WHO, await readToken(), household("a"), T0)).resolves.toBe("optedOut");
    await expect(readMeta()).resolves.toBeNull();
  });

  it("refuses to overwrite another account's or household's copy", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    await setOptIn("bogdan-uid", true);
    await expect(replaceCopy({ uid: "bogdan-uid", householdId: "home", displayName: "Bogdan" }, await readToken(), household("b"), T0)).resolves.toBe("otherCopy");
    await expect(replaceCopy({ ...WHO, householdId: "elsewhere" }, await readToken(), household("b"), T0)).resolves.toBe("otherCopy");
  });

  it("orders restaurants by name and notes newest first, whatever the input order", async () => {
    const data = household("b", "a");
    data.restaurants = [restaurant("b", "Zest"), restaurant("a", "Bistro")];
    data.notes.a = [note("old", T0 - 1000), note("new", T0)];
    await replaceCopy(WHO, await readToken(), data, T0);
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.name)).toEqual(["Bistro", "Zest"]);
    expect(got.data.notes.a!.map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("a large household with emoji and non-Latin text round-trips intact (Review Focus 3)", async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `r${String(i).padStart(3, "0")}`);
    const data = household(...ids);
    data.restaurants[7] = restaurant(ids[7]!, "Café Ölçü 🍝 東京");
    data.notes[ids[7]!] = [note("long", T0, "x".repeat(2000) + " 🍞")];
    await expect(replaceCopy(WHO, await readToken(), data, T0)).resolves.toBe("written");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants).toHaveLength(300);
    expect(got.data.restaurants.some((r) => r.name === "Café Ölçü 🍝 東京")).toBe(true);
    expect(got.data.notes[ids[7]!]![0]!.text.endsWith(" 🍞")).toBe(true);
  });
});

describe("cleanup wins and revisions (review P3-13, R2-2)", () => {
  it("a replace whose token predates a clear writes nothing", async () => {
    const token = await readToken();
    await clearCopy();
    await expect(replaceCopy(WHO, token, household("a"), T0)).resolves.toBe("cleared");
    await expect(readMeta()).resolves.toBeNull();
  });

  it("an evicted database (no control row) still aborts a stale replace by epoch equality", async () => {
    await clearCopy();
    await clearCopy();
    const token = await readToken();
    expect(token.epoch).toBe(2);
    globalThis.indexedDB = new IDBFactory(); // the browser evicted everything
    await setOptIn("ava-uid", true);
    await expect(replaceCopy(WHO, token, household("a"), T0)).resolves.toBe("cleared");
  });

  it("full vs full: the older run is stale and the newer data stays", async () => {
    const older = await readToken();
    const newer = await readToken();
    await expect(replaceCopy(WHO, newer, household("new"), T0 + 1)).resolves.toBe("written");
    await expect(replaceCopy(WHO, older, household("old"), T0 + 2)).resolves.toBe("stale");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["new"]);
    expect(got.meta.downloadedAt).toBe(T0 + 1);
  });

  it("partial vs full: a full refresh based on reads older than a partial is stale", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const fullToken = await readToken();
    const partial: RestaurantData = { restaurant: restaurant("a", "Renamed"), claims: [], notes: [], state: null };
    await expect(replaceRestaurant(ID, await readToken(), "a", partial)).resolves.toBe("written");
    await expect(replaceCopy(WHO, fullToken, household("a"), T0 + 5)).resolves.toBe("stale");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants[0]!.name).toBe("Renamed");
  });

  it("full vs partial: a partial based on reads older than a full refresh is stale", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const partialToken = await readToken();
    await replaceCopy(WHO, await readToken(), household("a", "b"), T0 + 5);
    await expect(replaceRestaurant(ID, partialToken, "a", null)).resolves.toBe("stale");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("partial replacement", () => {
  it("replaces one restaurant, keeps downloadedAt and membershipCheckedAt, and increments revision", async () => {
    await replaceCopy(WHO, await readToken(), household("a", "b"), T0);
    const data: RestaurantData = { restaurant: restaurant("a"), claims: [claim("a-c2", "2026-10-01")], notes: [], state: null };
    await expect(replaceRestaurant(ID, await readToken(), "a", data)).resolves.toBe("written");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.meta.revision).toBe(2);
    expect(got.meta.downloadedAt).toBe(T0);
    expect(got.meta.membershipCheckedAt).toBe(T0);
    expect(got.data.claims.a!.map((c) => c.id)).toEqual(["a-c2"]);
    expect(got.data.notes.a ?? []).toEqual([]);
    expect(got.data.collection.a).toBeUndefined();
    expect(got.data.claims.b!.map((c) => c.id)).toEqual(["b-c1"]);
  });

  it("null data removes the restaurant with its claims, notes and collection entry", async () => {
    await replaceCopy(WHO, await readToken(), household("a", "b"), T0);
    await expect(replaceRestaurant(ID, await readToken(), "a", null)).resolves.toBe("written");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["b"]);
    expect(got.data.claims.a).toBeUndefined();
    expect(got.data.notes.a).toBeUndefined();
    expect(got.data.collection.a).toBeUndefined();
  });

  it("does nothing without a complete copy", async () => {
    await expect(replaceRestaurant(ID, await readToken(), "a", null)).resolves.toBe("noCopy");
  });
});

describe("recordMembershipCheck (review P2-4)", () => {
  it("never creates meta", async () => {
    await recordMembershipCheck(ID, T0);
    await expect(readMeta()).resolves.toBeNull();
  });

  it("renews only a matching copy and leaves revision and downloadedAt alone", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    await recordMembershipCheck({ uid: "ava-uid", householdId: "elsewhere" }, T0 + 10);
    expect((await readMeta())!.membershipCheckedAt).toBe(T0);
    await recordMembershipCheck(ID, T0 + 20);
    expect(await readMeta()).toMatchObject({ membershipCheckedAt: T0 + 20, downloadedAt: T0, revision: 1 });
  });
});

describe("malformed copies and storage failures", () => {
  it("a meta record of the wrong shape reads as malformed", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("safebite-offline");
      open.onsuccess = () => {
        const tx = open.result.transaction("meta", "readwrite");
        tx.objectStore("meta").put({ uid: "ava-uid", householdId: "home", revision: "x" }, "copy");
        tx.oncomplete = () => { open.result.close(); resolve(); };
      };
    });
    await expect(readCopy(ID)).resolves.toEqual({ kind: "malformed" });
  });

  it("a quota failure rolls the whole replacement back and keeps the previous copy", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const realPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "notes") throw new DOMException("full", "QuotaExceededError");
      return realPut.apply(this, args);
    });
    await expect(replaceCopy(WHO, await readToken(), household("x", "y"), T0 + 1)).resolves.toBe("storageFull");
    vi.restoreAllMocks();
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["a"]);
    expect(got.meta.downloadedAt).toBe(T0);
  });

  it("without IndexedDB, reads are empty, opt-in is off and clearing succeeds", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(readMeta()).resolves.toBeNull();
    await expect(readCopy(ID)).resolves.toEqual({ kind: "none" });
    await expect(getOptIn("ava-uid")).resolves.toBe(false);
    await expect(clearCopy()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe("clearCopy and the cleaner", () => {
  it("clearCopy removes the copy, keeps opt-ins, bumps the epoch and announces it", async () => {
    const post = vi.spyOn(BroadcastChannel.prototype, "postMessage");
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const before = await readToken();
    await clearCopy();
    await expect(readMeta()).resolves.toBeNull();
    await expect(readCopy(ID)).resolves.toEqual({ kind: "none" });
    await expect(getOptIn("ava-uid")).resolves.toBe(true);
    expect((await readToken()).epoch).toBe(before.epoch + 1);
    expect(post).toHaveBeenCalledWith({ type: "invalidated" });
  });

  it("the offlineCopy cleaner also removes every opt-in", async () => {
    await setOptIn("bogdan-uid", true);
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    expect(offlineCopyCleaner.name).toBe("offlineCopy");
    await offlineCopyCleaner.clear();
    await expect(readMeta()).resolves.toBeNull();
    await expect(getOptIn("ava-uid")).resolves.toBe(false);
    await expect(getOptIn("bogdan-uid")).resolves.toBe(false);
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/store.test.ts`
Expected: FAIL — module `./store` not found.

- [ ] **Step 6: Implement the store**

Create `web/src/offline/store.ts`:

```ts
import type { DeviceCleaner } from "../device/cleanup";
import type { Claim, CollectionState, Note, Restaurant } from "../records/types";
import { announceInvalidation } from "./signals";
import { COPY_DB_NAME, COPY_DB_VERSION, type CopyData, type CopyIdentity, type CopyMeta, type CopyToken, type ReadCopyResult, type ReplaceResult, type RestaurantData } from "./types";

/**
 * The offline copy (spec §3.9 "Data model", "Units" 1). IndexedDB only — never import Firebase
 * here (review P2-5). One connection per operation, closed on completion and on versionchange.
 * Every replacement is one readwrite transaction that re-checks the epoch, the opt-in, the copy's
 * identity and its revision before writing, so cleanup and newer work always win (review P3-13, R2-2).
 */

const RECORD_STORES = ["restaurants", "claims", "collection", "notes"] as const;
const ALL_STORES = ["meta", ...RECORD_STORES, "optIn", "control"];
const META_KEY = "copy";
const EPOCH_KEY = "epoch";

interface ChildRow<T> { rid: string; id: string; value: T }
interface StateRow { rid: string; value: CollectionState }

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(COPY_DB_NAME, COPY_DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("meta");
      db.createObjectStore("control");
      db.createObjectStore("restaurants", { keyPath: "id" });
      db.createObjectStore("claims", { keyPath: ["rid", "id"] });
      db.createObjectStore("collection", { keyPath: "rid" });
      db.createObjectStore("notes", { keyPath: ["rid", "id"] });
      db.createObjectStore("optIn", { keyPath: "uid" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("offline copy database blocked"));
  });
}

async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException("aborted", "AbortError"));
  });
}

function isQuota(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === "QuotaExceededError";
}

function isMeta(value: unknown): value is CopyMeta {
  const m = value as Partial<CopyMeta> | null;
  return !!m && typeof m.uid === "string" && typeof m.householdId === "string" && typeof m.displayName === "string"
    && typeof m.revision === "number" && typeof m.downloadedAt === "number" && typeof m.membershipCheckedAt === "number" && m.complete === true;
}

function ridRange(rid: string): IDBKeyRange {
  return IDBKeyRange.bound([rid, ""], [rid, "￿"]);
}

/** Firestore's default string order (code units), as the live `orderBy("name")` query. */
function byName(a: Restaurant, b: Restaurant): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1;
}

function newestFirst(a: Note, b: Note): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export async function readToken(): Promise<CopyToken> {
  if (!hasIndexedDb()) return { epoch: 0, revision: 0 };
  return withDb(async (db) => {
    const tx = db.transaction(["control", "meta"], "readonly");
    const control = (await result(tx.objectStore("control").get(EPOCH_KEY))) as { epoch?: unknown } | undefined;
    const meta = (await result(tx.objectStore("meta").get(META_KEY))) as Partial<CopyMeta> | undefined;
    return { epoch: typeof control?.epoch === "number" ? control.epoch : 0, revision: typeof meta?.revision === "number" ? meta.revision : 0 };
  });
}

export async function readMeta(): Promise<CopyMeta | null> {
  if (!hasIndexedDb()) return null;
  try {
    return await withDb(async (db) => {
      const value = await result(db.transaction("meta", "readonly").objectStore("meta").get(META_KEY));
      return isMeta(value) ? value : null;
    });
  } catch {
    return null;
  }
}

export async function readCopy(id: CopyIdentity): Promise<ReadCopyResult> {
  if (!hasIndexedDb()) return { kind: "none" };
  try {
    return await withDb(async (db) => {
      const tx = db.transaction(["meta", ...RECORD_STORES], "readonly");
      const raw = await result(tx.objectStore("meta").get(META_KEY));
      if (raw === undefined) return { kind: "none" } as const;
      if (!isMeta(raw)) return { kind: "malformed" } as const;
      if (raw.uid !== id.uid || raw.householdId !== id.householdId) return { kind: "none" } as const;
      const restaurants = (await result(tx.objectStore("restaurants").getAll())) as Restaurant[];
      const claimRows = (await result(tx.objectStore("claims").getAll())) as Array<ChildRow<Claim>>;
      const noteRows = (await result(tx.objectStore("notes").getAll())) as Array<ChildRow<Note>>;
      const stateRows = (await result(tx.objectStore("collection").getAll())) as StateRow[];
      if (!restaurants.every((r) => typeof r?.id === "string" && typeof r.name === "string" && r.createdAt instanceof Date)) return { kind: "malformed" } as const;
      const data: CopyData = { restaurants: [...restaurants].sort(byName), claims: {}, collection: {}, notes: {} };
      for (const row of claimRows) (data.claims[row.rid] ??= []).push(row.value);
      for (const row of noteRows) (data.notes[row.rid] ??= []).push(row.value);
      for (const list of Object.values(data.notes)) list.sort(newestFirst);
      for (const row of stateRows) data.collection[row.rid] = row.value;
      return { kind: "copy", meta: raw, data } as const;
    });
  } catch {
    return { kind: "none" };
  }
}

/** Checks inside a readwrite transaction that also has `control`, `optIn` and `meta` in scope. */
async function check(tx: IDBTransaction, id: CopyIdentity, expected: CopyToken, requireCopy: boolean): Promise<"ok" | ReplaceResult> {
  const control = (await result(tx.objectStore("control").get(EPOCH_KEY))) as { epoch?: unknown } | undefined;
  const epoch = typeof control?.epoch === "number" ? control.epoch : 0;
  if (epoch !== expected.epoch) return "cleared";
  if ((await result(tx.objectStore("optIn").get(id.uid))) === undefined) return "optedOut";
  const meta = (await result(tx.objectStore("meta").get(META_KEY))) as Partial<CopyMeta> | undefined;
  if (meta && (meta.uid !== id.uid || meta.householdId !== id.householdId)) return "otherCopy";
  if (requireCopy && !isMeta(meta)) return "noCopy";
  const revision = typeof meta?.revision === "number" ? meta.revision : 0;
  if (revision !== expected.revision) return "stale";
  return "ok";
}

async function abort(tx: IDBTransaction, done: Promise<void>): Promise<void> {
  try {
    tx.abort();
  } catch {
    // already finished
  }
  await done.catch(() => {});
}

function putRestaurant(tx: IDBTransaction, rid: string, claims: Claim[], notes: Note[], state: CollectionState | null): void {
  for (const c of claims) tx.objectStore("claims").put({ rid, id: c.id, value: c } satisfies ChildRow<Claim>);
  for (const n of notes) tx.objectStore("notes").put({ rid, id: n.id, value: n } satisfies ChildRow<Note>);
  if (state) tx.objectStore("collection").put({ rid, value: state } satisfies StateRow);
}

export async function replaceCopy(id: CopyIdentity & { displayName: string }, expected: CopyToken, data: CopyData, now: number): Promise<ReplaceResult> {
  if (!hasIndexedDb()) return "unavailable";
  try {
    return await withDb(async (db) => {
      const tx = db.transaction(ALL_STORES, "readwrite");
      const done = finished(tx);
      const verdict = await check(tx, id, expected, false);
      if (verdict !== "ok") {
        await abort(tx, done);
        return verdict;
      }
      for (const name of RECORD_STORES) tx.objectStore(name).clear();
      for (const r of data.restaurants) {
        tx.objectStore("restaurants").put(r);
        putRestaurant(tx, r.id, data.claims[r.id] ?? [], data.notes[r.id] ?? [], data.collection[r.id] ?? null);
      }
      const meta: CopyMeta = { uid: id.uid, householdId: id.householdId, displayName: id.displayName, revision: expected.revision + 1, downloadedAt: now, membershipCheckedAt: now, complete: true };
      tx.objectStore("meta").put(meta, META_KEY); // written last
      await done;
      return "written";
    });
  } catch (err) {
    return isQuota(err) ? "storageFull" : "unavailable";
  }
}

/** Partial refresh after a write: one restaurant, `null` when it no longer exists. Keeps downloadedAt. */
export async function replaceRestaurant(id: CopyIdentity, expected: CopyToken, rid: string, data: RestaurantData | null): Promise<ReplaceResult> {
  if (!hasIndexedDb()) return "unavailable";
  try {
    return await withDb(async (db) => {
      const tx = db.transaction(ALL_STORES, "readwrite");
      const done = finished(tx);
      const verdict = await check(tx, id, expected, true);
      if (verdict !== "ok") {
        await abort(tx, done);
        return verdict;
      }
      const meta = (await result(tx.objectStore("meta").get(META_KEY))) as CopyMeta;
      tx.objectStore("claims").delete(ridRange(rid));
      tx.objectStore("notes").delete(ridRange(rid));
      tx.objectStore("collection").delete(rid);
      tx.objectStore("restaurants").delete(rid);
      if (data) {
        tx.objectStore("restaurants").put(data.restaurant);
        putRestaurant(tx, rid, data.claims, data.notes, data.state);
      }
      tx.objectStore("meta").put({ ...meta, revision: meta.revision + 1 } satisfies CopyMeta, META_KEY);
      await done;
      return "written";
    });
  } catch (err) {
    return isQuota(err) ? "storageFull" : "unavailable";
  }
}

/** Renews the 30-day window. Writes only when meta exists and matches both ids; never creates it. */
export async function recordMembershipCheck(id: CopyIdentity, now: number): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    await withDb(async (db) => {
      const tx = db.transaction("meta", "readwrite");
      const done = finished(tx);
      const meta = await result(tx.objectStore("meta").get(META_KEY));
      if (isMeta(meta) && meta.uid === id.uid && meta.householdId === id.householdId) {
        tx.objectStore("meta").put({ ...meta, membershipCheckedAt: now } satisfies CopyMeta, META_KEY);
      }
      await done;
    });
  } catch {
    // The window is simply not renewed.
  }
}

/** One transaction: bump the epoch, delete meta and every record. Leaves opt-ins. Throws on failure. */
export async function clearCopy(): Promise<void> {
  if (!hasIndexedDb()) return;
  await withDb(async (db) => {
    const tx = db.transaction(["control", "meta", ...RECORD_STORES], "readwrite");
    const done = finished(tx);
    const control = (await result(tx.objectStore("control").get(EPOCH_KEY))) as { epoch?: unknown } | undefined;
    const epoch = typeof control?.epoch === "number" ? control.epoch : 0;
    tx.objectStore("control").put({ epoch: epoch + 1 }, EPOCH_KEY);
    tx.objectStore("meta").delete(META_KEY);
    for (const name of RECORD_STORES) tx.objectStore(name).clear();
    await done;
  });
  announceInvalidation();
}

export async function getOptIn(uid: string): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    return await withDb(async (db) => (await result(db.transaction("optIn", "readonly").objectStore("optIn").get(uid))) !== undefined);
  } catch {
    return false;
  }
}

/** Throws when storage is unavailable, so the switch can say "This device can't store an offline copy." */
export async function setOptIn(uid: string, enabled: boolean): Promise<void> {
  if (!hasIndexedDb()) throw new Error("IndexedDB unavailable");
  await withDb(async (db) => {
    const tx = db.transaction("optIn", "readwrite");
    const done = finished(tx);
    if (enabled) tx.objectStore("optIn").put({ uid, enabled: true });
    else tx.objectStore("optIn").delete(uid);
    await done;
  });
}

export async function clearAllOptIns(): Promise<void> {
  if (!hasIndexedDb()) return;
  await withDb(async (db) => {
    const tx = db.transaction("optIn", "readwrite");
    const done = finished(tx);
    tx.objectStore("optIn").clear();
    await done;
  });
}

/** Registered in device/registerCleaners.ts. Touches only the safebite-offline database. */
export const offlineCopyCleaner: DeviceCleaner = {
  name: "offlineCopy",
  async clear() {
    await clearCopy();
    await clearAllOptIns();
  },
};
```

If the jsdom-free node environment reports `structuredClone is not defined`, Node 22 has it globally — check `node --version` first; the file's `// @vitest-environment node` line must be the very first line.

- [ ] **Step 7: Run the store tests**

Run: `npm --prefix web exec vitest run src/offline/store.test.ts`
Expected: PASS (20). If the quota test fails because fake-indexeddb wraps `put` differently, spy on `IDBObjectStore.prototype.put` from `fake-indexeddb` (`import { IDBObjectStore } from "fake-indexeddb"`) instead of the global.

- [ ] **Step 8: Write the failing registration tests**

Create `web/src/device/registerCleaners.test.tsx` (it renders JSX):

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Module-graph guard (review P2-5): loading the registry must never load Firebase, or Auth would
// initialise before §3.8's persistence gate and fall back to memory-only for every start.
vi.mock("../firebase", () => { throw new Error("registerCleaners must not import ../firebase"); });
vi.mock("firebase/auth", () => { throw new Error("registerCleaners must not import firebase/auth"); });
vi.mock("firebase/firestore", () => { throw new Error("registerCleaners must not import firebase/firestore"); });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((d) => d.name ?? "");
}

describe("registerCleaners", () => {
  it("loads without Firebase and registers the offline cleaner", async () => {
    await expect(import("./registerCleaners")).resolves.toBeDefined();
    const { clearDeviceData } = await import("./cleanup");
    const { setOptIn, getOptIn } = await import("../offline/store");
    await setOptIn("ava-uid", true);
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    await expect(getOptIn("ava-uid")).resolves.toBe(false);
  });

  it("cleaner boundary: 5a's Auth intents, the deleted-UID record and Firebase Auth's database survive", async () => {
    await import("./registerCleaners");
    const { clearDeviceData } = await import("./cleanup");
    localStorage.setItem("safebite.authCleanup.ava-uid:confirmed", "1");
    localStorage.setItem("safebite.deletedUids", JSON.stringify(["gone-uid"]));
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("firebaseLocalStorageDb", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      open.onsuccess = () => { open.result.close(); resolve(); };
    });
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(localStorage.getItem("safebite.authCleanup.ava-uid:confirmed")).toBe("1");
    expect(localStorage.getItem("safebite.deletedUids")).toBe(JSON.stringify(["gone-uid"]));
    expect(await databaseNames()).toContain("firebaseLocalStorageDb");
  });

  it("start-up with a pending clear wipes a seeded copy before the app may render (spec §3.9 Tests)", async () => {
    await import("./registerCleaners");
    const { render, waitFor } = await import("@testing-library/react");
    const { DeviceClearingScreen } = await import("./DeviceClearingScreen");
    const { readMeta, readToken, replaceCopy, setOptIn } = await import("../offline/store");
    await setOptIn("ava-uid", true);
    await replaceCopy({ uid: "ava-uid", householdId: "home", displayName: "Ava" }, await readToken(), { restaurants: [], claims: {}, collection: {}, notes: {} }, Date.now());
    localStorage.setItem("safebite.pendingClear.previous-run", "1");
    let metaWhenCleared: unknown = "not called";
    const onCleared = async () => { metaWhenCleared = await readMeta(); };
    render(<DeviceClearingScreen onCleared={() => void onCleared()} />);
    await waitFor(() => expect(metaWhenCleared).toBeNull());
  });
});
```

Run: `npm --prefix web exec vitest run src/device/registerCleaners.test.tsx`
Expected: FAIL — the first test's opt-in survives (nothing registered).

- [ ] **Step 9: Register the cleaner**

Replace `web/src/device/registerCleaners.ts`:

```ts
import { offlineCopyCleaner } from "../offline/store";
import { registerDeviceCleaner } from "./cleanup";

/**
 * The one place device cleaners are registered, imported first by main.tsx so a pending clear at
 * start-up runs every cleaner (spec §3.8). 5b registers the offline copy (spec §3.9). Nothing
 * imported here may load Firebase (review P2-5; guarded by registerCleaners.test.tsx).
 */
registerDeviceCleaner(offlineCopyCleaner);
```

Run: `npm --prefix web exec vitest run src/device/registerCleaners.test.tsx`
Expected: PASS (3).

- [ ] **Step 10: Write the cross-tab browser test (empirical stop 4)**

Create `web/e2e/offline-harness.html`:

```html
<!doctype html><html lang="en"><head><title>Local offline-copy harness</title></head><body></body></html>
```

Create `web/e2e/offline-store.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

// Empirical stop 4 (spec §3.9): IndexedDB serialises overlapping readwrite transactions across
// documents, so a refresh's replacement queued behind another tab's clear sees the new epoch.
async function harness(page: Page) {
  await page.goto("/e2e/offline-harness.html");
}

test("stop 4: a replacement queued behind another tab's clear aborts as cleared", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await harness(a);
  await harness(b);
  const token = await a.evaluate(async () => {
    const store = await import(/* @vite-ignore */ "/src/offline/store.ts");
    await store.setOptIn("ava-uid", true);
    return store.readToken();
  });
  // Tab B holds a readwrite transaction over control for ~800 ms, then bumps the epoch.
  const holding = b.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open("safebite-offline");
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(["control", "meta", "restaurants", "claims", "collection", "notes"], "readwrite");
      const control = tx.objectStore("control");
      const until = performance.now() + 800;
      const spin = () => {
        const r = control.get("epoch");
        r.onsuccess = () => {
          if (performance.now() < until) { spin(); return; }
          const epoch = typeof r.result?.epoch === "number" ? r.result.epoch : 0;
          control.put({ epoch: epoch + 1 }, "epoch");
        };
      };
      spin();
      tx.oncomplete = () => { db.close(); resolve(performance.now()); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await a.waitForTimeout(100); // B's transaction is active
  const outcome = await a.evaluate(async (t) => {
    const store = await import(/* @vite-ignore */ "/src/offline/store.ts");
    const data = { restaurants: [], claims: {}, collection: {}, notes: {} };
    return store.replaceCopy({ uid: "ava-uid", householdId: "home", displayName: "Ava" }, t, data, Date.now());
  }, token);
  await holding;
  expect(outcome).toBe("cleared");
  await expect(a.evaluate(async () => (await import(/* @vite-ignore */ "/src/offline/store.ts")).readMeta())).resolves.toBeNull();
});
```

- [ ] **Step 11: Run the web suite, typecheck and the browser suite**

Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 26 new (3 signals, 20 store, 3 registration).
Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: 59 passed (58 + stop 4). Record "stop 4 holds" in the ledger.

- [ ] **Step 12: Commit**

```bash
git add web/package.json web/package-lock.json web/src/offline web/src/device/registerCleaners.ts web/src/device/registerCleaners.test.tsx web/e2e/offline-harness.html web/e2e/offline-store.spec.ts planning/audits/2026-10-10-plan-5b-execution-ledger.md
git commit -m "feat(offline): IndexedDB copy store with epoch and revision guards; register its cleaner

Spec §3.9 data model and units: one copy per device tagged by account and
household, single-transaction replace/partial replace that re-checks epoch,
opt-in, identity and revision (cleanup and newer work win), conditional
membership renewal, single-transaction clear with cross-tab announcement, and
the offlineCopy cleaner registered in registerCleaners without loading Firebase.
Empirical stop 4 (cross-tab serialisation) proven in Chromium.
Web unit: previous + 26. Browser: previous + 1.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 4: Eligibility and the copy session (serving state, denial hook, cross-tab invalidation)

Spec §3.9 "Read source" (usable copy), "Cross-tab invalidation" (review R2-5), 30-day re-check in an open session, Review Focus 5.

**Files:**
- Create: `web/src/offline/eligibility.ts`, `web/src/offline/eligibility.test.ts`
- Create: `web/src/offline/session.ts`, `web/src/offline/session.test.ts`

**Interfaces:**
- Consumes: `readCopy`, `getOptIn`, `clearCopy`, `setOptIn`, `replaceCopy`, `readToken` (Task 3); `onInvalidation` (Task 3); `pendingClear`, `clearDeviceData` (Task 2); `resetDocument` from `auth/resetDocument.ts`.
- Produces (`eligibility.ts`): `type CopyIneligible = "none" | "otherCopy" | "optedOut" | "expired" | "pendingClear"`; `copyUsable(meta: CopyMeta | null, id: CopyIdentity, optedIn: boolean, pending: boolean, now: number): true | CopyIneligible`; `copyIsOld(meta: Pick<CopyMeta, "downloadedAt">, now: number): boolean`.
- Produces (`session.ts`): `interface CopySession { uid: string; householdId: string; mode: "member" | "offlineMember" }`; `setCopySession(s: CopySession | null): void`; `getCopySession(): CopySession | null`; `isServingCopy(): boolean`; `beginServingCopy(): () => void`; `lastServedMeta(): CopyMeta | null`; `subscribeCopySession(cb: () => void): () => void`; `copySessionVersion(): number`; `setDeniedHandler(h: (() => void) | null): void`; `reportDenied(): void`; `loadUsableCopy(now?: number): Promise<{ meta: CopyMeta; data: CopyData } | null>`; `checkServedCopy(now?: number): Promise<void>`; `startCopyWatch(): () => void`.

- [ ] **Step 1: Write the failing eligibility tests**

Create `web/src/offline/eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { copyIsOld, copyUsable } from "./eligibility";
import { COPY_MAX_AGE_MS, STALE_BANNER_MS, type CopyMeta } from "./types";

const NOW = Date.UTC(2026, 9, 10);
const ID = { uid: "ava-uid", householdId: "home" };
const meta = (checkedAgo: number, downloadedAgo = checkedAgo): CopyMeta => ({
  uid: "ava-uid", householdId: "home", displayName: "Ava", revision: 1,
  downloadedAt: NOW - downloadedAgo, membershipCheckedAt: NOW - checkedAgo, complete: true,
});

describe("copyUsable", () => {
  it("accepts a matching, opted-in copy checked within 30 days (inclusive)", () => {
    expect(copyUsable(meta(0), ID, true, false, NOW)).toBe(true);
    expect(copyUsable(meta(COPY_MAX_AGE_MS), ID, true, false, NOW)).toBe(true);
  });
  it("refuses just past 30 days", () => {
    expect(copyUsable(meta(COPY_MAX_AGE_MS + 1), ID, true, false, NOW)).toBe("expired");
  });
  it("refuses a membership check in the future, or a clock set back before it (Review Focus 5)", () => {
    expect(copyUsable(meta(-1), ID, true, false, NOW)).toBe("expired");
    expect(copyUsable(meta(0), ID, true, false, NOW - 60_000)).toBe("expired");
  });
  it("refuses another account or household, an opt-out, a pending clear and a missing copy", () => {
    expect(copyUsable(meta(0), { uid: "bogdan-uid", householdId: "home" }, true, false, NOW)).toBe("otherCopy");
    expect(copyUsable(meta(0), { uid: "ava-uid", householdId: "elsewhere" }, true, false, NOW)).toBe("otherCopy");
    expect(copyUsable(meta(0), ID, false, false, NOW)).toBe("optedOut");
    expect(copyUsable(meta(0), ID, true, true, NOW)).toBe("pendingClear");
    expect(copyUsable(null, ID, true, false, NOW)).toBe("none");
  });
});

describe("copyIsOld", () => {
  it("is old only beyond exactly 7 days", () => {
    expect(copyIsOld(meta(0, STALE_BANNER_MS), NOW)).toBe(false);
    expect(copyIsOld(meta(0, STALE_BANNER_MS + 1), NOW)).toBe(true);
  });
  it("a download time in the future is not old (Review Focus 5)", () => {
    expect(copyIsOld(meta(0, -60_000), NOW)).toBe(false);
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/eligibility.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement eligibility**

Create `web/src/offline/eligibility.ts`:

```ts
import { COPY_MAX_AGE_MS, STALE_BANNER_MS, type CopyIdentity, type CopyMeta } from "./types";

export type CopyIneligible = "none" | "otherCopy" | "optedOut" | "expired" | "pendingClear";

/**
 * A usable copy (spec §3.9 "Read source"): complete, tagged with this account and household,
 * opted in, no pending clear, and membership confirmed by the server within the last 30 days.
 * A check in the future counts as outside the window, so setting the clock back cannot extend it.
 */
export function copyUsable(meta: CopyMeta | null, id: CopyIdentity, optedIn: boolean, pending: boolean, now: number): true | CopyIneligible {
  if (pending) return "pendingClear";
  if (!meta) return "none";
  if (meta.uid !== id.uid || meta.householdId !== id.householdId) return "otherCopy";
  if (!optedIn) return "optedOut";
  const age = now - meta.membershipCheckedAt;
  if (age < 0 || age > COPY_MAX_AGE_MS) return "expired";
  return true;
}

/** The copy banner turns amber after 7 days. A download time in the future is not old. */
export function copyIsOld(meta: Pick<CopyMeta, "downloadedAt">, now: number): boolean {
  return now - meta.downloadedAt > STALE_BANNER_MS;
}
```

Run: `npm --prefix web exec vitest run src/offline/eligibility.test.ts`
Expected: PASS (6).

- [ ] **Step 3: Write the failing session tests**

Create `web/src/offline/session.test.ts`:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resetDocument, clearDeviceData } = vi.hoisted(() => ({ resetDocument: vi.fn(), clearDeviceData: vi.fn(async () => ({ failed: [] })) }));
vi.mock("../auth/resetDocument", () => ({ resetDocument }));
vi.mock("../device/cleanup", async (importOriginal) => ({ ...(await importOriginal<typeof import("../device/cleanup")>()), clearDeviceData }));

import {
  beginServingCopy, checkServedCopy, getCopySession, isServingCopy, loadUsableCopy, reportDenied,
  setCopySession, setDeniedHandler, startCopyWatch,
} from "./session";
import { readToken, replaceCopy, setOptIn } from "./store";
import { COPY_MAX_AGE_MS } from "./types";

const ID = { uid: "ava-uid", householdId: "home" };
const NOW = Date.now();

async function seedCopy(at = NOW) {
  await setOptIn("ava-uid", true);
  await replaceCopy({ ...ID, displayName: "Ava" }, await readToken(), { restaurants: [], claims: {}, collection: {}, notes: {} }, at);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  setCopySession(null);
});
afterEach(() => {
  vi.clearAllMocks();
  setDeniedHandler(null);
});

describe("serving state", () => {
  it("offlineMember always serves the copy; member serves while any watcher holds a lease", () => {
    expect(isServingCopy()).toBe(false);
    setCopySession({ ...ID, mode: "offlineMember" });
    expect(isServingCopy()).toBe(true);
    setCopySession({ ...ID, mode: "member" });
    expect(isServingCopy()).toBe(false);
    const release = beginServingCopy();
    expect(isServingCopy()).toBe(true);
    release();
    release(); // idempotent
    expect(isServingCopy()).toBe(false);
    expect(getCopySession()).toEqual({ ...ID, mode: "member" });
  });

  it("reportDenied reaches the registered handler", () => {
    const handler = vi.fn();
    setDeniedHandler(handler);
    reportDenied();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("loadUsableCopy", () => {
  it("returns the copy for the session's account and household", async () => {
    await seedCopy();
    setCopySession({ ...ID, mode: "member" });
    await expect(loadUsableCopy()).resolves.toMatchObject({ meta: { uid: "ava-uid" } });
  });

  it("returns null without a session, for another account, past 30 days, or with a pending clear", async () => {
    await seedCopy();
    await expect(loadUsableCopy()).resolves.toBeNull();
    setCopySession({ uid: "bogdan-uid", householdId: "home", mode: "member" });
    await expect(loadUsableCopy()).resolves.toBeNull();
    setCopySession({ ...ID, mode: "member" });
    await expect(loadUsableCopy(NOW + COPY_MAX_AGE_MS + 1)).resolves.toBeNull();
    localStorage.setItem("safebite.pendingClear.x", "1");
    await expect(loadUsableCopy()).resolves.toBeNull();
  });

  it("a malformed copy is wiped through the cleanup path and never returned", async () => {
    await seedCopy();
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("safebite-offline");
      open.onsuccess = () => {
        const tx = open.result.transaction("meta", "readwrite");
        tx.objectStore("meta").put({ broken: true }, "copy");
        tx.oncomplete = () => { open.result.close(); resolve(); };
      };
    });
    setCopySession({ ...ID, mode: "member" });
    await expect(loadUsableCopy()).resolves.toBeNull();
    expect(clearDeviceData).toHaveBeenCalledTimes(1);
  });
});

describe("cross-tab invalidation (review R2-5)", () => {
  it("an invalidation signal resets a document that is showing copy data, and only then", async () => {
    const stop = startCopyWatch();
    setCopySession({ ...ID, mode: "member" });
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear.t", newValue: "1" }));
    expect(resetDocument).not.toHaveBeenCalled();
    setCopySession({ ...ID, mode: "offlineMember" });
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear.t", newValue: "1" }));
    expect(resetDocument).toHaveBeenCalledTimes(1);
    stop();
  });

  it("on resume, a copy that is no longer usable resets the document", async () => {
    await seedCopy();
    const stop = startCopyWatch();
    setCopySession({ ...ID, mode: "offlineMember" });
    await setOptIn("ava-uid", false); // another tab opted out while this one was suspended
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    stop();
  });

  it("the open-session check resets when the 30-day limit passes (review contract)", async () => {
    await seedCopy();
    setCopySession({ ...ID, mode: "offlineMember" });
    await checkServedCopy(NOW + 1000);
    expect(resetDocument).not.toHaveBeenCalled();
    await checkServedCopy(NOW + COPY_MAX_AGE_MS + 1);
    expect(resetDocument).toHaveBeenCalledTimes(1);
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the session**

Create `web/src/offline/session.ts`:

```ts
import { resetDocument } from "../auth/resetDocument";
import { clearDeviceData, pendingClear } from "../device/cleanup";
import { copyUsable } from "./eligibility";
import { onInvalidation } from "./signals";
import { getOptIn, readCopy } from "./store";
import { ELIGIBILITY_CHECK_MS, type CopyData, type CopyMeta } from "./types";

/**
 * This document's view of the offline copy (spec §3.9 "Read source", "Cross-tab invalidation").
 * AuthProvider sets the session; watchers take a lease while they show copy data. Firebase-free.
 */
export interface CopySession { uid: string; householdId: string; mode: "member" | "offlineMember" }

let session: CopySession | null = null;
let leases = 0;
let lastMeta: CopyMeta | null = null;
let version = 0;
const subscribers = new Set<() => void>();
let deniedHandler: (() => void) | null = null;

function notify(): void {
  version += 1;
  for (const cb of subscribers) cb();
}

export function setCopySession(next: CopySession | null): void {
  session = next;
  if (next === null) lastMeta = null;
  notify();
}

export function getCopySession(): CopySession | null {
  return session;
}

/** True while this document shows any copy data: always in offlineMember, else while a watcher holds a lease. */
export function isServingCopy(): boolean {
  return session?.mode === "offlineMember" || leases > 0;
}

export function beginServingCopy(): () => void {
  leases += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    leases -= 1;
    notify();
  };
}

/** The meta of the copy last served in this document (for the banner's age). */
export function lastServedMeta(): CopyMeta | null {
  return lastMeta;
}

export function subscribeCopySession(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function copySessionVersion(): number {
  return version;
}

export function setDeniedHandler(handler: (() => void) | null): void {
  deniedHandler = handler;
}

/** A live listener reported permission-denied: AuthProvider re-reads membership from the server (review R2-4). */
export function reportDenied(): void {
  deniedHandler?.();
}

/** The usable copy for this session, or null. A malformed copy is wiped through the cleanup path. */
export async function loadUsableCopy(now: number = Date.now()): Promise<{ meta: CopyMeta; data: CopyData } | null> {
  const current = session;
  if (!current) return null;
  const read = await readCopy(current);
  if (read.kind === "malformed") {
    void clearDeviceData();
    return null;
  }
  if (read.kind !== "copy") return null;
  const usable = copyUsable(read.meta, current, await getOptIn(current.uid), pendingClear(), now);
  if (usable !== true) return null;
  if (lastMeta?.revision !== read.meta.revision || lastMeta.downloadedAt !== read.meta.downloadedAt) {
    lastMeta = read.meta;
    notify();
  }
  return { meta: read.meta, data: read.data };
}

/** Resets this document if it shows copy data that may no longer be shown. */
export async function checkServedCopy(now: number = Date.now()): Promise<void> {
  if (!isServingCopy()) return;
  const copy = await loadUsableCopy(now);
  if (copy === null && isServingCopy()) resetDocument();
}

/** Started once per document by AuthProvider. Returns a stop function. */
export function startCopyWatch(): () => void {
  const stopSignals = onInvalidation(() => {
    if (isServingCopy()) resetDocument();
  });
  const onResume = () => {
    if (document.visibilityState !== "hidden") void checkServedCopy();
  };
  document.addEventListener("visibilitychange", onResume);
  window.addEventListener("pageshow", onResume);
  const timer = setInterval(() => void checkServedCopy(), ELIGIBILITY_CHECK_MS);
  return () => {
    stopSignals();
    document.removeEventListener("visibilitychange", onResume);
    window.removeEventListener("pageshow", onResume);
    clearInterval(timer);
  };
}
```

- [ ] **Step 5: Run the session tests**

Run: `npm --prefix web exec vitest run src/offline/session.test.ts`
Expected: PASS (8).

- [ ] **Step 6: Run the web suite and typecheck**

Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 14 new.

- [ ] **Step 7: Commit**

```bash
git add web/src/offline/eligibility.ts web/src/offline/eligibility.test.ts web/src/offline/session.ts web/src/offline/session.test.ts
git commit -m "feat(offline): copy eligibility and the per-document copy session

Spec §3.9: a usable copy is complete, same account and household, opted in,
no pending clear and checked within 30 days (future checks expire). The
session tracks offlineMember and watcher leases, routes listener denials to
AuthProvider, wipes a malformed copy through the cleanup path, and resets a
document showing copy data on a cross-tab signal, on resume or when the
30-day limit passes during an open session (review R2-5).
Web unit: previous + 14.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 5: Server-pinned membership read and its classification

Spec §3.9 "Server reads" (review P1-1) and the "Membership read" classification. This task changes no visible behaviour: "no answer" still shows today's error screen until Task 6.

**Files:**
- Create: `web/src/auth/membershipCheck.ts`, `web/src/auth/membershipCheck.test.ts`
- Modify: `web/src/auth/AuthProvider.tsx` (replace `readDoc` and the body of `stateForUser`)
- Modify: `web/src/auth/AuthProvider.test.tsx` (mock `getDocFromServer`)

**Interfaces:**
- Consumes: `resolveMembership` from `auth/membership.ts`; `db` from `../firebase`.
- Produces: `MEMBERSHIP_TIMEOUT_MS = 6000`; `type MembershipAnswer = { kind: "member"; householdId: string; displayName: string } | { kind: "notMember"; canDeleteSignIn: boolean } | { kind: "deletionPending" } | { kind: "noAnswer" }`; `readMembershipFromServer(uid: string): Promise<MembershipAnswer>` (rejects only for unexpected failures); `membershipWithTimeout(uid: string, timeoutMs?: number): { first: Promise<MembershipAnswer>; late: Promise<MembershipAnswer> }`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/auth/membershipCheck.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  getDocFromServer: (ref: { path: string }) => read(ref.path),
}));

import { MEMBERSHIP_TIMEOUT_MS, membershipWithTimeout, readMembershipFromServer } from "./membershipCheck";

const snap = (data: Record<string, unknown> | undefined, fromCache = false) => ({ exists: () => data !== undefined, data: () => data, metadata: { fromCache } });
const err = (code: string) => Object.assign(new Error(code), { code });

function member() {
  read.mockImplementation(async (path: string) => {
    if (path === "users/ava-uid") return snap({ householdId: "home", displayName: "Ava" });
    if (path === "households/home") return snap({ memberIds: ["ava-uid"] });
    return snap(undefined);
  });
}

beforeEach(() => read.mockReset());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("readMembershipFromServer", () => {
  it("answers member from server snapshots", async () => {
    member();
    await expect(readMembershipFromServer("ava-uid")).resolves.toEqual({ kind: "member", householdId: "home", displayName: "Ava" });
  });

  it("treats permission-denied as a server answer: not a member", async () => {
    read.mockRejectedValue(err("permission-denied"));
    await expect(readMembershipFromServer("x")).resolves.toEqual({ kind: "notMember", canDeleteSignIn: true });
  });

  it("answers deletionPending when the caller's deletion record exists", async () => {
    read.mockImplementation(async (path: string) => (path === "accountDeletions/x" ? snap({ step: 2 }) : snap(undefined)));
    await expect(readMembershipFromServer("x")).resolves.toEqual({ kind: "deletionPending" });
  });

  it.each(["unavailable", "deadline-exceeded"])("%s is no answer", async (code) => {
    read.mockRejectedValue(err(code));
    await expect(readMembershipFromServer("x")).resolves.toEqual({ kind: "noAnswer" });
  });

  it("a snapshot served from cache is never a server answer (review P1-1)", async () => {
    read.mockResolvedValue(snap({ householdId: "home", displayName: "Ava" }, true));
    await expect(readMembershipFromServer("ava-uid")).resolves.toEqual({ kind: "noAnswer" });
  });

  it("any other failure rejects", async () => {
    read.mockRejectedValue(err("internal"));
    await expect(readMembershipFromServer("x")).rejects.toThrow("internal");
  });
});

describe("membershipWithTimeout", () => {
  it("answers noAnswer at the timeout and still delivers the late answer", async () => {
    vi.useFakeTimers();
    let release!: (v: unknown) => void;
    read.mockImplementation((path: string) => (path === "users/ava-uid" ? new Promise((r) => { release = r; }) : Promise.resolve(snap({ memberIds: ["ava-uid"] }))));
    const { first, late } = membershipWithTimeout("ava-uid");
    await vi.advanceTimersByTimeAsync(MEMBERSHIP_TIMEOUT_MS - 1);
    let settled = false;
    void first.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toEqual({ kind: "noAnswer" });
    release(snap({ householdId: "home", displayName: "Ava" }));
    await expect(late).resolves.toEqual({ kind: "member", householdId: "home", displayName: "Ava" });
  });

  it("answers noAnswer at once when the browser reports offline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: false });
    read.mockImplementation(() => new Promise(() => {}));
    const { first } = membershipWithTimeout("ava-uid");
    await vi.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toEqual({ kind: "noAnswer" });
  });
});
```

Run: `npm --prefix web exec vitest run src/auth/membershipCheck.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement**

Create `web/src/auth/membershipCheck.ts`:

```ts
import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "../firebase";
import { resolveMembership } from "./membership";

/**
 * The membership read (spec §3.9 "Server reads", review P1-1). Pinned to the server: the memory
 * cache can answer a default-source read for any document a live listener holds, so persistence
 * being off is not enough. permission-denied is a server answer (not a member); unavailable,
 * deadline-exceeded and cache-served snapshots are "no answer"; anything else rejects.
 */
export const MEMBERSHIP_TIMEOUT_MS = 6000;

export type MembershipAnswer =
  | { kind: "member"; householdId: string; displayName: string }
  | { kind: "notMember"; canDeleteSignIn: boolean }
  | { kind: "deletionPending" }
  | { kind: "noAnswer" };

class NoAnswer extends Error {}
const NO_ANSWER = new Set(["unavailable", "deadline-exceeded"]);

async function readServerDoc(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const snapshot = await getDocFromServer(doc(db, path));
    if (snapshot.metadata.fromCache) throw new NoAnswer();
    return snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined;
  } catch (err) {
    if (err instanceof NoAnswer) throw err;
    const code = (err as { code?: unknown }).code;
    if (code === "permission-denied") return undefined; // the rules deny exactly when not a member
    if (typeof code === "string" && NO_ANSWER.has(code)) throw new NoAnswer();
    throw err;
  }
}

export async function readMembershipFromServer(uid: string): Promise<MembershipAnswer> {
  try {
    const userDoc = await readServerDoc(`users/${uid}`);
    const householdId = userDoc?.householdId;
    const householdDoc = typeof householdId === "string" ? await readServerDoc(`households/${householdId}`) : undefined;
    const membership = resolveMembership(uid, userDoc, householdDoc);
    if (membership.kind === "member") return { kind: "member", householdId: membership.householdId, displayName: membership.displayName };
    // An interrupted account deletion (spec §3.8): the owner may read their own record.
    if ((await readServerDoc(`accountDeletions/${uid}`)) !== undefined) return { kind: "deletionPending" };
    return { kind: "notMember", canDeleteSignIn: userDoc === undefined };
  } catch (err) {
    if (err instanceof NoAnswer) return { kind: "noAnswer" };
    throw err;
  }
}

/**
 * `first` settles with the read or with "no answer" at the timeout (at once when the browser
 * reports offline); `late` is the read itself, never cancelled, so a later answer can still be
 * applied (review P3-7). Callers must handle `late`'s rejection.
 */
export function membershipWithTimeout(uid: string, timeoutMs: number = MEMBERSHIP_TIMEOUT_MS): { first: Promise<MembershipAnswer>; late: Promise<MembershipAnswer> } {
  const late = readMembershipFromServer(uid);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const timeout = new Promise<MembershipAnswer>((resolve) => {
    setTimeout(() => resolve({ kind: "noAnswer" }), offline ? 0 : timeoutMs);
  });
  return { first: Promise.race([late, timeout]), late };
}
```

Run: `npm --prefix web exec vitest run src/auth/membershipCheck.test.ts`
Expected: PASS (9).

- [ ] **Step 3: Use it in AuthProvider**

In `web/src/auth/AuthProvider.tsx`:
- Remove the `doc, getDoc` import from `firebase/firestore`, the `db` import, the `resolveMembership` import and the whole `readDoc` function.
- Add `import { readMembershipFromServer } from "./membershipCheck";`.
- Replace `stateForUser` with:

```ts
async function stateForUser(user: User): Promise<AuthState> {
  if (isDeletedUid(user.uid)) return { status: "deletedSession", uid: user.uid, email: user.email };
  const answer = await readMembershipFromServer(user.uid);
  switch (answer.kind) {
    case "member":
      return { status: "member", uid: user.uid, email: user.email, householdId: answer.householdId, displayName: answer.displayName };
    case "deletionPending":
      return { status: "deletionPending", uid: user.uid, email: user.email };
    case "notMember":
      return { status: "notMember", uid: user.uid, email: user.email, canDeleteSignIn: answer.canDeleteSignIn };
    case "noAnswer":
      // Task 6 opens the offline copy here; until then "no answer" is today's error screen.
      throw new Error("no answer");
  }
}
```

In `web/src/auth/AuthProvider.test.tsx`, change the `firebase/firestore` mock to:

```ts
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  getDocFromServer: (ref: { path: string }) => getDocMock(ref.path),
}));
```

and the `snap` helper to:

```ts
function snap(data: Record<string, unknown> | undefined) {
  return { exists: () => data !== undefined, data: () => data, metadata: { fromCache: false } };
}
```

- [ ] **Step 4: Run the AuthProvider tests and the web suite**

Run: `npm --prefix web exec vitest run src/auth/AuthProvider.test.tsx`
Expected: PASS (22, unchanged behaviour; the "unavailable" test still reaches the error state).
Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 9 new.

- [ ] **Step 5: Run the browser suite**

Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: all pass (every sign-in now reads membership with `getDocFromServer`).

- [ ] **Step 6: Commit**

```bash
git add web/src/auth/membershipCheck.ts web/src/auth/membershipCheck.test.ts web/src/auth/AuthProvider.tsx web/src/auth/AuthProvider.test.tsx
git commit -m "feat(auth): server-pinned membership read with timeout and late answer

Spec §3.9 'Server reads' (review P1-1): users, household and deletion-record
reads use getDocFromServer; a cache-served snapshot, unavailable or
deadline-exceeded is 'no answer'; permission-denied stays 'not a member'.
membershipWithTimeout races the read against 6 s (at once when offline) and
keeps the read for a late answer. AuthProvider uses it; no visible change yet.
Web unit: previous + 9.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 6: `offlineMember` — startup table, household move, wipe on loss, late answers, retries, denials

Spec §3.9 "Startup and the `offlineMember` state" (membership table, timeout, late answer, clock, `displayName`, leaving `offlineMember`), "Read source" (listener denial, review R2-4), rulings 5 and 8, reviews P2-4, P3-7.

**Files:**
- Create: `web/src/offline/decide.ts`, `web/src/offline/decide.test.ts`
- Modify: `web/src/auth/AuthProvider.tsx` (full replacement below), `web/src/auth/AuthProvider.test.tsx`
- Modify: `web/src/records/useMember.ts`; Create: `web/src/records/useMember.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `readMeta`, `getOptIn`, `clearCopy`, `recordMembershipCheck` (Task 3); `copyUsable` (Task 4); `setCopySession`, `isServingCopy`, `setDeniedHandler`, `startCopyWatch` (Task 4); `membershipWithTimeout`, `MembershipAnswer` (Task 5); `pendingClear`, `clearDeviceData` (Task 2).
- Produces (`offline/decide.ts`): `type NoAnswerOutcome = { kind: "open"; householdId: string; displayName: string; downloadedAt: number } | { kind: "expired" } | { kind: "none" }`; `decideNoAnswer(uid: string, now: number): Promise<NoAnswerOutcome>`; `prepareMemberCopy(uid: string, householdId: string, now: number): Promise<{ householdChanged: boolean }>`.
- Produces (`AuthState`): new variant `{ status: "offlineMember"; uid: string; email: string | null; householdId: string; displayName: string; downloadedAt: number; provisional?: true }` (`provisional` is set by Task 7); `member` gains optional `householdChanged?: true`. Exported constants `NO_ANSWER_MESSAGE`, `EXPIRED_MESSAGE`.
- Produces (`useMember()`): unchanged return type; also accepts `offlineMember`.

- [ ] **Step 1: Write the failing decision tests**

Create `web/src/offline/decide.test.ts`:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { decideNoAnswer, prepareMemberCopy } from "./decide";
import { readMeta, readToken, replaceCopy, setOptIn } from "./store";
import { COPY_MAX_AGE_MS } from "./types";

const NOW = Date.now();
const empty = { restaurants: [], claims: {}, collection: {}, notes: {} };

async function seed(householdId = "home", checkedAt = NOW, uid = "ava-uid") {
  await setOptIn(uid, true);
  await replaceCopy({ uid, householdId, displayName: "Ava" }, await readToken(), empty, checkedAt);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

describe("decideNoAnswer", () => {
  it("opens a usable copy for the signed-in account", async () => {
    await seed();
    await expect(decideNoAnswer("ava-uid", NOW)).resolves.toEqual({ kind: "open", householdId: "home", displayName: "Ava", downloadedAt: NOW });
  });
  it("reports an expired copy separately, and nothing for another account's copy", async () => {
    await seed("home", NOW - COPY_MAX_AGE_MS - 1);
    await expect(decideNoAnswer("ava-uid", NOW)).resolves.toEqual({ kind: "expired" });
    await expect(decideNoAnswer("bogdan-uid", NOW)).resolves.toEqual({ kind: "none" });
  });
  it("a pending clear blocks opening", async () => {
    await seed();
    localStorage.setItem("safebite.pendingClear.t", "1");
    await expect(decideNoAnswer("ava-uid", NOW)).resolves.toEqual({ kind: "none" });
  });
});

describe("prepareMemberCopy", () => {
  it("a different household clears the copy and reports the change to an opted-in account (ruling 8)", async () => {
    await seed("old-home");
    await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: true });
    await expect(readMeta()).resolves.toBeNull();
  });
  it("another account's leftover copy is cleared silently; a matching copy is renewed", async () => {
    await seed("home", NOW - 1000, "bogdan-uid");
    await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: false });
    await expect(readMeta()).resolves.toBeNull();
    await seed("home", NOW - 1000);
    await prepareMemberCopy("ava-uid", "home", NOW);
    expect((await readMeta())!.membershipCheckedAt).toBe(NOW);
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/decide.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the decisions**

Create `web/src/offline/decide.ts`:

```ts
import { pendingClear } from "../device/cleanup";
import { copyUsable } from "./eligibility";
import { clearCopy, getOptIn, readMeta, recordMembershipCheck } from "./store";

/** Start-up decisions over the device copy (spec §3.9 membership table). Firebase-free. */
export type NoAnswerOutcome =
  | { kind: "open"; householdId: string; displayName: string; downloadedAt: number }
  | { kind: "expired" }
  | { kind: "none" };

/** The server could not answer: open the copy only if it is usable for this account. */
export async function decideNoAnswer(uid: string, now: number): Promise<NoAnswerOutcome> {
  const meta = await readMeta();
  if (!meta || meta.uid !== uid) return { kind: "none" };
  const verdict = copyUsable(meta, { uid, householdId: meta.householdId }, await getOptIn(uid), pendingClear(), now);
  if (verdict === true) return { kind: "open", householdId: meta.householdId, displayName: meta.displayName, downloadedAt: meta.downloadedAt };
  return verdict === "expired" ? { kind: "expired" } : { kind: "none" };
}

/**
 * The server confirmed membership of `householdId`. A copy tagged with another household or
 * account is cleared first (review P2-4, ruling 8); then a matching copy's 30-day window is
 * renewed (never creating meta).
 */
export async function prepareMemberCopy(uid: string, householdId: string, now: number): Promise<{ householdChanged: boolean }> {
  const meta = await readMeta();
  let householdChanged = false;
  if (meta && (meta.uid !== uid || meta.householdId !== householdId)) {
    householdChanged = meta.uid === uid && (await getOptIn(uid));
    try {
      await clearCopy();
    } catch {
      // Reads refuse a mismatched copy anyway; the next start retries the clear.
    }
  }
  await recordMembershipCheck({ uid, householdId }, now);
  return { householdChanged };
}
```

Run: `npm --prefix web exec vitest run src/offline/decide.test.ts`
Expected: PASS (5).

- [ ] **Step 3: Write the failing AuthProvider tests**

In `web/src/auth/AuthProvider.test.tsx`:
- Add at the top: `import "fake-indexeddb/auto";` and `import { IDBFactory } from "fake-indexeddb";`.
- Add a hoisted override and a partial mock of the membership module, after the existing `vi.mock` lines:

```ts
const t = vi.hoisted(() => ({ timeout: undefined as number | undefined }));
vi.mock("./membershipCheck", async (importOriginal) => {
  const real = await importOriginal<typeof import("./membershipCheck")>();
  return { ...real, membershipWithTimeout: (uid: string) => real.membershipWithTimeout(uid, t.timeout ?? real.MEMBERSHIP_TIMEOUT_MS) };
});
```

- Add imports after `import { AuthProvider, useAuth } from "./AuthProvider";`:

```ts
import { auth as authMock } from "../firebase";
import { getCopySession, reportDenied, setCopySession } from "../offline/session";
import { readMeta, readToken, replaceCopy, setOptIn } from "../offline/store";
import { COPY_MAX_AGE_MS } from "../offline/types";
import { EXPIRED_MESSAGE, NO_ANSWER_MESSAGE } from "./AuthProvider";
```

- In `beforeEach` add: `globalThis.indexedDB = new IDBFactory(); localStorage.clear(); setCopySession(null); t.timeout = undefined; (authMock as { currentUser?: unknown }).currentUser = undefined;`
- Append:

```ts
const unavailable = () => Object.assign(new Error("unavailable"), { code: "unavailable" });
const AVA = { uid: "ava-uid", email: "ava@safebite.test" };

async function seedCopy(householdId = "home", checkedAt = Date.now()) {
  await setOptIn("ava-uid", true);
  await replaceCopy({ uid: "ava-uid", householdId, displayName: "Ava" }, await readToken(), { restaurants: [], claims: {}, collection: {}, notes: {} }, checkedAt);
}

function memberDocs() {
  getDocMock.mockImplementation(async (path: string) => {
    if (path === "users/ava-uid") return snap({ householdId: "home", displayName: "Ava" });
    if (path === "households/home") return snap({ name: "Home", memberIds: ["ava-uid"] });
    return snap(undefined);
  });
}

function stateText() {
  return screen.getByTestId("state").textContent ?? "";
}

describe("AuthProvider offline (spec §3.9)", () => {
  it("no answer with a usable copy opens offlineMember from the copy", async () => {
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    expect(stateText()).toContain('"householdId":"home"');
    expect(stateText()).toContain('"displayName":"Ava"');
    expect(getCopySession()).toEqual({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
  });

  it("no answer with a copy past 30 days says it needs a connection", async () => {
    await seedCopy("home", Date.now() - COPY_MAX_AGE_MS - 1000);
    getDocMock.mockRejectedValue(unavailable());
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain(EXPIRED_MESSAGE));
  });

  it("no answer with another account's copy is the plain membership error", async () => {
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "bogdan-uid", email: "bogdan@safebite.test" });
    await waitFor(() => expect(stateText()).toContain(NO_ANSWER_MESSAGE));
  });

  it("a member answer renews the 30-day window", async () => {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await seedCopy("home", old);
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    await waitFor(async () => expect((await readMeta())!.membershipCheckedAt).toBeGreaterThan(old));
  });

  it("a member of a different household loses the old copy and is told (ruling 8)", async () => {
    await seedCopy("old-home");
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"householdChanged":true'));
    await expect(readMeta()).resolves.toBeNull();
  });

  it("a confirmed loss of access wipes the device before showing the screen", async () => {
    getDocMock.mockImplementation(async () => snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"notMember"'));
    expect(clearDeviceData).toHaveBeenCalledTimes(1);
  });

  it("a late member answer after the timeout switches offlineMember to member in place (review P3-7)", async () => {
    t.timeout = 50;
    await seedCopy();
    const slow = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => (path === "users/ava-uid" ? slow.promise : Promise.resolve(snap({ name: "Home", memberIds: ["ava-uid"] }))));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    slow.resolve(snap({ householdId: "home", displayName: "Ava" }));
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("a late not-a-member answer wipes the copy and resets an offline session", async () => {
    t.timeout = 50;
    await seedCopy();
    const slow = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => (path === "users/ava-uid" ? slow.promise : Promise.resolve(snap(undefined))));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    slow.resolve(snap(undefined));
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    expect(clearDeviceData).toHaveBeenCalled();
  });

  it("in offlineMember, the online event re-checks membership quietly", async () => {
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    memberDocs();
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
  });

  it("a listener denial while member re-reads membership once (review R2-4)", async () => {
    memberDocs();
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    getDocMock.mockReset();
    getDocMock.mockImplementation(async () => snap(undefined));
    reportDenied();
    reportDenied();
    await waitFor(() => expect(stateText()).toContain('"notMember"'));
    expect(getDocMock.mock.calls.filter(([p]) => p === "users/ava-uid")).toHaveLength(1);
    expect(clearDeviceData).toHaveBeenCalled();
  });
});
```

Run: `npm --prefix web exec vitest run src/auth/AuthProvider.test.tsx`
Expected: FAIL — `EXPIRED_MESSAGE` is not exported and the new states never appear.

- [ ] **Step 4: Replace AuthProvider**

Replace `web/src/auth/AuthProvider.tsx` with:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "../firebase";
import { forgetAuthGuard } from "../account/authCleanupGuard";
import { DELETED_UIDS_KEY, forgetDeletedUid, isDeletedUid } from "../account/deletedSessions";
import { discardDeletedNoticeUnlessFor } from "../account/storage";
import { clearDeviceData } from "../device/cleanup";
import { decideNoAnswer, prepareMemberCopy } from "../offline/decide";
import { isServingCopy, setCopySession, setDeniedHandler, startCopyWatch } from "../offline/session";
import { REFRESH_INTERVAL_MS } from "../offline/types";
import { membershipWithTimeout, type MembershipAnswer } from "./membershipCheck";
import { resetDocument } from "./resetDocument";

export type AuthState =
  | { status: "loading" }
  | { status: "resetting" }
  | { status: "signedOut" }
  | { status: "notMember"; uid: string; email: string | null; canDeleteSignIn: boolean }
  | { status: "deletionPending"; uid: string; email: string | null }
  | { status: "deletedSession"; uid: string; email: string | null }
  | { status: "member"; uid: string; email: string | null; householdId: string; displayName: string; householdChanged?: true }
  /** Reading the device copy because the server could not answer (spec §3.9). */
  | { status: "offlineMember"; uid: string; email: string | null; householdId: string; displayName: string; downloadedAt: number; provisional?: true }
  | { status: "error"; email: string | null; message: string };

export const NO_ANSWER_MESSAGE = "Couldn't check your membership. Check your connection and try again.";
export const EXPIRED_MESSAGE = "This offline copy needs a connection to confirm your access.";

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function uidsIn(raw: string | null): string[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AuthState>({ status: "loading" });
  const stateRef = useRef<AuthState>(state);
  const setState = useCallback((next: AuthState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);
  const generationRef = useRef(0);
  const lastUidRef = useRef<string | null>(null);
  const deniedInFlightRef = useRef(false);

  /** Account change, deleted session elsewhere: clear device data first, then reload (spec §3.8). */
  const resetForChange = useCallback(() => {
    generationRef.current += 1;
    setCopySession(null);
    setState({ status: "resetting" });
    void clearDeviceData().finally(() => resetDocument());
  }, [setState]);

  const applyAnswer = useCallback(async (user: User, answer: MembershipAnswer, mine: number): Promise<void> => {
    if (mine !== generationRef.current) return;
    if (answer.kind === "member") {
      const prep = await prepareMemberCopy(user.uid, answer.householdId, Date.now());
      if (mine !== generationRef.current) return;
      setCopySession({ uid: user.uid, householdId: answer.householdId, mode: "member" });
      setState({
        status: "member", uid: user.uid, email: user.email, householdId: answer.householdId, displayName: answer.displayName,
        ...(prep.householdChanged ? { householdChanged: true as const } : {}),
      });
      return;
    }
    if (answer.kind === "notMember" || answer.kind === "deletionPending") {
      // A confirmed loss of access wipes the copy first; a document showing copy data resets (spec §3.9).
      const wasServing = isServingCopy();
      setCopySession(null);
      await clearDeviceData();
      if (mine !== generationRef.current) return;
      if (wasServing) {
        generationRef.current += 1;
        setState({ status: "resetting" });
        resetDocument();
        return;
      }
      setState(answer.kind === "notMember"
        ? { status: "notMember", uid: user.uid, email: user.email, canDeleteSignIn: answer.canDeleteSignIn }
        : { status: "deletionPending", uid: user.uid, email: user.email });
      return;
    }
    // No answer: an open session for this account stays as it is.
    const current = stateRef.current;
    if ((current.status === "member" || current.status === "offlineMember") && current.uid === user.uid && !("provisional" in current && current.provisional)) return;
    const outcome = await decideNoAnswer(user.uid, Date.now());
    if (mine !== generationRef.current) return;
    if (outcome.kind === "open") {
      setCopySession({ uid: user.uid, householdId: outcome.householdId, mode: "offlineMember" });
      setState({ status: "offlineMember", uid: user.uid, email: user.email, householdId: outcome.householdId, displayName: outcome.displayName, downloadedAt: outcome.downloadedAt });
      return;
    }
    setState({ status: "error", email: user.email, message: outcome.kind === "expired" ? EXPIRED_MESSAGE : NO_ANSWER_MESSAGE });
  }, [setState]);

  /** `quiet` keeps the current screen while re-checking (retries, denials, a provisional early open). */
  const resolveForUser = useCallback((user: User, options: { quiet?: boolean } = {}) => {
    const mine = ++generationRef.current;
    if (!options.quiet) setState({ status: "loading" });
    if (isDeletedUid(user.uid)) {
      setCopySession(null);
      setState({ status: "deletedSession", uid: user.uid, email: user.email });
      return;
    }
    // A notice names one account: resolving any other account discards it, error path included.
    discardDeletedNoticeUnlessFor(user.uid);
    const { first, late } = membershipWithTimeout(user.uid);
    void first
      .then((answer) => applyAnswer(user, answer, mine))
      .catch(() => {
        if (mine === generationRef.current && !options.quiet) setState({ status: "error", email: user.email, message: NO_ANSWER_MESSAGE });
      })
      .finally(() => { deniedInFlightRef.current = false; });
    // A read that outlived the timeout is applied when it lands (review P3-7).
    void Promise.allSettled([first, late]).then(([f, l]) => {
      if (f.status !== "fulfilled" || l.status !== "fulfilled") return;
      if (l.value === f.value || l.value.kind === "noAnswer") return;
      void applyAnswer(user, l.value, mine);
    });
  }, [applyAnswer, setState]);

  useEffect(() => startCopyWatch(), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const previous = lastUidRef.current;
      // Auth state is shared by every same-origin tab (audit F2): whichever tab signed out or
      // switched user, each document that had a user resets itself. Starting signed out, or a
      // repeat of the same UID, is not a change.
      if (previous !== null && (user === null || user.uid !== previous)) {
        resetForChange();
        return;
      }
      if (!user) {
        generationRef.current += 1;
        setCopySession(null);
        setState({ status: "signedOut" });
        return;
      }
      lastUidRef.current = user.uid;
      resolveForUser(user);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DELETED_UIDS_KEY) return;
      const uid = lastUidRef.current;
      // Reset only when this write newly added the current uid, not on any unrelated record write.
      if (uid === null || !uidsIn(event.newValue).includes(uid) || uidsIn(event.oldValue).includes(uid)) return;
      if (!isDeletedUid(uid)) return;
      resetForChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribe();
    };
  }, [resolveForUser, resetForChange, setState]);

  // A live listener's permission-denied re-reads membership from the server, once per episode (review R2-4).
  useEffect(() => {
    setDeniedHandler(() => {
      const user = auth.currentUser;
      const current = stateRef.current;
      if (!user || current.status !== "member" || current.uid !== user.uid || deniedInFlightRef.current) return;
      deniedInFlightRef.current = true;
      resolveForUser(user, { quiet: true });
    });
    return () => setDeniedHandler(null);
  }, [resolveForUser]);

  // Leaving offlineMember: retry on reconnection and every 15 minutes while visible (spec §3.9).
  useEffect(() => {
    if (state.status !== "offlineMember") return;
    const retryQuietly = () => {
      const user = auth.currentUser;
      const current = stateRef.current;
      if (user && current.status === "offlineMember" && current.uid === user.uid) resolveForUser(user, { quiet: true });
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") retryQuietly();
    }, REFRESH_INTERVAL_MS);
    window.addEventListener("online", retryQuietly);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retryQuietly);
    };
  }, [state.status, resolveForUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    forgetAuthGuard(user.uid);
    // A successful sign-in proves the account exists (e.g. re-created by an admin): forget it, then
    // re-resolve in case the listener already resolved deletedSession for it.
    if (isDeletedUid(user.uid)) {
      forgetDeletedUid(user.uid);
      if (lastUidRef.current === user.uid) resolveForUser(user);
    }
  }, [resolveForUser]);

  const signOut = useCallback(async () => {
    // The listener resets this document (and every other tab) when the user becomes null.
    await firebaseSignOut(auth);
  }, []);

  const retry = useCallback(() => {
    const user = auth.currentUser;
    if (!user) {
      generationRef.current += 1;
      setState({ status: "signedOut" });
      return;
    }
    resolveForUser(user);
  }, [resolveForUser, setState]);

  const value = useMemo(() => ({ state, signIn, signOut, retry }), [state, signIn, signOut, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 5: Run the AuthProvider tests**

Run: `npm --prefix web exec vitest run src/auth/AuthProvider.test.tsx`
Expected: PASS (22 existing + 10 new). If the "loss of access" test sees `clearDeviceData` called twice, check that only `applyAnswer` calls it on this path (the listener's reset path must not run: `lastUidRef` was null).

- [ ] **Step 6: Accept `offlineMember` in the shell**

Replace `web/src/records/useMember.ts`:

```ts
import { useAuth } from "../auth/AuthProvider";

/** Pages under the member shell render for members and, from the device copy, for offline members (spec §3.9). */
export function useMember(): { uid: string; householdId: string; displayName: string } {
  const { state } = useAuth();
  if (state.status !== "member" && state.status !== "offlineMember") throw new Error("useMember used outside a member session");
  return { uid: state.uid, householdId: state.householdId, displayName: state.displayName };
}
```

Create `web/src/records/useMember.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ state: { status: "loading" } as Record<string, unknown> }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ state: m.state }) }));

import { useMember } from "./useMember";

describe("useMember", () => {
  it("accepts offlineMember and returns the copy's identity", () => {
    m.state = { status: "offlineMember", uid: "ava-uid", email: null, householdId: "home", displayName: "Ava", downloadedAt: 1 };
    expect(renderHook(() => useMember()).result.current).toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava" });
  });
  it("still refuses anything else", () => {
    m.state = { status: "signedOut" };
    expect(() => renderHook(() => useMember())).toThrow("useMember used outside a member session");
  });
});
```

In `web/src/App.tsx`, inside `Gate`'s switch, add before `case "member":`:

```tsx
    case "offlineMember":
```

so both statuses return `<AppShell />`.

- [ ] **Step 7: Run the web suite and typecheck**

Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 17 new (5 decide, 10 AuthProvider, 2 useMember). TypeScript will flag any `switch (state.status)` elsewhere that must handle `offlineMember`; add it next to `member` where the code means "a member session".

- [ ] **Step 8: Run the browser suite**

Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: all pass (online behaviour is unchanged; no copy exists yet in these scenarios).

- [ ] **Step 9: Commit**

```bash
git add web/src/offline/decide.ts web/src/offline/decide.test.ts web/src/auth/AuthProvider.tsx web/src/auth/AuthProvider.test.tsx web/src/records/useMember.ts web/src/records/useMember.test.tsx web/src/App.tsx
git commit -m "feat(auth): offlineMember from the device copy; wipe on confirmed loss; late answers

Spec §3.9 startup table: no server answer opens a usable copy as
offlineMember (otherwise today's error, or 'needs a connection' past 30 days);
a member answer clears another household's or account's copy (with a notice
for a household move) and renews the 30 days; a confirmed loss wipes first and
resets a document showing copy data. Late answers after the 6 s timeout are
applied; offlineMember retries on 'online' and every 15 minutes while visible;
a listener denial re-reads membership once. useMember and the gate accept
offlineMember.
Web unit: previous + 17.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 7: Early opening from the saved account on a stalled connection

Spec §3.9 "Early opening (ruling 7)", review P2-3. Firebase Auth can take up to 30 s to report the saved user when the browser believes it is online (Task 1, stop 1). After 3 s without an Auth answer, open a ready copy for the account saved on this device as a provisional `offlineMember`; reconcile when Auth answers.

**Files:**
- Modify: `web/src/account/persistedSession.ts` (add `readPersistedUid`); Create: `web/src/account/persistedSession.read.test.ts`
- Create: `web/src/offline/early.ts`, `web/src/offline/early.test.ts`
- Modify: `web/src/auth/AuthProvider.tsx`, `web/src/auth/AuthProvider.test.tsx`

**Interfaces:**
- Consumes: `persistentAuthAllowed()` (`account/authPersistence.ts`); `isDeletedUid` (`account/deletedSessions.ts`); `decideNoAnswer` (Task 6); `EARLY_OPEN_MS` (Task 3).
- Produces: `readPersistedUid(): Promise<string | null | "unavailable">` (`null` = no saved user; `"unavailable"` = could not read or unexpected layout); `interface EarlyCandidate { uid: string; householdId: string; displayName: string; downloadedAt: number }`; `earlyCopyCandidate(now: number, deps?: EarlyDeps): Promise<EarlyCandidate | null>`.

- [ ] **Step 1: Write the failing persisted-uid tests**

Create `web/src/account/persistedSession.read.test.ts`:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebaseConfig", () => ({ firebaseConfig: { apiKey: "KEY" } }));

import { readPersistedUid } from "./persistedSession";

const KEY = "firebase:authUser:KEY:[DEFAULT]";

function seedAuthDb(record: unknown | undefined) {
  return new Promise<void>((resolve) => {
    const open = indexedDB.open("firebaseLocalStorageDb", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
    open.onsuccess = () => {
      const tx = open.result.transaction("firebaseLocalStorage", "readwrite");
      if (record !== undefined) tx.objectStore("firebaseLocalStorage").put(record);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  });
}

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe("readPersistedUid", () => {
  it("returns null when no Auth database exists, and leaves none behind", async () => {
    await expect(readPersistedUid()).resolves.toBeNull();
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain("firebaseLocalStorageDb");
  });
  it("returns the saved uid", async () => {
    await seedAuthDb({ fbase_key: KEY, value: { uid: "ava-uid" } });
    await expect(readPersistedUid()).resolves.toBe("ava-uid");
  });
  it("returns null when the database holds no saved user", async () => {
    await seedAuthDb(undefined);
    await expect(readPersistedUid()).resolves.toBeNull();
  });
  it("an unexpected layout is unavailable, never a guess", async () => {
    await seedAuthDb({ fbase_key: KEY, value: { unexpected: true } });
    await expect(readPersistedUid()).resolves.toBe("unavailable");
  });
});
```

Run: `npm --prefix web exec vitest run src/account/persistedSession.read.test.ts`
Expected: FAIL — `readPersistedUid` is not exported.

- [ ] **Step 2: Implement `readPersistedUid`**

Append to `web/src/account/persistedSession.ts` (it reuses the file's `DB_NAME`, `STORE` and `IDB_OPEN_TIMEOUT_MS`, and the same pinned layout):

```ts
/**
 * The uid of the Auth user saved on this device, read without starting Firebase (spec §3.9
 * "Early opening"). Same layout as removePersistedUsersIfUids (pinned to @firebase/auth 1.13.6).
 * null: no saved user. "unavailable": could not read, timed out, or an unexpected layout.
 */
export function readPersistedUid(): Promise<string | null | "unavailable"> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string | null | "unavailable") => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => done("unavailable"), IDB_OPEN_TIMEOUT_MS);
    try {
      const key = `firebase:authUser:${firebaseConfig.apiKey}:[DEFAULT]`;
      const open = indexedDB.open(DB_NAME); // no version: never creates or upgrades the SDK's database
      open.onerror = () => done("unavailable");
      open.onblocked = () => done("unavailable");
      open.onupgradeneeded = () => {
        open.transaction?.abort(); // the database did not exist
        done(null);
      };
      open.onsuccess = () => {
        const db = open.result;
        try {
          if (!db.objectStoreNames.contains(STORE)) { db.close(); done("unavailable"); return; }
          const get = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
          get.onsuccess = () => {
            db.close();
            const record = get.result as { value?: { uid?: unknown } } | undefined;
            if (record === undefined) done(null);
            else done(typeof record.value?.uid === "string" ? record.value.uid : "unavailable");
          };
          get.onerror = () => { db.close(); done("unavailable"); };
        } catch {
          try { db.close(); } catch { /* ignore */ }
          done("unavailable");
        }
      };
    } catch {
      done("unavailable");
    }
  });
}
```

Run: `npm --prefix web exec vitest run src/account/persistedSession.read.test.ts src/account/persistedSession.test.ts`
Expected: PASS (4 new + existing).

- [ ] **Step 3: Write the failing early-opening tests**

Create `web/src/offline/early.test.ts`:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { earlyCopyCandidate, type EarlyDeps } from "./early";
import { readToken, replaceCopy, setOptIn } from "./store";
import { COPY_MAX_AGE_MS } from "./types";

const NOW = Date.now();
const deps = (over: Partial<EarlyDeps> = {}): EarlyDeps => ({
  persistentAuthAllowed: () => true,
  readPersistedUid: async () => "ava-uid",
  isDeletedUid: () => false,
  ...over,
});

async function seed(checkedAt = NOW) {
  await setOptIn("ava-uid", true);
  await replaceCopy({ uid: "ava-uid", householdId: "home", displayName: "Ava" }, await readToken(), { restaurants: [], claims: {}, collection: {}, notes: {} }, checkedAt);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

describe("earlyCopyCandidate", () => {
  it("offers the ready copy of the account saved on this device", async () => {
    await seed();
    await expect(earlyCopyCandidate(NOW, deps())).resolves.toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava", downloadedAt: NOW });
  });
  it.each<[string, Partial<EarlyDeps>]>([
    ["memory-only Auth", { persistentAuthAllowed: () => false }],
    ["no saved user", { readPersistedUid: async () => null }],
    ["an unreadable Auth database", { readPersistedUid: async () => "unavailable" }],
    ["another saved account", { readPersistedUid: async () => "bogdan-uid" }],
    ["a deleted session", { isDeletedUid: () => true }],
  ])("offers nothing with %s", async (_label, over) => {
    await seed();
    await expect(earlyCopyCandidate(NOW, deps(over))).resolves.toBeNull();
  });
  it("offers nothing for an expired or missing copy", async () => {
    await expect(earlyCopyCandidate(NOW, deps())).resolves.toBeNull();
    await seed(NOW - COPY_MAX_AGE_MS - 1);
    await expect(earlyCopyCandidate(NOW, deps())).resolves.toBeNull();
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/early.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `web/src/offline/early.ts`:

```ts
import { persistentAuthAllowed } from "../account/authPersistence";
import { isDeletedUid } from "../account/deletedSessions";
import { readPersistedUid } from "../account/persistedSession";
import { decideNoAnswer } from "./decide";

/** Early opening (spec §3.9 ruling 7): every condition must hold, or nothing opens. Firebase-free. */
export interface EarlyCandidate { uid: string; householdId: string; displayName: string; downloadedAt: number }

export interface EarlyDeps {
  persistentAuthAllowed(): boolean;
  readPersistedUid(): Promise<string | null | "unavailable">;
  isDeletedUid(uid: string): boolean;
}

const realDeps: EarlyDeps = { persistentAuthAllowed, readPersistedUid, isDeletedUid };

export async function earlyCopyCandidate(now: number, deps: EarlyDeps = realDeps): Promise<EarlyCandidate | null> {
  if (!deps.persistentAuthAllowed()) return null;
  const uid = await deps.readPersistedUid();
  if (uid === null || uid === "unavailable" || deps.isDeletedUid(uid)) return null;
  const outcome = await decideNoAnswer(uid, now);
  if (outcome.kind !== "open") return null;
  return { uid, householdId: outcome.householdId, displayName: outcome.displayName, downloadedAt: outcome.downloadedAt };
}
```

Run: `npm --prefix web exec vitest run src/offline/early.test.ts`
Expected: PASS (7).

- [ ] **Step 5: Write the failing AuthProvider tests**

In `web/src/auth/AuthProvider.test.tsx`, add hoisted controls and mocks after the membership mock from Task 6:

```ts
const early = vi.hoisted(() => ({ candidate: null as null | { uid: string; householdId: string; displayName: string; downloadedAt: number } }));
vi.mock("../offline/early", () => ({ earlyCopyCandidate: async () => early.candidate }));
vi.mock("../offline/types", async (importOriginal) => ({ ...(await importOriginal<typeof import("../offline/types")>()), EARLY_OPEN_MS: 20 }));
```

In `beforeEach` add `early.candidate = null;`. Append:

```ts
describe("early opening (spec §3.9 ruling 7)", () => {
  const candidate = { uid: "ava-uid", householdId: "home", displayName: "Ava", downloadedAt: 123 };

  it("opens a provisional offlineMember when Auth has not answered in time", async () => {
    early.candidate = candidate;
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    expect(stateText()).toContain('"provisional":true');
    expect(getCopySession()).toEqual({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
  });

  it("the same user from Auth reconciles in place: no reset, no loading flash", async () => {
    early.candidate = candidate;
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    const seen: string[] = [];
    function Recorder() {
      const { state } = useAuth();
      seen.push(state.status);
      return null;
    }
    render(<AuthProvider><Probe /><Recorder /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"provisional":true'));
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).not.toContain("provisional"));
    expect(stateText()).toContain('"status":"offlineMember"');
    expect(seen.slice(seen.indexOf("offlineMember"))).not.toContain("loading");
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("Auth answering with no user, or another user, is an account change: clear and reset", async () => {
    early.candidate = candidate;
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"provisional":true'));
    listeners[0](null);
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    expect(clearDeviceData).toHaveBeenCalled();
  });

  it("never opens early once Auth has answered", async () => {
    early.candidate = candidate;
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    await new Promise((r) => setTimeout(r, 60));
    expect(stateText()).toContain('"status":"member"');
  });
});
```

Run: `npm --prefix web exec vitest run src/auth/AuthProvider.test.tsx`
Expected: FAIL — no early opening happens.

- [ ] **Step 6: Add early opening to AuthProvider**

In `web/src/auth/AuthProvider.tsx`:
- Add imports: `import { earlyCopyCandidate } from "../offline/early";` and change the types import to `import { EARLY_OPEN_MS, REFRESH_INTERVAL_MS } from "../offline/types";`.
- In the `onAuthStateChanged` handler, replace `lastUidRef.current = user.uid; resolveForUser(user);` with:

```tsx
      const provisional = stateRef.current.status === "offlineMember" && stateRef.current.provisional === true;
      lastUidRef.current = user.uid;
      // The same user as an early-opened copy: confirm membership without leaving the copy.
      resolveForUser(user, { quiet: provisional });
```

- Add this effect after `useEffect(() => startCopyWatch(), []);`:

```tsx
  // Early opening (spec §3.9 ruling 7, review P2-3): Auth can take ~30 s to report the saved user
  // on a stalled connection. After 3 s with no Auth answer, open a ready copy for the account saved
  // on this device; lastUidRef makes a different or missing Auth user an account change.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void earlyCopyCandidate(Date.now()).then((candidate) => {
        if (cancelled || !candidate || lastUidRef.current !== null || stateRef.current.status !== "loading") return;
        lastUidRef.current = candidate.uid;
        setCopySession({ uid: candidate.uid, householdId: candidate.householdId, mode: "offlineMember" });
        setState({ status: "offlineMember", uid: candidate.uid, email: null, householdId: candidate.householdId, displayName: candidate.displayName, downloadedAt: candidate.downloadedAt, provisional: true });
      });
    }, EARLY_OPEN_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [setState]);
```

- [ ] **Step 7: Run the tests**

Run: `npm --prefix web exec vitest run src/auth/AuthProvider.test.tsx`
Expected: PASS (previous + 4). The existing tests are unaffected: `early.candidate` is `null`.

Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 15 new (4 persisted uid, 7 early, 4 AuthProvider).

- [ ] **Step 8: Commit**

```bash
git add web/src/account/persistedSession.ts web/src/account/persistedSession.read.test.ts web/src/offline/early.ts web/src/offline/early.test.ts web/src/auth/AuthProvider.tsx web/src/auth/AuthProvider.test.tsx
git commit -m "feat(auth): open the copy early on a stalled connection

Spec §3.9 ruling 7 (review P2-3): after 3 s without an Auth answer, a ready
copy for the account saved on this device opens as a provisional
offlineMember. Requires persistent Auth, a readable saved uid (pinned layout),
no deleted-session record and a usable copy. The same user from Auth
reconciles without a reset or loading flash; no user or another user is an
account change.
Web unit: previous + 15.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 8: Refresh — server reads, single-flight refresher, triggers, partial refresh after writes (stop 5)

Spec §3.9 "Refresh" steps 1–6, "Cleanup wins", "Persistent storage" (Task 11 calls it), "Server reads", reviews P1-1, P3-10, R2-1, R2-2, Review Focus 1 and 2, empirical stop 5.

**Files:**
- Create: `web/src/offline/serverReads.ts`, `web/src/offline/serverReads.test.ts`
- Create: `web/src/offline/refresher.ts`, `web/src/offline/refresher.test.ts`
- Create: `web/src/offline/refreshTriggers.ts`, `web/src/offline/refreshTriggers.test.ts`
- Modify: `web/src/records/repository.ts`, `web/src/records/collection.ts`, `web/src/records/notes.ts` (write observer), `web/src/records/repository.test.ts`
- Modify: `web/src/auth/AuthProvider.tsx`, `web/src/auth/AuthProvider.test.tsx`
- Create: `planning/audits/plan-5b-probes/stop-5-cost.spec.ts`; Modify: `planning/audits/plan-5b-probes/results.md`

**Interfaces:**
- Consumes: `readToken`, `replaceCopy`, `replaceRestaurant`, `readMeta`, `getOptIn` (Task 3); `reportDenied` (Task 4); `toRestaurant`, `toClaim` (`records/repository.ts`), `toCollectionState` (`records/collection.ts`), `toNote` (`records/notes.ts`).
- Produces (`serverReads.ts`): `class RefreshOffline extends Error`, `class RefreshDenied extends Error`, `interface ReadStats { queries: number; documents: number; emptyQueries: number }`, `readHouseholdFromServer(hid: string): Promise<{ data: CopyData; stats: ReadStats }>`, `readRestaurantFromServer(hid: string, rid: string): Promise<{ data: RestaurantData | null; stats: ReadStats }>`.
- Produces (`refresher.ts`): `type RefreshFailure = "offline" | "storage" | "server" | "denied"`; `interface RefreshStatus { running: boolean; lastFailure: RefreshFailure | null; lastWrittenAt: number | null; cantStore: boolean }`; `interface RefreshTarget { uid: string; householdId: string; displayName: string }`; `interface RefresherDeps`; `interface Refresher { requestFull(t: RefreshTarget): Promise<void>; requestPartial(t: RefreshTarget, rid: string): Promise<void>; status(): RefreshStatus; subscribe(cb: () => void): () => void; lastStats(): ReadStats | null }`; `createRefresher(deps: RefresherDeps): Refresher`; singleton `refresher`; `notifyOptInChanged(): void`; `useOptInVersion(): number`; `useRefreshStatus(): RefreshStatus`.
- Produces (`refreshTriggers.ts`): `startRefreshTriggers(run: () => void, ageOf: () => Promise<number | null>): () => void`.
- Produces (`repository.ts`): `setWriteObserver(o: ((hid: string, rid: string) => void) | null): void`, `observed<T>(hid: string, rid: string | ((value: T) => string), outcome: Promise<WriteOutcome<T>>): Promise<WriteOutcome<T>>`.

- [ ] **Step 1: Write the failing server-read tests**

Create `web/src/offline/serverReads.test.ts`:

```ts
import { Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getDocs: vi.fn(), getDoc: vi.fn() }));
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    query: (source: { path: string }) => source,
    orderBy: () => undefined,
    getDocsFromServer: (q: { path: string }) => m.getDocs(q.path),
    getDocFromServer: (r: { path: string }) => m.getDoc(r.path),
  };
});

import { RefreshDenied, RefreshOffline, readHouseholdFromServer, readRestaurantFromServer } from "./serverReads";

const ts = Timestamp.fromMillis(Date.UTC(2026, 8, 1));
const restaurantDoc = (id: string, name: string) => ({ id, data: () => ({ name, address: "1 St", createdBy: "ava-uid", createdAt: ts, updatedAt: ts, version: 1, deleting: false }) });
const claimDoc = (id: string) => ({ id, data: () => ({ kind: "gfMenu", value: "yes", detail: "", source: { type: "restaurantStatement", label: "Phone" }, checkedAt: ts, authorUid: "ava-uid", authorName: "Ava", createdAt: ts }) });
const noteDoc = (id: string, at: number) => ({ id, data: () => ({ text: id, authorUid: "ava-uid", authorName: "Ava", createdAt: Timestamp.fromMillis(at), updatedAt: Timestamp.fromMillis(at), version: 1 }) });
const query = (docs: unknown[], fromCache = false) => ({ docs, empty: docs.length === 0, metadata: { fromCache } });

beforeEach(() => { m.getDocs.mockReset(); m.getDoc.mockReset(); });

function household() {
  m.getDocs.mockImplementation(async (path: string) => {
    if (path === "households/home/restaurants") return query([restaurantDoc("a", "Bistro"), restaurantDoc("b", "Zest")]);
    if (path === "households/home/restaurants/a/claims") return query([claimDoc("c1")]);
    if (path === "households/home/restaurants/a/notes") return query([noteDoc("new", 2), noteDoc("old", 1)]);
    if (path === "households/home/collection") return query([{ id: "a", data: () => ({ shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: ts, version: 1 }) }]);
    return query([]);
  });
}

describe("readHouseholdFromServer", () => {
  it("reads every collection from the server into a copy, keeping query order, and counts reads", async () => {
    household();
    const { data, stats } = await readHouseholdFromServer("home");
    expect(data.restaurants.map((r) => r.name)).toEqual(["Bistro", "Zest"]);
    expect(data.claims.a!.map((c) => c.id)).toEqual(["c1"]);
    expect(data.claims.b).toEqual([]);
    expect(data.notes.a!.map((n) => n.id)).toEqual(["new", "old"]);
    expect(data.collection.a!.shortlisted).toBe(true);
    expect(stats).toEqual({ queries: 6, documents: 6, emptyQueries: 2 });
  });

  it("refuses a snapshot served from cache (review P1-1)", async () => {
    household();
    m.getDocs.mockImplementationOnce(async () => query([restaurantDoc("a", "Bistro")], true));
    await expect(readHouseholdFromServer("home")).rejects.toBeInstanceOf(RefreshOffline);
  });

  it("maps unavailable to offline and permission-denied to denied", async () => {
    m.getDocs.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "unavailable" }));
    await expect(readHouseholdFromServer("home")).rejects.toBeInstanceOf(RefreshOffline);
    m.getDocs.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "permission-denied" }));
    await expect(readHouseholdFromServer("home")).rejects.toBeInstanceOf(RefreshDenied);
  });
});

describe("readRestaurantFromServer", () => {
  it("reads one restaurant with its claims, notes and state", async () => {
    household();
    m.getDoc.mockImplementation(async (path: string) => (path === "households/home/restaurants/a"
      ? { ...restaurantDoc("a", "Bistro"), exists: () => true, metadata: { fromCache: false } }
      : { id: "a", exists: () => false, data: () => undefined, metadata: { fromCache: false } }));
    const { data } = await readRestaurantFromServer("home", "a");
    expect(data!.restaurant.name).toBe("Bistro");
    expect(data!.claims).toHaveLength(1);
    expect(data!.notes.map((n) => n.id)).toEqual(["new", "old"]);
    expect(data!.state).toBeNull();
  });

  it("a restaurant gone from the server reads as null", async () => {
    m.getDoc.mockResolvedValue({ id: "a", exists: () => false, data: () => undefined, metadata: { fromCache: false } });
    await expect(readRestaurantFromServer("home", "a")).resolves.toMatchObject({ data: null });
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/serverReads.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the server reads**

Create `web/src/offline/serverReads.ts`:

```ts
import { collection, doc, getDocFromServer, getDocsFromServer, orderBy, query, type DocumentSnapshot, type QuerySnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { toCollectionState } from "../records/collection";
import { toNote } from "../records/notes";
import { toClaim, toRestaurant } from "../records/repository";
import type { CollectionState } from "../records/types";
import type { CopyData, RestaurantData } from "./types";

/**
 * Refresh reads (spec §3.9 "Server reads"): server-pinned, and a cache-served snapshot is refused.
 * No collection-group rule exists or is added, so claims and notes are one query per restaurant.
 */
export class RefreshOffline extends Error {}
export class RefreshDenied extends Error {}

export interface ReadStats { queries: number; documents: number; emptyQueries: number }

function mapError(err: unknown): never {
  if (err instanceof RefreshOffline || err instanceof RefreshDenied) throw err;
  const code = (err as { code?: unknown }).code;
  if (code === "permission-denied") throw new RefreshDenied();
  if (code === "unavailable" || code === "deadline-exceeded") throw new RefreshOffline();
  throw err;
}

async function serverQuery(source: Parameters<typeof getDocsFromServer>[0], stats: ReadStats): Promise<QuerySnapshot> {
  try {
    const snap = await getDocsFromServer(source);
    if (snap.metadata.fromCache) throw new RefreshOffline();
    stats.queries += 1;
    stats.documents += snap.docs.length;
    if (snap.docs.length === 0) stats.emptyQueries += 1;
    return snap;
  } catch (err) {
    return mapError(err);
  }
}

async function serverDoc(path: string[], stats: ReadStats): Promise<DocumentSnapshot> {
  try {
    const [first, ...rest] = path;
    const snap = await getDocFromServer(doc(db, first!, ...rest));
    if (snap.metadata.fromCache) throw new RefreshOffline();
    stats.queries += 1;
    stats.documents += snap.exists() ? 1 : 0;
    return snap;
  } catch (err) {
    return mapError(err);
  }
}

const restaurantsQuery = (hid: string) => query(collection(db, "households", hid, "restaurants"), orderBy("name"));
const claimsQuery = (hid: string, rid: string) => query(collection(db, "households", hid, "restaurants", rid, "claims"));
const notesQuery = (hid: string, rid: string) => query(collection(db, "households", hid, "restaurants", rid, "notes"), orderBy("createdAt", "desc"));

export async function readHouseholdFromServer(hid: string): Promise<{ data: CopyData; stats: ReadStats }> {
  const stats: ReadStats = { queries: 0, documents: 0, emptyQueries: 0 };
  const restaurants = (await serverQuery(restaurantsQuery(hid), stats)).docs.map(toRestaurant);
  const data: CopyData = { restaurants, claims: {}, collection: {}, notes: {} };
  await Promise.all(restaurants.map(async (r) => {
    const [claims, notes] = await Promise.all([serverQuery(claimsQuery(hid, r.id), stats), serverQuery(notesQuery(hid, r.id), stats)]);
    data.claims[r.id] = claims.docs.map(toClaim);
    data.notes[r.id] = notes.docs.map(toNote);
  }));
  const states = await serverQuery(collection(db, "households", hid, "collection"), stats);
  for (const d of states.docs) data.collection[d.id] = toCollectionState(d);
  return { data, stats };
}

export async function readRestaurantFromServer(hid: string, rid: string): Promise<{ data: RestaurantData | null; stats: ReadStats }> {
  const stats: ReadStats = { queries: 0, documents: 0, emptyQueries: 0 };
  const snap = await serverDoc(["households", hid, "restaurants", rid], stats);
  if (!snap.exists()) return { data: null, stats };
  const [claims, notes, state] = await Promise.all([
    serverQuery(claimsQuery(hid, rid), stats),
    serverQuery(notesQuery(hid, rid), stats),
    serverDoc(["households", hid, "collection", rid], stats),
  ]);
  const collectionState: CollectionState | null = state.exists() ? toCollectionState(state) : null;
  return { data: { restaurant: toRestaurant(snap), claims: claims.docs.map(toClaim), notes: notes.docs.map(toNote), state: collectionState }, stats };
}
```

Run: `npm --prefix web exec vitest run src/offline/serverReads.test.ts`
Expected: PASS (5).

- [ ] **Step 3: Write the failing refresher tests**

Create `web/src/offline/refresher.test.ts`:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "../records/types";
import { createRefresher, type RefresherDeps } from "./refresher";
import { RefreshDenied, RefreshOffline } from "./serverReads";
import { clearCopy, readCopy, readMeta, readToken, replaceCopy, setOptIn } from "./store";
import type { CopyData } from "./types";

const TARGET = { uid: "ava-uid", householdId: "home", displayName: "Ava" };
const ID = { uid: "ava-uid", householdId: "home" };
const STATS = { queries: 1, documents: 1, emptyQueries: 0 };
const restaurant = (id: string): Restaurant => ({ id, name: id, address: "", createdBy: "ava-uid", createdAt: new Date(0), updatedAt: new Date(0), version: 1, deleting: false });
const copyOf = (...ids: string[]): CopyData => ({
  restaurants: ids.map(restaurant),
  claims: Object.fromEntries(ids.map((id) => [id, []])),
  collection: {},
  notes: Object.fromEntries(ids.map((id) => [id, []])),
});

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => { open = r; });
  return { promise, open };
}

function deps(over: Partial<RefresherDeps> = {}): RefresherDeps {
  let now = 1_000;
  return {
    readHousehold: vi.fn(async () => ({ data: copyOf("a", "b"), stats: STATS })),
    readRestaurant: vi.fn(async () => ({ data: null, stats: STATS })),
    now: () => (now += 1),
    onDenied: vi.fn(),
    pause: async () => {},
    ...over,
  };
}

async function ids() {
  const got = await readCopy(ID);
  return got.kind === "copy" ? got.data.restaurants.map((r) => r.id) : null;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await setOptIn("ava-uid", true);
});

describe("refresher", () => {
  it("a full refresh writes the copy and records success and read stats", async () => {
    const r = createRefresher(deps());
    await r.requestFull(TARGET);
    expect(await ids()).toEqual(["a", "b"]);
    expect(r.status()).toMatchObject({ running: false, lastFailure: null });
    expect(r.status().lastWrittenAt).not.toBeNull();
    expect(r.lastStats()).toEqual(STATS);
  });

  it("a restaurant deleted on the server disappears at the next full refresh (Review Focus 1)", async () => {
    const d = deps();
    const r = createRefresher(d);
    await r.requestFull(TARGET);
    vi.mocked(d.readHousehold).mockResolvedValueOnce({ data: copyOf("a"), stats: STATS });
    await r.requestFull(TARGET);
    expect(await ids()).toEqual(["a"]);
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.claims.b).toBeUndefined();
  });

  it("an offline or failed read writes nothing and keeps the previous copy and downloadedAt", async () => {
    const d = deps();
    const r = createRefresher(d);
    await r.requestFull(TARGET);
    const before = (await readMeta())!.downloadedAt;
    vi.mocked(d.readHousehold).mockRejectedValueOnce(new RefreshOffline());
    await r.requestFull(TARGET);
    expect(r.status().lastFailure).toBe("offline");
    expect((await readMeta())!.downloadedAt).toBe(before);
    vi.mocked(d.readHousehold).mockRejectedValueOnce(new Error("boom"));
    await r.requestFull(TARGET);
    expect(r.status().lastFailure).toBe("server");
    expect(await ids()).toEqual(["a", "b"]);
  });

  it("permission-denied does not wipe; it defers to the membership read", async () => {
    const d = deps({ readHousehold: vi.fn(async () => { throw new RefreshDenied(); }) });
    const r = createRefresher(d);
    await r.requestFull(TARGET);
    expect(d.onDenied).toHaveBeenCalledTimes(1);
    expect(r.status().lastFailure).toBe("denied");
  });

  it("single flight: requests during a run coalesce into one more run", async () => {
    const g = gate();
    const d = deps({ pause: () => g.promise });
    const r = createRefresher(d);
    const first = r.requestFull(TARGET);
    void r.requestFull(TARGET);
    void r.requestFull(TARGET);
    g.open();
    await first;
    await vi.waitFor(() => expect(r.status().running).toBe(false));
    expect(d.readHousehold).toHaveBeenCalledTimes(2);
  });

  it("switching off while the first download is reading leaves nothing written (Review Focus 2)", async () => {
    const g = gate();
    const r = createRefresher(deps({ pause: () => g.promise }));
    const run = r.requestFull(TARGET);
    await vi.waitFor(async () => expect(r.status().running).toBe(true));
    await setOptIn("ava-uid", false);
    await clearCopy();
    g.open();
    await run;
    await expect(readMeta()).resolves.toBeNull();
    expect(r.status().lastFailure).toBeNull();
  });

  it("work based on older reads than another tab's write is discarded and re-run (review R2-2)", async () => {
    const g = gate();
    const d = deps({ pause: vi.fn().mockImplementationOnce(() => g.promise).mockResolvedValue(undefined) });
    vi.mocked(d.readHousehold).mockResolvedValueOnce({ data: copyOf("older"), stats: STATS }).mockResolvedValue({ data: copyOf("newest"), stats: STATS });
    const r = createRefresher(d);
    const run = r.requestFull(TARGET);
    await vi.waitFor(() => expect(d.readHousehold).toHaveBeenCalledTimes(1));
    await replaceCopy(TARGET, await readToken(), copyOf("other-tab"), 5_000); // another tab wins meanwhile
    g.open();
    await run;
    await vi.waitFor(() => expect(r.status().running).toBe(false));
    expect(await ids()).toEqual(["newest"]);
  });

  it("a partial refresh replaces one restaurant and keeps downloadedAt", async () => {
    const d = deps();
    const r = createRefresher(d);
    await r.requestFull(TARGET);
    const before = (await readMeta())!;
    vi.mocked(d.readRestaurant).mockResolvedValueOnce({ data: { restaurant: { ...restaurant("a"), name: "renamed" }, claims: [], notes: [], state: null }, stats: STATS });
    await r.requestPartial(TARGET, "a");
    const after = (await readMeta())!;
    expect(after.downloadedAt).toBe(before.downloadedAt);
    expect(after.revision).toBe(before.revision + 1);
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.find((x) => x.id === "a")!.name).toBe("renamed");
  });

  it("a first download refused by storage marks the device as unable to store a copy", async () => {
    const d = deps();
    const r = createRefresher(d);
    vi.stubGlobal("indexedDB", undefined);
    await r.requestFull(TARGET);
    vi.unstubAllGlobals();
    expect(r.status()).toMatchObject({ lastFailure: "storage", cantStore: true });
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/refresher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the refresher**

Create `web/src/offline/refresher.ts`:

```ts
import { useSyncExternalStore } from "react";
import { readHouseholdFromServer, readRestaurantFromServer, RefreshDenied, RefreshOffline, type ReadStats } from "./serverReads";
import { reportDenied } from "./session";
import { readMeta, readToken, replaceCopy, replaceRestaurant } from "./store";
import type { CopyData, RestaurantData } from "./types";

/** Keeps the copy current (spec §3.9 "Refresh"): single flight, at most one extra run, stale work re-run. */
export type RefreshFailure = "offline" | "storage" | "server" | "denied";
export interface RefreshStatus { running: boolean; lastFailure: RefreshFailure | null; lastWrittenAt: number | null; cantStore: boolean }
export interface RefreshTarget { uid: string; householdId: string; displayName: string }

export interface RefresherDeps {
  readHousehold(hid: string): Promise<{ data: CopyData; stats: ReadStats }>;
  readRestaurant(hid: string, rid: string): Promise<{ data: RestaurantData | null; stats: ReadStats }>;
  now(): number;
  /** A permission-denied read: AuthProvider re-reads membership; never a wipe by itself. */
  onDenied(): void;
  /** Test-only pause between the server reads and the write (browser test 5). */
  pause(): Promise<void>;
}

export interface Refresher {
  requestFull(target: RefreshTarget): Promise<void>;
  requestPartial(target: RefreshTarget, rid: string): Promise<void>;
  status(): RefreshStatus;
  subscribe(cb: () => void): () => void;
  lastStats(): ReadStats | null;
}

/** Bounds re-runs when other tabs keep winning. */
const MAX_STALE_RETRIES = 3;

export function createRefresher(deps: RefresherDeps): Refresher {
  let status: RefreshStatus = { running: false, lastFailure: null, lastWrittenAt: null, cantStore: false };
  let stats: ReadStats | null = null;
  let target: RefreshTarget | null = null;
  let fullPending = false;
  const partialsPending = new Set<string>();
  let running: Promise<void> | null = null;
  const subscribers = new Set<() => void>();

  const set = (next: Partial<RefreshStatus>) => {
    status = { ...status, ...next };
    for (const cb of subscribers) cb();
  };

  function failureOf(err: unknown): RefreshFailure {
    if (err instanceof RefreshDenied) return "denied";
    if (err instanceof RefreshOffline) return "offline";
    return "server";
  }

  async function runFull(t: RefreshTarget): Promise<"done" | "stale"> {
    const token = await readToken().catch(() => null);
    if (!token) { set({ lastFailure: "storage" }); return "done"; }
    let read: { data: CopyData; stats: ReadStats };
    try {
      read = await deps.readHousehold(t.householdId);
    } catch (err) {
      const failure = failureOf(err);
      set({ lastFailure: failure });
      if (failure === "denied") deps.onDenied();
      return "done";
    }
    await deps.pause();
    const result = await replaceCopy(t, token, read.data, deps.now());
    switch (result) {
      case "written":
        stats = read.stats;
        set({ lastFailure: null, lastWrittenAt: deps.now(), cantStore: false });
        return "done";
      case "stale":
        return "stale";
      case "storageFull":
      case "unavailable":
        set({ lastFailure: "storage", cantStore: (await readMeta()) === null });
        return "done";
      default:
        // cleared, optedOut, otherCopy: cleanup won; nothing to report.
        return "done";
    }
  }

  async function runPartial(t: RefreshTarget, rid: string): Promise<"done" | "stale"> {
    const token = await readToken().catch(() => null);
    if (!token) return "done";
    let read: { data: RestaurantData | null };
    try {
      read = await deps.readRestaurant(t.householdId, rid);
    } catch (err) {
      const failure = failureOf(err);
      set({ lastFailure: failure });
      if (failure === "denied") deps.onDenied();
      return "done";
    }
    await deps.pause();
    const result = await replaceRestaurant(t, token, rid, read.data);
    return result === "stale" ? "stale" : "done";
  }

  async function loop(): Promise<void> {
    set({ running: true });
    let staleRetries = 0;
    try {
      while (target && (fullPending || partialsPending.size > 0)) {
        const t = target;
        if (fullPending) {
          fullPending = false;
          partialsPending.clear(); // a full refresh covers every partial
          if ((await runFull(t)) === "stale" && staleRetries++ < MAX_STALE_RETRIES) fullPending = true;
        } else {
          const rid = partialsPending.values().next().value as string;
          partialsPending.delete(rid);
          if ((await runPartial(t, rid)) === "stale" && staleRetries++ < MAX_STALE_RETRIES) partialsPending.add(rid);
        }
      }
    } finally {
      set({ running: false });
    }
  }

  function kick(): Promise<void> {
    if (!running) running = loop().finally(() => { running = null; });
    return running;
  }

  return {
    requestFull(t) {
      target = t;
      fullPending = true;
      return kick();
    },
    requestPartial(t, rid) {
      target = t;
      partialsPending.add(rid);
      return kick();
    },
    status: () => status,
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    lastStats: () => stats,
  };
}

async function devPause(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const hook = (globalThis as { __SAFEBITE_REFRESH_PAUSE__?: () => Promise<void> }).__SAFEBITE_REFRESH_PAUSE__;
  if (hook) await hook();
}

export const refresher: Refresher = createRefresher({
  readHousehold: readHouseholdFromServer,
  readRestaurant: readRestaurantFromServer,
  now: () => Date.now(),
  onDenied: reportDenied,
  pause: devPause,
});

export function useRefreshStatus(): RefreshStatus {
  return useSyncExternalStore(refresher.subscribe, refresher.status, refresher.status);
}

let optInVersion = 0;
const optInSubscribers = new Set<() => void>();
/** Settings calls this after changing the switch, so AuthProvider starts or stops the triggers. */
export function notifyOptInChanged(): void {
  optInVersion += 1;
  for (const cb of optInSubscribers) cb();
}
export function useOptInVersion(): number {
  return useSyncExternalStore(
    (cb) => { optInSubscribers.add(cb); return () => optInSubscribers.delete(cb); },
    () => optInVersion,
    () => optInVersion,
  );
}
```

Run: `npm --prefix web exec vitest run src/offline/refresher.test.ts`
Expected: PASS (9). The refresher test imports `./refresher`, which imports `./serverReads` and therefore `../firebase`; if the import fails in jsdom, add `vi.mock("../firebase", () => ({ db: {} }));` at the top of the test.

- [ ] **Step 5: Write the failing trigger tests**

Create `web/src/offline/refreshTriggers.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRefreshTriggers } from "./refreshTriggers";
import { REFRESH_INTERVAL_MS } from "./types";

let visibility: DocumentVisibilityState = "visible";
beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startRefreshTriggers", () => {
  it("refreshes on reconnection", () => {
    const run = vi.fn();
    const stop = startRefreshTriggers(run, async () => 0);
    window.dispatchEvent(new Event("online"));
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it("on return, refreshes only a copy older than 15 minutes (or none)", async () => {
    const run = vi.fn();
    let age: number | null = REFRESH_INTERVAL_MS - 1;
    const stop = startRefreshTriggers(run, async () => age);
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    age = REFRESH_INTERVAL_MS + 1;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    age = null;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    stop();
  });

  it("the 15-minute timer always runs while visible and never while hidden (review R2-1)", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const stop = startRefreshTriggers(run, async () => 0);
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
    visibility = "visible";
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/refreshTriggers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the triggers**

Create `web/src/offline/refreshTriggers.ts`:

```ts
import { REFRESH_INTERVAL_MS } from "./types";

/**
 * Full-refresh triggers while a member is opted in (spec §3.9 "Refresh" step 4): reconnection,
 * returning to the page with a copy older than 15 minutes, and every 15 minutes while visible.
 * The timer is never skipped: live listeners prove only the queries on screen (review R2-1).
 * `ageOf` returns the copy's age in ms, or null when there is no copy.
 */
export function startRefreshTriggers(run: () => void, ageOf: () => Promise<number | null>): () => void {
  const onOnline = () => run();
  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    void ageOf().then((age) => {
      if (age === null || age > REFRESH_INTERVAL_MS) run();
    });
  };
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, REFRESH_INTERVAL_MS);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
```

Run: `npm --prefix web exec vitest run src/offline/refreshTriggers.test.ts`
Expected: PASS (3).

- [ ] **Step 7: Write the failing write-observer tests**

Append to `web/src/records/repository.test.ts` (add `setWriteObserver` and `deleteClaim` to the import list):

```ts
describe("write observer (spec §3.9 Refresh step 5)", () => {
  afterEach(() => setWriteObserver(null));

  it("reports the household and restaurant after a successful write only", async () => {
    const seen = vi.fn();
    setWriteObserver(seen);
    m.runTransaction.mockResolvedValueOnce("new-rid");
    await createRestaurant("home", "ava-uid", { name: "Da Marco", address: "1 St" });
    expect(seen).toHaveBeenCalledWith("home", "new-rid");
    m.runTransaction.mockResolvedValueOnce(undefined);
    await deleteClaim("home", "r1", "c1");
    expect(seen).toHaveBeenLastCalledWith("home", "r1");
    m.runTransaction.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "permission-denied" }));
    await deleteClaim("home", "r1", "c2");
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("an observer that throws never breaks the write", async () => {
    setWriteObserver(() => { throw new Error("observer"); });
    m.runTransaction.mockResolvedValueOnce(undefined);
    await expect(deleteClaim("home", "r1", "c1")).resolves.toEqual({ kind: "ok", value: undefined });
  });
});
```

Run: `npm --prefix web exec vitest run src/records/repository.test.ts`
Expected: FAIL — `setWriteObserver` is not exported.

- [ ] **Step 8: Add the observer and wrap every writer**

In `web/src/records/repository.ts`, after the `write` function, add:

```ts
type WriteObserver = (hid: string, rid: string) => void;
let writeObserver: WriteObserver | null = null;

/** The offline refresher's partial refresh after a successful write (spec §3.9 Refresh step 5). */
export function setWriteObserver(observer: WriteObserver | null): void {
  writeObserver = observer;
}

/** Reports `hid`/`rid` to the observer when the write succeeded. Never affects the outcome. */
export async function observed<T>(hid: string, rid: string | ((value: T) => string), outcome: Promise<WriteOutcome<T>>): Promise<WriteOutcome<T>> {
  const out = await outcome;
  if (out.kind === "ok") {
    try {
      writeObserver?.(hid, typeof rid === "function" ? rid(out.value) : rid);
    } catch {
      // never let the copy affect a write
    }
  }
  return out;
}
```

Then change each writer's `return write(...)` to `return observed(hid, <rid>, write(...))`, exactly:

| File | Function | Change |
|---|---|---|
| `repository.ts` | `createRestaurant` | `return observed(hid, (id: string) => id, write(async (tx) => { … }));` |
| `repository.ts` | `updateRestaurant` | `return observed(hid, rid, write(async (tx) => { … }));` |
| `repository.ts` | `markDeleting` | `return observed(hid, rid, write(async (tx) => { … }));` |
| `repository.ts` | `finishDeleting` | last line becomes `return observed(hid, rid, removeRestaurant(hid, rid));` |
| `repository.ts` | `addClaim` | `return observed(hid, rid, write(async (tx) => { … }));` |
| `repository.ts` | `deleteClaim` | `return observed(hid, rid, write(async (tx) => { … }));` |
| `collection.ts` | `writeState` | `return observed(hid, rid, write(async (tx) => { … }));` (import `observed` from `./repository`) |
| `notes.ts` | `addNote`, `updateNote`, `deleteNote` | `return observed(hid, rid, write(async (tx) => { … }));` (import `observed`) |

The `…` is each function's existing transaction body, unchanged.

Run: `npm --prefix web exec vitest run src/records`
Expected: PASS (existing + 2).

- [ ] **Step 9: Start refreshes from AuthProvider**

In `web/src/auth/AuthProvider.tsx` add imports:

```tsx
import { setWriteObserver } from "../records/repository";
import { refresher, useOptInVersion } from "../offline/refresher";
import { startRefreshTriggers } from "../offline/refreshTriggers";
import { getOptIn, readMeta } from "../offline/store";
```

and this effect after the denial-handler effect:

```tsx
  // Keep the copy current while a member is opted in on this device (spec §3.9 "Refresh").
  const optInVersion = useOptInVersion();
  const memberKey = state.status === "member" ? `${state.uid}|${state.householdId}|${state.displayName}` : null;
  useEffect(() => {
    const current = stateRef.current;
    if (memberKey === null || current.status !== "member") return;
    const target = { uid: current.uid, householdId: current.householdId, displayName: current.displayName };
    let cancelled = false;
    let stopTriggers = () => {};
    void getOptIn(target.uid).then((on) => {
      if (cancelled || !on) return;
      void refresher.requestFull(target);
      stopTriggers = startRefreshTriggers(
        () => void refresher.requestFull(target),
        async () => {
          const meta = await readMeta();
          return meta ? Date.now() - meta.downloadedAt : null;
        },
      );
    });
    setWriteObserver((hid, rid) => {
      if (hid !== target.householdId) return;
      void getOptIn(target.uid).then((on) => { if (on) void refresher.requestPartial(target, rid); });
    });
    return () => {
      cancelled = true;
      stopTriggers();
      setWriteObserver(null);
    };
  }, [memberKey, optInVersion]);
```

In `web/src/auth/AuthProvider.test.tsx`, mock the refresher (add with the other mocks):

```ts
const refresh = vi.hoisted(() => ({ requestFull: vi.fn(async () => {}), requestPartial: vi.fn(async () => {}) }));
vi.mock("../offline/refresher", () => ({ refresher: refresh, useOptInVersion: () => 0 }));
```

add `refresh.requestFull.mockClear(); refresh.requestPartial.mockClear();` to `beforeEach`, add `import { observed } from "../records/repository";` to the imports, and append:

```ts
describe("refresh start (spec §3.9 Refresh step 4)", () => {
  it("an opted-in member starts a full refresh; an opted-out member does not", async () => {
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh.requestFull).not.toHaveBeenCalled();
  });

  it("starts a full refresh, and a successful write requests a partial one", async () => {
    await setOptIn("ava-uid", true);
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(refresh.requestFull).toHaveBeenCalledWith({ uid: "ava-uid", householdId: "home", displayName: "Ava" }));
    await observed("home", "r1", Promise.resolve({ kind: "ok" as const, value: undefined }));
    await waitFor(() => expect(refresh.requestPartial).toHaveBeenCalledWith({ uid: "ava-uid", householdId: "home", displayName: "Ava" }, "r1"));
  });
});
```

The `records/repository` module imports `firebase/firestore` symbols that the AuthProvider test's `firebase/firestore` mock does not provide. Extend that mock to spread the real module: `vi.mock("firebase/firestore", async (importOriginal) => ({ ...(await importOriginal<typeof import("firebase/firestore")>()), doc: (_db: unknown, path: string) => ({ path }), getDocFromServer: (ref: { path: string }) => getDocMock(ref.path) }));`

Run: `npm --prefix web exec vitest run src/auth/AuthProvider.test.tsx`
Expected: PASS (previous + 2).

- [ ] **Step 10: Measure the refresh read cost (empirical stop 5)**

Create `planning/audits/plan-5b-probes/stop-5-cost.spec.ts`:

```ts
// Plan 5b empirical stop 5: billed reads of one full refresh. Run from a temporary copy in web/e2e/.
import { expect, test } from "@playwright/test";
import { clearRecords, seedClaim, seedNote, seedRestaurant } from "./emulator-rest";

test.setTimeout(600_000);

test("stop 5: reads of one full refresh for 100 restaurants, ~5 claims and ~2 notes each", async ({ page, request }) => {
  await clearRecords(request);
  for (let i = 0; i < 100; i += 1) {
    const rid = `cost-${String(i).padStart(3, "0")}`;
    await seedRestaurant(request, rid, { name: `Cost ${i}` });
    for (let c = 0; c < 5; c += 1) await seedClaim(request, rid, `${rid}-c${c}`);
    if (i % 2 === 0) for (let n = 0; n < 4; n += 1) await seedNote(request, rid, `${rid}-n${n}`); // half have notes: empty queries count
  }
  await page.goto("/e2e/offline-harness.html");
  const stats = await page.evaluate(async () => {
    (window as any).__SAFEBITE_BUILD__ = false;
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    await (await load("/src/account/authPersistence.ts")).prepareAuthPersistence();
    const { auth } = await load("/src/firebase.ts");
    const { signInWithEmailAndPassword } = await load("/node_modules/.vite/deps/firebase_auth.js");
    await signInWithEmailAndPassword(auth, "ava@safebite.test", "pilot-password-1");
    const { readHouseholdFromServer } = await load("/src/offline/serverReads.ts");
    return (await readHouseholdFromServer("home")).stats;
  });
  const billed = stats.documents + stats.emptyQueries + stats.queries; // documents + empty-query minimums + one rules get() per query
  console.log(`STOP5 ${JSON.stringify(stats)} estimatedBilledReads=${billed} perHourAt4=${billed * 4}`);
  expect(stats.queries).toBe(1 + 2 * 100 + 1);
  await clearRecords(request);
});
```

Run (10 minute timeout):
```bash
cp planning/audits/plan-5b-probes/stop-5-cost.spec.ts web/e2e/zz-probe-5b-cost.spec.ts
node tooling/ensure-secret-local.mjs && npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:exec --only auth,firestore,functions --project demo-safebite "node functions/lib/seed-emulator.js && npm --prefix web run e2e -- zz-probe-5b-cost.spec.ts --retries=0" 2>&1 | tee /tmp/plan-5b-stop-5.log | grep -E "STOP5|passed|failed"
rm web/e2e/zz-probe-5b-cost.spec.ts
```
Expected: `STOP5 {"queries":202,"documents":~800,"emptyQueries":~50} estimatedBilledReads≈1050 perHourAt4≈4200`. Add the line to `results.md` and to the ledger's stop 5 row. This is an estimate from the emulator (which does not bill); 5c checks the pilot's real usage.

- [ ] **Step 11: Run the web suite, typecheck and browser suite**

Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 21 new (5 server reads, 9 refresher, 3 triggers, 2 observer, 2 AuthProvider).
Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add web/src/offline web/src/records/repository.ts web/src/records/collection.ts web/src/records/notes.ts web/src/records/repository.test.ts web/src/auth/AuthProvider.tsx web/src/auth/AuthProvider.test.tsx planning/audits/plan-5b-probes planning/audits/2026-10-10-plan-5b-execution-ledger.md
git commit -m "feat(offline): keep the copy current — server-pinned refresh, triggers, partial refresh

Spec §3.9 Refresh: server-pinned reads refuse cache snapshots (P1-1); a
single-flight refresher with one coalesced extra run, stale work re-run
(R2-2), cleanup winning, permission-denied deferring to the membership read,
and a dev-only pause hook. Triggers: entering member, opt-in, online, return
after 15 minutes, and an unconditional 15-minute timer while visible (R2-1).
Every successful write requests a partial refresh of its restaurant.
Empirical stop 5: <measured line>.
Web unit: previous + 21.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

Replace `<measured line>` with the `STOP5` result before committing.

---
### Task 9: Read source — the copy whenever the server cannot answer

Spec §3.9 "Read source" (rule, `member`, `offlineMember`, not-in-copy, notices, empty copy, transition), ruling 6, reviews P2-2, P3-9, Review Focus 4.

**Files:**
- Modify: `web/src/records/repository.ts` (`Snapshot` gains `source`/`cacheMiss`; watchers wrapped), `web/src/records/collection.ts`, `web/src/records/notes.ts`
- Create: `web/src/offline/withCopy.ts`, `web/src/offline/withCopy.test.ts`
- Create: `web/src/offline/hooks.ts`
- Modify: `web/src/records/useWatch.ts`; Create: `web/src/records/useWatch.test.tsx`
- Modify: `web/src/records/ReadStateNotice.tsx`; Create: `web/src/records/ReadStateNotice.test.tsx`
- Modify: `web/src/records/RestaurantsPage.tsx`, `web/src/records/RestaurantsPage.test.tsx`

**Interfaces:**
- Consumes: `getCopySession`, `beginServingCopy`, `loadUsableCopy`, `reportDenied`, `subscribeCopySession`, `isServingCopy` (Task 4).
- Produces: `Snapshot<T>` variants `{ status: "ready" | "offline"; value: T; source?: "copy" }` and `{ status: "error"; message: string; cacheMiss?: true }` (others unchanged); `NOT_IN_COPY` message; `withCopy<T>(live, select): (cb) => () => void`; hooks `useCopyServing(): boolean` and `useCopyMode(): "member" | "offlineMember" | null` in `offline/hooks.ts`.

- [ ] **Step 1: Extend the snapshot type**

In `web/src/records/repository.ts` replace the `Snapshot` type:

```ts
export type Snapshot<T> =
  /** `source: "copy"`: read from the offline copy because the server could not answer (spec §3.9). */
  | { status: "ready" | "offline"; value: T; source?: "copy" }
  | { status: "gone" }
  | { status: "denied" }
  /** `cacheMiss`: offline and this document is not in the memory cache — the copy may still have it. */
  | { status: "error"; message: string; cacheMiss?: true };
```

and in `watchRestaurant` change the cached-miss line to:

```ts
        cb(snap.metadata.fromCache ? { status: "error", message: NOT_IN_COPY, cacheMiss: true } : { status: "gone" });
```

with `import { NOT_IN_COPY } from "../offline/withCopy";` (Step 3 creates it; the message text is unchanged: "You are offline and this restaurant has not been loaded on this device.").

- [ ] **Step 2: Write the failing read-source tests**

Create `web/src/offline/withCopy.test.ts`:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../records/repository";
import type { Note, Restaurant } from "../records/types";
import { isServingCopy, setCopySession, setDeniedHandler } from "./session";
import { readToken, replaceCopy, setOptIn } from "./store";
import type { CopyData } from "./types";
import { NOT_IN_COPY, withCopy } from "./withCopy";

vi.mock("../auth/resetDocument", () => ({ resetDocument: vi.fn() }));

const ID = { uid: "ava-uid", householdId: "home" };
const r = (id: string): Restaurant => ({ id, name: id, address: "", createdBy: "ava-uid", createdAt: new Date(0), updatedAt: new Date(0), version: 1, deleting: false });
const note = (id: string, at: number): Note => ({ id, text: id, authorUid: "ava-uid", authorName: "Ava", createdAt: new Date(at), updatedAt: new Date(at), version: 1 });

async function seed() {
  await setOptIn("ava-uid", true);
  const data: CopyData = { restaurants: [r("a")], claims: { a: [] }, collection: {}, notes: { a: [note("old", 1), note("new", 2)] } };
  await replaceCopy({ ...ID, displayName: "Ava" }, await readToken(), data, Date.now());
}

/** A fake live listener the test drives. */
function live<T>() {
  let emit: (s: Snapshot<T>) => void = () => {};
  const subscribe = vi.fn((cb: (s: Snapshot<T>) => void) => { emit = cb; return vi.fn(); });
  return { subscribe, emit: (s: Snapshot<T>) => emit(s) };
}

const restaurantsFromCopy = (copy: CopyData): Snapshot<Restaurant[]> => ({ status: "offline", source: "copy", value: copy.restaurants });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  setCopySession(null);
  setDeniedHandler(null);
});

describe("withCopy", () => {
  it("without a copy session it passes snapshots straight through, synchronously", () => {
    const l = live<Restaurant[]>();
    const seen: unknown[] = [];
    withCopy(l.subscribe, restaurantsFromCopy)((s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    expect(seen).toEqual([{ status: "offline", value: [] }]);
  });

  it("member: a cache-served snapshot is replaced by the copy; a server snapshot wins back (P2-2)", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: Array<Snapshot<Restaurant[]>> = [];
    withCopy(l.subscribe, restaurantsFromCopy)((s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatchObject({ status: "offline", source: "copy" });
    expect(isServingCopy()).toBe(true);
    l.emit({ status: "ready", value: [r("live")] });
    expect(seen[1]).toEqual({ status: "ready", value: [r("live")] });
    expect(isServingCopy()).toBe(false);
  });

  it("a server snapshot arriving while the copy is being read is never overwritten by it", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: Array<Snapshot<Restaurant[]>> = [];
    withCopy(l.subscribe, restaurantsFromCopy)((s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    l.emit({ status: "ready", value: [r("live")] });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toEqual([{ status: "ready", value: [r("live")] }]);
  });

  it("a cached miss reads the restaurant from the copy, or keeps the not-loaded error", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const select = (rid: string) => (copy: CopyData): Snapshot<Restaurant> => {
      const found = copy.restaurants.find((x) => x.id === rid);
      return found ? { status: "offline", source: "copy", value: found } : { status: "error", message: NOT_IN_COPY, cacheMiss: true };
    };
    for (const [rid, expected] of [["a", "offline"], ["zz", "error"]] as const) {
      const l = live<Restaurant>();
      const seen: Array<Snapshot<Restaurant>> = [];
      withCopy(l.subscribe, select(rid))((s) => seen.push(s));
      l.emit({ status: "error", message: NOT_IN_COPY, cacheMiss: true });
      await vi.waitFor(() => expect(seen).toHaveLength(1));
      expect(seen[0]!.status).toBe(expected);
    }
  });

  it("offlineMember creates no live listener and serves the copy", async () => {
    await seed();
    setCopySession({ ...ID, mode: "offlineMember" });
    const l = live<Restaurant[]>();
    const seen: Array<Snapshot<Restaurant[]>> = [];
    withCopy(l.subscribe, restaurantsFromCopy)((s) => seen.push(s));
    expect(l.subscribe).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(seen[0]).toMatchObject({ status: "offline", source: "copy" }));
  });

  it("notes from the copy stay newest first (Review Focus 4)", async () => {
    await seed();
    setCopySession({ ...ID, mode: "offlineMember" });
    const seen: Array<Snapshot<Note[]>> = [];
    withCopy<Note[]>(live<Note[]>().subscribe, (copy) => ({ status: "offline", source: "copy", value: copy.notes.a ?? [] }))((s) => seen.push(s));
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    const first = seen[0]!;
    expect(first.status === "offline" ? first.value.map((n) => n.id) : null).toEqual(["new", "old"]);
  });

  it("a denial is reported for a membership re-read and releases the copy", async () => {
    const denied = vi.fn();
    setDeniedHandler(denied);
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: unknown[] = [];
    withCopy(l.subscribe, restaurantsFromCopy)((s) => seen.push(s));
    l.emit({ status: "denied" });
    expect(denied).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ status: "denied" }]);
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/withCopy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the read source**

Create `web/src/offline/withCopy.ts`:

```ts
import type { Snapshot } from "../records/repository"; // type only: erased, no Firebase at run time
import { beginServingCopy, getCopySession, loadUsableCopy, reportDenied } from "./session";
import type { CopyData } from "./types";

export const NOT_IN_COPY = "You are offline and this restaurant has not been loaded on this device.";

/**
 * Rule (spec §3.9 "Read source"): the UI shows the server or the copy, never the memory cache,
 * whenever a usable copy exists. Wraps a live watcher; `select` maps the copy to this query's
 * snapshot. In offlineMember no listener is created. A listener denial is reported so
 * AuthProvider re-reads membership (review R2-4).
 */
export function withCopy<T>(
  live: (cb: (s: Snapshot<T>) => void) => () => void,
  select: (copy: CopyData) => Snapshot<T>,
): (cb: (s: Snapshot<T>) => void) => () => void {
  return (cb) => {
    let closed = false;
    let seq = 0;
    let release: (() => void) | null = null;
    const stopServing = () => {
      release?.();
      release = null;
    };
    const serveCopy = async (fallback: Snapshot<T>, mine: number) => {
      const copy = await loadUsableCopy();
      if (closed || mine !== seq) return; // a newer snapshot arrived meanwhile
      if (!copy) {
        stopServing();
        cb(fallback);
        return;
      }
      release ??= beginServingCopy();
      cb(select(copy.data));
    };

    if (getCopySession()?.mode === "offlineMember") {
      void serveCopy({ status: "error", message: NOT_IN_COPY, cacheMiss: true }, seq);
      return () => {
        closed = true;
        stopServing();
      };
    }

    const unsubscribe = live((s) => {
      const mine = ++seq;
      const fromCache = s.status === "offline" || (s.status === "error" && s.cacheMiss === true);
      if (fromCache && getCopySession() !== null) {
        void serveCopy(s, mine);
        return;
      }
      stopServing();
      if (s.status === "denied") reportDenied();
      cb(s);
    });
    return () => {
      closed = true;
      stopServing();
      unsubscribe();
    };
  };
}
```

Create `web/src/offline/hooks.ts`:

```ts
import { useSyncExternalStore } from "react";
import { getCopySession, isServingCopy, subscribeCopySession } from "./session";

/** True while this document shows any copy data (offlineMember, or a watcher serving the copy). */
export function useCopyServing(): boolean {
  return useSyncExternalStore(subscribeCopySession, isServingCopy, isServingCopy);
}

export function useCopyMode(): "member" | "offlineMember" | null {
  const read = () => getCopySession()?.mode ?? null;
  return useSyncExternalStore(subscribeCopySession, read, read);
}
```

Run: `npm --prefix web exec vitest run src/offline/withCopy.test.ts`
Expected: PASS (7).

- [ ] **Step 4: Wrap every watcher**

In `web/src/records/repository.ts`, rename the three watcher functions to non-exported `listenRestaurants`, `listenRestaurant`, `listenClaims` (bodies unchanged) and add, with `import { NOT_IN_COPY, withCopy } from "../offline/withCopy";`:

```ts
export function watchRestaurants(hid: string, cb: (s: Snapshot<Restaurant[]>) => void): () => void {
  return withCopy<Restaurant[]>((c) => listenRestaurants(hid, c), (copy) => ({ status: "offline", source: "copy", value: copy.restaurants }))(cb);
}

export function watchRestaurant(hid: string, rid: string, cb: (s: Snapshot<Restaurant>) => void): () => void {
  return withCopy<Restaurant>((c) => listenRestaurant(hid, rid, c), (copy) => {
    const found = copy.restaurants.find((r) => r.id === rid);
    return found ? { status: "offline", source: "copy", value: found } : { status: "error", message: NOT_IN_COPY, cacheMiss: true };
  })(cb);
}

export function watchClaims(hid: string, rid: string, cb: (s: Snapshot<Claim[]>) => void): () => void {
  return withCopy<Claim[]>((c) => listenClaims(hid, rid, c), (copy) => ({ status: "offline", source: "copy", value: copy.claims[rid] ?? [] }))(cb);
}
```

In `web/src/records/collection.ts`, rename to `listenCollection`, `listenCollectionEntry` and add:

```ts
export function watchCollection(hid: string, cb: (s: Snapshot<Record<string, CollectionState>>) => void): () => void {
  return withCopy<Record<string, CollectionState>>((c) => listenCollection(hid, c), (copy) => ({ status: "offline", source: "copy", value: copy.collection }))(cb);
}

export function watchCollectionEntry(hid: string, rid: string, cb: (s: Snapshot<CollectionState | null>) => void): () => void {
  return withCopy<CollectionState | null>((c) => listenCollectionEntry(hid, rid, c), (copy) => ({ status: "offline", source: "copy", value: copy.collection[rid] ?? null }))(cb);
}
```

In `web/src/records/notes.ts`, rename to `listenNotes` and add:

```ts
export function watchNotes(hid: string, rid: string, cb: (s: Snapshot<Note[]>) => void): () => void {
  return withCopy<Note[]>((c) => listenNotes(hid, rid, c), (copy) => ({ status: "offline", source: "copy", value: copy.notes[rid] ?? [] }))(cb);
}
```

(both files: `import { withCopy } from "../offline/withCopy";`).

Run: `npm --prefix web exec vitest run src/records`
Expected: PASS — with no copy session the wrapper is synchronous and transparent, so the existing watcher tests are unchanged.

- [ ] **Step 5: Write the failing useWatch and notice tests**

Create `web/src/records/useWatch.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "./repository";
import { useWatch } from "./useWatch";
import { setCopySession } from "../offline/session";

describe("useWatch and the copy session", () => {
  it("re-subscribes on offlineMember → member and keeps the copy value instead of flashing loading", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
    const emitters: Array<(s: Snapshot<string[]>) => void> = [];
    const { result } = renderHook(() => useWatch<string[]>((cb) => { emitters.push(cb); return () => {}; }, ["home"]));
    act(() => emitters[0]!({ status: "offline", source: "copy", value: ["from-copy"] }));
    act(() => setCopySession({ uid: "ava-uid", householdId: "home", mode: "member" }));
    expect(emitters).toHaveLength(2);
    expect(result.current.state).toEqual({ status: "offline", source: "copy", value: ["from-copy"] });
    act(() => emitters[1]!({ status: "ready", value: ["live"] }));
    expect(result.current.state).toEqual({ status: "ready", value: ["live"] });
    act(() => setCopySession(null));
  });
});
```

Create `web/src/records/ReadStateNotice.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ serving: false }));
vi.mock("../offline/hooks", () => ({ useCopyServing: () => m.serving }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import { ReadStateNotice } from "./ReadStateNotice";

describe("ReadStateNotice offline", () => {
  it("shows the memory-cache notice when no copy data is shown", () => {
    m.serving = false;
    render(<ReadStateNotice state={{ status: "offline", value: [] }} onRetry={() => {}} />);
    expect(screen.getByTestId("read-offline")).toBeInTheDocument();
  });
  it("is silent while copy data is shown; the shell's copy banner speaks instead", () => {
    m.serving = true;
    render(<ReadStateNotice state={{ status: "offline", value: [] }} onRetry={() => {}} />);
    expect(screen.queryByTestId("read-offline")).toBeNull();
  });
});
```

Append to `web/src/records/RestaurantsPage.test.tsx` (add `vi.mock("../offline/hooks", () => ({ useCopyServing: () => hooks.serving }));` with `const hooks = vi.hoisted(() => ({ serving: false }));` next to the other mocks, and reset `hooks.serving = false` in `beforeEach`):

```tsx
describe("offline copy (spec §3.9)", () => {
  it("an empty copy says so instead of showing a bare list", async () => {
    hooks.serving = true;
    render(<MemoryRouter><RestaurantsPage /></MemoryRouter>);
    act(() => emit({ status: "offline", source: "copy", value: [] }));
    act(() => emitState({ status: "offline", source: "copy", value: {} }));
    expect(await screen.findByTestId("copy-empty")).toHaveTextContent("Nothing in the offline copy.");
  });
});
```

Run: `npm --prefix web exec vitest run src/records/useWatch.test.tsx src/records/ReadStateNotice.test.tsx src/records/RestaurantsPage.test.tsx`
Expected: FAIL — no re-subscription on mode change, the notice still shows, no `copy-empty`.

- [ ] **Step 6: Implement**

Replace `web/src/records/useWatch.ts`'s body:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useCopyMode } from "../offline/hooks";
import type { Snapshot } from "./repository";

export type WatchState<T> = Snapshot<T> | { status: "loading" };

/**
 * Subscribes to a repository watcher for the lifetime of `deps`; callbacks from a superseded
 * subscription are ignored (generation counter, as in AuthProvider), so an account or route
 * change can never paint stale data. `retry` tears down and re-subscribes. A copy-session mode
 * change (offlineMember → member) re-subscribes and keeps a copy value until the server answers
 * (spec §3.9 "Transition").
 */
export function useWatch<T>(subscribe: (cb: (s: Snapshot<T>) => void) => () => void, deps: readonly unknown[]): { state: WatchState<T>; retry: () => void } {
  const [state, setState] = useState<WatchState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const mode = useCopyMode();
  const generation = useRef(0);
  useEffect(() => {
    const mine = ++generation.current;
    setState((prev) => (prev.status === "offline" && prev.source === "copy" ? prev : { status: "loading" }));
    const unsubscribe = subscribe((s) => {
      if (mine === generation.current) setState(s);
    });
    return () => {
      generation.current += 1;
      unsubscribe();
    };
    // `subscribe` is recreated each render by callers; the real inputs are `deps`, `attempt` and the copy mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, mode]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
}
```

In `web/src/records/ReadStateNotice.tsx`, add `import { useCopyServing } from "../offline/hooks";`, call `const serving = useCopyServing();` at the top of the component, and change the `offline` case to:

```tsx
    case "offline":
      // While copy data is shown, the shell's copy banner is the only notice (spec §3.9).
      if (serving) return null;
      return (
        <p className="notice" role="status" data-testid="read-offline">
          Showing last loaded data — you are offline. Adding and editing need a connection.
        </p>
      );
```

In `web/src/records/RestaurantsPage.tsx`, add `import { useCopyServing } from "../offline/hooks";`, `const serving = useCopyServing();`, and after the `restaurants-empty` line:

```tsx
      {combined.status === "offline" && serving && all.length === 0 && <p className="empty-state" data-testid="copy-empty">Nothing in the offline copy.</p>}
```

Run: `npm --prefix web exec vitest run src/records`
Expected: PASS (existing + 4).

- [ ] **Step 7: Run the web suite, typecheck and browser suite**

Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 11 new (7 withCopy, 1 useWatch, 2 notice, 1 empty copy).
Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: all pass. The existing offline scenarios (records/collection "offline" banners) have no copy, so they still show "Showing last loaded data".

- [ ] **Step 8: Commit**

```bash
git add web/src/offline/withCopy.ts web/src/offline/withCopy.test.ts web/src/offline/hooks.ts web/src/records
git commit -m "feat(offline): pages read the copy whenever the server cannot answer

Spec §3.9 read source (ruling 6, review P2-2): every record watcher shows the
server or the copy, never the memory cache, when a usable copy exists — cold
start or app already open; offlineMember creates no listener. A cached miss
reads the restaurant from the copy; listener denials are reported for a
membership re-read. useWatch re-subscribes on the offlineMember → member
switch without a loading flash; the generic offline notice is silent while
copy data is shown; an empty copy says so.
Web unit: previous + 11.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 10: Write access — one gate for every write control and submit handler

Spec §3.9 "Write access" (review R2-6), ruling 3.

**Files:**
- Create: `web/src/offline/writeAccess.ts`, `web/src/offline/writeAccess.test.ts`, `web/src/offline/WriteBlockedNotice.tsx`
- Modify: `web/src/records/RestaurantFormPage.tsx`, `ClaimFormPage.tsx`, `RestaurantsPage.tsx`, `RestaurantDetailPage.tsx`, `StatusBlock.tsx`, `NotesSection.tsx`
- Modify: `web/src/discover/DiscoverPage.tsx`, `web/src/pages/ChangePasswordForm.tsx`, `web/src/pages/SettingsPage.tsx`, `web/src/account/ExportSection.tsx`
- Test: `web/src/records/RestaurantFormPage.test.tsx`, `ClaimFormPage.test.tsx`, `RestaurantDetailPage.test.tsx`, `web/src/pages/ChangePasswordForm.test.tsx`, `web/src/account/ExportSection.test.tsx`

**Interfaces:**
- Consumes: `getCopySession`, `isServingCopy`, `subscribeCopySession` (Task 4).
- Produces: `canWrite(): boolean`, `useWriteAccess(): boolean`, `isConnected(): boolean`, `useConnectivity(): boolean`, `<WriteBlockedNotice />` (test ID `write-blocked`, text "Adding and editing need a connection.").

- [ ] **Step 1: Write the failing gate tests**

Create `web/src/offline/writeAccess.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginServingCopy, setCopySession } from "./session";
import { canWrite, isConnected, useWriteAccess } from "./writeAccess";

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
  setCopySession(null);
});

describe("canWrite (review R2-6)", () => {
  it("is true for an online member showing live data", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "member" });
    expect(canWrite()).toBe(true);
    expect(isConnected()).toBe(true);
  });
  it("is false in offlineMember", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
    expect(canWrite()).toBe(false);
    expect(isConnected()).toBe(false);
  });
  it("is false while any watcher serves copy data", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "member" });
    const release = beginServingCopy();
    expect(canWrite()).toBe(false);
    release();
    expect(canWrite()).toBe(true);
  });
  it("is false while the browser reports offline, and the hook follows the events", () => {
    const { result } = renderHook(() => useWriteAccess());
    expect(result.current).toBe(true);
    setOnline(false);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(result.current).toBe(false);
    setOnline(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(result.current).toBe(true);
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/writeAccess.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the gate**

Create `web/src/offline/writeAccess.ts`:

```ts
import { useSyncExternalStore } from "react";
import { getCopySession, isServingCopy, subscribeCopySession } from "./session";

/**
 * The single write gate (spec §3.9 "Write access", review R2-6): false in offlineMember, while any
 * watcher on the page shows copy data, and while the browser reports offline. Every write control
 * and every submit handler uses it; the server transaction stays the final guard.
 */
function browserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function isConnected(): boolean {
  return browserOnline() && getCopySession()?.mode !== "offlineMember";
}

export function canWrite(): boolean {
  return isConnected() && !isServingCopy();
}

function subscribe(cb: () => void): () => void {
  const stop = subscribeCopySession(cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    stop();
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useWriteAccess(): boolean {
  return useSyncExternalStore(subscribe, canWrite, canWrite);
}

/** For actions that need the network but are not writes (Discover search). */
export function useConnectivity(): boolean {
  return useSyncExternalStore(subscribe, isConnected, isConnected);
}
```

Create `web/src/offline/WriteBlockedNotice.tsx`:

```tsx
/** Shown on write routes while writes are not allowed (spec §3.9 "Write access"). */
export function WriteBlockedNotice() {
  return <p className="notice" role="status" data-testid="write-blocked">Adding and editing need a connection.</p>;
}
```

Run: `npm --prefix web exec vitest run src/offline/writeAccess.test.ts`
Expected: PASS (4).

- [ ] **Step 3: Write the failing page tests**

In `web/src/records/RestaurantFormPage.test.tsx` and `web/src/records/ClaimFormPage.test.tsx`, add next to the existing mocks:

```ts
const w = vi.hoisted(() => ({ writable: true }));
vi.mock("../offline/writeAccess", () => ({ useWriteAccess: () => w.writable, canWrite: () => w.writable }));
```

with `w.writable = true;` in a `beforeEach` (add one to `ClaimFormPage.test.tsx`, importing `beforeEach`). Append to `RestaurantFormPage.test.tsx`:

```tsx
describe("write gate (review R2-6)", () => {
  it("opening /restaurants/new while writes are not allowed disables Save and says why", async () => {
    w.writable = false;
    renderAt("/restaurants/new");
    expect(await screen.findByTestId("write-blocked")).toHaveTextContent("Adding and editing need a connection.");
    expect(screen.getByTestId("save-restaurant")).toBeDisabled();
  });

  it("a form open when the connection drops never sends, even if submitted", async () => {
    renderAt("/restaurants/new");
    await screen.findByTestId("restaurant-form");
    w.writable = false;
    const form = screen.getByTestId("restaurant-form") as HTMLFormElement;
    form.requestSubmit();
    await new Promise((r) => setTimeout(r, 10));
    expect(m.createRestaurant).not.toHaveBeenCalled();
  });
});
```

Append to `ClaimFormPage.test.tsx`:

```tsx
describe("write gate (review R2-6)", () => {
  it("the evidence form opened while writes are not allowed is disabled and says why", () => {
    w.writable = false;
    renderPage();
    expect(screen.getByTestId("write-blocked")).toBeInTheDocument();
    expect(screen.getByTestId("claim-submit")).toBeDisabled();
  });

  it("submitting after the connection drops sends nothing", async () => {
    renderPage();
    w.writable = false;
    (screen.getByTestId("claim-form") as HTMLFormElement).requestSubmit();
    await new Promise((r) => setTimeout(r, 10));
    expect(m.addClaim).not.toHaveBeenCalled();
  });
});
```

In `web/src/records/RestaurantDetailPage.test.tsx` add the same hoisted `w` and mock, reset `w.writable = true;` in the existing `beforeEach`, and append (the file's `beforeEach` already emits a ready `null` collection entry and ready empty notes; `renderPage`, `emitRestaurant`, `emitClaims` and `restaurant` are defined at the top of the file):

```tsx
describe("write gate (review R2-6)", () => {
  it("when writes are not allowed, Add evidence and every write control are disabled", () => {
    w.writable = false;
    renderPage();
    act(() => { emitRestaurant({ status: "ready", value: restaurant }); emitClaims({ status: "ready", value: [] }); });
    expect(screen.getByTestId("add-evidence")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("shortlist-add")).toBeDisabled();
    expect(screen.getByTestId("note-add-save")).toBeDisabled();
  });
});
```

In `web/src/pages/ChangePasswordForm.test.tsx` and `web/src/account/ExportSection.test.tsx` add the same hoisted `w` and mock and append, respectively:

```tsx
it("is disabled while writes are not allowed", () => {
  w.writable = false;
  render(<ChangePasswordForm />);
  expect(screen.getByTestId("pw-submit")).toBeDisabled();
});
```

```tsx
it("Prepare export is disabled while offline or reading the copy", () => {
  w.writable = false;
  render(<ExportSection />);
  expect(screen.getByTestId("export-prepare")).toBeDisabled();
});
```

Run: `npm --prefix web exec vitest run src/records src/pages src/account`
Expected: FAIL — no `write-blocked`, buttons enabled, handlers send.

- [ ] **Step 4: Apply the gate**

Make exactly these changes (`useWriteAccess`/`canWrite` from `"../offline/writeAccess"`, `WriteBlockedNotice` from `"../offline/WriteBlockedNotice"`):

| File | Change |
|---|---|
| `records/RestaurantFormPage.tsx` | `const writable = useWriteAccess();` and `const offline = state.status === "offline" \|\| !writable;` (replaces line 79). Render `{!writable && <WriteBlockedNotice />}` as the first child of the form's section. First line of `onSubmit` after `preventDefault()` and of `onDelete`: `if (!canWrite()) return;` |
| `records/ClaimFormPage.tsx` | `const writable = useWriteAccess();`; submit button `disabled={busy \|\| !writable}`; `{!writable && <WriteBlockedNotice />}` above the form; first line of `onSubmit` after `preventDefault()`: `if (!canWrite()) return;` |
| `records/RestaurantsPage.tsx` | `const writable = useWriteAccess();` and `const offline = combined.status === "offline" \|\| !writable;`; first line of `finish`: `if (!canWrite()) return;` |
| `records/RestaurantDetailPage.tsx` | `const writable = useWriteAccess();` and `const offline = anyOffline(rs, cs, ss, notesWatch.state) \|\| !writable;`; first line of `onDeleteClaim`: `if (!canWrite()) return;` |
| `records/StatusBlock.tsx` | first line of `run`: `if (!canWrite()) return false;` |
| `records/NotesSection.tsx` | first line of the composer's `save`, the card's `save` and `confirmDelete`: `if (!canWrite()) return;` |
| `discover/DiscoverPage.tsx` | `const writable = useWriteAccess();` in `DiscoverPage`, passed to `ResultRow` as a `writable` prop; the `result-add` button gets `disabled={!writable}` |
| `pages/ChangePasswordForm.tsx` | `const writable = useWriteAccess();`; submit `disabled={busy \|\| !writable}`; first line of the submit handler after `preventDefault()`: `if (!canWrite()) return;` |
| `account/ExportSection.tsx` | `const writable = useWriteAccess();`; `export-prepare` `disabled={state === "preparing" \|\| !writable}` |
| `pages/SettingsPage.tsx` | `const writable = useWriteAccess();`; the `delete-account-link` gets `aria-disabled={writable ? undefined : "true"}`, `className={writable ? undefined : "disabled-link"}` and `onClick={(e) => { if (!writable) e.preventDefault(); }}` |

- [ ] **Step 5: Run the tests**

Run: `npm --prefix web exec vitest run src/records src/pages src/account src/discover src/offline`
Expected: PASS (existing + 7 new in these folders).
Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 11 new (4 gate + 7 page).

- [ ] **Step 6: Run the browser suite**

Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: all pass. Existing offline scenarios already expected disabled controls; any scenario that writes immediately after `context.setOffline(false)` may need to wait for the `online` event (`await page.waitForFunction(() => navigator.onLine)`); add that wait in the scenario if one fails this way, and record it in the ledger.

- [ ] **Step 7: Commit**

```bash
git add web/src/offline/writeAccess.ts web/src/offline/writeAccess.test.ts web/src/offline/WriteBlockedNotice.tsx web/src/records web/src/discover web/src/pages web/src/account
git commit -m "feat(offline): one write gate for every write control and submit handler

Spec §3.9 write access (review R2-6): canWrite() is false in offlineMember,
while copy data is shown and while the browser reports offline. Every write
control and handler uses it, including /restaurants/new (no data listener in
create mode) and the evidence form (no offline check before), plus notes,
shortlist/visited, claim and restaurant delete, Add to our records, change
password, export and the delete-account link. Write routes say 'Adding and
editing need a connection.'
Web unit: previous + 11.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 11: Screens — Settings "Offline copy", copy banner, household notice, Discover offline

Spec §3.9 "Screens and wording", "Persistent storage", ruling 8, review P3-9 (Settings `whoami`), P3-11 (memory-only), P3-12 (Safari tab), Review Focus 5.

**Files:**
- Create: `web/src/offline/format.ts`, `web/src/offline/format.test.ts`
- Create: `web/src/offline/OfflineSection.tsx`, `web/src/offline/OfflineSection.test.tsx`
- Create: `web/src/offline/CopyBanner.tsx`, `web/src/offline/CopyBanner.test.tsx`
- Modify: `web/src/AppShell.tsx`, `web/src/pages/SettingsPage.tsx`, `web/src/pages/SettingsPage.test.tsx`, `web/src/discover/DiscoverPage.tsx`, `web/src/discover/DiscoverPage.test.tsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: `useAuth` (state `member`/`offlineMember`, `householdChanged`); `refresher`, `useRefreshStatus`, `notifyOptInChanged` (Task 8); `getOptIn`, `setOptIn`, `readMeta`, `clearCopy` (Task 3); `useCopyServing` (Task 9); `lastServedMeta`, `subscribeCopySession` (Task 4); `copyIsOld` (Task 4); `useConnectivity` (Task 10); `persistentAuthAllowed`; `clearDeviceData`.
- Produces: `formatCopyTime(ms: number): string` ("10 Oct, 14:32"); `<OfflineSection />`; `<CopyBanner />`. Test IDs: `offline-section`, `offline-switch`, `offline-status`, `offline-reason`, `offline-retry`, `offline-refresh`, `offline-persist-warning`, `offline-cant-store`, `offline-memory-only`, `offline-remove-question`, `offline-remove-confirm`, `offline-remove-cancel`, `device-clear`, `device-clear-result`, `copy-banner`, `household-changed`, `whoami-offline`, `discover-offline`.

- [ ] **Step 1: Write the failing format and banner tests**

Create `web/src/offline/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatCopyTime } from "./format";

describe("formatCopyTime", () => {
  it("formats as day, short month and 24-hour time", () => {
    expect(formatCopyTime(new Date(2026, 9, 10, 14, 32).getTime())).toBe("10 Oct, 14:32");
  });
});
```

Create `web/src/offline/CopyBanner.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STALE_BANNER_MS } from "./types";

const m = vi.hoisted(() => ({ serving: false, meta: null as null | { downloadedAt: number }, state: { status: "member" } as Record<string, unknown> }));
vi.mock("./hooks", () => ({ useCopyServing: () => m.serving }));
vi.mock("./session", () => ({ lastServedMeta: () => m.meta, subscribeCopySession: () => () => {} }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ state: m.state }) }));

import { CopyBanner } from "./CopyBanner";

beforeEach(() => { m.serving = false; m.meta = null; m.state = { status: "member" }; });

describe("CopyBanner", () => {
  it("shows nothing while live data is shown", () => {
    render(<CopyBanner />);
    expect(screen.queryByTestId("copy-banner")).toBeNull();
  });
  it("names the copy's time while copy data is shown", () => {
    m.serving = true;
    m.meta = { downloadedAt: new Date(2026, 9, 10, 14, 32).getTime() };
    render(<CopyBanner />);
    expect(screen.getByTestId("copy-banner")).toHaveTextContent("Offline copy from 10 Oct, 14:32. Adding and editing need a connection.");
    expect(screen.getByTestId("copy-banner")).toHaveAttribute("data-old", "false");
  });
  it("turns amber after 7 days", () => {
    m.serving = true;
    m.meta = { downloadedAt: Date.now() - STALE_BANNER_MS - 60_000 };
    render(<CopyBanner />);
    expect(screen.getByTestId("copy-banner")).toHaveAttribute("data-old", "true");
    expect(screen.getByTestId("copy-banner")).toHaveTextContent("This offline copy is over a week old. Evidence may have changed since.");
  });
  it("a download time in the future shows the plain banner (Review Focus 5)", () => {
    m.serving = true;
    m.meta = { downloadedAt: Date.now() + 86_400_000 };
    render(<CopyBanner />);
    expect(screen.getByTestId("copy-banner")).toHaveAttribute("data-old", "false");
  });
  it("tells a member whose household changed that the copy was replaced", () => {
    m.state = { status: "member", householdChanged: true };
    render(<CopyBanner />);
    expect(screen.getByTestId("household-changed")).toHaveTextContent("Your household changed; the offline copy was replaced.");
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/format.test.ts src/offline/CopyBanner.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 2: Implement format and the banner**

Create `web/src/offline/format.ts`:

```ts
const COPY_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** "10 Oct, 14:32" — the copy's download time in the device's time zone. */
export function formatCopyTime(ms: number): string {
  const parts = Object.fromEntries(COPY_TIME.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}
```

Create `web/src/offline/CopyBanner.tsx`:

```tsx
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "../auth/AuthProvider";
import { copyIsOld } from "./eligibility";
import { formatCopyTime } from "./format";
import { useCopyServing } from "./hooks";
import { lastServedMeta, subscribeCopySession } from "./session";

/** Shell banner whenever any page shows copy data (spec §3.9 "Copy banner"), and the household-move notice (ruling 8). */
export function CopyBanner() {
  const { state } = useAuth();
  const serving = useCopyServing();
  const meta = useSyncExternalStore(subscribeCopySession, lastServedMeta, lastServedMeta);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const householdNotice = state.status === "member" && state.householdChanged
    ? <p className="notice" role="status" data-testid="household-changed">Your household changed; the offline copy was replaced.</p>
    : null;
  const downloadedAt = meta?.downloadedAt ?? (state.status === "offlineMember" ? state.downloadedAt : null);
  if (!serving || downloadedAt === null) return householdNotice;
  const old = copyIsOld({ downloadedAt }, now);
  return (
    <>
      {householdNotice}
      <p className={old ? "copy-banner old" : "copy-banner"} role="status" data-testid="copy-banner" data-old={old ? "true" : "false"}>
        Offline copy from {formatCopyTime(downloadedAt)}. Adding and editing need a connection.
        {old && <> This offline copy is over a week old. Evidence may have changed since.</>}
      </p>
    </>
  );
}
```

In `web/src/AppShell.tsx` add `import { CopyBanner } from "./offline/CopyBanner";` and render `<CopyBanner />` as the first child of `<main className="shell-main">`.

Run: `npm --prefix web exec vitest run src/offline/format.test.ts src/offline/CopyBanner.test.tsx`
Expected: PASS (6).

- [ ] **Step 3: Write the failing Settings section tests**

Create `web/src/offline/OfflineSection.test.tsx`:

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" } as Record<string, unknown>,
  status: { running: false, lastFailure: null as null | string, lastWrittenAt: null as null | number, cantStore: false },
  optIn: false,
  meta: null as null | Record<string, unknown>,
  persistent: true,
  connected: true,
  setOptIn: vi.fn(),
  clearCopy: vi.fn(async () => {}),
  requestFull: vi.fn(async () => {}),
  notify: vi.fn(),
  clearDeviceData: vi.fn(async () => ({ failed: [] as string[] })),
  persist: vi.fn(async () => true),
}));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ state: m.state }) }));
vi.mock("./refresher", () => ({ refresher: { requestFull: m.requestFull }, useRefreshStatus: () => m.status, notifyOptInChanged: m.notify }));
vi.mock("./store", () => ({ getOptIn: async () => m.optIn, setOptIn: m.setOptIn, readMeta: async () => m.meta, clearCopy: m.clearCopy }));
vi.mock("../account/authPersistence", () => ({ persistentAuthAllowed: () => m.persistent }));
vi.mock("./writeAccess", () => ({ useConnectivity: () => m.connected }));
vi.mock("../device/cleanup", () => ({ clearDeviceData: m.clearDeviceData }));

import { OfflineSection } from "./OfflineSection";

const META = { uid: "ava-uid", householdId: "home", displayName: "Ava", revision: 1, downloadedAt: new Date(2026, 9, 10, 14, 32).getTime(), membershipCheckedAt: 0, complete: true };

beforeEach(() => {
  m.status = { running: false, lastFailure: null, lastWrittenAt: null, cantStore: false };
  m.optIn = false;
  m.meta = null;
  m.persistent = true;
  m.connected = true;
  m.setOptIn.mockReset().mockResolvedValue(undefined);
  m.persist.mockReset().mockResolvedValue(true);
  Object.defineProperty(navigator, "storage", { configurable: true, value: { persist: m.persist } });
  vi.clearAllMocks();
});

describe("OfflineSection", () => {
  it("off: not stored; turning on saves the opt-in, starts the download and asks to persist storage", async () => {
    render(<OfflineSection />);
    expect(await screen.findByTestId("offline-status")).toHaveTextContent("Not stored on this device.");
    m.persist.mockResolvedValueOnce(false);
    await userEvent.click(screen.getByTestId("offline-switch"));
    expect(m.setOptIn).toHaveBeenCalledWith("ava-uid", true);
    expect(m.notify).toHaveBeenCalled();
    expect(await screen.findByTestId("offline-persist-warning")).toHaveTextContent("Your browser may remove this copy if the device runs low on space.");
  });

  it("opted in without a copy: Downloading… while running, then Not ready offline", async () => {
    m.optIn = true;
    m.status = { ...m.status, running: true };
    const { rerender } = render(<OfflineSection />);
    expect(await screen.findByTestId("offline-status")).toHaveTextContent("Downloading…");
    m.status = { ...m.status, running: false };
    rerender(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Not ready offline"));
  });

  it("ready: names the update time, and Refresh now requests a full refresh", async () => {
    m.optIn = true;
    m.meta = META;
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Ready offline · updated 10 Oct, 14:32"));
    await userEvent.click(screen.getByTestId("offline-refresh"));
    expect(m.requestFull).toHaveBeenCalledWith({ uid: "ava-uid", householdId: "home", displayName: "Ava" });
  });

  it("a failed update keeps the copy's time, gives a plain reason and Try again", async () => {
    m.optIn = true;
    m.meta = META;
    m.status = { ...m.status, lastFailure: "offline" };
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Last update failed · copy from 10 Oct, 14:32"));
    expect(screen.getByTestId("offline-reason")).toHaveTextContent("You're offline.");
    await userEvent.click(screen.getByTestId("offline-retry"));
    expect(m.requestFull).toHaveBeenCalled();
  });

  it("turning off asks first, then removes the copy and the opt-in", async () => {
    m.optIn = true;
    m.meta = META;
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-switch")).toBeChecked());
    await userEvent.click(screen.getByTestId("offline-switch"));
    expect(screen.getByTestId("offline-remove-question")).toHaveTextContent("Remove the offline copy from this device?");
    expect(m.clearCopy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("offline-remove-confirm"));
    expect(m.setOptIn).toHaveBeenCalledWith("ava-uid", false);
    expect(m.clearCopy).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Not stored on this device."));
  });

  it("memory-only sign-in disables the switch and explains why (review P3-11)", async () => {
    m.persistent = false;
    render(<OfflineSection />);
    expect(await screen.findByTestId("offline-memory-only")).toHaveTextContent("Offline copies need sign-in to be saved on this device.");
    expect(screen.getByTestId("offline-switch")).toBeDisabled();
  });

  it("a device that cannot store says so and stays off", async () => {
    m.setOptIn.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    render(<OfflineSection />);
    await userEvent.click(await screen.findByTestId("offline-switch"));
    expect(await screen.findByTestId("offline-cant-store")).toHaveTextContent("This device can't store an offline copy.");
    expect(screen.getByTestId("offline-switch")).not.toBeChecked();
  });

  it("Clear device data runs the cleanup registry and reports the result", async () => {
    render(<OfflineSection />);
    m.clearDeviceData.mockResolvedValueOnce({ failed: ["offlineCopy"] });
    await act(async () => { await userEvent.click(screen.getByTestId("device-clear")); });
    expect(m.clearDeviceData).toHaveBeenCalled();
    expect(await screen.findByTestId("device-clear-result")).toHaveTextContent("Some data on this device couldn't be cleared.");
  });
});
```

Run: `npm --prefix web exec vitest run src/offline/OfflineSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the Settings section**

Create `web/src/offline/OfflineSection.tsx`:

```tsx
import { useEffect, useState } from "react";
import { persistentAuthAllowed } from "../account/authPersistence";
import { useAuth } from "../auth/AuthProvider";
import { clearDeviceData } from "../device/cleanup";
import { formatCopyTime } from "./format";
import { notifyOptInChanged, refresher, useRefreshStatus, type RefreshFailure } from "./refresher";
import { clearCopy, getOptIn, readMeta, setOptIn } from "./store";
import type { CopyMeta } from "./types";
import { useConnectivity } from "./writeAccess";

const REASON: Record<RefreshFailure, string> = {
  offline: "You're offline.",
  storage: "Storage is full or unavailable on this device.",
  server: "Couldn't reach SafeBite.",
  denied: "Couldn't reach SafeBite.",
};

/** Settings → Offline copy (spec §3.9 "Screens and wording"): this device, this sign-in. */
export function OfflineSection() {
  const { state } = useAuth();
  const session = state.status === "member" || state.status === "offlineMember" ? state : null;
  const uid = session?.uid ?? null;
  const status = useRefreshStatus();
  const connected = useConnectivity();
  const [optedIn, setOptedIn] = useState(false);
  const [meta, setMeta] = useState<CopyMeta | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [persistWarning, setPersistWarning] = useState(false);
  const [cantStore, setCantStore] = useState(false);
  const [clearResult, setClearResult] = useState<"ok" | "failed" | null>(null);

  useEffect(() => {
    if (uid === null) return;
    let live = true;
    void getOptIn(uid).then((on) => { if (live) setOptedIn(on); });
    return () => { live = false; };
  }, [uid]);

  useEffect(() => {
    let live = true;
    void readMeta().then((m) => { if (live) setMeta(m && m.uid === uid ? m : null); });
    return () => { live = false; };
  }, [uid, optedIn, status.running, status.lastWrittenAt]);

  if (!session || uid === null) return null;
  const target = { uid, householdId: session.householdId, displayName: session.displayName };
  const memoryOnly = !persistentAuthAllowed();
  const unableToStore = cantStore || status.cantStore;

  async function turnOn() {
    setCantStore(false);
    try {
      await setOptIn(uid!, true);
    } catch {
      setCantStore(true);
      return;
    }
    setOptedIn(true);
    notifyOptInChanged(); // AuthProvider starts the first download and the triggers
    const persist = typeof navigator !== "undefined" ? navigator.storage?.persist : undefined;
    const granted = persist ? await persist.call(navigator.storage).catch(() => false) : false;
    setPersistWarning(!granted);
  }

  async function turnOff() {
    await setOptIn(uid!, false).catch(() => {});
    await clearCopy().catch(() => {});
    setOptedIn(false);
    setMeta(null);
    setConfirmingOff(false);
    notifyOptInChanged();
  }

  async function clearDevice() {
    const { failed } = await clearDeviceData();
    setClearResult(failed.length === 0 ? "ok" : "failed");
    setOptedIn(await getOptIn(uid!));
    setMeta(null);
  }

  let line: string;
  if (!optedIn) line = "Not stored on this device.";
  else if (status.lastFailure) line = meta ? `Last update failed · copy from ${formatCopyTime(meta.downloadedAt)}` : "Not ready offline";
  else if (meta) line = `Ready offline · updated ${formatCopyTime(meta.downloadedAt)}`;
  else line = status.running ? "Downloading…" : "Not ready offline";

  return (
    <section className="offline-section" data-testid="offline-section" aria-labelledby="offline-title">
      <h3 id="offline-title">Offline copy</h3>
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          data-testid="offline-switch"
          checked={optedIn}
          disabled={memoryOnly || confirmingOff}
          onChange={(e) => { if (e.target.checked) void turnOn(); else setConfirmingOff(true); }}
        />
        Keep a copy on this device
      </label>
      {memoryOnly && <p className="hint" data-testid="offline-memory-only">Offline copies need sign-in to be saved on this device.</p>}
      {unableToStore && <p role="alert" data-testid="offline-cant-store">This device can't store an offline copy.</p>}
      <p data-testid="offline-status">{line}</p>
      {optedIn && status.lastFailure && (
        <p className="hint">
          <span data-testid="offline-reason">{REASON[status.lastFailure as RefreshFailure]}</span>{" "}
          <button type="button" data-testid="offline-retry" onClick={() => void refresher.requestFull(target)}>Try again</button>
        </p>
      )}
      {confirmingOff && (
        <div className="notice" role="group" aria-labelledby="offline-remove-q">
          <p id="offline-remove-q" data-testid="offline-remove-question">Remove the offline copy from this device?</p>
          <div className="actions">
            <button type="button" data-testid="offline-remove-confirm" onClick={() => void turnOff()}>Remove</button>
            <button type="button" data-testid="offline-remove-cancel" onClick={() => setConfirmingOff(false)}>Keep</button>
          </div>
        </div>
      )}
      {optedIn && (
        <button type="button" data-testid="offline-refresh" disabled={!connected || state.status !== "member" || status.running} onClick={() => void refresher.requestFull(target)}>
          Refresh now
        </button>
      )}
      {persistWarning && <p className="hint" data-testid="offline-persist-warning">Your browser may remove this copy if the device runs low on space.</p>}
      <p className="hint">Works best in the app installed on your Home Screen. In a browser tab, the browser may remove the copy after a week without use.</p>
      <div className="actions">
        <button type="button" data-testid="device-clear" onClick={() => void clearDevice()}>Clear device data</button>
        {clearResult && (
          <span role="status" data-testid="device-clear-result">
            {clearResult === "ok" ? "Data on this device was cleared." : "Some data on this device couldn't be cleared."}
          </span>
        )}
      </div>
    </section>
  );
}
```

Run: `npm --prefix web exec vitest run src/offline/OfflineSection.test.tsx`
Expected: PASS (8).

- [ ] **Step 5: Write the failing Settings and Discover tests**

In `web/src/pages/SettingsPage.test.tsx`: make the mocked auth state variable — replace the `../auth/AuthProvider` mock with

```ts
const authState = vi.hoisted(() => ({ value: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" } as Record<string, unknown> }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ state: authState.value, signOut: vi.fn() }) }));
vi.mock("../offline/OfflineSection", () => ({ OfflineSection: () => <div data-testid="offline-section" /> }));
```

reset `authState.value` to the member object in `beforeEach`, and append:

```tsx
  it("offline member: no server confirmation is requested; it says membership will be confirmed later", () => {
    authState.value = { status: "offlineMember", uid: "ava-uid", email: null, householdId: "home", displayName: "Ava", downloadedAt: 1 };
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByTestId("whoami-offline")).toHaveTextContent("Offline — membership will be confirmed when you reconnect.");
    expect(whoamiCalls).not.toHaveBeenCalled();
    expect(screen.getByTestId("offline-section")).toBeInTheDocument();
  });
```

In `web/src/discover/DiscoverPage.test.tsx` add

```ts
const conn = vi.hoisted(() => ({ connected: true }));
vi.mock("../offline/writeAccess", () => ({ useWriteAccess: () => conn.connected, useConnectivity: () => conn.connected }));
```

(reset `conn.connected = true` in `beforeEach`) and append:

```tsx
describe("offline (spec §3.9)", () => {
  it("shows 'Search needs a connection.' in place of the search actions", () => {
    conn.connected = false;
    renderPage();
    expect(screen.getByTestId("discover-offline")).toHaveTextContent("Search needs a connection.");
    expect(screen.queryByTestId("discover-submit")).toBeNull();
  });
});
```

Run: `npm --prefix web exec vitest run src/pages/SettingsPage.test.tsx src/discover/DiscoverPage.test.tsx`
Expected: FAIL.

- [ ] **Step 6: Implement Settings and Discover changes**

In `web/src/pages/SettingsPage.tsx`:
- import `OfflineSection` from `"../offline/OfflineSection"`;
- compute `const offline = state.status === "offlineMember";`;
- make the `whoami` effect start with `if (offline) return;` and add `offline` to its dependency list (`[offline]`);
- show the signed-in line for both statuses: `{(state.status === "member" || state.status === "offlineMember") && state.email && <p>Signed in as {state.email}</p>}`;
- after the `{error && …}` line add `{offline && <p className="hint" data-testid="whoami-offline">Offline — membership will be confirmed when you reconnect.</p>}`;
- render `<OfflineSection />` after `<ExportSection />`.

In `web/src/discover/DiscoverPage.tsx`: `const connected = useConnectivity();` (import from `"../offline/writeAccess"`), and wrap the actions block:

```tsx
          {connected ? (
            <div className="actions search-actions">
              {/* existing Search and Near me buttons, unchanged */}
            </div>
          ) : (
            <p className="hint" data-testid="discover-offline">Search needs a connection.</p>
          )}
```

Keep the two existing buttons inside the `connected` branch exactly as they are.

Append to `web/src/styles.css` (before the phone-layout media query):

```css
/* ---------- Offline copy (spec §3.9) ---------- */
.copy-banner { margin: 0 0 16px; padding: 12px 16px; border-radius: 16px; background: var(--surface-soft); color: var(--ink); font-size: 14px; }
.copy-banner.old { background: var(--amber-bg); color: var(--amber); }
.offline-section { margin: 18px 0; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.switch-row { display: flex; align-items: center; gap: 10px; color: var(--ink); font-size: 15px; font-weight: 600; min-height: 44px; }
.switch-row input[type="checkbox"] { width: 22px; height: 22px; accent-color: var(--accent); }
```

Run: `npm --prefix web exec vitest run src/pages src/discover src/offline`
Expected: PASS (existing + 16 new: 1 format, 5 banner, 8 section, 1 settings, 1 discover).

- [ ] **Step 7: Run the web suite, typecheck and browser suite**

Run: `npm run typecheck && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: clean; previous + 16 new.
Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: all pass. The Settings scenarios still find `whoami`, export and the delete link; the new section adds no network call until switched on.

- [ ] **Step 8: Commit**

```bash
git add web/src/offline web/src/AppShell.tsx web/src/pages web/src/discover web/src/styles.css
git commit -m "feat(offline): Settings 'Offline copy', copy banner, household notice, Discover offline

Spec §3.9 screens: the per-sign-in switch with Downloading…/Not ready/Ready/
Last update failed states, plain reasons and Try again, Refresh now, an
in-page opt-out confirmation, persistent-storage request and warning,
memory-only and can't-store messages, the Home Screen note, and Clear device
data. The shell banner names the copy's time and turns amber after 7 days; a
household move is announced; Settings skips whoami offline; Discover says
'Search needs a connection.'
Web unit: previous + 16.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 12: Browser scenarios — offline reading (spec tests 1, 2, 3, 8, 9, 10, 11, 14)

Spec §3.9 "Tests → Browser", review P2-6. The Vite dev server stays reachable: "offline" means aborting the emulator origins with `page.route` (fast failures), "stalled" means never fulfilling them, and `navigator.onLine` is stubbed only where a scenario needs the fast path.

**Files:**
- Create: `web/e2e/offline-rest.ts`
- Create: `web/e2e/offline.spec.ts`

**Interfaces:**
- Consumes: `seedRestaurant`, `seedClaim`, `seedNote`, `seedCollection`, `clearRecords` (`e2e/emulator-rest.ts`); test IDs from Tasks 9–11; the dev-only refresh pause hook `window.__SAFEBITE_REFRESH_PAUSE__` (Task 8).
- Produces (`offline-rest.ts`): `EMULATORS`, `daysAgo(n)`, `seedHousehold(request)`, `signIn(page, email)`, `optInAndWait(page)`, `cutServer(page)`, `stallServer(page)`, `restoreServer(page)`, `reportOffline(page)`, `copyMeta(page)`, `moveToHousehold(request, uid, hid)`, `deleteHousehold(request, hid)`.

- [ ] **Step 1: Write the helpers**

Create `web/e2e/offline-rest.ts`:

```ts
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { seedClaim, seedCollection, seedNote, seedRestaurant } from "./emulator-rest";

/** Offline-scenario helpers (spec §3.9 Tests). Emulator-only: 127.0.0.1, project demo-safebite. */
export const EMULATORS = /127\.0\.0\.1:(9099|8080|5001)\//;
const FS = "http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents";
const HEADERS = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const PASSWORD = "pilot-password-1";

export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Two restaurants; Riverside has current evidence with one older entry, an old fryer answer, notes by both members. */
export async function seedHousehold(request: APIRequestContext): Promise<void> {
  await seedRestaurant(request, "r1", { name: "Riverside" });
  await seedRestaurant(request, "r2", { name: "Zest" });
  await seedClaim(request, "r1", "c-new", { kind: "gfMenu", value: "yes", checkedAt: daysAgo(20) });
  await seedClaim(request, "r1", "c-old", { kind: "gfMenu", value: "no", checkedAt: daysAgo(400) });
  await seedClaim(request, "r2", "c-fryer", { kind: "separateFryer", value: "yes", checkedAt: daysAgo(10) });
  await seedNote(request, "r1", "n-ava", { text: "Ask about the fryer." });
  await seedNote(request, "r1", "n-bogdan", { authorUid: "bogdan-uid", text: "Staff were helpful." });
  await seedCollection(request, "r1", { shortlisted: true });
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-saved")).toBeVisible({ timeout: 15_000 });
}

export async function optInAndWait(page: Page): Promise<void> {
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("offline-switch").click();
  await expect(page.getByTestId("offline-status")).toContainText("Ready offline", { timeout: 30_000 });
}

/** Emulators unreachable, failing fast (connection refused). */
export async function cutServer(page: Page): Promise<void> {
  await page.route(EMULATORS, (route) => route.abort("internetdisconnected"));
}

/** Emulators reachable but never answering: a stalled connection. */
export async function stallServer(page: Page): Promise<void> {
  await page.route(EMULATORS, () => { /* never fulfilled */ });
}

export async function restoreServer(page: Page): Promise<void> {
  await page.unroute(EMULATORS);
}

/** From the next load on, the browser reports offline (the fast path). */
export async function reportOffline(page: Page): Promise<void> {
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
}

export async function copyMeta(page: Page): Promise<{ uid: string; householdId: string; downloadedAt: number } | null> {
  return page.evaluate(async () => (await import(/* @vite-ignore */ "/src/offline/store.ts")).readMeta());
}

export async function moveToHousehold(request: APIRequestContext, uid: string, hid: string): Promise<void> {
  const s = (v: string) => ({ stringValue: v });
  for (const [path, fields] of [
    [`households/${hid}`, { name: s("Elsewhere"), memberIds: { arrayValue: { values: [s(uid)] } }, createdAt: { timestampValue: "2026-10-01T00:00:00Z" } }],
    [`users/${uid}`, { householdId: s(hid), displayName: s("Ava") }],
  ] as const) {
    const res = await request.patch(`${FS}/${path}`, { headers: HEADERS, data: { fields } });
    if (!res.ok()) throw new Error(`patch ${path}: ${res.status()} ${await res.text()}`);
  }
}

export async function deleteHousehold(request: APIRequestContext, hid: string): Promise<void> {
  await request.delete(`${FS}/households/${hid}`, { headers: HEADERS });
}
```

- [ ] **Step 2: Write the scenarios**

Create `web/e2e/offline.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { clearRecords } from "./emulator-rest";
import { copyMeta, cutServer, optInAndWait, reportOffline, restoreServer, seedHousehold, signIn, stallServer } from "./offline-rest";

test.setTimeout(90_000);
test.beforeEach(async ({ request }) => {
  await clearRecords(request);
  await seedHousehold(request);
});

test("O1. an opted-in copy opens with no connection: restaurants, evidence with history, both members' notes; writes disabled", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await reportOffline(page);
  await cutServer(page);
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toContainText("Offline copy from", { timeout: 15_000 });
  await page.getByTestId("nav-saved").click();
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("restaurant-row")).toHaveCount(2);
  await page.getByTestId("restaurant-row").filter({ hasText: "Riverside" }).getByRole("link").click();
  await expect(page.getByTestId("restaurant-name")).toHaveText("Riverside");
  await expect(page.getByTestId("evidence-gfMenu")).toHaveAttribute("data-state", "current");
  await expect(page.getByText("Older evidence (1)")).toBeVisible();
  await expect(page.getByTestId("note-n-ava")).toBeVisible();
  await expect(page.getByTestId("note-n-bogdan")).toBeVisible();
  await expect(page.getByTestId("add-evidence")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("note-add-save")).toBeDisabled();
  await expect(page.getByTestId("read-offline")).toHaveCount(0); // the copy banner is the only notice
});

test("O2. with the app already open, a record never opened before reads from the copy when the connection drops", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.getByTestId("nav-saved").click();
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("restaurant-row")).toHaveCount(2);
  await context.setOffline(true);
  await page.getByTestId("restaurant-row").filter({ hasText: "Zest" }).getByRole("link").click();
  await expect(page.getByTestId("restaurant-name")).toHaveText("Zest", { timeout: 20_000 });
  await expect(page.getByTestId("evidence-separateFryer")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("copy-banner")).toBeVisible();
  await context.setOffline(false);
});

test("O3. on a stalled connection the copy opens early instead of waiting for sign-in", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await stallServer(page);
  const started = Date.now();
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toBeVisible({ timeout: 12_000 });
  expect(Date.now() - started).toBeLessThan(12_000);
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurant-row")).toHaveCount(1); // shortlist: Riverside
});

test("O8. a copy whose last membership check is over 30 days old needs a connection", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await cutServer(page);
  await page.clock.install({ time: new Date(Date.now() + 31 * 86_400_000) });
  await page.reload();
  await expect(page.getByTestId("membership-error")).toContainText("This offline copy needs a connection to confirm your access.", { timeout: 30_000 });
});

test("O9. switching off asks, then removes the copy from this device", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.getByTestId("offline-switch").click();
  await expect(page.getByTestId("offline-remove-question")).toBeVisible();
  await page.getByTestId("offline-remove-confirm").click();
  await expect(page.getByTestId("offline-status")).toHaveText("Not stored on this device.");
  await expect.poll(() => copyMeta(page)).toBeNull();
});

test("O10. an interrupted refresh keeps the previous copy and its time", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  const before = await copyMeta(page);
  expect(before).not.toBeNull();
  await cutServer(page);
  await page.getByTestId("offline-refresh").click();
  await expect(page.getByTestId("offline-status")).toContainText("Last update failed · copy from", { timeout: 45_000 });
  expect((await copyMeta(page))!.downloadedAt).toBe(before!.downloadedAt);
  await restoreServer(page);
});

test("O11. offline, Discover says search needs a connection", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await reportOffline(page);
  await cutServer(page);
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("nav-discover").click();
  await expect(page.getByTestId("discover-offline")).toHaveText("Search needs a connection.");
});

test("O14. write routes are disabled offline, opened directly or already open when the connection drops", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.goto("/restaurants/new");
  await expect(page.getByTestId("save-restaurant")).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByTestId("save-restaurant")).toBeDisabled();
  await expect(page.getByTestId("write-blocked")).toBeVisible();
  await context.setOffline(false);
  await reportOffline(page);
  await cutServer(page);
  await page.goto("/restaurants/r1/evidence/new");
  await expect(page.getByTestId("write-blocked")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("claim-submit")).toBeDisabled();
  await page.goto("/restaurants/new");
  await expect(page.getByTestId("save-restaurant")).toBeDisabled({ timeout: 15_000 });
});
```

- [ ] **Step 3: Run the new scenarios**

Run (10 minute timeout):
```bash
node tooling/ensure-secret-local.mjs && npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:exec --only auth,firestore,functions --project demo-safebite "node functions/lib/seed-emulator.js && npm --prefix web run e2e -- offline.spec.ts --retries=0" 2>&1 | grep -E "✓|✘|passed|failed"
```
Expected: 8 passed. If O2's `setOffline` makes the Vite client reload the page when the connection returns, that happens after the assertions; if it interferes with the next test, close the context's pages at the end of O2.

- [ ] **Step 4: Run the full browser suite and commit**

Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: previous + 8, all passing.

```bash
git add web/e2e/offline-rest.ts web/e2e/offline.spec.ts
git commit -m "test(offline): browser scenarios for reading offline

Spec §3.9 browser tests 1, 2, 3, 8, 9, 10, 11, 14: cold start offline from the
copy (history and both members' notes, writes disabled, one notice), live
fallback with the app open, early opening on a stalled connection, the
30-day limit, opt-out, an interrupted refresh keeping the old copy, Discover
offline, and write routes opened directly or open when the connection drops.
Browser: previous + 8.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---

### Task 13: Browser scenarios — isolation, revocation and cross-tab (spec tests 4, 5, 6, 7, 12, 13)

**Files:**
- Create: `web/e2e/offline-isolation.spec.ts`

**Interfaces:**
- Consumes: Task 12's helpers; `setMemberIds`, `restoreSeedAccounts` (`e2e/account-rest.ts`).

- [ ] **Step 1: Write the scenarios**

Create `web/e2e/offline-isolation.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { restoreSeedAccounts, setMemberIds } from "./account-rest";
import { clearRecords } from "./emulator-rest";
import { copyMeta, cutServer, deleteHousehold, moveToHousehold, optInAndWait, reportOffline, restoreServer, seedHousehold, signIn } from "./offline-rest";

test.setTimeout(120_000);
test.beforeEach(async ({ request }) => {
  await clearRecords(request);
  await seedHousehold(request);
});
test.afterEach(async ({ request }) => {
  await deleteHousehold(request, "home2");
  await restoreSeedAccounts(request);
});

test("O4. after an account switch the next account sees no copy and nothing is stored", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await signIn(page, "bogdan@safebite.test");
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("offline-status")).toHaveText("Not stored on this device.");
  expect(await copyMeta(page)).toBeNull();
  const avaOptedIn = await page.evaluate(async () => (await import(/* @vite-ignore */ "/src/offline/store.ts")).getOptIn("ava-uid"));
  expect(avaOptedIn).toBe(false);
});

test("O5. a device clear in another tab wins over a refresh paused before its write", async ({ page, context }) => {
  // Sign-out runs the same clearDeviceData(); a device clear keeps tab A alive to observe its own refresh.
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.evaluate(() => {
    (window as any).__SAFEBITE_REFRESH_PAUSE__ = () => new Promise<void>((resolve) => { (window as any).__releaseRefresh = resolve; });
  });
  await page.getByTestId("offline-refresh").click();
  await page.waitForFunction(() => typeof (window as any).__releaseRefresh === "function", undefined, { timeout: 30_000 });
  const other = await context.newPage();
  await other.goto("/settings");
  await expect(other.getByTestId("offline-section")).toBeVisible({ timeout: 15_000 });
  await other.getByTestId("device-clear").click();
  await expect(other.getByTestId("device-clear-result")).toHaveText("Data on this device was cleared.");
  await page.evaluate(() => (window as any).__releaseRefresh());
  await expect.poll(() => copyMeta(page), { timeout: 10_000 }).toBeNull();
});

test("O6. membership revoked while offline: reconnecting wipes the copy and shows today's screen", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await cutServer(page);
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toBeVisible({ timeout: 20_000 });
  await setMemberIds(request, ["bogdan-uid"]);
  await restoreServer(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("not-invited")).toBeVisible({ timeout: 45_000 });
  expect(await copyMeta(page)).toBeNull();
});

test("O7. a household move replaces the copy and says so", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await moveToHousehold(request, "ava-uid", "home2");
  await page.reload();
  await expect(page.getByTestId("household-changed")).toHaveText("Your household changed; the offline copy was replaced.", { timeout: 20_000 });
  await expect.poll(async () => (await copyMeta(page))?.householdId ?? null, { timeout: 30_000 }).toBe("home2");
});

test("O12. membership revoked while the app is open online: the listener denial wipes the copy", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurant-row")).toHaveCount(1);
  await setMemberIds(request, ["bogdan-uid"]);
  await expect(page.getByTestId("not-invited")).toBeVisible({ timeout: 30_000 });
  expect(await copyMeta(page)).toBeNull();
});

test("O13. turning the copy off in one tab removes copy data already shown in another", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  const reader = await context.newPage();
  await reportOffline(reader);
  await cutServer(reader);
  await reader.goto("/restaurants");
  await expect(reader.getByTestId("copy-banner")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("offline-switch").click();
  await page.getByTestId("offline-remove-confirm").click();
  await expect(reader.getByTestId("copy-banner")).toHaveCount(0, { timeout: 15_000 });
  await expect(reader.getByTestId("restaurant-row")).toHaveCount(0);
  await expect(reader.getByTestId("membership-error")).toBeVisible({ timeout: 20_000 });
});
```

- [ ] **Step 2: Run the new scenarios**

Run (10 minute timeout):
```bash
node tooling/ensure-secret-local.mjs && npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:exec --only auth,firestore,functions --project demo-safebite "node functions/lib/seed-emulator.js && npm --prefix web run e2e -- offline-isolation.spec.ts --retries=0" 2>&1 | grep -E "✓|✘|passed|failed"
```
Expected: 6 passed.

- [ ] **Step 3: Run the full browser suite and commit**

Run: `npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"` (10 minute timeout)
Expected: previous + 6, all passing.

```bash
git add web/e2e/offline-isolation.spec.ts
git commit -m "test(offline): isolation, revocation and cross-tab browser scenarios

Spec §3.9 browser tests 4, 5, 6, 7, 12, 13: an account switch leaves no copy
or opt-in; a device clear in another tab beats a refresh paused before its
write; revocation while offline wipes on reconnection and while online wipes
via the listener denial; a household move replaces the copy with a notice;
turning the copy off in one tab removes copy data shown in another.
Browser: previous + 6.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

---
### Task 14: Documentation, iPhone acceptance steps and the final gate

Spec §3.9 "Real-iPhone acceptance", empirical stop 3 (owner-run), "Deploy note". No product code.

**Files:**
- Modify: `README.md`, `web/playwright.config.ts`
- Create: `planning/acceptance/iphone-acceptance.md`
- Modify: `planning/audits/2026-10-10-plan-5b-execution-ledger.md`

- [ ] **Step 1: Update the README**

In `README.md`:
- In the Tests block, change the stress line's count to the new browser total (58 + 15 = 73 if every task added what it planned; use the measured number).
- Replace the "currently reports" sentence with the measured unit, functions + rules and browser counts.
- Add these Guardrails bullets after the deploy-order bullet:

```markdown
- Plan 5b (spec §3.9) deploys as hosting only: no rules, functions or index changes.
- The offline copy lives only in the `safebite-offline` IndexedDB database, per device, tagged with account and household, and only after the member turns on **Keep a copy on this device**. It is read-only, cleared on sign-out, opt-out, **Clear device data** and confirmed loss of access, and stops opening after 30 days without a server-confirmed membership check. Never add Firebase imports to the Firebase-free `web/src/offline/` modules (`registerCleaners.test.tsx` guards the start-up path).
- A full offline refresh costs roughly one read per document plus one per query (see `planning/audits/plan-5b-probes/results.md`); it runs every 15 minutes per visible opted-in device. Watch the pilot's daily reads after deploy.
```

In `web/playwright.config.ts` update the comment's scenario count to the measured browser total.

- [ ] **Step 2: Write the iPhone acceptance steps**

Create `planning/acceptance/iphone-acceptance.md`:

```markdown
# Real-iPhone acceptance

Drafted in Plan 5b; Plan 5c extends this script and runs it against the finished pilot. Use a
real iPhone, the pilot URL, and a household account. Record the iOS version, date and result
of each step.

## Plan 5b — offline reading

Empirical stop 3 (spec §3.9) is part of this run.

1. In Safari, open the pilot and **Add to Home Screen**. Open the installed app and sign in.
2. Settings → **Keep a copy on this device**. Note whether "Your browser may remove this copy
   if the device runs low on space." appears (that is `navigator.storage.persist()` refusing).
   Wait for **Ready offline · updated …**.
3. Fully close the app (swipe it away). Turn on Airplane Mode. Reopen the app.
   Expected: the app opens with "Offline copy from …"; Saved lists the restaurants; a
   restaurant shows its evidence (with older evidence) and both members' notes; Add evidence
   and Save note are disabled; Discover says "Search needs a connection."
4. Turn Airplane Mode off. Expected within a minute: the banner disappears and editing works.
5. With the app open on Saved, turn Airplane Mode on (or walk out of signal). Open a restaurant
   you have not opened in this session. Expected: it shows from the copy with the banner.
6. Turn Airplane Mode off. Settings → **Sign out**. Sign in again. Expected: Settings shows
   "Not stored on this device." until the switch is turned on again.
7. Stop 3, browser tab: repeat steps 1–3 in a Safari tab instead of the installed app. Record
   whether the copy survives closing Safari, and what step 2 showed.
8. Optional, slow: leave the installed app unopened for 8 days, then repeat step 3 without
   reconnecting first. Expected: the copy still opens and the banner is amber ("over a week old").
```

- [ ] **Step 3: Run the final gate**

Run each (the stress run takes longer than 10 minutes: run it in the background and wait for it):

```bash
npm run typecheck
npm run test:unit 2>&1 | grep -E "Test Files|Tests "
npm run emu:test 2>&1 | grep -E "Test Files|Tests "
npm run emu:e2e 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"
npm run emu:e2e:stress 2>&1 | grep -E "[0-9]+ (passed|failed|flaky)"
npm --prefix web run build:check
npm --prefix web run build:e2e
npm --prefix web run e2e:boot-guard 2>&1 | grep -E "passed|failed"
npm --prefix web run e2e:preview 2>&1 | grep -E "passed|failed"
npm --prefix web run e2e:upgrade 2>&1 | grep -E "passed|failed"
git diff --check c2d1324 HEAD
grep -rn "safebite-production-13ba1" web/src web/e2e planning/plans/2026-10-10-safebite-pwa-05b-offline.md | grep -v firebaseEnv || echo "no legacy project string"
grep -lE "from \"(firebase/|\.\./firebase)" web/src/offline/{types,store,signals,eligibility,session,withCopy,writeAccess,decide,early,hooks,format}.ts || echo "offline core is Firebase-free"
```

Expected: typecheck clean; unit and browser counts equal the baseline plus every task's additions; functions + rules unchanged (441); stress all passing with retries 0; builds, boot guard (1/1), preview (4/4) and upgrade (7/7) pass; whitespace clean; both greps print their "no …"/"Firebase-free" message. If the preview suite's offline-shell test changes because the app now renders "Preparing sign-in…" longer, record it and fix only the test's wait.

- [ ] **Step 4: Close the ledger and commit**

Append to the ledger a "Final gate" table with every number from Step 3, the stop 5 cost line, the list of commits, anything that differed from the plan, and "Not run: real iPhone (stop 3 and the acceptance script) — owner-run after deploy." Then:

```bash
git add README.md web/playwright.config.ts planning/acceptance/iphone-acceptance.md planning/audits/2026-10-10-plan-5b-execution-ledger.md
git commit -m "docs(5b): README guardrails and counts, iPhone acceptance steps, execution ledger

Final gate: <one line of measured counts>. Hosting-only deploy; real-iPhone
acceptance (including empirical stop 3) is owner-run after deploy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MRsbJXkLpLQG7QzdeZmxsQ"
```

Replace `<one line of measured counts>` before committing.
