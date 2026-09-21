# SafeBite PWA — Plan 2a: Pre-work, misconfiguration screen, PWA app shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the spec's Plan 2 pre-work list, replace the blank-page failure of a misconfigured bundle with a plain screen that also refuses to register a service worker, and turn the member shell into an installable PWA (manifest, icon set, Apple meta tags, standalone display, service worker) proven by a preview-bundle browser test that reloads the shell offline.

**Architecture:** Same branch and layout as Plans 1 and 1b (`web/`, `functions/`, root scripts, `.github/workflows/ci.yml`). Bootstrap is split: `web/src/main.tsx` computes startup problems from the pure validator before anything imports Firebase; only a clean configuration dynamically imports `App` and registers the service worker. `vite-plugin-pwa` generates the manifest and Workbox service worker at build time; registration is manual (`injectRegister: null`) so the misconfigured branch can never register one. A pure `abortable` helper gives callables cancellation semantics the Firebase SDK lacks, and the Settings page holds its in-flight `whoami` promise in a ref so StrictMode's double effect issues one request. A third Playwright configuration builds a validated bundle with synthetic non-demo values and serves it with `vite preview` to test the manifest, worker and offline reload without emulators.

**Tech Stack:** Vite 8.3, React 19, TypeScript 6 strict (web) / 5.9 (functions), Vitest 5, Playwright 1.63 (Chromium only), `vite-plugin-pwa` 1.3.0 (Workbox 7, generateSW), Firebase JS SDK 12, Node 22.

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md` — §2.2 architecture (`vite-plugin-pwa` for the app shell), §2.7 testing strategy, §3.2 guardrails, the "Plan 2 pre-work" and "Added from the Plan 1b final review" lists, and the "Plan 2 rulings (owner, 2026-09-21)" block. Plan 1: `planning/plans/2026-09-20-safebite-pwa-01-foundation.md`; Plan 1b: `planning/plans/2026-09-20-safebite-pwa-01b-hardening.md`.

## Global Constraints

- Emulators only (`demo-safebite`); no `firebase deploy`, no `git push`, no billing or console changes. The string `safebite-production-13ba1` must not appear in new files; the CI guardrail grep excludes only `web/src/config/firebaseEnv.ts` and its test.
- Working directory is the worktree `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-01-foundation` on branch `worktree-pwa-01-foundation`. Never run anything in `/home/godja/Dev/AvaGF` itself or in the old `/mnt/c` checkout.
- Testids and the five browser scenarios in `web/e2e/auth.spec.ts` stay; only timeouts and warm-up code change.
- A deployable build (`npm --prefix web run build`) must keep rejecting missing, blank, demo, legacy-project and emulator configurations; any `vite build` with `NODE_ENV` other than `production` must keep being refused; the runtime guard in `web/src/firebase.ts` stays as the second line of defence.
- No new bypass environment variables for the build guard. No new native dependencies (icons are rendered with the already-installed Playwright Chromium).
- No restaurants, claims, subcollection rules or Firestore indexes in this plan; those are Plan 2b.
- Line endings: files under `web/`, `functions/`, `planning/`, `.github/` are LF. `README.md`, `CLAUDE.md`, `.gitignore` and `firestore.rules` are CRLF until Task 1 renormalises them; after Task 1 every file this plan touches is LF. Edit with tools that preserve the file's existing endings (Python `open(path, newline="")`, not sed with `$` anchors).
- British spelling in copy. Node 22; TS strict; Vitest `include` patterns unchanged; commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Emulator-backed runs (`npm run emu:test`, `npm run emu:e2e`) take one to two minutes on this Linux checkout; give shell commands a 5 minute timeout.
- Every task ends with the same green gate: `npm run typecheck`, `npm run test:unit`, and whichever emulator or preview suite the task touched.

---

## File map

| Path | Responsibility |
|------|----------------|
| `.gitattributes` (new) | LF normalisation for PWA paths and root config; legacy Swift tree untouched |
| `functions/tsconfig.test.json` (new) | Typechecks `functions/test/**` without emitting |
| `functions/package.json` | `typecheck` also runs the test tsconfig |
| `functions/vitest.config.mts` | Timeouts 60 s on CI, 20 s locally |
| `firestore.rules` | Household read uses `resource.data.memberIds`; `isMember(hid)` kept for Plan 2b subcollections |
| `functions/test/rules.test.ts` | New fail-closed case for a household without `memberIds` |
| `web/src/auth/AuthProvider.test.tsx` | Generation-counter race and unsubscribe-on-unmount tests |
| `web/src/api/callable.ts` (new) | `callable(name)`, `abortable(promise, signal)`, `isAbortError(err)` |
| `web/src/api/callable.test.ts` (new) | Unit tests for the three helpers |
| `web/src/pages/SettingsPage.tsx` | One `whoami` request under StrictMode; abort on unmount |
| `web/src/pages/SettingsPage.test.tsx` (new) | Proves a single request under `<StrictMode>` |
| `web/playwright.config.ts`, `web/e2e/global-setup.ts` | Drop the 15 s global expect timeout and the doubled warm-up |
| `web/src/config/firebaseEnv.ts` | Shape checks; `startupProblems(env, isBuild)` |
| `web/src/config/firebaseEnv.test.ts` | Shape-check and `startupProblems` tests |
| `web/src/MisconfiguredScreen.tsx` (new) | Plain screen listing configuration problems |
| `web/src/pwa/serviceWorker.ts` (new) | `unregisterServiceWorkers()` (Task 6), `registerServiceWorker()` (Task 7) |
| `web/src/pwa/serviceWorker.test.ts` (new) | Unit test for unregistration with a fake `navigator.serviceWorker` |
| `web/src/main.tsx` | Bootstrap: problems → screen + unregister; clean → dynamic `App` import + register |
| `web/e2e-boot-guard/boot-guard.spec.ts` | Asserts the screen, no page error, no worker |
| `web/assets/safebite-mark.svg` (new) | Monochrome glyph, the single source of all icons |
| `web/scripts/render-icons.mjs` (new) | Renders the PNG icon set with Playwright Chromium |
| `web/public/favicon.svg`, `web/public/pwa-192.png`, `web/public/pwa-512.png`, `web/public/pwa-maskable-512.png`, `web/public/apple-touch-icon-180.png` | Icon set (Vite logo removed) |
| `web/src/pwa/icons.test.ts` (new) | Asserts each PNG exists with the declared dimensions |
| `web/index.html` | Description, theme colour, Apple meta tags, touch icon |
| `web/vite.config.ts` | `VitePWA` plugin: manifest, Workbox precache, manual registration |
| `web/tsconfig.app.json` | `vite-plugin-pwa/client` types |
| `firebase.json` | Hosting headers for `sw.js`, `index.html`, manifest, hashed assets |
| `web/playwright.preview.config.ts` (new), `web/e2e-preview/pwa-shell.spec.ts` (new) | Preview-bundle suite: manifest, icons, worker, offline reload |
| `web/package.json` | Scripts `icons`, `preview:pwa`, `e2e:preview` |
| `.github/workflows/ci.yml` | Preview-suite step |
| `README.md`, `planning/specs/...design.md` | Commands and guardrails |

---

### Task 1: Functions test typecheck, CI-conditional timeouts, LF normalisation

**Files:**
- Create: `functions/tsconfig.test.json`, `.gitattributes`
- Modify: `functions/package.json`, `functions/vitest.config.mts`
- Renormalise: `README.md`, `CLAUDE.md`, `.gitignore`, `firestore.rules`

**Interfaces:**
- Produces: `npm --prefix functions run typecheck` covers `functions/test/**`; `.gitattributes` guarantees LF for every path later tasks touch.

- [ ] **Step 1: Prove the test files are not typechecked today**

Run:
```bash
cd functions && npx tsc --noEmit -p tsconfig.json --listFilesOnly | grep -c "/test/" ; cd ..
```
Expected: `0` (the count of test files in the program). If it prints a number greater than 0, stop and report DONE_WITH_CONCERNS: the premise of this task is wrong.

- [ ] **Step 2: Add the test tsconfig**

Create `functions/tsconfig.test.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "lib": ["es2022"],
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Run it and fix module resolution if needed**

Run:
```bash
cd functions && npx tsc -p tsconfig.test.json; echo "exit=$?"; cd ..
```
Expected: `exit=0`. Two known outcomes need action:
- Errors of the form `Cannot find module 'firebase/firestore'` or `... has no exported member` under `node16` resolution mean the `firebase` package's Node entry points differ from its bundler entry points. Replace the `compilerOptions` block above with:
  ```json
  {
    "noEmit": true,
    "rootDir": ".",
    "lib": ["es2022"],
    "types": ["node"],
    "module": "esnext",
    "moduleResolution": "bundler"
  }
  ```
  (Vitest transpiles the tests; the emitted `lib/` build still uses `tsconfig.json` unchanged.) Re-run until `exit=0`.
- Genuine type errors inside `functions/test/**` (for example an unused variable) are fixed in the test file, never by loosening `strict`.

- [ ] **Step 4: Wire the typecheck script**

In `functions/package.json` change the `typecheck` script to:
```json
"typecheck": "tsc --noEmit && tsc -p tsconfig.test.json"
```

- [ ] **Step 5: Make the vitest timeouts conditional on CI**

Replace `functions/vitest.config.mts` with:
```ts
import { defineConfig } from "vitest/config";

// The first callable invocation against the emulator pays a cold-require cost. On the hosted
// CI runner that can approach a minute; on a local Linux checkout it is a few seconds.
const slowTimeoutMs = process.env.CI ? 60_000 : 20_000;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: slowTimeoutMs,
    hookTimeout: slowTimeoutMs,
    fileParallelism: false,
  },
});
```
`functions/test/whoami.test.ts` keeps its explicit `300000` on the `beforeAll` warm-up; do not change it.

- [ ] **Step 6: Add `.gitattributes` scoped to the PWA**

Create `.gitattributes` (LF endings):
```
# Line endings. Everything the PWA touches is LF. The legacy Swift tree (SafeBite/,
# SafeBiteTests/, Package.swift, Config.xcconfig.template, docs/) is deliberately not
# listed: it stays byte-for-byte as it is in history.
web/**            text eol=lf
functions/**      text eol=lf
planning/**       text eol=lf
.github/**        text eol=lf
README.md         text eol=lf
CLAUDE.md         text eol=lf
AGENTS.md         text eol=lf
firebase.json     text eol=lf
.firebaserc       text eol=lf
firestore.rules   text eol=lf
firestore.indexes.json text eol=lf
package.json      text eol=lf
package-lock.json text eol=lf
.gitignore        text eol=lf
.gitattributes    text eol=lf
*.png             binary
*.ico             binary
*.webp            binary
```

- [ ] **Step 7: Renormalise and confirm exactly four files change**

Run:
```bash
git add --renormalize . && git status --short
```
Expected: exactly these lines (order may differ), plus the new/modified files from Steps 2–6:
```
M  .gitignore
M  CLAUDE.md
M  README.md
M  firestore.rules
```
If any path under `SafeBite/`, `SafeBiteTests/`, `docs/` or `Package.swift` appears, stop: the `.gitattributes` scope leaked. Fix the pattern and re-run `git add --renormalize .` before continuing.

- [ ] **Step 8: Rewrite the four working-tree files as LF**

Git normalised the index, not the working copies. Run:
```bash
rm README.md CLAUDE.md .gitignore firestore.rules && git checkout -- README.md CLAUDE.md .gitignore firestore.rules && file README.md CLAUDE.md .gitignore firestore.rules
```
Expected: none of the four lines mentions `CRLF`.

- [ ] **Step 9: Green gate**

Run:
```bash
npm run typecheck && npm run test:unit && npm run emu:test
```
Expected: both typechecks pass (the functions one now lists two `tsc` runs), web `26 passed`, functions `26 passed`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: typecheck functions tests; CI-conditional emulator timeouts; LF normalisation for PWA paths

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Household read rule without an extra `get()`

**Files:**
- Modify: `firestore.rules`, `functions/test/rules.test.ts`

**Interfaces:**
- Produces: `households/{hid}` read = `signedIn() && request.auth.uid in resource.data.memberIds`. `isMember(hid)` remains defined for Plan 2b's subcollection rules.

- [ ] **Step 1: Write the failing rules test**

In `functions/test/rules.test.ts`, inside `describe("households/{hid}", ...)`, add after the last `it`:
```ts
  it("fails closed for a household document without memberIds", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "households/broken"), { name: "Broken", createdAt: new Date() });
    });
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(getDoc(doc(db, "households/broken")));
  });
```

- [ ] **Step 2: Run the rules tests to see the new case**

Run:
```bash
npm run emu:test 2>&1 | grep -E "✓|×|passed|failed" | tail -20
```
Expected: the new test passes already (the current `isMember` also fails closed) and the count is `27 passed`. That is acceptable here: this test pins behaviour the rule change must preserve. Continue.

- [ ] **Step 3: Change the household read rule**

Edit `firestore.rules` (LF after Task 1). Replace the `households` block with:
```
    match /households/{hid} {
      // Read the membership list off the document itself: no second get() per read.
      allow read: if signedIn() && request.auth.uid in resource.data.memberIds;
      allow write: if false;
    }
```
Keep `signedIn()`, `household(hid)` and `isMember(hid)` exactly as they are; Plan 2b's subcollection rules use `isMember(hid)`.

- [ ] **Step 4: Run the rules tests**

Run:
```bash
npm run emu:test 2>&1 | grep -E "×|passed|failed" | tail -5
```
Expected: `27 passed`, including "allows a member to read their household", "denies a non-member reading the household", "fails closed for a member reading a household that does not exist" and the new case. A failure in "fails closed … does not exist" would mean `resource` is null-safe in a way that grants access; it must be denied.

- [ ] **Step 5: Confirm the browser suite still signs in**

Run:
```bash
npm run emu:e2e 2>&1 | grep -E "passed|failed" | tail -2
```
Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules functions/test/rules.test.ts
git commit -m "feat(rules): read household membership from resource.data, no extra get()

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Auth provider race and unsubscribe tests

**Files:**
- Modify: `web/src/auth/AuthProvider.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` from `web/src/auth/AuthProvider.tsx` (unchanged unless a test exposes a defect).

- [ ] **Step 1: Make the auth mock record unsubscribe functions and support deferred lookups**

Replace the hoisted block and the `firebase/auth` mock at the top of `web/src/auth/AuthProvider.test.tsx` with:
```tsx
const { listeners, unsubscribes, getDocMock } = vi.hoisted(() => ({
  listeners: [] as Array<(user: unknown) => void>,
  unsubscribes: [] as Array<ReturnType<typeof vi.fn>>,
  getDocMock: vi.fn(),
}));

vi.mock("../firebase", () => ({ auth: {}, db: {}, functions: {}, usingEmulators: true }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    listeners.push(cb);
    const unsubscribe = vi.fn();
    unsubscribes.push(unsubscribe);
    return unsubscribe;
  },
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));
```
Add to `beforeEach`: `unsubscribes.length = 0;`. Add this helper below `snap`:
```tsx
/** A getDoc result the test resolves by hand, to order overlapping membership lookups. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
```

- [ ] **Step 2: Write the failing tests**

Append inside `describe("AuthProvider", ...)`:
```tsx
  it("ignores a slow membership lookup that finishes after the user signed out", async () => {
    const slowUserDoc = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => {
      if (path === "users/ava-uid") return slowUserDoc.promise;
      if (path === "households/home") return Promise.resolve(snap({ name: "Home", memberIds: ["ava-uid"] }));
      return Promise.resolve(snap(undefined));
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    expect(screen.getByTestId("state")).toHaveTextContent('"loading"');
    listeners[0](null);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"signedOut"'));
    slowUserDoc.resolve(snap({ householdId: "home", displayName: "Ava" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("state")).toHaveTextContent('"signedOut"');
    expect(screen.getByTestId("state")).not.toHaveTextContent('"member"');
  });

  it("never lets an earlier user's lookup overwrite a later user's state", async () => {
    const slowUserDoc = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => {
      if (path === "users/slow-uid") return slowUserDoc.promise;
      if (path === "users/fast-uid") return Promise.resolve(snap({ householdId: "home", displayName: "Fast" }));
      if (path === "households/home") return Promise.resolve(snap({ name: "Home", memberIds: ["fast-uid", "slow-uid"] }));
      return Promise.resolve(snap(undefined));
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "slow-uid", email: "slow@safebite.test" });
    listeners[0]({ uid: "fast-uid", email: "fast@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"displayName":"Fast"'));
    slowUserDoc.resolve(snap({ householdId: "home", displayName: "Slow" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("state")).toHaveTextContent('"displayName":"Fast"');
  });

  it("unsubscribes from auth state changes on unmount", () => {
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
    expect(unsubscribes).toHaveLength(1);
    expect(unsubscribes[0]).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 3: Run the tests**

Run:
```bash
cd web && npx vitest run src/auth/AuthProvider.test.tsx; cd ..
```
Expected: `8 passed`. These tests pin the generation counter and cleanup that already exist; if any of the three fails, the provider has a real defect: fix it in `AuthProvider.tsx` (never by weakening the test) and record the fix in the commit message.

- [ ] **Step 4: Commit**

```bash
git add web/src/auth/AuthProvider.test.tsx web/src/auth/AuthProvider.tsx
git commit -m "test(web): pin the auth provider's generation race and unsubscribe-on-unmount

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Cancellable callables; one `whoami` request under StrictMode; Playwright timeout clean-up

**Files:**
- Create: `web/src/api/callable.ts`, `web/src/api/callable.test.ts`, `web/src/pages/SettingsPage.test.tsx`
- Modify: `web/src/pages/SettingsPage.tsx`, `web/playwright.config.ts`, `web/e2e/global-setup.ts`

**Interfaces:**
- Produces (used by Plan 3's discovery calls):
  ```ts
  export function callable<Req, Res>(name: string): (data: Req) => Promise<Res>;
  export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T>; // rejects with DOMException "AbortError"
  export function isAbortError(err: unknown): boolean;
  ```

- [ ] **Step 1: Write the failing helper tests**

Create `web/src/api/callable.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

const { httpsCallableMock } = vi.hoisted(() => ({ httpsCallableMock: vi.fn() }));
vi.mock("../firebase", () => ({ functions: { app: "fake" } }));
vi.mock("firebase/functions", () => ({ httpsCallable: httpsCallableMock }));

import { abortable, callable, isAbortError } from "./callable";

describe("callable", () => {
  it("unwraps the callable result's data", async () => {
    httpsCallableMock.mockReturnValue(async (data: unknown) => ({ data: { echo: data } }));
    const echo = callable<{ n: number }, { echo: { n: number } }>("echo");
    await expect(echo({ n: 1 })).resolves.toEqual({ echo: { n: 1 } });
    expect(httpsCallableMock).toHaveBeenCalledWith({ app: "fake" }, "echo");
  });
});

describe("abortable", () => {
  it("resolves with the promise's value when the signal never fires", async () => {
    const controller = new AbortController();
    await expect(abortable(Promise.resolve(42), controller.signal)).resolves.toBe(42);
  });

  it("rejects with an AbortError when the signal fires first", async () => {
    const controller = new AbortController();
    const never = new Promise<number>(() => {});
    const pending = abortable(never, controller.signal);
    controller.abort();
    await expect(pending).rejects.toSatisfy(isAbortError);
  });

  it("rejects immediately for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortable(Promise.resolve(1), controller.signal)).rejects.toSatisfy(isAbortError);
  });

  it("does not report the underlying failure after abort", async () => {
    const controller = new AbortController();
    let fail!: (err: Error) => void;
    const failing = new Promise<number>((_, reject) => (fail = reject));
    const pending = abortable(failing, controller.signal);
    controller.abort();
    fail(new Error("late network failure"));
    await expect(pending).rejects.toSatisfy(isAbortError);
  });
});

describe("isAbortError", () => {
  it("recognises only AbortError", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run:
```bash
cd web && npx vitest run src/api/callable.test.ts; cd ..
```
Expected: FAIL, `Failed to resolve import "./callable"`.

- [ ] **Step 3: Implement the helpers**

Create `web/src/api/callable.ts`:
```ts
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/** A typed callable that resolves to the response data (not the SDK's `{ data }` wrapper). */
export function callable<Req, Res>(name: string): (data: Req) => Promise<Res> {
  const call = httpsCallable<Req, Res>(functions, name);
  return async (data: Req) => (await call(data)).data;
}

