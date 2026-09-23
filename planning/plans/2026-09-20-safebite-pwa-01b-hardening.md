# SafeBite PWA — Plan 1b: Hardening before Plan 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three follow-ups from the external re-audit of Plan 1: deterministic account switching in the browser suite, build-time rejection of missing/empty/demo Firebase configuration with a production-startup test, and bounded warm-up requests plus retained browser failure artifacts even when a retry passes.

**Architecture:** Same branch and layout as Plan 1 (`web/`, `functions/`, root scripts, `.github/workflows/ci.yml`). One pure validation module `web/src/config/firebaseEnv.ts` is shared by a Vite build plugin (build-time rejection) and `web/src/firebase.ts` (runtime guard).

**Tech Stack:** unchanged (Vite 8, React 19, TS strict, Vitest 5, Playwright 1.63, Node 22).

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md` (Part 2.2 architecture, 2.4 security, 3.2 guardrails). Plan 1: `planning/plans/2026-09-20-safebite-pwa-01-foundation.md`.

## Global Constraints

- Emulators only (`demo-safebite`); no `firebase deploy`, no `git push`. The string `safebite-production-13ba1` must not appear in new code except as a **rejected** value inside the validator and its tests.
- Testids and the five browser scenarios from Plan 1 stay; only waits/ordering may change in `auth.spec.ts`.
- A deployable build (`npm --prefix web run build`, used by `firebase.json` predeploy) must fail when any of `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` is missing or blank, when the project id starts with `demo-`, equals `safebite-production-13ba1`, when the api key is `demo-api-key` or app id is `demo-app-id`, or when `VITE_USE_EMULATORS` is `true`. A compile-only check build is `npm --prefix web run build:check` (sets `SAFEBITE_UNVALIDATED_BUILD=1`).
- Every fetch in warm-ups and emulator test helpers carries `AbortSignal.timeout(...)`.
- Node 22; TS strict; commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Working directory is the worktree `/mnt/c/Dev/AvaGF/.claude/worktrees/pwa-01-foundation`. Emulator runs take ~6 minutes each here; use long timeouts.

---

### Task 1: Deterministic account switching in the browser suite

**Files:**
- Modify: `web/e2e/auth.spec.ts`, `web/playwright.config.ts`, `package.json` (root: add `emu:e2e:stress`)

**Interfaces:**
- Produces: helper `signOutAndWait(page)` in `auth.spec.ts`; root script `emu:e2e:stress` = the e2e run with `--repeat-each=3 --retries=0`.

- [ ] **Step 1: Rewrite `web/e2e/auth.spec.ts`** (five scenarios unchanged in intent; sign-out now waits for the signed-out state; the cookie clear is removed because Firebase persists sessions in IndexedDB, and each Playwright test already gets a fresh context)

```ts
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "pilot-password-1";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
}

/** Click sign-out and wait until the app has actually returned to the signed-out state. */
async function signOutAndWait(page: Page) {
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("signout")).toHaveCount(0);
}

test("signed-out visitor sees the sign-in form and nothing else", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
});

test("wrong password shows an error and stays signed out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
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
  await signOutAndWait(page);
});

test("a signed-in non-member is refused and can sign out", async ({ page }) => {
  await signIn(page, "stranger@safebite.test");
  await expect(page.getByTestId("not-invited")).toBeVisible();
  await expect(page.getByTestId("not-invited")).toContainText("stranger@safebite.test");
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
  await signOutAndWait(page);
});

test("switching accounts on the same device never shows the previous member's shell", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await expect(page.getByTestId("nav-discover")).toBeVisible();
  await page.getByTestId("nav-settings").click();
  await signOutAndWait(page);
  // Reload after sign-out: a persisted session would resurrect the member shell here.
  await page.reload();
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await signIn(page, "stranger@safebite.test");
  await expect(page.getByTestId("not-invited")).toBeVisible();
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
});
```

- [ ] **Step 2: Playwright config — keep failure artifacts of every attempt**

In `web/playwright.config.ts` change the `use` block to:
```ts
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
```
Leave `retries: process.env.CI ? 1 : 0` as is (Task 3 proves artifacts survive a passing retry).

- [ ] **Step 3: Root script for stress runs**

In root `package.json` add, next to `emu:e2e`:
```json
    "emu:e2e:stress": "npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec --only auth,firestore,functions --project demo-safebite \"node functions/lib/seed-emulator.js && npm --prefix web run e2e -- --repeat-each=3 --retries=0\"",
