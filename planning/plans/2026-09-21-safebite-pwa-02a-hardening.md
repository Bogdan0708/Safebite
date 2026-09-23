# SafeBite PWA — Plan 2a-h: Worker-update hardening (audit P2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Plan 2a audit's P2 finding: an installed, valid service worker can pick up a misconfigured (compile-only) release as an update, precache its app chunk, and leave that cache and its control of the open page in place after the misconfiguration screen unregisters it. After this plan, an invalid build ships a self-destroying worker that precaches nothing, the misconfigured page purges every cache and leaves worker control, and a same-origin upgrade suite proves both the valid-to-invalid and the valid-to-valid paths.

**Architecture:** `web/vite.config.ts` resolves the Firebase env once with `loadEnv` and the same `validateFirebaseEnv` the app uses; when the values are not deployable it passes `selfDestroying: true` to `vite-plugin-pwa`, whose generated worker skips waiting, unregisters itself, navigates every open client and deletes all caches. `web/src/pwa/serviceWorker.ts` gains `purgeServiceWorkerState()` (unregister everything, delete every cache, report whether the document was controlled) and `main.tsx`'s misconfigured branch reloads once when it was. A fourth Playwright configuration (`web/e2e-upgrade/`) uses a small switchable static server, adapted from the auditor's probe, to serve three builds on one origin.

**Tech Stack:** unchanged (Vite 8.3, React 19, TS strict, Vitest 5, Playwright 1.63 Chromium, `vite-plugin-pwa` 1.3.0, Node 22).

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md` (§2.2, §2.7, §3.2; the "Carried from the Plan 2a final review" block). Audit: `planning/audits/2026-09-21-plan-2a-audit.md` (P2 finding and correction direction; its probe `plan-2a-update-probe.mjs` is the model for the test server). Plan 2a: `planning/plans/2026-09-21-safebite-pwa-02a-shell.md`.

## Global Constraints

- Emulators only (`demo-safebite`); no `firebase deploy`, no `git push`; the string `safebite-production-13ba1` must not appear in new files. Working directory is the worktree `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-01-foundation` on branch `worktree-pwa-01-foundation` (head `b054ea7`); never touch `/home/godja/Dev/AvaGF` itself or `/mnt/c`; never bare `git stash`.
- The three guard layers stay and keep sharing `validateFirebaseEnv`: build-time (`guardViteBuild`), bootstrap (`startupProblems` in `main.tsx`), module scope (`web/src/firebase.ts`). No new bypass environment variables. Deployable builds keep emitting the normal Workbox worker; the dev server and Vitest keep running without a worker.
- Existing suites stay green and unchanged in intent: emulator browser 5, boot guard 1, preview 4, functions 27. Playwright `webServer` commands are npm scripts, never `npx`. Never run two Playwright or emulator suites at once.
- Test-count gates are relative: unit tests are 53 at the start; each task states how many it adds.
- Files under `web/`, `planning/`, `.github/`, `README.md` are LF (enforced by `.gitattributes`). British spelling. TS strict (`noUnusedLocals`, `verbatimModuleSyntax`). Commit messages end with exactly these two trailer lines, which override any other attribution reminder an implementer receives:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01XSp7ebmUaqxSfwhK9nNXud`.
- Ports: 4173 boot guard, 4174 preview, **4175 upgrade** (new). Output dirs: `dist-boot-guard` (invalid), `dist-preview` (valid v1), **`dist-preview-v2`** (valid v2, new).

---

## File map