/**
 * Cancellation semantics for a promise that cannot itself be cancelled (the Firebase callable
 * SDK exposes no AbortSignal): once `signal` fires, the returned promise rejects with an
 * AbortError and the underlying promise's later outcome is ignored.
 */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) reject(err);
      },
    );
  });
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
```

- [ ] **Step 4: Run to verify pass**

Run:
```bash
cd web && npx vitest run src/api/callable.test.ts; cd ..
```
Expected: `6 passed`.

- [ ] **Step 5: Write the failing Settings page test**

Create `web/src/pages/SettingsPage.test.tsx`:
```tsx
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { whoamiCalls } = vi.hoisted(() => ({ whoamiCalls: vi.fn() }));
vi.mock("../firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => async (data: unknown) => {
    whoamiCalls(data);
    return { data: { uid: "ava-uid", householdId: "home", displayName: "Ava" } };
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));

import { SettingsPage } from "./SettingsPage";

beforeEach(() => whoamiCalls.mockClear());

describe("SettingsPage", () => {
  it("issues exactly one whoami request even when StrictMode double-runs the effect", async () => {
    render(<StrictMode><SettingsPage /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("whoami")).toHaveTextContent("Ava"));
    expect(whoamiCalls).toHaveBeenCalledTimes(1);
  });

  it("shows the server's household confirmation", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByTestId("whoami")).toHaveTextContent('household “home”'));
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run:
```bash
cd web && npx vitest run src/pages/SettingsPage.test.tsx; cd ..
```
Expected: the first test FAILS with `expected "spy" to be called 1 times, but got 2 times`; the second passes.