```

- [ ] **Step 4: Run the stress suite**

Run: `npm run emu:e2e:stress` (repo root). Expected: `15 passed` (5 scenarios × 3), zero flaky, zero retries.

- [ ] **Step 5: Commit**

Stage `web/e2e/auth.spec.ts`, `web/playwright.config.ts`, `package.json` and commit with message:
```
test(web): wait for sign-out before switching accounts; stress script; failure artifacts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 2: Build-time validation of Firebase configuration and production-startup test

**Files:**
- Create: `web/src/config/firebaseEnv.ts`, `web/src/config/firebaseEnv.test.ts`
- Modify: `web/src/firebase.ts`, `web/vite.config.ts`, `web/package.json` (scripts), `package.json` (root `build`), `.github/workflows/ci.yml`, `README.md` (Tests/Guardrails lines)

**Interfaces:**
- Produces:
  ```ts
  export interface FirebaseEnvLike { VITE_FIREBASE_API_KEY?: string; VITE_FIREBASE_AUTH_DOMAIN?: string; VITE_FIREBASE_PROJECT_ID?: string; VITE_FIREBASE_APP_ID?: string; VITE_USE_EMULATORS?: string; }
  export function validateFirebaseEnv(env: FirebaseEnvLike): string[]; // [] when deployable
  export function assertDeployableFirebaseEnv(env: FirebaseEnvLike, context: string): void; // throws listing problems
  ```
  Web scripts: `build` (validated), `build:check` (unvalidated compile check). Root `build` uses `build:check`. CI proves the validated build is rejected without config.

- [ ] **Step 1: Write the failing tests `web/src/config/firebaseEnv.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { assertDeployableFirebaseEnv, validateFirebaseEnv } from "./firebaseEnv";

const good = {
  VITE_FIREBASE_API_KEY: "AIzaSyExampleKey",
  VITE_FIREBASE_AUTH_DOMAIN: "safebite-pilot.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "safebite-pilot",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("validateFirebaseEnv", () => {
  it("accepts a complete non-demo configuration", () => {
    expect(validateFirebaseEnv(good)).toEqual([]);
  });

  it("reports every missing variable", () => {
    const problems = validateFirebaseEnv({});
    expect(problems).toHaveLength(4);
    expect(problems.join("\n")).toContain("VITE_FIREBASE_PROJECT_ID");
  });

  it("treats blank values as missing", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_APP_ID: "   " })).toEqual([
      "VITE_FIREBASE_APP_ID is missing or blank",
    ]);
  });

  it("rejects demo project ids and demo placeholders", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_PROJECT_ID: "demo-safebite" })).toEqual([
      "VITE_FIREBASE_PROJECT_ID must not be an emulator-only demo- project (got demo-safebite)",
    ]);
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_API_KEY: "demo-api-key" })).toEqual([
      "VITE_FIREBASE_API_KEY is the demo placeholder",
    ]);
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_APP_ID: "demo-app-id" })).toEqual([
      "VITE_FIREBASE_APP_ID is the demo placeholder",
    ]);
  });

  it("rejects the legacy production project by name", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_PROJECT_ID: "safebite-production-13ba1" })).toEqual([
      "VITE_FIREBASE_PROJECT_ID must not be the legacy project safebite-production-13ba1 (the pilot uses a separate project)",
    ]);
  });

  it("rejects emulator mode", () => {
    expect(validateFirebaseEnv({ ...good, VITE_USE_EMULATORS: "true" })).toEqual([
      "VITE_USE_EMULATORS must not be true for a deployable build",
    ]);
  });
});

describe("assertDeployableFirebaseEnv", () => {
  it("does nothing for a deployable configuration", () => {
    expect(() => assertDeployableFirebaseEnv(good, "test")).not.toThrow();
  });

  it("throws a message that names the context and every problem", () => {
    expect(() => assertDeployableFirebaseEnv({ ...good, VITE_FIREBASE_PROJECT_ID: "" }, "production startup")).toThrow(
      /production startup.*VITE_FIREBASE_PROJECT_ID is missing or blank/s,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npm test`. Expected: FAIL, cannot resolve `./firebaseEnv`.