| Path | Responsibility |
|------|----------------|
| `web/e2e-upgrade/server.mjs` (new) | Switchable static server on 4175: serves v1 / v2 / invalid builds, records requests, control endpoints under `/_test/` |
| `web/e2e-upgrade/upgrade.spec.ts` (new) | Artefact check + valid→invalid + valid→valid tests |
| `web/playwright.upgrade.config.ts` (new) | Fourth Playwright configuration |
| `web/package.json` | Scripts `serve:upgrade`, `e2e:upgrade` |
| `web/tsconfig.e2e.json` | Includes `e2e-upgrade` and the new config |
| `.gitignore` | `web/dist-preview-v2/` |
| `web/vite.config.ts` | Resolves env once; `selfDestroying` for non-deployable builds |
| `web/src/pwa/serviceWorker.ts`, `.test.ts` | `purgeServiceWorkerState()` replaces `unregisterServiceWorkers()` |
| `web/src/main.tsx` | Misconfigured branch purges, then reloads once if the document was controlled |
| `.github/workflows/ci.yml` | Upgrade-suite step |
| `README.md`, spec | Commands, guardrail wording, audit closure |
| `planning/audits/*` | The auditor's report, probe and evidence, committed |

---

### Task 1: Same-origin upgrade suite (server, config, three tests; records the defect)

**Files:**
- Create: `web/e2e-upgrade/server.mjs`, `web/e2e-upgrade/upgrade.spec.ts`, `web/playwright.upgrade.config.ts`
- Modify: `web/package.json`, `web/tsconfig.e2e.json`, `.gitignore`

**Interfaces:**
- Produces: `npm run e2e:upgrade` (from `web/`) builds `dist-preview`, `dist-preview-v2`, `dist-boot-guard` and runs the suite. Server control API: `POST /_test/serve/{v1|v2|invalid}`, `POST /_test/requests/reset`, `GET /_test/requests` → `[{ build, path }]`, `GET /_test/assets` → `string[]` of the current build's `assets/` filenames, `GET /_test/health` → `ok`.
- At the end of this task the suite is expected to FAIL on two tests (the defect is real); Task 2 and Task 3 make it pass. The commit records the red state deliberately.

- [ ] **Step 1: The server**