- [ ] **Step 7: Dedupe the request**

Replace `web/src/pages/SettingsPage.tsx` with:
```tsx
import { useEffect, useRef, useState } from "react";
import { abortable, callable, isAbortError } from "../api/callable";
import { useAuth } from "../auth/AuthProvider";

interface WhoAmI {
  uid: string;
  householdId: string;
  displayName: string;
}

const whoami = callable<Record<string, never>, WhoAmI>("whoami");

export function SettingsPage() {
  const { state, signOut } = useAuth();
  const [confirmed, setConfirmed] = useState<WhoAmI | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref so React StrictMode's mount → unmount → mount in development reuses the
  // in-flight request instead of issuing a second one. Refs survive that simulated remount.
  const request = useRef<Promise<WhoAmI> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    request.current ??= whoami({});
    abortable(request.current, controller.signal)
      .then(setConfirmed)
      .catch((err: unknown) => {
        if (!isAbortError(err)) setError("Could not confirm membership with the server.");
      });
    return () => controller.abort();
  }, []);

  return (
    <section>
      <h2>Settings</h2>
      {state.status === "member" && <p>Signed in as {state.email}</p>}
      {confirmed && (
        <p data-testid="whoami">
          Server confirms: {confirmed.displayName} in household “{confirmed.householdId}”.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}
```