- [ ] **Step 3: Write `web/src/config/firebaseEnv.ts`**

```ts
/**
 * Single source of truth for "is this Firebase configuration deployable?".
 * Used at build time by the Vite plugin in vite.config.ts and at runtime by firebase.ts.
 * Pure: no imports, no environment access.
 */
export interface FirebaseEnvLike {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_USE_EMULATORS?: string;
}

export const REQUIRED_FIREBASE_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const LEGACY_PRODUCTION_PROJECT = "safebite-production-13ba1";
const DEMO_PLACEHOLDERS: Partial<Record<(typeof REQUIRED_FIREBASE_VARS)[number], string>> = {
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "demo-app-id",
};

function blank(value: string | undefined): value is undefined {
  return value === undefined || value.trim().length === 0;
}

/** Returns a list of human-readable problems; empty means the configuration is deployable. */
export function validateFirebaseEnv(env: FirebaseEnvLike): string[] {
  const problems: string[] = [];
  for (const name of REQUIRED_FIREBASE_VARS) {
    const value = env[name];
    if (blank(value)) {
      problems.push(`${name} is missing or blank`);
      continue;
    }
    const placeholder = DEMO_PLACEHOLDERS[name];
    if (placeholder !== undefined && value === placeholder) {
      problems.push(`${name} is the demo placeholder`);
    }
  }
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (!blank(projectId)) {
    if (projectId.startsWith("demo-")) {
      problems.push(`VITE_FIREBASE_PROJECT_ID must not be an emulator-only demo- project (got ${projectId})`);
    } else if (projectId === LEGACY_PRODUCTION_PROJECT) {
      problems.push(
        `VITE_FIREBASE_PROJECT_ID must not be the legacy project ${LEGACY_PRODUCTION_PROJECT} (the pilot uses a separate project)`,
      );
    }
  }
  if (env.VITE_USE_EMULATORS === "true") {
    problems.push("VITE_USE_EMULATORS must not be true for a deployable build");
  }
  return problems;
}

/** Throws when the configuration is not deployable. `context` names where the check ran. */
export function assertDeployableFirebaseEnv(env: FirebaseEnvLike, context: string): void {
  const problems = validateFirebaseEnv(env);
  if (problems.length > 0) {
    throw new Error(
      `Firebase configuration is not deployable (${context}):\n- ${problems.join("\n- ")}\n` +
        "Set VITE_FIREBASE_* for the pilot project, or use `npm run build:check` for a compile-only build.",
    );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npm test`. Expected: `19 passed` (11 existing + 8 new).

- [ ] **Step 5: Use the validator at runtime in `web/src/firebase.ts`**

Replace the existing `if (import.meta.env.PROD && !import.meta.env.VITE_FIREBASE_PROJECT_ID) { throw ... }` block with:
```ts
// A production bundle must never start against the emulator-only demo project or placeholders.
if (import.meta.env.PROD) {
  assertDeployableFirebaseEnv(import.meta.env, "production startup");
}
```
and add `import { assertDeployableFirebaseEnv } from "./config/firebaseEnv";` at the top. Keep the demo defaults for the `firebaseConfig` object (they are only reachable in development).

- [ ] **Step 6: Build-time rejection via a Vite plugin in `web/vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { assertDeployableFirebaseEnv } from "./src/config/firebaseEnv.ts"; // explicit extension: tsconfig.node.json uses nodenext resolution

/**
 * Refuses to produce a deployable bundle with missing, blank, or demo Firebase values.
 * `SAFEBITE_UNVALIDATED_BUILD=1` skips the check for compile-only builds (CI, local smoke);
 * such bundles still refuse to start at runtime (see src/firebase.ts).
 */
function requireDeployableFirebaseEnv(mode: string): Plugin {
  return {
    name: "safebite-require-deployable-firebase-env",
    apply: "build",
    configResolved(config) {
      if (process.env.SAFEBITE_UNVALIDATED_BUILD === "1") {
        config.logger.warn(
          "[safebite] SAFEBITE_UNVALIDATED_BUILD=1: skipping Firebase configuration validation (compile-only build)",
        );
        return;
      }
      const env = loadEnv(mode, config.root, "VITE_");
      assertDeployableFirebaseEnv(env, `vite build --mode ${mode}`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), requireDeployableFirebaseEnv(mode)],
  server: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
}));
```
Note: `loadEnv` reads `.env`, `.env.<mode>` and `process.env` for the `VITE_` prefix, so both CI-provided variables and a local `.env.staging.local` (git-ignored) work.