Create `web/e2e-upgrade/server.mjs`:
```js
// Static server for the upgrade suite: one origin, three builds, switched at runtime so an
// installed service worker sees a "new release" at the same URL. Adapted from
// planning/audits/plan-2a-update-probe.mjs. Control endpoints live under /_test/ and are called
// with Playwright's request context (Node-side), so a controlling worker never sees them.
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILDS = {
  v1: path.resolve(here, "../dist-preview"),
  v2: path.resolve(here, "../dist-preview-v2"),
  invalid: path.resolve(here, "../dist-boot-guard"),
};
const MIME = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};
const PORT = Number(process.env.SAFEBITE_UPGRADE_PORT ?? 4175);

let serving = "v1";
let requests = [];

async function control(req, res, url) {
  const [, , action, arg] = url.pathname.split("/");
  if (action === "health") return text(res, 200, "ok");
  if (action === "serve" && req.method === "POST" && arg in BUILDS) {
    serving = arg;
    return text(res, 200, serving);
  }
  if (action === "requests" && arg === "reset" && req.method === "POST") {
    requests = [];
    return text(res, 200, "reset");
  }
  if (action === "requests") return json(res, requests);
  if (action === "assets") return json(res, await readdir(path.join(BUILDS[serving], "assets")));
  return text(res, 404, "unknown control endpoint");
}

function text(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
  res.end(body);
}
function json(res, value) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith("/_test/")) return control(req, res, url);
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  requests.push({ build: serving, path: pathname });
  let body;
  try {
    body = await readFile(path.join(BUILDS[serving], pathname));
  } catch {
    if (path.extname(pathname)) return text(res, 404, "not found");
    pathname = "/index.html";
    body = await readFile(path.join(BUILDS[serving], pathname));
  }
  // no-store everywhere: the suite switches releases underneath the browser and must never be
  // served a stale copy by the HTTP cache. (Hosting uses no-cache for sw/index and immutable for
  // hashed assets; the worker lifecycle under test does not depend on HTTP caching.)
  res.writeHead(200, { "Content-Type": MIME[path.extname(pathname)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`upgrade server on http://127.0.0.1:${PORT} serving ${serving}`);
});
```

- [ ] **Step 2: Scripts, ignore entry, typecheck include**

In `web/package.json` add (keep existing scripts):
```json
"serve:upgrade": "node e2e-upgrade/server.mjs",
"e2e:upgrade": "VITE_FIREBASE_API_KEY=AIzaSyPreviewOnly0123456789abcdefghijklmn VITE_FIREBASE_AUTH_DOMAIN=safebite-preview.firebaseapp.com VITE_FIREBASE_PROJECT_ID=safebite-preview VITE_FIREBASE_APP_ID=1:000000000000:web:0123456789abcdef VITE_USE_EMULATORS=false vite build --outDir dist-preview && VITE_FIREBASE_API_KEY=AIzaSyPreviewOnly0123456789abcdefghijklmn VITE_FIREBASE_AUTH_DOMAIN=safebite-preview.firebaseapp.com VITE_FIREBASE_PROJECT_ID=safebite-preview-v2 VITE_FIREBASE_APP_ID=1:000000000000:web:0123456789abcdef VITE_USE_EMULATORS=false vite build --outDir dist-preview-v2 && SAFEBITE_UNVALIDATED_BUILD=1 VITE_FIREBASE_API_KEY=demo-api-key VITE_FIREBASE_AUTH_DOMAIN=localhost VITE_FIREBASE_PROJECT_ID=demo-safebite VITE_FIREBASE_APP_ID=demo-app-id VITE_USE_EMULATORS=true vite build --outDir dist-boot-guard && playwright test -c playwright.upgrade.config.ts"
```
(v2 differs from v1 only by `VITE_FIREBASE_PROJECT_ID=safebite-preview-v2`, which is inlined into the entry chunk and changes its hash — a synthetic "next release".)

Add `web/dist-preview-v2/` to `.gitignore` directly under `web/dist-preview/`. In `web/tsconfig.e2e.json` add `"e2e-upgrade"` and `"playwright.upgrade.config.ts"` to `include`.

- [ ] **Step 3: Playwright configuration**

Create `web/playwright.upgrade.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

// Same-origin release upgrades: a switchable static server (e2e-upgrade/server.mjs) serves the
// valid v1, valid v2 and invalid compile-only builds on port 4175, so an installed worker sees
// each as an update of the previous. No emulators, no network beyond 127.0.0.1.
export default defineConfig({
  testDir: "./e2e-upgrade",
  outputDir: "test-results/upgrade",
  timeout: 45_000,
  globalTimeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run serve:upgrade",
    url: "http://127.0.0.1:4175/_test/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
```

- [ ] **Step 4: The tests**

Create `web/e2e-upgrade/upgrade.spec.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Build = "v1" | "v2" | "invalid";
interface Recorded { build: Build; path: string }

const DIST = (name: string) => path.resolve(__dirname, "..", name);

/** Refuse every page-initiated request off-box; the synthetic projects must never be contacted. */
async function blockExternalNetwork(context: BrowserContext) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
}

// Control calls go through Playwright's Node-side request context, never through the page.
async function serve(page: Page, build: Build) {
  const res = await page.request.post(`/_test/serve/${build}`);
  expect(await res.text()).toBe(build);
  await page.request.post("/_test/requests/reset");
}
async function recorded(page: Page): Promise<Recorded[]> {
  return (await page.request.get("/_test/requests")).json();
}
async function assetsOf(page: Page, build: Build): Promise<string[]> {
  await page.request.post(`/_test/serve/${build}`);
  return (await page.request.get("/_test/assets")).json();
}

// Page-state probes. A navigation can destroy the execution context mid-call; report `null` so
// expect.poll keeps polling instead of failing on the transient error.
async function registrations(page: Page): Promise<number | null> {
  return page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length).catch(() => null);
}
async function cacheNames(page: Page): Promise<string[] | null> {
  return page.evaluate(() => caches.keys()).catch(() => null);
}
async function cachedPaths(page: Page): Promise<string[] | null> {
  return page
    .evaluate(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) paths.push(new URL(req.url).pathname);
      }
      return paths.sort();
    })
    .catch(() => null);
}
async function controlled(page: Page): Promise<boolean | null> {
  return page.evaluate(() => navigator.serviceWorker.controller !== null).catch(() => null);
}
async function entryScript(page: Page): Promise<string | null> {
  return page.evaluate(() => document.querySelector('script[type="module"]')?.getAttribute("src") ?? null).catch(() => null);
}