- [ ] **Step 8: Run to verify pass**

Run:
```bash
cd web && npx vitest run src/pages/SettingsPage.test.tsx; cd ..
```
Expected: `2 passed`.

- [ ] **Step 9: Drop the global expect timeout and the doubled warm-up**

In `web/playwright.config.ts` delete the comment block and the line `expect: { timeout: 15_000 },` (Playwright's default 5 s applies again). Leave everything else.

In `web/e2e/global-setup.ts`:
- Replace the header comment (lines 1–16) with:
  ```ts
  // The Functions emulator spawns its runtime worker lazily on the first request; warm it up
  // before any test's timeout budget starts so the Settings page's single `whoami` call only
  // pays for a warm invocation. Mirrors functions/test/emulator-helpers.ts's warmUpFunctions().
  ```
- Replace the `globalSetup` function with:
  ```ts
  export default async function globalSetup(): Promise<void> {
    await waitUntilReachable();
  }
  ```
`callWhoami` and `waitUntilReachable` stay as they are.

- [ ] **Step 10: Run the browser suite three times with retries off**

Run:
```bash
npm run emu:e2e:stress 2>&1 | grep -E "passed|failed|flaky" | tail -3
```
Expected: `15 passed`, no `flaky`. If "a member signs in…" or "switching accounts…" fails on the `whoami` assertion, the dedupe did not take effect in the dev server: verify with `grep -n "request.current ??=" web/src/pages/SettingsPage.tsx` and re-run; do not reintroduce the global timeout.

- [ ] **Step 11: Green gate and commit**

Run `npm run typecheck && npm run test:unit` (expect web `37 passed`). Then:
```bash
git add web/src/api web/src/pages/SettingsPage.tsx web/src/pages/SettingsPage.test.tsx web/playwright.config.ts web/e2e/global-setup.ts
git commit -m "feat(web): cancellable callables; one whoami request under StrictMode; drop the global expect timeout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Validator shape checks and `startupProblems`

**Files:**
- Modify: `web/src/config/firebaseEnv.ts`, `web/src/config/firebaseEnv.test.ts`

**Interfaces:**
- Produces: `validateFirebaseEnv` additionally rejects malformed values; `export function startupProblems(env: FirebaseEnvLike, isBuild: boolean): string[]` returns `[]` outside a built bundle and `validateFirebaseEnv(env)` inside one. Task 6's `main.tsx` calls it.

- [ ] **Step 1: Update the good fixture and write the failing tests**

In `web/src/config/firebaseEnv.test.ts` change `good` to:
```ts
const good = {
  VITE_FIREBASE_API_KEY: "AIzaSyExampleKey0123456789abcdefghijk",
  VITE_FIREBASE_AUTH_DOMAIN: "safebite-pilot.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "safebite-pilot",
  VITE_FIREBASE_APP_ID: "1:123456789012:web:0123456789abcdef",
};
```
Append inside `describe("validateFirebaseEnv", ...)`:
```ts
  it("rejects an api key that does not look like a Firebase web key", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_API_KEY: "AIzaShort" })).toEqual([
      "VITE_FIREBASE_API_KEY does not look like a Firebase web API key (expected AIza… of at least 30 characters)",
    ]);
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_API_KEY: "not-a-firebase-key-0123456789abcdefghijk" })).toHaveLength(1);
  });

  it("rejects an app id that is not a web app id", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_APP_ID: "1:123:ios:abc" })).toEqual([
      "VITE_FIREBASE_APP_ID does not look like a Firebase web app id (expected <digits>:<digits>:web:<hex>)",
    ]);
  });

  it("rejects an auth domain without a dot", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_AUTH_DOMAIN: "localhost" })).toEqual([
      "VITE_FIREBASE_AUTH_DOMAIN does not look like a domain (expected something like <project>.firebaseapp.com)",
    ]);
  });

  it("reports a placeholder once, not also as a shape problem", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_API_KEY: "demo-api-key" })).toEqual([
      "VITE_FIREBASE_API_KEY is the demo placeholder",
    ]);
  });
```
Add a new describe at the end of the file:
```ts
describe("startupProblems", () => {
  const demo = { ...good, VITE_FIREBASE_PROJECT_ID: "demo-safebite" };

  it("is empty outside a built bundle, whatever the values", () => {
    expect(startupProblems(demo, false)).toEqual([]);
    expect(startupProblems({}, false)).toEqual([]);
  });

  it("returns the validator's problems inside a built bundle", () => {
    expect(startupProblems(demo, true)).toEqual([
      "VITE_FIREBASE_PROJECT_ID must not be an emulator-only demo- project (got demo-safebite)",
    ]);
    expect(startupProblems(good, true)).toEqual([]);
  });
});
```
Update the import line to include `startupProblems`.

- [ ] **Step 2: Run to verify failure**

Run:
```bash
cd web && npx vitest run src/config/firebaseEnv.test.ts 2>&1 | grep -E "×|✓|passed|failed" ; cd ..
```
Expected: the four shape tests and the two `startupProblems` tests fail (`startupProblems is not a function`, and the shape tests receive `[]`); the rest pass.

- [ ] **Step 3: Implement**

In `web/src/config/firebaseEnv.ts`, add after `DEMO_PLACEHOLDERS`:
```ts
const SHAPE_CHECKS: Partial<Record<(typeof REQUIRED_FIREBASE_VARS)[number], { ok: (v: string) => boolean; problem: string }>> = {
  VITE_FIREBASE_API_KEY: {
    ok: (v) => /^AIza[0-9A-Za-z_-]{26,}$/.test(v),
    problem: "does not look like a Firebase web API key (expected AIza… of at least 30 characters)",
  },
  VITE_FIREBASE_APP_ID: {
    ok: (v) => /^\d+:\d+:web:[0-9a-f]+$/.test(v),
    problem: "does not look like a Firebase web app id (expected <digits>:<digits>:web:<hex>)",
  },
  VITE_FIREBASE_AUTH_DOMAIN: {
    ok: (v) => v.includes("."),
    problem: "does not look like a domain (expected something like <project>.firebaseapp.com)",
  },
};
```
In `validateFirebaseEnv`, replace the loop body's placeholder check with:
```ts
    const placeholder = DEMO_PLACEHOLDERS[name];
    if (placeholder !== undefined && value === placeholder) {
      problems.push(`${name} is the demo placeholder`);
      continue;
    }
    const shape = SHAPE_CHECKS[name];
    if (shape !== undefined && !shape.ok(value)) {
      problems.push(`${name} ${shape.problem}`);
    }