- [ ] **Step 7: Scripts**

`web/package.json` scripts: keep `"build": "tsc -b && vite build"`; add `"build:check": "SAFEBITE_UNVALIDATED_BUILD=1 npm run build"`.
Root `package.json`: change `"build"` to `"npm --prefix functions run build && npm --prefix web run build:check"`.

- [ ] **Step 8: Prove the rejection and the check build locally**

```bash
cd web && npm run build; echo "exit=$?"
```
Expected: the build FAILS with a message listing all four missing variables, `exit=1`.
```bash
cd web && npm run build:check; echo "exit=$?"
```
Expected: the warning line, then a successful build, `exit=0`.
```bash
cd web && VITE_FIREBASE_API_KEY=k VITE_FIREBASE_AUTH_DOMAIN=d VITE_FIREBASE_PROJECT_ID=demo-safebite VITE_FIREBASE_APP_ID=a npm run build; echo "exit=$?"
```
Expected: FAIL naming the demo project, `exit=1`.

- [ ] **Step 9: CI — compile check plus a step proving the deployable build is rejected**

In `.github/workflows/ci.yml` rename the step `Production build` to `Build (compile check, unvalidated)` (it runs the root `npm run build`, which now uses `build:check`), and add after it:
```yaml
      - name: Deployable build is rejected without Firebase configuration
        run: |
          if npm --prefix web run build; then
            echo "Deployable build succeeded without configuration — validator is broken"; exit 1
          fi
          echo "Validator rejected the unconfigured deployable build as expected"
```

- [ ] **Step 10: README**

Under "Tests" add: `npm --prefix web run build:check   # compile-only build (no Firebase config needed)`; update the unit-test count line to 19; under "Guardrails" add: `- \`npm --prefix web run build\` (used by \`firebase deploy\`) refuses missing, blank, demo-, or legacy-project Firebase values; the resulting bundle also refuses to start against them.`

- [ ] **Step 11: Verify and commit**

```bash
npm run typecheck && npm run test:unit && npm run build
```
Expected: clean; web `19 passed`; root build succeeds via `build:check`.
Stage `web/src/config`, `web/src/firebase.ts`, `web/vite.config.ts`, `web/package.json`, `package.json`, `.github/workflows/ci.yml`, `README.md` and commit with message:
```
feat(web): reject undeployable Firebase configuration at build time and at production startup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 3: Bounded warm-up requests and retained browser artifacts

**Files:**
- Modify: `web/e2e/global-setup.ts`, `functions/test/emulator-helpers.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `warmUpFunctions(name, maxElapsedMs = 240000, perRequestMs = 90000)` in the functions helpers (remaining budget checked before each attempt; per-request abort clamped to it); `signInForIdToken`/`callFunction` fetches time out after 30 s; global-setup uses per-request aborts; CI always uploads `web/playwright-report` and `web/test-results`.

- [ ] **Step 1: `functions/test/emulator-helpers.ts` — abort stalled requests**