async function installValidRelease(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => cacheNames(page)).toHaveLength(1);
}

/** Ask the installed registration to check for a new sw.js now, instead of waiting for the browser. */
async function triggerUpdateCheck(page: Page) {
  await page
    .evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    })
    .catch(() => {
      /* the update may navigate the page before evaluate returns; that is expected */
    });
}

test("the invalid build ships a self-destroying worker, the valid build a precaching one", () => {
  const invalid = readFileSync(path.join(DIST("dist-boot-guard"), "sw.js"), "utf8");
  const valid = readFileSync(path.join(DIST("dist-preview"), "sw.js"), "utf8");
  expect(invalid).toContain("self.registration.unregister()");
  expect(invalid).toContain("caches.delete(");
  expect(invalid).not.toContain("precache");
  expect(valid).toContain("precache");
  expect(valid).not.toContain("self.registration.unregister()");
});

test("an installed worker that picks up an invalid release cleans the device instead of caching it", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await serve(page, "v1");
  await installValidRelease(page);

  await serve(page, "invalid");
  await triggerUpdateCheck(page);

  await expect(page.getByTestId("misconfigured")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => registrations(page), { timeout: 15_000 }).toBe(0);
  await expect.poll(() => cacheNames(page), { timeout: 15_000 }).toEqual([]);
  await expect.poll(() => controlled(page), { timeout: 15_000 }).toBe(false);

  const invalidRequests = (await recorded(page)).filter((r) => r.build === "invalid");
  expect(invalidRequests.some((r) => r.path === "/sw.js"), "the update check fetched the new worker").toBe(true);
  expect(invalidRequests.filter((r) => /^\/assets\/App-/.test(r.path)), "the invalid app chunk was never fetched").toEqual([]);
});