```
(`value` is narrowed to `string` after the `blank` check; if TypeScript disagrees, bind `const value = env[name] ?? ""` before the check and keep `blank(value)` first.)

Append at the end of the file:
```ts
/**
 * What blocks this bundle from starting. Outside a built bundle (dev server, Vitest) nothing
 * does: the emulator-backed development server runs on demo values by design.
 */
export function startupProblems(env: FirebaseEnvLike, isBuild: boolean): string[] {
  return isBuild ? validateFirebaseEnv(env) : [];
}
```

- [ ] **Step 4: Run to verify pass**

Run:
```bash
cd web && npx vitest run src/config/firebaseEnv.test.ts; cd ..
```
Expected: `18 passed`. Then run the whole web suite: `npm run test:unit` → `43 passed`.

- [ ] **Step 5: Prove the build-time rejection messages**

Run from `web/`:
```bash
VITE_FIREBASE_API_KEY=short VITE_FIREBASE_AUTH_DOMAIN=localhost VITE_FIREBASE_PROJECT_ID=safebite-pilot VITE_FIREBASE_APP_ID=1:1:ios:a node node_modules/vite/bin/vite.js build --outDir /tmp/claude-shape-check 2>&1 | grep -E "does not look like" ; echo "exit=${PIPESTATUS[0]}"
```
Expected: three "does not look like" lines and `exit=1`.

- [ ] **Step 6: Commit**

```bash
git add web/src/config/firebaseEnv.ts web/src/config/firebaseEnv.test.ts
git commit -m "feat(web): validator shape checks for api key, app id and auth domain; startupProblems()

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Misconfigured-build screen instead of a blank page

**Files:**
- Create: `web/src/MisconfiguredScreen.tsx`, `web/src/pwa/serviceWorker.ts`, `web/src/pwa/serviceWorker.test.ts`
- Modify: `web/src/main.tsx`, `web/src/styles.css`, `web/e2e-boot-guard/boot-guard.spec.ts`

**Interfaces:**
- Consumes: `startupProblems(env, isBuild)` from Task 5.
- Produces: `export async function unregisterServiceWorkers(): Promise<number>` in `web/src/pwa/serviceWorker.ts` (Task 7 adds `registerServiceWorker` to the same file). `MisconfiguredScreen` renders `data-testid="misconfigured"` with one `<li>` per problem.

- [ ] **Step 1: Write the failing unit test for unregistration**

Create `web/src/pwa/serviceWorker.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { unregisterServiceWorkers } from "./serviceWorker";

afterEach(() => {
  // jsdom has no navigator.serviceWorker; each test installs and removes its own fake.
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("unregisterServiceWorkers", () => {
  it("unregisters every registration and reports how many", async () => {
    const unregister = vi.fn(async () => true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: async () => [{ unregister }, { unregister }] },
    });
    await expect(unregisterServiceWorkers()).resolves.toBe(2);
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it("is a no-op where service workers are unsupported", async () => {
    await expect(unregisterServiceWorkers()).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run:
```bash
cd web && npx vitest run src/pwa/serviceWorker.test.ts; cd ..
```
Expected: FAIL, `Failed to resolve import "./serviceWorker"`.

- [ ] **Step 3: Implement unregistration**

Create `web/src/pwa/serviceWorker.ts`:
```ts
/**
 * Removes every service worker registration for this origin. Called when the bundle is
 * misconfigured so a previously installed worker cannot keep serving a stale shell.
 */
export async function unregisterServiceWorkers(): Promise<number> {
  if (!("serviceWorker" in navigator)) return 0;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  return registrations.length;
}
```

- [ ] **Step 4: Run to verify pass**

Run the same command. Expected: `2 passed`.

- [ ] **Step 5: Write the failing boot-guard browser test**

Replace `web/e2e-boot-guard/boot-guard.spec.ts` with:
```ts
import { expect, test } from "@playwright/test";