Add near the top:
```ts
const REQUEST_TIMEOUT_MS = 30_000;
```
In `signInForIdToken` and `callFunction`, add `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),` to the `fetch` options. Replace `warmUpFunctions` with:
```ts
export async function warmUpFunctions(name: string, maxElapsedMs = 240000, perRequestMs = 90000): Promise<void> {
  const url = `http://${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}/${name}`;
  const start = Date.now();
  for (;;) {
    const remaining = maxElapsedMs - (Date.now() - start);
    if (remaining <= 0) {
      throw new Error(`Functions emulator did not answer ${name} within ${maxElapsedMs} ms`);
    }
    try {
      // A cold worker legitimately takes tens of seconds; a request that exceeds perRequestMs is
      // aborted and retried so a stalled emulator cannot hold the hook until its own timeout. The
      // signal is clamped to whatever remains of maxElapsedMs so the last attempt cannot itself
      // overshoot the overall bound.
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
        signal: AbortSignal.timeout(Math.min(perRequestMs, remaining)),
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
```

- [ ] **Step 2: `web/e2e/global-setup.ts` — per-request aborts clamped to the remaining budget**

Add `const PER_REQUEST_MS = 90_000;` next to the other constants. `callWhoami` takes a `timeoutMs = PER_REQUEST_MS` parameter; `waitUntilReachable` checks the remaining budget before every attempt and clamps the attempt's timeout to it, so the overall bound is never exceeded:

```ts
function callWhoami(timeoutMs = PER_REQUEST_MS): Promise<Response> {
  // Any HTTP response counts as "warm" -- a 401 (unauthenticated) is expected.
  return fetch(WHOAMI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// Clamps each attempt's own timeout to whatever remains of MAX_ELAPSED_MS, so a late attempt
// cannot itself overshoot the overall bound (checking elapsed time only after an attempt
// finishes would let a single PER_REQUEST_MS-long attempt push the total past MAX_ELAPSED_MS).
async function waitUntilReachable(): Promise<void> {
  const start = Date.now();
  for (;;) {
    const remaining = MAX_ELAPSED_MS - (Date.now() - start);
    if (remaining <= 0) {
      throw new Error(`Functions emulator did not answer whoami within ${MAX_ELAPSED_MS} ms`);
    }
    try {
      await callWhoami(Math.min(PER_REQUEST_MS, remaining));
      return;
    } catch {
      // Emulator worker not accepting connections yet (still spinning up / cold require in progress).
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export default async function globalSetup(): Promise<void> {
  await waitUntilReachable();
  // Warm a second, concurrent instance so StrictMode's double-fetch never hits a cold one.
  try {
    await Promise.all([callWhoami(), callWhoami()]);
  } catch (err) {
    throw new Error(`Second warm-up request failed or exceeded ${PER_REQUEST_MS} ms: ${String(err)}`);
  }
}
```

- [ ] **Step 3: CI — always upload browser artifacts**

Replace the `Upload Playwright report on failure` step with:
```yaml
      - name: Upload Playwright artifacts (report, traces, screenshots, videos)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: |
            web/playwright-report
            web/test-results
          if-no-files-found: ignore
          retention-days: 14
```

- [ ] **Step 4: Prove failure artifacts survive a passing retry**

Create a temporary spec `web/e2e/zz-flaky-probe.spec.ts` (NOT committed):
```ts
import { expect, test } from "@playwright/test";
test("fails on first attempt only", async ({ page }, testInfo) => {
  await page.goto("/");
  expect(testInfo.retry, "first attempt must fail to prove artifact retention").toBe(1);
});
```
Run: `npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:exec --only auth,firestore,functions --project demo-safebite "node functions/lib/seed-emulator.js && npm --prefix web run e2e -- --retries=1"`.
Expected: `5 passed, 1 flaky`. Then `ls web/test-results` must show a directory for the probe's first attempt containing `trace.zip` (and a screenshot). Record the listing in the report. Delete the probe file and `web/test-results`.

- [ ] **Step 5: Run the functions suite and the normal e2e suite**

`npm run emu:test` → `26 passed`; `npm run emu:e2e` → `5 passed`.

- [ ] **Step 6: Commit**

Stage `functions/test/emulator-helpers.ts`, `web/e2e/global-setup.ts`, `.github/workflows/ci.yml` and commit with message:
```
test: abort stalled warm-up requests; always upload browser artifacts in CI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

## Self-review record

- Coverage: audit item 1 → Task 1 (wait + reload + stress script); item 2 → Task 2 (validator, plugin, runtime guard, tests, CI rejection step); item 3 → Task 3 (aborts, always-upload, retention proof). No placeholders. Names consistent: `assertDeployableFirebaseEnv` (T2 steps 3, 5, 6); `warmUpFunctions` signature (T3 step 1) matches the interface block; `build:check` used in web and root scripts and CI.