test("a valid update replaces the installed worker and its cached release", async ({ page, context }) => {
  await blockExternalNetwork(context);
  const v1Assets = await assetsOf(page, "v1");
  const v2Assets = await assetsOf(page, "v2");
  const v1Index = v1Assets.find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  const v2Index = v2Assets.find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  expect(v2Index).not.toBe(v1Index);

  await serve(page, "v1");
  await installValidRelease(page);
  expect(await entryScript(page)).toBe(`/assets/${v1Index}`);

  await serve(page, "v2");
  await triggerUpdateCheck(page);

  // autoUpdate reloads the page once the new worker activates; the new entry chunk proves it.
  await expect.poll(() => entryScript(page), { timeout: 20_000 }).toBe(`/assets/${v2Index}`);
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect.poll(() => registrations(page)).toBe(1);
  await expect.poll(() => controlled(page)).toBe(true);
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).toContain(`/assets/${v2Index}`);
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).not.toContain(`/assets/${v1Index}`);
});
```

- [ ] **Step 5: Typecheck and run the suite to record the red state**

Run from `web/`:
```bash
npx tsc -b && timeout 400 npm run e2e:upgrade 2>&1 | grep -E "✓|✘|passed|failed|Error:" | head -20
```
Expected: typecheck clean; three builds succeed; then `1 passed, 2 failed` or `2 passed, 1 failed`:
- "the invalid build ships a self-destroying worker…" FAILS (`dist-boot-guard/sw.js` is a normal Workbox worker: `expect(invalid).not.toContain("precache")` fails).
- "an installed worker that picks up an invalid release…" FAILS — this is the audit's P2 exactly (expect either the `cacheNames` poll not reaching `[]`, or the "invalid app chunk was never fetched" assertion listing `/assets/App-<hash>.js`). Record which assertion failed and its message in the report.
- "a valid update replaces…" is expected to PASS already (it pins current, correct behaviour). If it fails, stop and report DONE_WITH_CONCERNS with the output: the pin must be right before Tasks 2–3 change the worker.

- [ ] **Step 6: Commit the suite in its red state**

```bash
git add web/e2e-upgrade web/playwright.upgrade.config.ts web/package.json web/tsconfig.e2e.json .gitignore
git commit -m "test(web): same-origin upgrade suite; records the audit's P2 worker-update defect (2 red)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XSp7ebmUaqxSfwhK9nNXud"
```

---

### Task 2: Non-deployable builds emit a self-destroying worker

**Files:**
- Modify: `web/vite.config.ts`

**Interfaces:**
- Consumes: `validateFirebaseEnv` from `web/src/config/firebaseEnv.ts`; `loadEnv` from `vite`.
- Produces: `dist-boot-guard/sw.js` is the plugin's self-destroying worker; `dist-preview/sw.js` unchanged.

- [ ] **Step 1: Resolve the env once and choose the worker**

In `web/vite.config.ts`:
- change the vite import to `import { defineConfig, loadEnv, type Plugin } from "vite";`
- change the firebaseEnv import to `import { guardViteBuild, validateFirebaseEnv } from "./src/config/firebaseEnv.ts";`
- replace the `export default defineConfig(...)` block with:
```ts
export default defineConfig(({ mode, command }) => {
  // The same validator the app uses at startup decides, at build time, which worker to emit.
  // A compile-only build carrying non-deployable values (SAFEBITE_UNVALIDATED_BUILD=1) gets the
  // plugin's self-destroying worker: it precaches nothing and, if an installed valid worker ever
  // picks it up as an update, it unregisters itself, navigates open pages and deletes every cache.
  // Deployable builds get the normal precaching worker. (guardViteBuild, below in the plugin
  // chain, still refuses non-production builds and un-bypassed invalid ones.)
  const firebaseEnv = loadEnv(mode, process.cwd(), "VITE_");
  const deployable = validateFirebaseEnv(firebaseEnv).length === 0;
  return {
    // True in every built bundle, false for the dev server and Vitest. Unlike import.meta.env.PROD
    // it cannot be flipped by NODE_ENV, so src/firebase.ts can rely on it for the startup guard.
    define: { __SAFEBITE_BUILD__: JSON.stringify(command === "build") },
    plugins: [
      react(),
      requireDeployableFirebaseEnv(mode),
      VitePWA({ ...pwaOptions, selfDestroying: command === "build" && !deployable }),
    ],
    server: { port: 5173, strictPort: true },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["src/test-setup.ts"],
    },
  };
});
```
Update the comment block above `pwaOptions` so its last sentence reads: `// see src/pwa/serviceWorker.ts. Non-deployable builds swap in a self-destroying worker (see below).`

- [ ] **Step 2: Prove the artefacts**