// Regression for the Plan 1b re-audit finding: a compile-only bundle (SAFEBITE_UNVALIDATED_BUILD=1)
// carrying demo Firebase values must refuse to start in a real browser. Since Plan 2a it refuses
// with a plain screen instead of a blank page, and must never register a service worker.
// The bundle is built by `npm run e2e:boot-guard` and served by `vite preview`.
test("a compile-only bundle with demo Firebase values shows the misconfiguration screen", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  const screen = page.getByTestId("misconfigured");
  await expect(screen).toBeVisible();
  await expect(screen).toContainText("demo-safebite");
  await expect(screen.locator("li")).toHaveCount(5);
  await expect(page.getByTestId("signin-form")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  const registrations = await page.evaluate(async () =>
    "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  );
  expect(registrations).toBe(0);
});
```
(The five problems: api key placeholder, app id placeholder, auth domain `localhost` has no dot, demo project id, emulators on.)

- [ ] **Step 6: Run to verify failure**

Run from `web/`:
```bash
timeout 240 npm run e2e:boot-guard 2>&1 | grep -E "✓|✘|passed|failed|Error:" | head -5
```
Expected: `1 failed` because `misconfigured` is not found (the bundle still throws at module scope).

- [ ] **Step 7: Create the screen**

Create `web/src/MisconfiguredScreen.tsx`:
```tsx
/** Shown instead of the app when a built bundle carries a non-deployable Firebase configuration. */
export function MisconfiguredScreen({ problems }: { problems: string[] }) {
  return (
    <main className="screen" data-testid="misconfigured">
      <h1>This build is misconfigured</h1>
      <p>SafeBite refused to start because its Firebase configuration is not deployable:</p>
      <ul className="problems">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
      <p>Rebuild with the pilot project's <code>VITE_FIREBASE_*</code> values. Nothing was loaded and no data was touched.</p>
    </main>
  );
}
```
Append to `web/src/styles.css`:
```css
.problems { padding-left: 1.25rem; }
.problems li { margin: 0.25rem 0; overflow-wrap: anywhere; }
```

- [ ] **Step 8: Split the bootstrap**

Replace `web/src/main.tsx` with:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startupProblems } from "./config/firebaseEnv";
import { MisconfiguredScreen } from "./MisconfiguredScreen";
import { unregisterServiceWorkers } from "./pwa/serviceWorker";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

// Decided before anything imports Firebase. A misconfigured bundle renders the screen, removes
// any service worker left by an earlier install, and never loads the app chunk at all.
const problems = startupProblems(import.meta.env, __SAFEBITE_BUILD__);

if (problems.length > 0) {
  void unregisterServiceWorkers();
  root.render(<MisconfiguredScreen problems={problems} />);
} else {
  void import("./App").then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
```
`web/src/firebase.ts` is not changed: its module-scope guard stays as the second line of defence and its three unit tests keep passing.

- [ ] **Step 9: Run to verify pass**

Run from `web/`:
```bash
timeout 240 npm run e2e:boot-guard 2>&1 | grep -E "✓|✘|passed|failed" | tail -3
```
Expected: `1 passed`. Then confirm the app chunk really is separate:
```bash
ls dist-boot-guard/assets/ | grep -c "App-"
```
Expected: `1` (a chunk named `App-<hash>.js`). If `0`, the bundler inlined the dynamic import; add `build: { rolldownOptions: { output: { manualChunks: { app: ["./src/App.tsx"] } } } }` to `web/vite.config.ts` and re-run both checks.

- [ ] **Step 10: Green gate**

Run:
```bash
npm run typecheck && npm run test:unit && npm run emu:e2e 2>&1 | grep -E "passed|failed" | tail -2
```
Expected: web `45 passed`; browser `5 passed` (the dev server takes the clean branch: `__SAFEBITE_BUILD__` is false, so `startupProblems` is empty).

- [ ] **Step 11: Commit**

```bash
git add web/src/main.tsx web/src/MisconfiguredScreen.tsx web/src/pwa web/src/styles.css web/e2e-boot-guard/boot-guard.spec.ts web/vite.config.ts
git commit -m "feat(web): misconfigured-build screen; bootstrap never loads Firebase or a service worker on bad config

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: PWA shell — icons, manifest, meta tags, service worker

**Files:**
- Create: `web/assets/safebite-mark.svg`, `web/scripts/render-icons.mjs`, `web/src/pwa/icons.test.ts`, `web/public/pwa-192.png`, `web/public/pwa-512.png`, `web/public/pwa-maskable-512.png`, `web/public/apple-touch-icon-180.png`
- Modify: `web/public/favicon.svg` (replace the Vite logo), `web/index.html`, `web/vite.config.ts`, `web/tsconfig.app.json`, `web/package.json`, `web/src/pwa/serviceWorker.ts`, `web/src/main.tsx`, `firebase.json`

**Interfaces:**
- Consumes: `unregisterServiceWorkers` (Task 6) stays; adds `export function registerServiceWorker(): void` beside it.
- Produces: `/manifest.webmanifest`, `/sw.js` and `/workbox-*.js` in every build; theme colour `#1f7a4d`; npm script `icons`.

- [ ] **Step 1: Install the plugin**

Run from `web/`:
```bash
npm install --save-dev vite-plugin-pwa@1.3.0 && grep '"vite-plugin-pwa"' package.json
```
Expected: `"vite-plugin-pwa": "^1.3.0"` under `devDependencies`. If npm reports a peer conflict with Vite 8, stop and report DONE_WITH_CONCERNS with the exact message; do not use `--legacy-peer-deps`.

- [ ] **Step 2: Write the failing icon-dimension test**

Create `web/src/pwa/icons.test.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// PNG: 8-byte signature, then the IHDR chunk whose width/height are big-endian at bytes 16–23.
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const publicDir = path.resolve(__dirname, "../../public");

describe("PWA icon set", () => {
  it.each([
    ["pwa-192.png", 192],
    ["pwa-512.png", 512],
    ["pwa-maskable-512.png", 512],
    ["apple-touch-icon-180.png", 180],
  ])("%s is a %ipx square PNG", (file, size) => {
    expect(pngSize(path.join(publicDir, file))).toEqual({ width: size, height: size });
  });

  it("the favicon is the SafeBite mark, not the Vite logo", () => {
    const svg = readFileSync(path.join(publicDir, "favicon.svg"), "utf8");
    expect(svg).toContain("safebite-mark");
    expect(svg).not.toContain("#863bff");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run:
```bash
cd web && npx vitest run src/pwa/icons.test.ts 2>&1 | grep -E "×|✓|ENOENT|passed|failed" | head; cd ..
```
Expected: `5 failed` (ENOENT for the four PNGs; the favicon test fails on the Vite logo's `#863bff`).

- [ ] **Step 4: Draw the mark**

Create `web/assets/safebite-mark.svg` (a white glyph on transparent; the renderer adds the green ground):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" id="safebite-mark" fill="none">
  <!-- Plate -->
  <circle cx="50" cy="52" r="34" stroke="#ffffff" stroke-width="7"/>
  <!-- Leaf inside the plate: a wheat-free plate -->
  <path d="M50 74 C34 66 30 50 40 36 C54 38 62 50 50 74 Z" fill="#ffffff"/>
  <path d="M50 74 C50 60 46 50 42 42" stroke="#1f7a4d" stroke-width="3.5" stroke-linecap="round"/>
</svg>
```
Replace `web/public/favicon.svg` with:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" id="safebite-mark-favicon" fill="none">
  <rect width="100" height="100" rx="22" fill="#1f7a4d"/>
  <g transform="translate(15 15) scale(0.7)">
    <circle cx="50" cy="52" r="34" stroke="#ffffff" stroke-width="7"/>
    <path d="M50 74 C34 66 30 50 40 36 C54 38 62 50 50 74 Z" fill="#ffffff"/>
    <path d="M50 74 C50 60 46 50 42 42" stroke="#1f7a4d" stroke-width="3.5" stroke-linecap="round"/>
  </g>
</svg>
```

- [ ] **Step 5: Write the renderer**

Create `web/scripts/render-icons.mjs`:
```js
// Renders the PNG icon set from assets/safebite-mark.svg with the Playwright Chromium that the
// browser tests already install. Run: `npm run icons` (from web/). Output is committed.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");
const GROUND = "#1f7a4d";

// radius: corner radius as a fraction of the size (0 = square; iOS and maskable icons are
// masked by the platform). glyph: glyph width as a fraction of the size (maskable icons keep
// the glyph inside the 80% safe zone).
const ICONS = [
  { file: "pwa-192.png", size: 192, radius: 0.22, glyph: 0.72 },
  { file: "pwa-512.png", size: 512, radius: 0.22, glyph: 0.72 },
  { file: "pwa-maskable-512.png", size: 512, radius: 0, glyph: 0.6 },
  { file: "apple-touch-icon-180.png", size: 180, radius: 0, glyph: 0.72 },
];

const svg = await readFile(path.resolve(here, "../assets/safebite-mark.svg"), "utf8");
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
      <div id="icon" style="width:${icon.size}px;height:${icon.size}px;background:${GROUND};
        border-radius:${Math.round(icon.size * icon.radius)}px;display:grid;place-items:center">
        <img src="${dataUrl}" style="width:${Math.round(icon.size * icon.glyph)}px;height:${Math.round(icon.size * icon.glyph)}px" />
      </div></body></html>`);
    await page.locator("#icon img").evaluate((img) => img.decode());
    await page.locator("#icon").screenshot({ path: path.join(publicDir, icon.file), omitBackground: true });
    console.log(`wrote ${icon.file} (${icon.size}px)`);
  }
} finally {
  await browser.close();
}
```
Add to `web/package.json` scripts: `"icons": "node scripts/render-icons.mjs"`.

- [ ] **Step 6: Render and verify**

Run from `web/`:
```bash
npm run icons && npx vitest run src/pwa/icons.test.ts
```
Expected: four `wrote …` lines, then `5 passed`. Look at one output: `file public/pwa-512.png` reports `PNG image data, 512 x 512, 8-bit/color RGBA`.

- [ ] **Step 7: Meta tags in `index.html`**

Replace the `<head>` of `web/index.html` with:
```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="description" content="Private gluten-free restaurant research for our household." />
    <meta name="theme-color" content="#1f7a4d" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="SafeBite" />
    <title>SafeBite</title>
  </head>