Run from `web/`:
```bash
npm run e2e:boot-guard 2>&1 | grep -E "passed|failed" | tail -1; head -c 300 dist-boot-guard/sw.js; echo; grep -c "precache" dist-boot-guard/sw.js; ls dist-boot-guard | tr '\n' ' '; echo; npm run build:check 2>&1 | grep -E "PWA|precache|built in"; grep -c "self.registration.unregister" dist/sw.js
```
Expected: boot guard `1 passed` (the misconfigured page still registers nothing); `dist-boot-guard/sw.js` starts with the `self.addEventListener('install'` template and has `0` occurrences of `precache`; no `workbox-*.js` in `dist-boot-guard`; the compile-only root build (`build:check` with no VITE_ values set → not deployable) also reports the self-destroying worker; and the LAST grep prints `0` only if `dist/` came from a deployable build — it will print `1` here because `build:check` has no values. That is correct: compile-only bundles never deploy (the Hosting predeploy is the validated `npm run build`). Then confirm the deployable path with the preview env from the `e2e:preview` script:
```bash
VITE_FIREBASE_API_KEY=AIzaSyPreviewOnly0123456789abcdefghijklmn VITE_FIREBASE_AUTH_DOMAIN=safebite-preview.firebaseapp.com VITE_FIREBASE_PROJECT_ID=safebite-preview VITE_FIREBASE_APP_ID=1:000000000000:web:0123456789abcdef VITE_USE_EMULATORS=false node node_modules/vite/bin/vite.js build --outDir dist-preview 2>&1 | grep -E "precache|built in"; grep -c "self.registration.unregister" dist-preview/sw.js
```
Expected: `precache N entries` in the summary and `0`.

- [ ] **Step 3: Run the upgrade suite**

Run from `web/`:
```bash
timeout 400 npm run e2e:upgrade 2>&1 | grep -E "✓|✘|passed|failed|Error:" | head -20
```
Expected: "the invalid build ships a self-destroying worker…" now PASSES; "a valid update replaces…" still PASSES; "an installed worker that picks up an invalid release…" PASSES or fails only on the `controlled` / `cacheNames` polls (Task 3 closes those). Record the exact result. If the App-chunk assertion still fails, stop: the self-destroying worker was not emitted for that build; re-check Step 2.

- [ ] **Step 4: Dev server and unit tests unaffected**

Run from the repo root: `npm run test:unit` (53 passed) and `npm run emu:e2e 2>&1 | grep -E "passed|failed" | tail -1` (5 passed).

- [ ] **Step 5: Commit**

```bash
git add web/vite.config.ts
git commit -m "fix(web): non-deployable builds emit a self-destroying service worker instead of a precaching one

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XSp7ebmUaqxSfwhK9nNXud"
```

---

### Task 3: Page-side purge and controlled-document reload; CI; docs; audit files

**Files:**
- Modify: `web/src/pwa/serviceWorker.ts`, `web/src/pwa/serviceWorker.test.ts`, `web/src/main.tsx`, `web/e2e-boot-guard/boot-guard.spec.ts`, `.github/workflows/ci.yml`, `README.md`, `planning/specs/2026-09-20-safebite-pwa-design.md`
- Add to git: `planning/audits/2026-09-21-plan-2a-audit.md`, `planning/audits/plan-2a-update-probe.mjs`, `planning/audits/plan-2a-update-evidence.json`

**Interfaces:**
- Produces: `export async function purgeServiceWorkerState(): Promise<{ registrations: number; caches: number; wasControlled: boolean }>` replacing `unregisterServiceWorkers`.

- [ ] **Step 1: Write the failing unit tests**