```

- [ ] **Step 8: Configure the plugin**

In `web/vite.config.ts` add the import `import { VitePWA } from "vite-plugin-pwa";` and change the plugins line to:
```ts
  plugins: [react(), requireDeployableFirebaseEnv(mode), VitePWA(pwaOptions)],
```
Add above `export default`:
```ts
// The manifest and Workbox service worker are generated at build time only (devOptions stay
// disabled: the dev server and the emulator-backed browser tests run without a worker).
// injectRegister: null — registration is done by src/main.tsx, and only when the bundle's
// Firebase configuration passed startupProblems(); see src/pwa/serviceWorker.ts.
const pwaOptions: Parameters<typeof VitePWA>[0] = {
  registerType: "autoUpdate",
  injectRegister: null,
  includeAssets: ["favicon.svg", "apple-touch-icon-180.png"],
  manifest: {
    name: "SafeBite",
    short_name: "SafeBite",
    description: "Private gluten-free restaurant research for our household.",
    lang: "en-GB",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f7a4d",
    icons: [
      { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
      { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
    navigateFallback: "/index.html",
    cleanupOutdatedCaches: true,
  },
};
```
In `web/tsconfig.app.json` change `"types": ["vite/client"]` to `"types": ["vite/client", "vite-plugin-pwa/client"]`.

- [ ] **Step 9: Register only on a clean configuration**

Append to `web/src/pwa/serviceWorker.ts`:
```ts
import { registerSW } from "virtual:pwa-register";

/**
 * Registers the generated service worker. Only src/main.tsx calls this, and only after
 * startupProblems() returned nothing, so a misconfigured bundle is never precached.
 * Outside a built bundle there is no worker to register.
 */
export function registerServiceWorker(): void {
  if (!__SAFEBITE_BUILD__ || !("serviceWorker" in navigator)) return;
  registerSW({ immediate: true });
}
```
(Move the `import` to the top of the file; keep `unregisterServiceWorkers` unchanged.) In `web/src/main.tsx` import `registerServiceWorker` from `./pwa/serviceWorker` and call it in the clean branch, after `root.render(...)` inside the `.then`:
```tsx
    registerServiceWorker();
```

- [ ] **Step 10: Unit tests still pass with the virtual module in the graph**

Run:
```bash
cd web && npx vitest run 2>&1 | tail -4; cd ..
```
Expected: `47 passed`. If Vitest fails to resolve `virtual:pwa-register` in `serviceWorker.test.ts`, add `vi.mock("virtual:pwa-register", () => ({ registerSW: vi.fn() }));` at the top of that test file (after the imports) and re-run.

- [ ] **Step 11: Hosting headers**

In `firebase.json`, inside `"hosting"`, add after `"rewrites"`:
```json
    "headers": [
      { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/workbox-*.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/manifest.webmanifest", "headers": [{ "key": "Content-Type", "value": "application/manifest+json" }, { "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
    ],
```

- [ ] **Step 12: Build and inspect the output**

Run from `web/`:
```bash
npm run build:check 2>&1 | grep -E "PWA|manifest|sw.js|precache|built in|error" ; ls dist | tr '\n' ' '; echo; cat dist/manifest.webmanifest | head -c 400; echo
```
Expected: the plugin's summary lines (`PWA v1.3.0`, `mode generateSW`, `precache N entries`), `dist` contains `sw.js`, `workbox-<hash>.js`, `manifest.webmanifest`, the four PNGs and `favicon.svg`; the manifest JSON starts with `{"name":"SafeBite"` and has `"display":"standalone"`. Also confirm `grep -c 'rel="manifest"' dist/index.html` prints `1`.

- [ ] **Step 13: The misconfigured bundle still registers nothing**

Run from `web/`:
```bash
timeout 240 npm run e2e:boot-guard 2>&1 | grep -E "passed|failed" | tail -2
```
Expected: `1 passed` (its registrations assertion now guards against the new worker).

- [ ] **Step 14: Green gate and commit**

Run `npm run typecheck && npm run test:unit && npm run emu:e2e 2>&1 | grep -E "passed|failed" | tail -2` → web `47 passed`, browser `5 passed`.
```bash
git add web/assets web/scripts web/public web/index.html web/vite.config.ts web/tsconfig.app.json web/package.json web/package-lock.json web/src/pwa web/src/main.tsx firebase.json
git commit -m "feat(web): installable PWA shell — icon set, manifest, Apple meta tags, Workbox worker registered only on clean config

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Preview-bundle browser suite, CI, docs

**Files:**
- Create: `web/playwright.preview.config.ts`, `web/e2e-preview/pwa-shell.spec.ts`
- Modify: `web/package.json`, `.gitignore`, `.github/workflows/ci.yml`, `README.md`, `planning/specs/2026-09-20-safebite-pwa-design.md`

**Interfaces:**
- Produces: `npm --prefix web run e2e:preview` = validated build with synthetic non-demo values into `web/dist-preview` + Playwright against `vite preview` on port 4174.

- [ ] **Step 1: Scripts and ignore entry**

Add to `web/package.json` scripts (keep the existing ones):
```json
"preview:pwa": "vite preview --outDir dist-preview --host 127.0.0.1 --port 4174 --strictPort",
"e2e:preview": "VITE_FIREBASE_API_KEY=AIzaSyPreviewOnly0123456789abcdefghijklmn VITE_FIREBASE_AUTH_DOMAIN=safebite-preview.firebaseapp.com VITE_FIREBASE_PROJECT_ID=safebite-preview VITE_FIREBASE_APP_ID=1:000000000000:web:0123456789abcdef VITE_USE_EMULATORS=false vite build --outDir dist-preview && playwright test -c playwright.preview.config.ts"
```
These synthetic values pass the validator (Task 5) and name no real project; the browser never reaches the network in this suite. Add `web/dist-preview/` to `.gitignore` directly under `web/dist-boot-guard/`.

- [ ] **Step 2: Playwright configuration**

Create `web/playwright.preview.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

// Serves the validated bundle in `dist-preview` (built by `npm run e2e:preview` with synthetic,
// non-demo Firebase values) through `vite preview`, to test the PWA shell: manifest, icons,
// service worker, offline reload. No emulators, no network beyond 127.0.0.1.
export default defineConfig({
  testDir: "./e2e-preview",
  outputDir: "test-results/preview",
  timeout: 30_000,
  globalTimeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run preview:pwa",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: Write the tests (they fail until the build exists, then must pass on the first run)**

Create `web/e2e-preview/pwa-shell.spec.ts`:
```ts
import { expect, test, type BrowserContext } from "@playwright/test";

interface Manifest {
  name: string;
  display: string;
  start_url: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
}

/** The synthetic Firebase project must never be contacted: refuse everything off-box. */
async function blockExternalNetwork(context: BrowserContext) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
}

test("the manifest describes a standalone app with the full icon set", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const response = await page.request.get(href!);
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;
  expect(manifest.name).toBe("SafeBite");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.theme_color).toBe("#1f7a4d");
  expect(manifest.icons.map((i) => [i.sizes, i.purpose ?? "any"])).toEqual([
    ["192x192", "any"],
    ["512x512", "any"],
    ["512x512", "maskable"],
  ]);
  for (const icon of manifest.icons) {
    const png = await page.request.get(`/${icon.src}`);
    expect(png.ok(), icon.src).toBe(true);
    expect(png.headers()["content-type"]).toContain("image/png");
  }
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1f7a4d");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon-180.png");
});

test("the service worker installs and the shell reloads while offline", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();

  // Wait for the worker to activate and take control of this page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await context.setOffline(false);
});

test("the misconfiguration screen is not shown for a validated bundle", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("misconfigured")).toHaveCount(0);
});
```

- [ ] **Step 4: Run the suite**

Run from `web/`:
```bash
timeout 300 npm run e2e:preview 2>&1 | grep -E "✓|✘|passed|failed|Error" | tail -8
```
Expected: `3 passed`. Known failure modes and their fixes:
- The offline test times out on the reload: check `dist-preview/sw.js` exists and `navigateFallback` is `/index.html` (Task 7). If `navigator.serviceWorker.controller` never becomes non-null, the worker did not claim clients: add `clientsClaim: true, skipWaiting: true` inside `workbox` in `pwaOptions` and rebuild.
- The manifest test fails on `content-type`: `vite preview` serves PNGs as `image/png`; if it does not, the file was not written by Task 7's renderer — re-run `npm run icons`.
- An unexpected `pageerror` about Firebase: the synthetic values did not pass the validator, so the boot took the misconfigured branch; run `npm run build` from `web/` with the same env to read the validator's message.

- [ ] **Step 5: Run it a second time to prove it is deterministic**

Run the same command again. Expected: `3 passed` (the worker from the first run is in a fresh browser context each time; nothing persists).

- [ ] **Step 6: CI step**

In `.github/workflows/ci.yml`, insert after the step `Compile-only bundle refuses to start in a browser` and before `Upload Playwright artifacts`:
```yaml
      - name: PWA shell — manifest, service worker, offline reload (preview bundle)
        run: npm --prefix web run e2e:preview

```
The artifact upload already covers `web/test-results` (which now includes `preview/`).

- [ ] **Step 7: README**

In `README.md` (LF after Task 1), under `### Tests` add after the `e2e:boot-guard` line:
```
npm --prefix web run e2e:preview      # validated build with synthetic values → manifest, service worker, offline shell (Chromium, no emulators)
npm --prefix web run icons            # re-render the PNG icon set from web/assets/safebite-mark.svg
```
Change the unit-test count line to `` `npm run test:unit` currently reports 47 tests. `` Under `### Guardrails` add:
```
- A misconfigured built bundle shows a plain "this build is misconfigured" screen, loads no Firebase code, and unregisters any service worker; a clean bundle registers the Workbox worker only after that check.
- The PWA icon set is generated, never hand-edited: change `web/assets/safebite-mark.svg` and run `npm --prefix web run icons`.
```

- [ ] **Step 8: Spec**

In `planning/specs/2026-09-20-safebite-pwa-design.md`, in the "Added from the Plan 1b final review (2026-09-21)" list, replace the first bullet (the one starting "The runtime deployability guard in `web/src/firebase.ts` throws at module scope") with:
```
- Done in Plan 2a: a misconfigured bundle renders `MisconfiguredScreen` from `web/src/main.tsx`
  before any Firebase import, unregisters service workers, and never registers one; the
  module-scope guard in `web/src/firebase.ts` remains as the second line. Any deploy job must
  call `npm --prefix web run build` (validated), never the root `build` (compile-only).
```
Mark the other pre-work bullets that this plan completed by prefixing them with `Done in Plan 2a: ` (the `whoami` dedupe, the household read rule, the tsconfig/.gitattributes/timeouts bullet, the auth-provider tests, the shape checks, the expect-timeout bullet, the cancellation bullet).

- [ ] **Step 9: Full green gate**

Run:
```bash
npm run typecheck && npm run test:unit && npm run build && npm run emu:test 2>&1 | tail -3 && npm run emu:e2e 2>&1 | grep -E "passed|failed" | tail -1 && (cd web && npm run e2e:boot-guard 2>&1 | grep -E "passed|failed" | tail -1 && npm run e2e:preview 2>&1 | grep -E "passed|failed" | tail -1)
```
Expected, in order: both typechecks; web `47 passed`; root build (compile-only, PWA summary printed); functions `27 passed`; browser `5 passed`; boot guard `1 passed`; preview `3 passed`.

- [ ] **Step 10: Commit**

```bash
git add web/playwright.preview.config.ts web/e2e-preview web/package.json .gitignore .github/workflows/ci.yml README.md planning/specs/2026-09-20-safebite-pwa-design.md
git commit -m "test(web): preview-bundle PWA suite (manifest, worker, offline reload); CI step; docs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Controller notes (for the subagent-driven-development session)

- Tasks 1–5 are independent of the PWA work and may be reviewed as a group; Tasks 6–8 depend on each other in order. Task 5 must land before Task 6 (`startupProblems`), and Task 6 before Task 7 (`serviceWorker.ts`).
- Emulator-backed steps are sequential by nature; never run two `firebase emulators:exec` invocations at once (ports 8080/9099/5001 are fixed).
- The reviewer for Task 7 should open `web/public/pwa-512.png` and `pwa-maskable-512.png` and confirm the glyph is centred and, for the maskable one, well inside the middle 80%.
- The reviewer for Task 8 should re-run `e2e:preview` themselves; the offline reload is the one assertion in this plan that exercises browser machinery (service worker + offline emulation) rather than our code.
- Unit-test counts referenced in gates: 26 (start) → 29 after Task 3 (+3) → 37 after Task 4 (+6 callable, +2 Settings) → 43 after Task 5 (+4 shape, +2 startupProblems) → 45 after Task 6 (+2) → 47 after Task 7 (+5). If a task adds or removes a test, adjust later gates and the README line accordingly.
- Do not push, deploy, or touch the old `/mnt/c` checkout.

## Self-review record

- Spec coverage: pre-work list — `whoami` dedupe (T4), household rule (T2), test tsconfig + `.gitattributes` + CI-conditional timeouts (T1), auth-provider race tests (T3), misconfiguration screen + service-worker safeguard (T6, T7), shape checks (T5), expect-timeout scoping (T4 removes it outright, which the spec allows: "or raise the per-test timeout" is unnecessary once one request is issued), cancellation helper (T4). PWA shell items from the §3.3 table row for Plan 2 — manifest, icon set, `apple-touch-icon`, `apple-mobile-web-app-capable`, `theme-color`, standalone display (T7), proven in T8. Owner rulings: plan split (this is 2a), generated SVG icon (T7). The `.gitattributes` scope follows the approved outline (PWA paths only), which narrows the spec's literal `* text=auto eol=lf`; recorded in T1's file comment.
- Placeholder scan: no TBD/TODO; every code step has its content; expected outputs stated.
- Type consistency: `startupProblems(env, isBuild)` defined in T5, used in T6; `unregisterServiceWorkers` defined in T6, `registerServiceWorker` added in T7, both imported in `main.tsx`; `callable`/`abortable`/`isAbortError` defined and consumed in T4; testids `misconfigured`, `signin-form` consistent across T6 and T8; port 4173 (boot guard) vs 4174 (preview) distinct; output dirs `dist-boot-guard` vs `dist-preview` distinct and both ignored.
- Known judgement calls: the boot-guard `li` count is 5 because `localhost` also fails the new auth-domain check; the `lib` setting in `tsconfig.test.json` is `es2022`, which already provides `Error` `cause`.