In `web/src/pwa/serviceWorker.test.ts` replace the `unregisterServiceWorkers` describe with:
```ts
function fakeServiceWorker(registrations: Array<{ unregister: () => Promise<boolean> }>, controller: unknown = null) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { controller, getRegistrations: async () => registrations },
  });
}
function fakeCaches(names: string[]) {
  const deleted: string[] = [];
  vi.stubGlobal("caches", { keys: async () => names, delete: async (name: string) => (deleted.push(name), true) });
  return deleted;
}

describe("purgeServiceWorkerState", () => {
  it("unregisters every registration, deletes every cache, and reports whether the page was controlled", async () => {
    const unregister = vi.fn(async () => true);
    fakeServiceWorker([{ unregister }, { unregister }], { scriptURL: "http://127.0.0.1/sw.js" });
    const deleted = fakeCaches(["workbox-precache-v2-http://127.0.0.1/", "other"]);
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 2, caches: 2, wasControlled: true });
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual(["workbox-precache-v2-http://127.0.0.1/", "other"]);
  });

  it("reports an uncontrolled page and still deletes caches", async () => {
    fakeServiceWorker([]);
    const deleted = fakeCaches(["stale"]);
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 0, caches: 1, wasControlled: false });
    expect(deleted).toEqual(["stale"]);
  });

  it("is a no-op where service workers and Cache Storage are unsupported", async () => {
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 0, caches: 0, wasControlled: false });
  });
});
```
Update the import line to `import { purgeServiceWorkerState, registerServiceWorker } from "./serviceWorker";`. (`afterEach` already deletes the fake `navigator.serviceWorker` and calls `vi.unstubAllGlobals()`, which removes the `caches` stub.)

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pwa/serviceWorker.test.ts`. Expected: FAIL, `purgeServiceWorkerState` is not exported (the two `registerServiceWorker` tests still pass).

- [ ] **Step 3: Implement the purge**

In `web/src/pwa/serviceWorker.ts` replace `unregisterServiceWorkers` with:
```ts
export interface PurgeResult {
  registrations: number;
  caches: number;
  /** True when a worker controlled this document at the time of the purge (unregistering does not end that). */
  wasControlled: boolean;
}

/**
 * Removes every service worker registration and every Cache Storage cache for this origin.
 * Called when the bundle is misconfigured, so neither a previously installed worker nor its
 * precached release can keep serving a stale shell. Unregistering leaves the current document
 * under the old worker's control until the next navigation; the caller reloads once if
 * `wasControlled` is true. SafeBite owns this origin, so deleting all caches is correct.
 */
export async function purgeServiceWorkerState(): Promise<PurgeResult> {
  const result: PurgeResult = { registrations: 0, caches: 0, wasControlled: false };
  if ("serviceWorker" in navigator) {
    result.wasControlled = navigator.serviceWorker.controller !== null;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    result.registrations = registrations.length;
  }
  if ("caches" in globalThis) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    result.caches = names.length;
  }
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd web && npx vitest run src/pwa/serviceWorker.test.ts`. Expected: `5 passed`. Then `npx vitest run` → `54 passed` (53 − 2 + 3).

- [ ] **Step 5: Reload once when the document was controlled**

In `web/src/main.tsx` change the import to `import { purgeServiceWorkerState, registerServiceWorker } from "./pwa/serviceWorker";` and replace the misconfigured branch with:
```tsx
if (problems.length > 0) {
  root.render(<MisconfiguredScreen problems={problems} />);
  // Purge lookups can be refused by the browser (e.g. a locked-down profile); the screen is
  // already rendered either way. A document still controlled by the old worker reloads once,
  // uncontrolled, so no cached release can be served to it; after the reload there is no
  // registration, so this cannot loop.
  purgeServiceWorkerState()
    .then(({ wasControlled }) => {
      if (wasControlled) window.location.reload();
    })
    .catch(() => {});
} else {
```
(Render first, then purge: the screen must be visible even if the purge hangs.)

- [ ] **Step 6: Boot-guard test asserts the purge**

In `web/e2e-boot-guard/boot-guard.spec.ts`, after the registrations assertion add:
```ts
  const cacheCount = await page.evaluate(async () => (await caches.keys()).length);
  expect(cacheCount).toBe(0);
```
and extend the header comment's last sentence: `…and must never register a service worker or leave a cache behind.`

- [ ] **Step 7: Run the browser suites**

Run from `web/`, one after another:
```bash
timeout 300 npm run e2e:boot-guard 2>&1 | grep -E "passed|failed" | tail -1
timeout 400 npm run e2e:upgrade 2>&1 | grep -E "✓|✘|passed|failed" | tail -5
timeout 300 npm run e2e:preview 2>&1 | grep -E "passed|failed" | tail -1
```
Expected: `1 passed`; `3 passed` (the P2 test is green: screen shown, 0 registrations, no caches, uncontrolled, invalid App chunk never fetched); `4 passed`. Then run the upgrade suite a second time and expect `3 passed` again.

- [ ] **Step 8: CI step**

In `.github/workflows/ci.yml` insert after the step `PWA shell — manifest, service worker, offline reload (preview bundle)` and before the artifact upload:
```yaml
      - name: Service worker upgrades — invalid release self-destructs, valid release replaces (upgrade suite)
        run: npm --prefix web run e2e:upgrade

```

- [ ] **Step 9: README and spec**

`README.md`: under `### Tests` after the `e2e:preview` line add:
```
npm --prefix web run e2e:upgrade      # same-origin release upgrades: invalid release self-destructs, valid release replaces (Chromium, no emulators)
```
Change `currently reports 51 tests.` to `currently reports 54 tests.` Under `### Guardrails`, replace the bullet beginning `- A misconfigured built bundle shows a plain "this build is misconfigured" screen` with:
```
- A misconfigured built bundle shows a plain "this build is misconfigured" screen, loads no Firebase code, unregisters every service worker, deletes every cache and leaves the old worker's control; a clean bundle registers the Workbox worker only after that check. A non-deployable build ships a self-destroying worker (no precache), so an installed worker that picks it up as an update cleans the device instead of caching it (`npm --prefix web run e2e:upgrade` proves both paths).
```

Spec (`planning/specs/2026-09-20-safebite-pwa-design.md`): in the block "Carried from the Plan 2a final review (2026-09-21), for Plan 2b/3/5", replace the first bullet (the one about `unregisterServiceWorkers()` leaving the precache) with:
```
- Done in Plan 2a-h (audit P2): non-deployable builds emit the plugin's self-destroying worker;
  the misconfigured page purges registrations and all caches and reloads once if it was still
  controlled; `web/e2e-upgrade` proves valid→invalid and valid→valid same-origin upgrades.
```
Keep the `onNeedRefresh` prompt bullet: it remains a Plan 2b prerequisite.

- [ ] **Step 10: Commit the auditor's files and everything else**

Confirm the three files under `planning/audits/` are LF (`file planning/audits/*` shows no CRLF) and contain no secrets (`grep -c "AIza\|sk_live" planning/audits/*` → 0 for each). Then:
```bash
npm run typecheck && npm run test:unit
git add web/src/pwa web/src/main.tsx web/e2e-boot-guard/boot-guard.spec.ts .github/workflows/ci.yml README.md planning/specs/2026-09-20-safebite-pwa-design.md planning/audits
git commit -m "fix(web): purge service-worker state on misconfiguration and reload a controlled page; upgrade suite in CI; commit the Plan 2a audit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XSp7ebmUaqxSfwhK9nNXud"
```

---

## Controller notes

- Tasks are strictly sequential (1 records red, 2 turns the artefact test green, 3 turns the P2 test green).
- The reviewer for Task 1 should confirm the two red tests fail for the audited reason, not for suite plumbing.
- The reviewer for Task 3 should re-run `npm --prefix web run e2e:upgrade` once themselves.
- Unit counts: 53 → 53 (T1, T2) → 54 (T3).

## Self-review record

- Audit coverage: build-time decision on the same validator (T2); no precaching update for invalid builds (T2, proven by the artefact test in T1 and the App-chunk assertion); explicit cleanup worker (the plugin's, T2); caches removed during recovery (T3); control of the open document handled by a single reload (T3); valid→invalid and valid→valid regressions checking requests, Cache Storage, recovery, registration and control separately (T1); fresh-install tests retained.
- Placeholder scan: none.
- Type consistency: `purgeServiceWorkerState` name and `PurgeResult` shape match between T3 code, test and `main.tsx`; server control paths match between `server.mjs` and the spec helpers; ports and dirs match the Global Constraints.
