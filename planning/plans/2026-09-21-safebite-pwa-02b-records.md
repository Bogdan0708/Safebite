# SafeBite PWA — Plan 2b: Restaurant records and evidence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the four worker/build pre-work items (prompt-mode update banner with per-tab reload, hermetic synthetic builds with provenance stamps, precache and manifest clean-up), then the household's restaurant records: `restaurants` + `claims` model, rules with accreditation, version and deletion-protocol validation, transaction-only writes with typed outcomes, list / form / detail / claim pages with calendar-date evidence states and "call ahead" prompts, proven by unit, table-driven rules and browser tests.

**Architecture:** Same branch and layout as Plans 1–2a-h (`web/`, `functions/`, root scripts, `.github/workflows/ci.yml`, `firestore.rules`). Nothing changes under `functions/src`: everything here is client code plus Firestore rules. Pure domain code (`web/src/records/{types,dates,evidence,validation}.ts`) has no Firebase imports beyond the `Timestamp` type and is unit-tested; `web/src/records/repository.ts` is the only module that touches Firestore, every write is a `runTransaction`, and every listener reports an explicit read state. Pages under `web/src/records/` consume the repository through small hooks. The update prompt is an external store (`web/src/pwa/updates.ts`) read by `<UpdateBanner>` via `useSyncExternalStore`, wired from `registerServiceWorker()`. Build hygiene lives in `web/vite.config.ts`, `web/src/config/fixtureEnv.ts` and `web/tooling/`.

**Tech Stack:** Vite 8.3, React 19, TypeScript 6 strict (web) / 5.9 (functions), Vitest 5, Playwright 1.63 (Chromium only), `vite-plugin-pwa` 1.3.0 (Workbox 7, generateSW, `registerType: "prompt"`), Firebase JS SDK 12, `@firebase/rules-unit-testing` 5.0.2, firebase-tools 15.30, Node 22.

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md` — **§3.5 is the binding design for this plan** (rulings 1–6, pre-work F5/F6/F7, data model, calendar dates, deletion protocol, rules, online-only writes and read states, client modules, pages, tests). Also §2.1 non-negotiable rules, §2.3 data model, §2.4 security model, §2.6 offline stance, §2.7 testing strategy, §3.2 guardrails. Design audit that shaped §3.5: `planning/audits/2026-09-21-plan-2b-design-audit.md` (F1–F7). Previous plans: `planning/plans/2026-09-21-safebite-pwa-02a-shell.md`, `planning/plans/2026-09-21-safebite-pwa-02a-hardening.md`.

## Global Constraints

- Emulators only (`demo-safebite`); no `firebase deploy`, no `git push`, no billing or console changes. The string `safebite-production-13ba1` must not appear in new files; the CI guardrail grep excludes only `web/src/config/firebaseEnv.ts` and its test.
- Working directory is the worktree `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-01-foundation` on branch `worktree-pwa-01-foundation`. Never run anything in `/home/godja/Dev/AvaGF` itself or in the old `/mnt/c` checkout.
- The five browser scenarios in `web/e2e/auth.spec.ts` and their testids (`signin-form`, `signin-email`, `signin-password`, `signin-submit`, `signin-error`, `signout`, `whoami`, `not-invited`, `nav-discover`, `nav-saved`, `nav-settings`) stay unchanged. `nav-saved` keeps the label "Saved" and now points at `/restaurants`.
- A deployable build (`npm --prefix web run build`) must keep rejecting missing, blank, demo, legacy-project and emulator configurations; any `vite build` with `NODE_ENV` other than `production` must keep being refused; the worker-decision interlock (`expectedDeployable`) and the runtime guard in `web/src/firebase.ts` stay. No new bypass environment variables.
- Misconfiguration recovery (Plan 2a-h: self-destroying worker for non-deployable builds, page-side purge and one-shot reload) is unchanged and exempt from "nothing reloads until tapped". All four existing `e2e-upgrade` scenarios keep passing (one is rewritten, not removed).
- Every write to Firestore from `web/` goes through `runTransaction`. No `addDoc`, `setDoc`, `updateDoc`, `deleteDoc` or `writeBatch` in `web/src` (unit tests may stub them; `grep -rn "addDoc\|setDoc\|updateDoc\|deleteDoc\|writeBatch" web/src --include=*.ts --include=*.tsx | grep -v test` must print nothing at the end of Task 8).
- Never `window.confirm`/`alert`/`prompt` in `web/src` (they block Playwright). Delete confirmations are in-page.
- No numerical safety score anywhere; copy uses British spelling ("coeliac", "colour"); dates display as UTC calendar dates in `en-GB` format.
- Rules text and the TypeScript constant lists in `web/src/records/types.ts` must agree; Task 7's table-driven emulator tests are the proof, Task 7's literal smoke test the tripwire.
- Line endings: every file this plan touches is LF (`.gitattributes` from Plan 2a). Edit with tools that preserve endings.
- Node 22; TS strict; commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (implementers may see a different attribution reminder; use the line above).
- Emulator-backed runs (`npm run emu:test`, `npm run emu:e2e`) take one to two minutes here; give those shell commands a 5 minute timeout. Vite builds take ~10 s each; the upgrade suite ~1 min.
- Every task ends with `npm run typecheck` and `npm run test:unit` green, plus whichever emulator/preview/upgrade suite the task touched. State unit counts as "previous + N new" — do not assert absolute totals in commit messages.

---

## File map

| Path | Responsibility |
|------|----------------|
| `web/.env.preview`, `web/.env.preview-v2`, `web/.env.boot-guard` (new, committed) | Synthetic `VITE_*` fixtures for the three test builds |
| `.gitignore` | Un-ignore the three fixture files |
| `web/src/config/fixtureEnv.ts` (+test, new) | Pure `.env` parser and fixture-vs-resolved comparison |
| `web/tooling/sourceHash.ts` (+test, new) | SHA-256 over the source set for a mode |
| `web/tooling/distStamp.ts` (new) | `assertFreshDist(outDir, mode)` used by the three Playwright configs |
| `web/vite.config.ts` | `--mode` fixture check, build stamp plugin, `registerType: "prompt"`, `includeManifestIcons: false`, glob without `webmanifest`, `manifest: false` when self-destroying |
| `web/package.json` | `build:preview`, `build:preview-v2`, `build:boot-guard`, `build:e2e`; `e2e:*` run Playwright only |
| `web/playwright.preview.config.ts`, `web/playwright.boot-guard.config.ts`, `web/playwright.upgrade.config.ts` | Call `assertFreshDist` before starting the server |
| `web/tsconfig.e2e.json`, `web/vite.config.ts` (`test.include`) | Typecheck and run `tooling/` (e2e tsconfig gains `allowImportingTsExtensions`) |
| `.github/workflows/ci.yml` | One `build:e2e` step, then three test steps |
| `README.md` | Commands, guardrails, counts |
| `web/e2e-upgrade/upgrade.spec.ts` | Unique precache URLs; rewritten valid→valid test; new two-tab test; tightened wording |
| `web/e2e-boot-guard/boot-guard.spec.ts` | No `<link rel="manifest">` |
| `web/src/pwa/updates.ts` (+test, new) | External store: `idle` → `available` → `activated`; `applyUpdate`, `requestedHere` gate |
| `web/src/pwa/UpdateBanner.tsx` (+test, new) | Banner with Reload button for `available`/`activated` |
| `web/src/pwa/serviceWorker.ts` (+test) | `registerServiceWorker()` wires `onNeedRefresh`/`onNeedReload` into the store |
| `web/src/App.tsx` | Renders `<UpdateBanner />` above `<Gate />` |
| `web/src/records/types.ts` (new) | Constants, labels, read models, write inputs, `CalendarDate` |
| `web/src/records/dates.ts` (+test, new) | UTC calendar-date helpers |
| `web/src/records/evidence.ts` (+test, new) | `evidenceStatus`, `sortClaims`, `summariseEvidence` |
| `web/src/records/validation.ts` (+test, new) | `LIMITS`, `validateRestaurantInput`, `validateClaimInput`, `isHttpUrl`, `normaliseRestaurantInput` |
| `web/src/records/rulesParity.test.ts` (new) | Literal smoke check against `firestore.rules` |
| `firestore.rules` | Nested `restaurants`/`claims` rules, helper functions |
| `functions/test/rules.records.test.ts` (new) | Table-driven emulator rules tests |
| `web/src/records/repository.ts` (+test, new) | Watchers with read states; transaction writes with typed outcomes; deletion protocol |
| `web/src/records/useMember.ts`, `web/src/records/useWatch.ts` (new) | Member identity from the auth state; generation-guarded listener hook returning `WatchState<T>` |
| `web/src/records/useToday.ts` (new) | Local calendar "today" that refreshes on visibility change and at midnight |
| `web/src/records/ReadStateNotice.tsx` (new) | Renders offline/denied/error/gone notices for a `Snapshot` |
| `web/src/records/RestaurantsPage.tsx` (+test, new) | List, Deleting… rows, Finish deleting, Add |
| `web/src/records/RestaurantFormPage.tsx` (+test, new) | Create/edit with draft vs remote, outcomes, delete protocol UI |
| `web/src/records/RestaurantDetailPage.tsx` (+test, new) | Facts, evidence by kind, call-ahead block, claim delete |
| `web/src/records/ClaimFormPage.tsx` (+test, new) | Add evidence form |
| `web/src/records/callAhead.ts` (new) | The four question groups |
| `web/src/AppShell.tsx` | Routes for `/restaurants…`; `/saved` redirect; `SavedPage` removed |
| `web/src/pages/SavedPage.tsx` | Deleted |
| `web/src/styles.css` | Small additions: banner, list, card, evidence, field errors |
| `web/e2e/records.spec.ts` (new), `web/e2e/emulator-rest.ts` (new) | Seven browser scenarios and Firestore-emulator REST helpers |
| `planning/audits/2026-09-21-plan-2a-h-recheck.md` | Committed together with this plan document (owner instruction), unchanged |

---

### Task 1: Committed synthetic fixtures and the `--mode` fixture-identity check (F7, part 1)

**Files:**
- Create: `web/.env.preview`, `web/.env.preview-v2`, `web/.env.boot-guard`, `web/src/config/fixtureEnv.ts`, `web/src/config/fixtureEnv.test.ts`
- Modify: `.gitignore`, `web/vite.config.ts`, `web/package.json`

**Interfaces:**
- Produces:
  ```ts
  // web/src/config/fixtureEnv.ts (pure)
  export const FIXTURE_MODES = ["preview", "preview-v2", "boot-guard"] as const;
  export type FixtureMode = (typeof FIXTURE_MODES)[number];
  export function isFixtureMode(mode: string): mode is FixtureMode;
  export function parseEnvFile(text: string): Record<string, string>;   // KEY=VALUE lines, # comments, optional surrounding quotes
  export function fixtureMismatches(fixture: Record<string, string>, resolved: Record<string, string>): string[]; // one line per differing/missing key
  ```
- Produces scripts `build:preview`, `build:preview-v2`, `build:boot-guard`, `build:e2e` (used by Task 2's test scripts and CI).

- [ ] **Step 1: Write the failing parser/mismatch tests**

Create `web/src/config/fixtureEnv.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { FIXTURE_MODES, fixtureMismatches, isFixtureMode, parseEnvFile } from "./fixtureEnv";

describe("parseEnvFile", () => {
  it("reads KEY=VALUE lines, ignores comments and blanks, strips quotes", () => {
    const text = [
      "# synthetic preview fixture",
      "",
      "VITE_FIREBASE_PROJECT_ID=safebite-preview",
      'VITE_FIREBASE_AUTH_DOMAIN="safebite-preview.firebaseapp.com"',
      "VITE_USE_EMULATORS='false'",
      "  VITE_FIREBASE_APP_ID = 1:000000000000:web:0123456789abcdef  ",
    ].join("\n");
    expect(parseEnvFile(text)).toEqual({
      VITE_FIREBASE_PROJECT_ID: "safebite-preview",
      VITE_FIREBASE_AUTH_DOMAIN: "safebite-preview.firebaseapp.com",
      VITE_USE_EMULATORS: "false",
      VITE_FIREBASE_APP_ID: "1:000000000000:web:0123456789abcdef",
    });
  });

  it("keeps an equals sign inside the value", () => {
    expect(parseEnvFile("A=b=c")).toEqual({ A: "b=c" });
  });
});

describe("fixtureMismatches", () => {
  const fixture = { VITE_FIREBASE_PROJECT_ID: "safebite-preview", VITE_USE_EMULATORS: "false" };

  it("is empty when every fixture key resolves to the fixture value", () => {
    expect(fixtureMismatches(fixture, { ...fixture, VITE_OTHER: "ignored" })).toEqual([]);
  });

  it("names a key whose resolved value differs (an exported shell variable won)", () => {
    expect(fixtureMismatches(fixture, { ...fixture, VITE_FIREBASE_PROJECT_ID: "my-real-project" })).toEqual([
      "VITE_FIREBASE_PROJECT_ID resolved to \"my-real-project\" but the fixture says \"safebite-preview\"",
    ]);
  });

  it("names a fixture key that did not resolve at all", () => {
    expect(fixtureMismatches(fixture, { VITE_FIREBASE_PROJECT_ID: "safebite-preview" })).toEqual([
      "VITE_USE_EMULATORS resolved to <unset> but the fixture says \"false\"",
    ]);
  });
});

describe("isFixtureMode", () => {
  it("recognises exactly the three fixture modes", () => {
    for (const mode of FIXTURE_MODES) expect(isFixtureMode(mode)).toBe(true);
    expect(isFixtureMode("production")).toBe(false);
    expect(isFixtureMode("development")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- src/config/fixtureEnv.test.ts`
Expected: FAIL — cannot resolve `./fixtureEnv`.

- [ ] **Step 3: Implement the pure module**

Create `web/src/config/fixtureEnv.ts`:
```ts
/**
 * Synthetic build fixtures. `vite build --mode <fixture>` loads `web/.env.<fixture>`, but Vite lets
 * an already-exported `VITE_*` variable outrank the mode file (audit F7, reproduced). The config
 * therefore compares what Vite resolved against the file itself and refuses the build on any
 * difference, so a test bundle can never quietly carry a real project's values.
 * Pure: no filesystem or environment access here; vite.config.ts supplies both sides.
 */
export const FIXTURE_MODES = ["preview", "preview-v2", "boot-guard"] as const;
export type FixtureMode = (typeof FIXTURE_MODES)[number];

export function isFixtureMode(mode: string): mode is FixtureMode {
  return (FIXTURE_MODES as readonly string[]).includes(mode);
}

/** Minimal `.env` parser: `KEY=VALUE` per line, `#` comments, blank lines, optional matching quotes. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** One message per fixture key whose resolved value is missing or different. Empty means hermetic. */
export function fixtureMismatches(fixture: Record<string, string>, resolved: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [key, expected] of Object.entries(fixture)) {
    const actual = resolved[key];
    if (actual !== expected) {
      const shown = actual === undefined ? "<unset>" : JSON.stringify(actual);
      problems.push(`${key} resolved to ${shown} but the fixture says ${JSON.stringify(expected)}`);
    }
  }
  return problems;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix web test -- src/config/fixtureEnv.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Create the three fixture files and un-ignore them**

Create `web/.env.preview` (values identical to today's inline `e2e:preview` script):
```
# Synthetic, shape-valid Firebase values for the preview and upgrade browser suites.
# Not a real project: the suites block every request off 127.0.0.1. Loaded by `vite build --mode preview`.
VITE_FIREBASE_API_KEY=AIzaSyPreviewOnly0123456789abcdefghijklmn
VITE_FIREBASE_AUTH_DOMAIN=safebite-preview.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=safebite-preview
VITE_FIREBASE_APP_ID=1:000000000000:web:0123456789abcdef
VITE_USE_EMULATORS=false
```

Create `web/.env.preview-v2` (only the project id differs, so the bundle hashes differ — the upgrade suite's "v2"):
```
# Second synthetic release for the upgrade suite: differs from .env.preview only in the project id,
# so the built assets hash differently and an installed worker sees a new release.
VITE_FIREBASE_API_KEY=AIzaSyPreviewOnly0123456789abcdefghijklmn
VITE_FIREBASE_AUTH_DOMAIN=safebite-preview.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=safebite-preview-v2
VITE_FIREBASE_APP_ID=1:000000000000:web:0123456789abcdef
VITE_USE_EMULATORS=false
```

Create `web/.env.boot-guard` (the demo values the boot-guard suite proves are refused at runtime):
```
# Demo/emulator values for the boot-guard suite: built compile-only (SAFEBITE_UNVALIDATED_BUILD=1 on
# the command line) and proven to refuse to start in a browser. Loaded by `vite build --mode boot-guard`.
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=localhost
VITE_FIREBASE_PROJECT_ID=demo-safebite
VITE_FIREBASE_APP_ID=demo-app-id
VITE_USE_EMULATORS=true
```

In `.gitignore`, directly after the existing line `!/web/.env.development`, add:
```
!/web/.env.preview
!/web/.env.preview-v2
!/web/.env.boot-guard
```
Verify: `git check-ignore -v web/.env.preview` prints nothing (exit 1) and `git status --short` lists the three files as untracked.

- [ ] **Step 6: Add the fixture-identity check to `web/vite.config.ts`**

Add imports at the top (keep the existing ones):
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fixtureMismatches, isFixtureMode, parseEnvFile } from "./src/config/fixtureEnv.ts";
```

Add this function after `requireDeployableFirebaseEnv`:
```ts
/**
 * For the three synthetic test modes, refuse the build unless every value in `web/.env.<mode>`
 * is exactly what Vite resolved. An exported VITE_* variable outranks the mode file in Vite, so
 * without this a shell could swap a real project into a "synthetic" bundle (audit F7).
 */
function requireFixtureIdentity(mode: string, resolvedEnv: Record<string, string>): Plugin {
  return {
    name: "safebite-require-fixture-identity",
    apply: "build",
    configResolved(config) {
      if (!isFixtureMode(mode)) return;
      const file = path.resolve(config.root, `.env.${mode}`);
      const fixture = parseEnvFile(readFileSync(file, "utf8"));
      const problems = fixtureMismatches(fixture, resolvedEnv);
      if (problems.length > 0) {
        throw new Error(
          `[safebite] vite build --mode ${mode} is not hermetic; refusing to build:\n- ${problems.join("\n- ")}\n` +
            `Unset the conflicting VITE_* variables (and any .env.${mode}.local) so the committed fixture is what gets built.`,
        );
      }
    },
  };
}
```

In `defineConfig`, `firebaseEnv` is already `loadEnv(mode, process.cwd(), "VITE_")`; add the plugin to the `plugins` array right after `react()`:
```ts
      react(),
      requireFixtureIdentity(mode, firebaseEnv),
      requireDeployableFirebaseEnv(mode, deployable),
```

- [ ] **Step 7: Add the build scripts (test scripts still inline for now; Task 2 replaces them)**

In `web/package.json` `scripts`, add these four entries (keep the existing `e2e:*` entries untouched in this task):
```json
    "build:preview": "vite build --mode preview --outDir dist-preview",
    "build:preview-v2": "vite build --mode preview-v2 --outDir dist-preview-v2",
    "build:boot-guard": "SAFEBITE_UNVALIDATED_BUILD=1 vite build --mode boot-guard --outDir dist-boot-guard",
    "build:e2e": "npm run build:preview && npm run build:preview-v2 && npm run build:boot-guard",
```

- [ ] **Step 8: Prove the three builds work and the check refuses a shell override**

Run from `web/`:
```bash
npm run build:e2e 2>&1 | tail -5
ls dist-preview/sw.js dist-preview-v2/sw.js dist-boot-guard/sw.js
grep -c "precache" dist-preview/sw.js dist-boot-guard/sw.js
```
Expected: three builds succeed; `dist-preview/sw.js` contains `precache` (count ≥ 1); `dist-boot-guard/sw.js` contains 0 (self-destroying, the boot-guard mode is non-deployable so `selfDestroying` is true).

Then:
```bash
VITE_FIREBASE_PROJECT_ID=someone-elses-project npm run build:preview; echo "exit $?"
```
Expected: the build fails, output contains `vite build --mode preview is not hermetic` and `VITE_FIREBASE_PROJECT_ID resolved to "someone-elses-project"`, exit code non-zero.

Also confirm the non-production guard is intact under a mode:
```bash
NODE_ENV=development npm run build:preview; echo "exit $?"
```
Expected: fails with `Refusing a non-production Vite build`, exit non-zero.

- [ ] **Step 9: Gate and commit**

Run: `npm run typecheck && npm run test:unit` (root). Expected: both green; unit count = previous + 6.

```bash
git add .gitignore web/.env.preview web/.env.preview-v2 web/.env.boot-guard web/src/config/fixtureEnv.ts web/src/config/fixtureEnv.test.ts web/vite.config.ts web/package.json
git commit -m "build(web): committed synthetic .env fixtures with a --mode identity check; build:preview/-v2/boot-guard scripts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Build provenance stamp, fresh-dist checks, test scripts run Playwright only, CI and README (F7, part 2)

**Files:**
- Create: `web/tooling/sourceHash.ts`, `web/tooling/sourceHash.test.ts`, `web/tooling/distStamp.ts`
- Modify: `web/vite.config.ts`, `web/package.json`, `web/playwright.preview.config.ts`, `web/playwright.boot-guard.config.ts`, `web/playwright.upgrade.config.ts`, `web/tsconfig.node.json`, `web/tsconfig.e2e.json`, `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: `isFixtureMode`, `FixtureMode` from Task 1.
- Produces:
  ```ts
  // web/tooling/sourceHash.ts
  export function sourceFilesFor(webRoot: string, mode: string): string[];      // sorted absolute paths
  export function computeSourceHash(webRoot: string, mode: string): string;     // hex sha256 over "relpath\0contents\0" per file
  export interface BuildStamp { mode: string; projectId: string; sourceHash: string; builtAt: string }
  // web/tooling/distStamp.ts
  export function assertFreshDist(webRoot: string, outDir: string, mode: string): BuildStamp; // throws with the build:<mode> hint
  ```
- Every build emits `<outDir>/safebite-build.json` (a `BuildStamp`).

- [ ] **Step 1: Write the failing source-hash test**

Create `web/tooling/sourceHash.test.ts`:
```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeSourceHash, sourceFilesFor } from "./sourceHash";

let root: string;
function scaffold() {
  root = mkdtempSync(path.join(tmpdir(), "safebite-hash-"));
  mkdirSync(path.join(root, "src", "records"), { recursive: true });
  mkdirSync(path.join(root, "public"));
  writeFileSync(path.join(root, "index.html"), "<html></html>");
  writeFileSync(path.join(root, "vite.config.ts"), "export default {}");
  writeFileSync(path.join(root, ".env.preview"), "VITE_X=1");
  writeFileSync(path.join(root, "src", "main.tsx"), "console.log(1)");
  writeFileSync(path.join(root, "src", "records", "types.ts"), "export const a = 1");
  writeFileSync(path.join(root, "public", "favicon.svg"), "<svg/>");
  writeFileSync(path.join(root, "package.json"), "{}"); // not part of the set
}
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("sourceFilesFor", () => {
  it("lists index.html, vite.config.ts, the mode file and everything under src/ and public/, sorted", () => {
    scaffold();
    expect(sourceFilesFor(root, "preview").map((f) => path.relative(root, f))).toEqual([
      ".env.preview",
      "index.html",
      "public/favicon.svg",
      "src/main.tsx",
      "src/records/types.ts",
      "vite.config.ts",
    ]);
  });
});

describe("computeSourceHash", () => {
  it("is stable for identical trees and changes when any listed file changes", () => {
    scaffold();
    const a = computeSourceHash(root, "preview");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(computeSourceHash(root, "preview")).toBe(a);
    writeFileSync(path.join(root, "src", "records", "types.ts"), "export const a = 2");
    expect(computeSourceHash(root, "preview")).not.toBe(a);
  });

  it("depends on the mode file, and ignores files outside the set", () => {
    scaffold();
    const a = computeSourceHash(root, "preview");
    writeFileSync(path.join(root, "package.json"), '{"changed":true}');
    expect(computeSourceHash(root, "preview")).toBe(a);
    writeFileSync(path.join(root, ".env.preview"), "VITE_X=2");
    expect(computeSourceHash(root, "preview")).not.toBe(a);
  });

  it("differs between modes whose fixture files differ", () => {
    scaffold();
    writeFileSync(path.join(root, ".env.preview-v2"), "VITE_X=3");
    expect(computeSourceHash(root, "preview")).not.toBe(computeSourceHash(root, "preview-v2"));
  });
});
```

- [ ] **Step 2: Include `tooling/` in Vitest and the tsconfigs, run the test to see it fail**

In `web/vite.config.ts` `test.include`, change to:
```ts
      include: ["src/**/*.test.{ts,tsx}", "tooling/**/*.test.ts"],
```
`web/tsconfig.node.json` stays as it is: `vite.config.ts` imports the tooling module, so it is typechecked there via the import (module `nodenext` requires the explicit `.ts` extension, which `allowImportingTsExtensions` already permits).
In `web/tsconfig.e2e.json` add `"allowImportingTsExtensions": true` to `compilerOptions` (legal because `noEmit` is set; needed because the tooling files and the Playwright configs import each other with `.ts` extensions) and add `"tooling"` to `include` (before `"e2e"`).

Run: `npm --prefix web test -- tooling/sourceHash.test.ts`
Expected: FAIL — cannot resolve `./sourceHash`.

- [ ] **Step 3: Implement `sourceHash.ts`**

Create `web/tooling/sourceHash.ts`:
```ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The source set whose contents a build depends on, for provenance stamping (audit F7): a dist
 * directory can exist yet be stale or built from another mode. The test scripts recompute this
 * hash and refuse to run against a dist whose stamp disagrees. package.json/lockfiles are
 * deliberately excluded (dependency upgrades are caught by CI's clean build, not by this stamp).
 */
export function sourceFilesFor(webRoot: string, mode: string): string[] {
  const files = [
    path.join(webRoot, "index.html"),
    path.join(webRoot, "vite.config.ts"),
    path.join(webRoot, `.env.${mode}`),
    ...walk(path.join(webRoot, "src")),
    ...walk(path.join(webRoot, "public")),
  ].filter((f) => exists(f));
  return files.sort((a, b) => path.relative(webRoot, a).localeCompare(path.relative(webRoot, b)));
}

export function computeSourceHash(webRoot: string, mode: string): string {
  const hash = createHash("sha256");
  for (const file of sourceFilesFor(webRoot, mode)) {
    hash.update(path.relative(webRoot, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export interface BuildStamp {
  mode: string;
  projectId: string;
  sourceHash: string;
  builtAt: string;
}

function walk(dir: string): string[] {
  if (!exists(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the hash tests to verify they pass**

Run: `npm --prefix web test -- tooling/sourceHash.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Emit the stamp from every build**

In `web/vite.config.ts`, import the hash helper and add a plugin:
```ts
import { computeSourceHash, type BuildStamp } from "./tooling/sourceHash.ts";

/**
 * Writes `<outDir>/safebite-build.json` so test scripts can verify which mode and which sources a
 * dist came from. Not matched by the Workbox glob (json is not in it), so never precached.
 */
function buildStamp(mode: string, projectId: string): Plugin {
  return {
    name: "safebite-build-stamp",
    apply: "build",
    generateBundle() {
      const stamp: BuildStamp = {
        mode,
        projectId,
        sourceHash: computeSourceHash(process.cwd(), mode),
        builtAt: new Date().toISOString(),
      };
      this.emitFile({ type: "asset", fileName: "safebite-build.json", source: JSON.stringify(stamp, null, 2) + "\n" });
    },
  };
}
```
Add `buildStamp(mode, firebaseEnv.VITE_FIREBASE_PROJECT_ID ?? "")` to `plugins` after `requireDeployableFirebaseEnv(...)`.

Run from `web/`: `npm run build:preview && cat dist-preview/safebite-build.json`
Expected: JSON with `"mode": "preview"`, `"projectId": "safebite-preview"`, a 64-hex `sourceHash`. Also `grep -c safebite-build.json dist-preview/sw.js` prints `0` (not precached).

- [ ] **Step 6: Implement `assertFreshDist`**

Create `web/tooling/distStamp.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeSourceHash, type BuildStamp } from "./sourceHash.ts";

/**
 * Refuses to test a dist that is missing, was built for another mode, or was built from
 * different sources than the working tree (audit F7). Called at module top level by the
 * Playwright configs, before any server starts. The message names the script to run.
 */
export function assertFreshDist(webRoot: string, outDir: string, mode: string): BuildStamp {
  const hint = `Run \`npm --prefix web run build:${mode}\` (or \`build:e2e\` for all three) and retry.`;
  const stampPath = path.join(webRoot, outDir, "safebite-build.json");
  let stamp: BuildStamp;
  try {
    stamp = JSON.parse(readFileSync(stampPath, "utf8")) as BuildStamp;
  } catch {
    throw new Error(`[safebite] ${outDir}/safebite-build.json is missing: no fresh ${mode} build to test. ${hint}`);
  }
  if (stamp.mode !== mode) {
    throw new Error(`[safebite] ${outDir} was built for mode "${stamp.mode}", expected "${mode}". ${hint}`);
  }
  const current = computeSourceHash(webRoot, mode);
  if (stamp.sourceHash !== current) {
    throw new Error(`[safebite] ${outDir} is stale: built from sources ${stamp.sourceHash.slice(0, 12)}…, working tree is ${current.slice(0, 12)}…. ${hint}`);
  }
  return stamp;
}
```

- [ ] **Step 7: Call it from the three Playwright configs**

Playwright's TypeScript loader resolves relative imports that carry an explicit `.ts` extension (the same form `vite.config.ts` already uses). In `web/playwright.preview.config.ts`, before `export default defineConfig(`:
```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertFreshDist } from "./tooling/distStamp.ts";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
assertFreshDist(webRoot, "dist-preview", "preview");
```
Update its header comment's "(built by `npm run e2e:preview` ...)" to "(built by `npm run build:preview`; this config refuses a missing or stale dist)".

In `web/playwright.boot-guard.config.ts` likewise with `assertFreshDist(webRoot, "dist-boot-guard", "boot-guard");` and the comment "(built by `npm run build:boot-guard`)".

In `web/playwright.upgrade.config.ts`:
```ts
assertFreshDist(webRoot, "dist-preview", "preview");
assertFreshDist(webRoot, "dist-preview-v2", "preview-v2");
assertFreshDist(webRoot, "dist-boot-guard", "boot-guard");
```

- [ ] **Step 8: Make the test scripts run Playwright only**

In `web/package.json` replace the three `e2e:*` script values:
```json
    "e2e:boot-guard": "playwright test -c playwright.boot-guard.config.ts",
    "e2e:preview": "playwright test -c playwright.preview.config.ts",
    "e2e:upgrade": "playwright test -c playwright.upgrade.config.ts",
```

- [ ] **Step 9: Prove the stale/missing refusals and the happy path**

From `web/`:
```bash
rm -rf dist-preview && npm run e2e:preview; echo "exit $?"
```
Expected: exits non-zero before any browser starts; output contains `dist-preview/safebite-build.json is missing` and `build:preview`.
```bash
npm run build:e2e && printf '\n' >> src/styles.css && npm run e2e:preview; echo "exit $?"; git checkout -- src/styles.css
```
Expected: non-zero, output contains `dist-preview is stale`.
```bash
npm run build:e2e && npm run e2e:boot-guard && npm run e2e:preview && npm run e2e:upgrade
```
Expected: 1 + 4 + 4 tests pass (the upgrade suite still passes unchanged at this point because the worker is still `autoUpdate`).

- [ ] **Step 10: CI and README**

In `.github/workflows/ci.yml`, replace the three steps "Compile-only bundle refuses to start in a browser", "PWA shell — …" and "Service worker upgrades — …" with:
```yaml
      - name: Build the three synthetic test bundles (preview, preview-v2, boot-guard)
        run: npm --prefix web run build:e2e

      - name: Compile-only bundle refuses to start in a browser
        run: npm --prefix web run e2e:boot-guard

      - name: PWA shell — manifest, service worker, offline reload (preview bundle)
        run: npm --prefix web run e2e:preview

      - name: Service worker upgrades and update prompt (upgrade suite)
        run: npm --prefix web run e2e:upgrade
```
Add, after the "Non-production build is rejected" step, a fixture-identity guard step:
```yaml
      - name: Synthetic build refuses an ambient VITE_ override (fixture identity)
        env:
          VITE_FIREBASE_PROJECT_ID: not-the-fixture
        run: |
          set +e
          out=$(npm --prefix web run build:preview 2>&1)
          status=$?
          set -e
          if [ "$status" -eq 0 ]; then
            echo "$out"; echo "build:preview succeeded with an ambient VITE_FIREBASE_PROJECT_ID — the fixture check is broken"; exit 1
          fi
          if ! echo "$out" | grep -q "is not hermetic"; then
            echo "$out"; echo "Build failed, but not because of the fixture check"; exit 1
          fi
          echo "Fixture identity check rejected the override as expected"
```

In `README.md` "### Tests" block, replace the three `e2e:*` lines with:
```
npm --prefix web run build:e2e        # builds the three synthetic bundles: dist-preview, dist-preview-v2, dist-boot-guard (fixtures in web/.env.preview, .env.preview-v2, .env.boot-guard)
npm --prefix web run e2e:boot-guard   # compile-only bundle with demo values refuses to start (Chromium, no emulators)
npm --prefix web run e2e:preview      # manifest, service worker, offline shell (Chromium, no emulators)
npm --prefix web run e2e:upgrade      # same-origin release upgrades and the update prompt (Chromium, no emulators)
```
and add under Guardrails:
```
- The three synthetic test bundles are built only from the committed `web/.env.<mode>` fixtures: `vite build --mode preview|preview-v2|boot-guard` refuses to run if an exported `VITE_*` variable differs from the file, and every build writes `safebite-build.json` (mode, project id, source hash) that the `e2e:*` scripts verify, so a stale or wrong-mode dist is refused with the `build:<mode>` command to run.
```

- [ ] **Step 11: Gate and commit**

Run: `npm run typecheck && npm run test:unit` (root). Expected: green; unit count = previous + 4.

```bash
git add web/tooling web/vite.config.ts web/package.json web/playwright.preview.config.ts web/playwright.boot-guard.config.ts web/playwright.upgrade.config.ts web/tsconfig.node.json web/tsconfig.e2e.json .github/workflows/ci.yml README.md
git commit -m "build(web): provenance stamp per build, fresh-dist checks in the Playwright configs, e2e scripts run tests only; CI builds once

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Precache duplicates and manifest for self-destroying builds (F6)

**Files:**
- Modify: `web/vite.config.ts`, `web/e2e-upgrade/upgrade.spec.ts`, `web/e2e-boot-guard/boot-guard.spec.ts`

**Interfaces:**
- Produces: precache manifest with unique URLs; no manifest file or `<link rel="manifest">` in a self-destroying build. No code interfaces.

- [ ] **Step 1: Write the failing artefact assertions**

In `web/e2e-upgrade/upgrade.spec.ts`, add after the existing artefact test ("the invalid build ships a self-destroying worker…"):
```ts
/** Precache entries as emitted by generateSW: `{url:"...",revision:"..."}` objects inside sw.js. */
function precacheUrls(sw: string): string[] {
  return [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
}

test("the valid worker precaches every shell file exactly once (no duplicate icon or manifest entries)", () => {
  const urls = precacheUrls(readFileSync(path.join(distDir("dist-preview"), "sw.js"), "utf8"));
  const duplicates = urls.filter((u, i) => urls.indexOf(u) !== i);
  expect(duplicates, `duplicated precache URLs: ${duplicates.join(", ")}`).toEqual([]);
  for (const required of ["index.html", "manifest.webmanifest", "favicon.svg", "pwa-192.png", "pwa-512.png", "pwa-maskable-512.png", "apple-touch-icon-180.png"]) {
    expect(urls.filter((u) => u === required), required).toHaveLength(1);
  }
});

test("the invalid build has no web app manifest, so a misconfigured artefact is not installable", () => {
  const index = readFileSync(path.join(distDir("dist-boot-guard"), "index.html"), "utf8");
  expect(index).not.toContain('rel="manifest"');
  expect(existsSync(path.join(distDir("dist-boot-guard"), "manifest.webmanifest"))).toBe(false);
  // The valid build keeps it.
  expect(readFileSync(path.join(distDir("dist-preview"), "index.html"), "utf8")).toContain('rel="manifest"');
});
```
Add `existsSync` to the `node:fs` import at the top of the file: `import { existsSync, readFileSync } from "node:fs";`.

In `web/e2e-boot-guard/boot-guard.spec.ts`, add inside the existing test after the `signin-form` assertion:
```ts
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
```

- [ ] **Step 2: Run the artefact tests to verify they fail**

From `web/`: `npm run build:e2e && npx playwright test -c playwright.upgrade.config.ts -g "exactly once|no web app manifest"`
Expected: both FAIL — duplicates `pwa-192.png, pwa-512.png, pwa-maskable-512.png, manifest.webmanifest`; the invalid `index.html` contains `rel="manifest"`.

- [ ] **Step 3: Fix the plugin options**

In `web/vite.config.ts`:
- In `pwaOptions`, add `includeManifestIcons: false,` directly under `injectRegister: null,` with the comment `// The glob below already matches the PNG icons; the plugin would otherwise add them a second time.`
- Change `globPatterns` to `["**/*.{js,css,html,svg,png}"]` with the comment `// No "webmanifest" here: the plugin adds manifest.webmanifest itself (outside the includeManifestIcons switch), so listing it too duplicated the entry (audit F6).`
- In the `VitePWA({...})` call, pass `manifest: deployable ? pwaOptions.manifest : false` alongside `selfDestroying`, with the comment `// A self-destroying build must not look installable: no manifest file, no <link rel="manifest">.`

- [ ] **Step 4: Rebuild and run the three suites**

From `web/`: `npm run build:e2e && npm run e2e:boot-guard && npm run e2e:preview && npm run e2e:upgrade`
Expected: boot-guard 1 pass (now also asserting no manifest link); preview 4 pass (manifest and icons still served and precached once); upgrade 6 pass (4 previous + 2 new).

- [ ] **Step 5: Gate and commit**

Run: `npm run typecheck && npm run test:unit`. Expected: green, counts unchanged.

```bash
git add web/vite.config.ts web/e2e-upgrade/upgrade.spec.ts web/e2e-boot-guard/boot-guard.spec.ts
git commit -m "fix(web): precache every shell file once; self-destroying builds emit no manifest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Prompt-mode service worker with a per-tab Reload banner (F5)

**Files:**
- Create: `web/src/pwa/updates.ts`, `web/src/pwa/updates.test.ts`, `web/src/pwa/UpdateBanner.tsx`, `web/src/pwa/UpdateBanner.test.tsx`
- Modify: `web/src/pwa/serviceWorker.ts`, `web/src/pwa/serviceWorker.test.ts`, `web/src/App.tsx`, `web/src/styles.css`, `web/vite.config.ts`, `web/e2e-upgrade/upgrade.spec.ts`, `README.md`

**Interfaces:**
- Produces:
  ```ts
  // web/src/pwa/updates.ts
  export type UpdateState = "idle" | "available" | "activated";
  export function subscribeToUpdates(listener: () => void): () => void;
  export function getUpdateState(): UpdateState;
  export function updateAvailable(update: () => Promise<void>): void;         // from onNeedRefresh
  export function workerActivated(reload?: () => void): void;                 // from onNeedReload, every tab
  export function applyUpdate(reload?: () => void): void;                     // Reload button
  export function resetUpdatesForTests(): void;
  // web/src/pwa/UpdateBanner.tsx
  export function UpdateBanner(): JSX.Element | null;   // testids update-banner (data-state), update-reload
  ```
- `registerServiceWorker()` keeps its signature; it now passes `onNeedRefresh`/`onNeedReload`.

- [ ] **Step 1: Write the failing store tests**

Create `web/src/pwa/updates.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyUpdate, getUpdateState, resetUpdatesForTests, subscribeToUpdates, updateAvailable, workerActivated } from "./updates";

beforeEach(() => resetUpdatesForTests());

describe("updates store", () => {
  it("starts idle and becomes available when a new worker is waiting, notifying subscribers", () => {
    const listener = vi.fn();
    subscribeToUpdates(listener);
    expect(getUpdateState()).toBe("idle");
    updateAvailable(async () => {});
    expect(getUpdateState()).toBe("available");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("Reload while available asks the waiting worker to take over and does not reload the page itself", () => {
    const update = vi.fn(async () => {});
    const reload = vi.fn();
    updateAvailable(update);
    applyUpdate(reload);
    expect(update).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads this tab when the worker activates only if this tab asked for the update", () => {
    const reload = vi.fn();
    updateAvailable(async () => {});
    applyUpdate(vi.fn());
    workerActivated(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a tab that did not ask is moved to 'activated' and keeps running (audit F5: no forced reload of other tabs)", () => {
    const listener = vi.fn();
    const reload = vi.fn();
    updateAvailable(async () => {});
    subscribeToUpdates(listener);
    workerActivated(reload);
    expect(reload).not.toHaveBeenCalled();
    expect(getUpdateState()).toBe("activated");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("Reload while activated reloads this tab", () => {
    const reload = vi.fn();
    workerActivated(vi.fn());
    applyUpdate(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Reload while idle does nothing", () => {
    const reload = vi.fn();
    applyUpdate(reload);
    expect(reload).not.toHaveBeenCalled();
  });

  it("unsubscribe stops notifications", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUpdates(listener);
    unsubscribe();
    updateAvailable(async () => {});
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- src/pwa/updates.test.ts`
Expected: FAIL — cannot resolve `./updates`.

- [ ] **Step 3: Implement the store**

Create `web/src/pwa/updates.ts`:
```ts
/**
 * Update-prompt state shared between the service-worker registration (src/pwa/serviceWorker.ts)
 * and the banner (UpdateBanner.tsx). Module-level so it exists before React renders.
 *
 * Lifecycle in `registerType: "prompt"`:
 *   idle → available   a new worker is installed and waiting (plugin `onNeedRefresh`)
 *   available → (Reload tapped) → `updateServiceWorker()` tells the waiting worker to skip waiting
 *   any → `onNeedReload` fires in EVERY open tab once the new worker controls them (audit F5
 *         reproduced that the plugin's default handler reloads them all). Only the tab that tapped
 *         Reload (`requestedHere`) reloads; the others move to `activated` and keep running their
 *         old code — safe because the app loads no lazy chunk after boot — until they tap Reload.
 * Misconfiguration recovery (src/main.tsx purge + one-shot reload) is separate and unaffected.
 */
export type UpdateState = "idle" | "available" | "activated";

type Listener = () => void;

let state: UpdateState = "idle";
let updater: (() => Promise<void>) | null = null;
let requestedHere = false;
const listeners = new Set<Listener>();

function setState(next: UpdateState): void {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeToUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUpdateState(): UpdateState {
  return state;
}

/** A new worker is waiting. `update` is the function returned by the plugin's registerSW(). */
export function updateAvailable(update: () => Promise<void>): void {
  updater = update;
  if (state === "idle") setState("available");
}

/** The new worker now controls this tab. Reload only if this tab asked for it. */
export function workerActivated(reload: () => void = () => window.location.reload()): void {
  if (requestedHere) {
    reload();
    return;
  }
  setState("activated");
}

/** The banner's Reload button. */
export function applyUpdate(reload: () => void = () => window.location.reload()): void {
  if (state === "available" && updater) {
    requestedHere = true;
    void updater();
    return;
  }
  if (state === "activated") reload();
}

export function resetUpdatesForTests(): void {
  state = "idle";
  updater = null;
  requestedHere = false;
  listeners.clear();
}
```

- [ ] **Step 4: Run the store tests**

Run: `npm --prefix web test -- src/pwa/updates.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing banner test**

Create `web/src/pwa/UpdateBanner.test.tsx`:
```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetUpdatesForTests, updateAvailable, workerActivated } from "./updates";
import { UpdateBanner } from "./UpdateBanner";

beforeEach(() => resetUpdatesForTests());

describe("UpdateBanner", () => {
  it("renders nothing while idle", () => {
    render(<UpdateBanner />);
    expect(screen.queryByTestId("update-banner")).toBeNull();
  });

  it("shows the new-version message and asks the waiting worker to take over on Reload", async () => {
    const update = vi.fn(async () => {});
    render(<UpdateBanner />);
    act(() => updateAvailable(update));
    const banner = screen.getByTestId("update-banner");
    expect(banner).toHaveAttribute("data-state", "available");
    expect(banner).toHaveTextContent("A new version of SafeBite is ready.");
    await userEvent.click(screen.getByTestId("update-reload"));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("shows the updated-in-another-tab message once the worker activated without this tab asking", () => {
    render(<UpdateBanner />);
    act(() => workerActivated(vi.fn()));
    const banner = screen.getByTestId("update-banner");
    expect(banner).toHaveAttribute("data-state", "activated");
    expect(banner).toHaveTextContent("SafeBite was updated in another tab. Reload when you are ready.");
  });
});
```

- [ ] **Step 6: Run to verify failure, then implement the banner**

Run: `npm --prefix web test -- src/pwa/UpdateBanner.test.tsx` → FAIL (module missing).

Create `web/src/pwa/UpdateBanner.tsx`:
```tsx
import { useSyncExternalStore } from "react";
import { applyUpdate, getUpdateState, subscribeToUpdates, type UpdateState } from "./updates";

const MESSAGES: Record<Exclude<UpdateState, "idle">, string> = {
  available: "A new version of SafeBite is ready.",
  activated: "SafeBite was updated in another tab. Reload when you are ready.",
};

/** Non-modal; rendered above every screen (App.tsx). Nothing reloads until Reload is tapped in this tab. */
export function UpdateBanner() {
  const state = useSyncExternalStore(subscribeToUpdates, getUpdateState, (): UpdateState => "idle");
  if (state === "idle") return null;
  return (
    <div className="banner" role="status" data-testid="update-banner" data-state={state}>
      <span>{MESSAGES[state]}</span>
      <button type="button" data-testid="update-reload" onClick={() => applyUpdate()}>
        Reload
      </button>
    </div>
  );
}
```

Add to `web/src/styles.css`:
```css
.banner { display: flex; align-items: center; justify-content: space-between; gap: var(--gap); padding: 0.6rem var(--gap); padding-top: calc(0.6rem + env(safe-area-inset-top, 0px)); background: #1f7a4d; color: #fff; }
.banner button { font-size: 0.95rem; padding: 0.4rem 0.8rem; }
```

Run: `npm --prefix web test -- src/pwa/UpdateBanner.test.tsx` → PASS, 3 tests.

- [ ] **Step 7: Wire the registration and update its test**

Replace `registerServiceWorker` in `web/src/pwa/serviceWorker.ts` (add `import { updateAvailable, workerActivated } from "./updates";` at the top):
```ts
/**
 * Registers the generated service worker in prompt mode. Only src/main.tsx calls this, and only
 * after startupProblems() returned nothing, so a misconfigured bundle is never precached.
 * A waiting worker surfaces as the update banner; `onNeedReload` fires in every tab once the new
 * worker controls it, and the store decides per tab whether to reload (see updates.ts).
 * Outside a built bundle there is no worker to register.
 */
export function registerServiceWorker(): void {
  if (!__SAFEBITE_BUILD__ || !("serviceWorker" in navigator)) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh: () => updateAvailable(() => update()),
    onNeedReload: () => workerActivated(),
  });
}
```

In `web/src/pwa/serviceWorker.test.ts`, replace the second `registerServiceWorker` test with:
```ts
  it("registers once in prompt mode and routes the plugin callbacks into the update store", async () => {
    vi.stubGlobal("__SAFEBITE_BUILD__", true);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
    const updateServiceWorker = vi.fn(async () => {});
    registerSWMock.mockReturnValue(updateServiceWorker);
    registerServiceWorker();
    expect(registerSWMock).toHaveBeenCalledTimes(1);
    const options = registerSWMock.mock.calls[0]![0] as { immediate: boolean; onNeedRefresh: () => void; onNeedReload: () => void };
    expect(options.immediate).toBe(true);

    options.onNeedRefresh();
    expect(getUpdateState()).toBe("available");
    applyUpdate(vi.fn());
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);

    // Another tab's activation, in a tab that did not ask: no reload, state becomes "activated".
    resetUpdatesForTests();
    options.onNeedRefresh();
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });
    options.onNeedReload();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(getUpdateState()).toBe("activated");
  });
```
Add `import { applyUpdate, getUpdateState, resetUpdatesForTests } from "./updates";` and `resetUpdatesForTests()` inside the file's `afterEach`. If `vi.stubGlobal("location", …)` is rejected by jsdom in this Vitest version, instead spy with `const reloadSpy = vi.spyOn(window.location, "reload").mockImplementation(() => {})` — jsdom 30 allows this when `location.reload` is configurable; keep whichever works and note it in the commit body.

Run: `npm --prefix web test -- src/pwa` → PASS (updates 7, banner 3, serviceWorker 9).

- [ ] **Step 8: Render the banner and switch the worker to prompt mode**

`web/src/App.tsx`: add `import { UpdateBanner } from "./pwa/UpdateBanner";` and render it as the first child of `<BrowserRouter>`:
```tsx
    <BrowserRouter>
      <UpdateBanner />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
```

`web/vite.config.ts`: change `registerType: "autoUpdate"` to `registerType: "prompt"` and replace the comment above `pwaOptions`' `registerType` with: `// prompt: a new worker waits until a tab taps Reload (src/pwa/updates.ts). autoUpdate reloaded every tab unannounced, discarding typed input (Plan 2a final review; audit F5).`

- [ ] **Step 9: Rewrite the valid→valid upgrade test and add the two-tab test**

In `web/e2e-upgrade/upgrade.spec.ts`, replace the test "a valid update replaces the installed worker and its cached release" with:
```ts
test("a valid update waits for the user: banner shown, typed input kept, reload only on tap", async ({ page, context }) => {
  await blockExternalNetwork(context);
  const v1Assets = await assetsOf(page, "v1");
  const v2Assets = await assetsOf(page, "v2");
  const v1Index = v1Assets.find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  const v2Index = v2Assets.find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  expect(v2Index).not.toBe(v1Index);

  await serve(page, "v1");
  await installValidRelease(page);
  expect(await entryScript(page)).toBe(`/assets/${v1Index}`);
  await page.getByTestId("signin-email").fill("draft@example.test");

  await serve(page, "v2");
  await triggerUpdateCheck(page);

  // Prompt mode: the new worker waits; the banner appears; nothing reloads on its own.
  const banner = page.getByTestId("update-banner");
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toHaveAttribute("data-state", "available");
  await page.waitForTimeout(2_000); // an autoUpdate-style reload would have happened by now
  expect(await entryScript(page)).toBe(`/assets/${v1Index}`);
  await expect(page.getByTestId("signin-email")).toHaveValue("draft@example.test");

  await page.getByTestId("update-reload").click();
  await expect.poll(() => entryScript(page), { timeout: 20_000 }).toBe(`/assets/${v2Index}`);
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("update-banner")).toHaveCount(0);
  await expect.poll(() => registrations(page)).toBe(1);
  await expect.poll(() => controlled(page)).toBe(true);
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).toContain(`/assets/${v2Index}`);
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).not.toContain(`/assets/${v1Index}`);
});

test("Reload in one tab never reloads another tab: it keeps its draft and gets its own banner", async ({ page, context }) => {
  await blockExternalNetwork(context);
  const v1Index = (await assetsOf(page, "v1")).find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  const v2Index = (await assetsOf(page, "v2")).find((f) => f.startsWith("index-") && f.endsWith(".js"))!;

  await serve(page, "v1");
  await installValidRelease(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByTestId("signin-form")).toBeVisible();
  await other.getByTestId("signin-email").fill("unsaved restaurant edit");

  await serve(page, "v2");
  await triggerUpdateCheck(page);
  await expect(page.getByTestId("update-banner")).toHaveAttribute("data-state", "available", { timeout: 20_000 });
  await expect(other.getByTestId("update-banner")).toHaveAttribute("data-state", "available", { timeout: 20_000 });

  await page.getByTestId("update-reload").click();
  await expect.poll(() => entryScript(page), { timeout: 20_000 }).toBe(`/assets/${v2Index}`);

  // The other tab: same worker now controls it, but it did not ask — it stays on v1 with its draft.
  await expect(other.getByTestId("update-banner")).toHaveAttribute("data-state", "activated", { timeout: 20_000 });
  expect(await entryScript(other)).toBe(`/assets/${v1Index}`);
  await expect(other.getByTestId("signin-email")).toHaveValue("unsaved restaurant edit");
  await expect.poll(() => controlled(other)).toBe(true);

  await other.getByTestId("update-reload").click();
  await expect.poll(() => entryScript(other), { timeout: 20_000 }).toBe(`/assets/${v2Index}`);
  await other.close();
});
```
Rename the purge test to `"a misconfigured page reached under a still-controlling worker purges, sets the one-shot reload flag and ends uncontrolled"` and replace its comment line `// The reload was driven by the page's own purge, not a worker-side update: the flag it sets is` … with `// The one-shot flag proves the page's own controlled-reload branch ran (this test does not count navigations; the unit test for alreadyReloadedForPurge covers the one-shot guard).`

- [ ] **Step 10: Run the upgrade suite and the other two**

From `web/`: `npm run build:e2e && npm run e2e:upgrade && npm run e2e:preview && npm run e2e:boot-guard`
Expected: upgrade 7 pass (artefact ×3, invalid ×2, valid→valid prompt, two-tab); preview 4; boot-guard 1. If the two-tab test's `other` banner never reaches `available`, check `installValidRelease` waited for `navigator.serviceWorker.ready` in **both** pages (add `await other.evaluate(() => navigator.serviceWorker.ready)` after `other.goto`).

- [ ] **Step 11: README and gate, commit**

README Guardrails: replace "A misconfigured built bundle shows a plain…" bullet's last sentence group with an additional bullet:
```
- Updates are prompted, never forced: a new release shows a "new version ready" banner and only the tab whose Reload is tapped reloads; other open tabs get an "updated in another tab" banner and keep their typed input until they reload (`e2e:upgrade` proves both).
```

Run: `npm run typecheck && npm run test:unit`. Expected: green; unit count = previous + 10 (7 store + 3 banner; the serviceWorker test is rewritten, not added).

```bash
git add web/src/pwa web/src/App.tsx web/src/styles.css web/vite.config.ts web/e2e-upgrade/upgrade.spec.ts README.md
git commit -m "feat(web): prompt-mode service worker with a per-tab Reload banner; two-tab upgrade test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Records domain — types, calendar dates, evidence, validation (pure)

**Files:**
- Create: `web/src/records/types.ts`, `web/src/records/dates.ts`, `web/src/records/dates.test.ts`, `web/src/records/evidence.ts`, `web/src/records/evidence.test.ts`, `web/src/records/validation.ts`, `web/src/records/validation.test.ts`

**Interfaces:**
- Produces (used by every later task):
  ```ts
  // types.ts
  export const CLAIM_KINDS: readonly ["dedicatedKitchen","separateFryer","trainedStaff","gfMenu","preparationPractice","accreditation"];
  export type ClaimKind; export const CLAIM_KIND_LABELS: Record<ClaimKind, string>;
  export const CLAIM_VALUES: readonly ["yes","no","partial"]; export type ClaimValue; export const CLAIM_VALUE_LABELS;
  export const SOURCE_TYPES: readonly ["restaurantStatement","accreditingBody","ownVisit","thirdParty"]; export type SourceType; export const SOURCE_TYPE_LABELS;
  export type CalendarDate = string; // "YYYY-MM-DD", a UTC calendar day
  export interface Restaurant { id; name; address; phone?; website?; lat?; lng?; googlePlaceId?; createdBy; createdAt: Date; updatedAt: Date; version: number; deleting: boolean }
  export interface RestaurantInput { name: string; address: string; phone?: string; website?: string }
  export interface ClaimSource { type: SourceType; label: string; url?: string }
  export interface Claim { id; kind; value; detail; source: ClaimSource; checkedAt: CalendarDate; expiresAt?: CalendarDate; authorUid; authorName; createdAt: Date }
  export interface ClaimInput { kind; value; detail; source: ClaimSource; checkedAt: CalendarDate; expiresAt?: CalendarDate }
  export interface Author { uid: string; displayName: string }
  // dates.ts
  export function isCalendarDate(v: string): v is CalendarDate;
  export function toCalendarDate(ts: Timestamp): CalendarDate;          // UTC getters
  export function fromCalendarDate(d: CalendarDate): Timestamp;         // 00:00:00 UTC
  export function localToday(now?: Date): CalendarDate;                 // device-local calendar day
  export function addMonths(d: CalendarDate, months: number): CalendarDate; // end-of-month clamp
  export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number;
  export function formatCalendarDate(d: CalendarDate): string;          // "21 September 2026"
  export function msUntilNextLocalMidnight(now: Date): number;
  // evidence.ts
  export const DEFAULT_EVIDENCE_MONTHS = 12;
  export type EvidenceStatus = "current" | "needsRechecking";
  export function evidenceStatus(claim: Pick<Claim,"checkedAt"|"expiresAt">, today: CalendarDate): EvidenceStatus;
  export function sortClaims(claims: readonly Claim[]): Claim[];        // checkedAt desc, createdAt desc, id asc
  export type KindEvidence = { kind; state: "unknown" } | { kind; state: EvidenceStatus; latest: Claim; history: Claim[] } | { kind; state: "conflicting"; tied: Claim[]; history: Claim[] };
  export function summariseEvidence(claims: readonly Claim[], today: CalendarDate): KindEvidence[]; // CLAIM_KINDS order
  // validation.ts
  export const LIMITS: { name: 120; address: 300; phone: 40; website: 300; detail: 1000; sourceLabel: 200; sourceUrl: 500; googlePlaceId: 200 };
  export type FieldErrors<F extends string> = Partial<Record<F, string>>;
  export type RestaurantField = "name"|"address"|"phone"|"website";
  export type ClaimField = "kind"|"value"|"detail"|"sourceType"|"sourceLabel"|"sourceUrl"|"checkedAt"|"expiresAt";
  export function isHttpUrl(v: string): boolean;
  export interface RawRestaurantForm { name: string; address: string; phone: string; website: string }
  export function normaliseRestaurantInput(raw: RawRestaurantForm): RestaurantInput;
  export function validateRestaurantInput(input: RestaurantInput): FieldErrors<RestaurantField>;
  export function validateClaimInput(input: ClaimInput, today: CalendarDate): FieldErrors<ClaimField>;
  ```

- [ ] **Step 1: Create `types.ts` (no test of its own; every other test imports it)**

Create `web/src/records/types.ts`:
```ts
/**
 * Restaurant records and evidence claims (spec §3.5). The constant lists here must match the
 * literals in firestore.rules — Task 7's emulator tests prove parity, rulesParity.test.ts trips
 * on drift. Never add a numerical score.
 */
export const CLAIM_KINDS = ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const CLAIM_KIND_LABELS: Record<ClaimKind, string> = {
  dedicatedKitchen: "Dedicated gluten-free kitchen",
  separateFryer: "Separate fryer",
  trainedStaff: "Trained staff",
  gfMenu: "Gluten-free menu",
  preparationPractice: "Preparation practices",
  accreditation: "Accreditation",
};

export const CLAIM_VALUES = ["yes", "no", "partial"] as const;
export type ClaimValue = (typeof CLAIM_VALUES)[number];
export const CLAIM_VALUE_LABELS: Record<ClaimValue, string> = { yes: "Yes", no: "No", partial: "Partly" };

export const SOURCE_TYPES = ["restaurantStatement", "accreditingBody", "ownVisit", "thirdParty"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  restaurantStatement: "The restaurant told us",
  accreditingBody: "Accrediting body",
  ownVisit: "Our own visit",
  thirdParty: "Third party",
};

/** A UTC calendar day, "YYYY-MM-DD". Stored as a Firestore timestamp at 00:00:00 UTC (dates.ts). */
export type CalendarDate = string;

/** Read model of households/{hid}/restaurants/{rid}. */
export interface Restaurant {
  id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  deleting: boolean;
}

/** What the restaurant form edits. Coordinates and place id are Plan 3's; the form never touches them. */
export interface RestaurantInput {
  name: string;
  address: string;
  phone?: string;
  website?: string;
}

export interface ClaimSource {
  type: SourceType;
  label: string;
  url?: string;
}

/** Read model of households/{hid}/restaurants/{rid}/claims/{cid}. Immutable once written. */
export interface Claim {
  id: string;
  kind: ClaimKind;
  value: ClaimValue;
  detail: string;
  source: ClaimSource;
  checkedAt: CalendarDate;
  expiresAt?: CalendarDate;
  authorUid: string;
  authorName: string;
  createdAt: Date;
}

export interface ClaimInput {
  kind: ClaimKind;
  value: ClaimValue;
  detail: string;
  source: ClaimSource;
  checkedAt: CalendarDate;
  expiresAt?: CalendarDate;
}

export interface Author {
  uid: string;
  displayName: string;
}
```

- [ ] **Step 2: Write the failing date tests**

Create `web/src/records/dates.test.ts`:
```ts
// The whole file runs in a far-from-UTC zone so any accidental local-time arithmetic shows up.
// Node re-reads TZ when process.env.TZ is assigned at runtime.
process.env.TZ = "Pacific/Auckland";

import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  addMonths,
  compareCalendarDates,
  formatCalendarDate,
  fromCalendarDate,
  isCalendarDate,
  localToday,
  msUntilNextLocalMidnight,
  toCalendarDate,
} from "./dates";

describe("test zone", () => {
  it("really runs in Pacific/Auckland (UTC+12/+13)", () => {
    expect([-720, -780]).toContain(new Date(2026, 0, 15).getTimezoneOffset());
  });
});

describe("isCalendarDate", () => {
  it("accepts real YYYY-MM-DD dates and rejects malformed or impossible ones", () => {
    expect(isCalendarDate("2026-09-21")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("21/09/2026")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});

describe("fromCalendarDate / toCalendarDate", () => {
  it("round-trips through a UTC-midnight timestamp regardless of the device zone", () => {
    const ts = fromCalendarDate("2026-09-21");
    expect(ts.toDate().toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(toCalendarDate(ts)).toBe("2026-09-21");
  });

  it("reads a Rome-midnight instant as the UTC calendar day it falls on (audit F3 reproduction)", () => {
    // 2026-09-21T00:00 in Rome (CEST) is 2026-09-20T22:00Z: that timestamp is NOT a canonical date;
    // the reader must report the UTC day, and the rules refuse to store such a value at all.
    const romeMidnight = Timestamp.fromDate(new Date("2026-09-20T22:00:00.000Z"));
    expect(toCalendarDate(romeMidnight)).toBe("2026-09-20");
  });
});

describe("localToday", () => {
  it("uses the device's local calendar day, not UTC", () => {
    // 00:30 local in Auckland on 21 Sept is still 20 Sept in UTC.
    expect(localToday(new Date(2026, 8, 21, 0, 30))).toBe("2026-09-21");
    expect(new Date(2026, 8, 21, 0, 30).toISOString().slice(0, 10)).toBe("2026-09-20");
  });
});

describe("addMonths", () => {
  it("adds twelve months keeping the day", () => {
    expect(addMonths("2025-09-21", 12)).toBe("2026-09-21");
  });
  it("clamps to the last day when the target month is shorter", () => {
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-08-31", 1)).toBe("2026-09-30");
  });
  it("carries across a year boundary", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("compareCalendarDates", () => {
  it("orders lexicographically, which is chronological for zero-padded dates", () => {
    expect(compareCalendarDates("2026-09-21", "2026-10-01")).toBeLessThan(0);
    expect(compareCalendarDates("2026-09-21", "2026-09-21")).toBe(0);
    expect(compareCalendarDates("2027-01-01", "2026-12-31")).toBeGreaterThan(0);
  });
});

describe("formatCalendarDate", () => {
  it("prints the UTC calendar date in British long form, independent of the device zone", () => {
    expect(formatCalendarDate("2026-09-21")).toBe("21 September 2026");
    expect(formatCalendarDate("2026-03-01")).toBe("1 March 2026");
  });
});

describe("msUntilNextLocalMidnight", () => {
  it("counts to the next local 00:00", () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 21, 23, 59, 0))).toBe(60_000);
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 21, 0, 0, 0))).toBe(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement `dates.ts`**

Run: `npm --prefix web test -- src/records/dates.test.ts` → FAIL (module missing).

Create `web/src/records/dates.ts`:
```ts
import { Timestamp } from "firebase/firestore";
import type { CalendarDate } from "./types";

/**
 * Calendar-date contract (spec §3.5, audit F3): checkedAt/expiresAt are timestamps at 00:00:00 UTC
 * and are read, compared and displayed as UTC calendar days only. Nothing here uses local time
 * except `localToday`, which is exactly the one place the device's own calendar matters.
 */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parts(date: CalendarDate): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y!, m!, d!];
}

function fromParts(y: number, m: number, d: number): CalendarDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isCalendarDate(value: string): value is CalendarDate {
  if (!CALENDAR_DATE.test(value)) return false;
  const [y, m, d] = parts(value);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function toCalendarDate(ts: Timestamp): CalendarDate {
  const date = ts.toDate();
  return fromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function fromCalendarDate(date: CalendarDate): Timestamp {
  const [y, m, d] = parts(date);
  return Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d)));
}

/** The device's local calendar day — what the user means by "today". */
export function localToday(now: Date = new Date()): CalendarDate {
  return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Same day-of-month `months` later; a month without that day yields its last day (29 Feb → 28 Feb). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return fromParts(ny, nm, Math.min(d, lastDay));
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

export function formatCalendarDate(date: CalendarDate): string {
  const [y, m, d] = parts(date);
  return FORMAT.format(new Date(Date.UTC(y, m - 1, d)));
}

export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
```

Run: `npm --prefix web test -- src/records/dates.test.ts` → PASS, 11 tests. If the "test zone" assertion fails, the runtime did not honour `process.env.TZ`; then run Vitest with `TZ=Pacific/Auckland` from the script (`"test": "TZ=Pacific/Auckland vitest run"`) and change the first line of the test to read the offset only — record which you did in the commit body.

- [ ] **Step 4: Write the failing evidence tests**

Create `web/src/records/evidence.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { evidenceStatus, sortClaims, summariseEvidence } from "./evidence";
import type { Claim } from "./types";

function claim(over: Partial<Claim> & Pick<Claim, "id">): Claim {
  return {
    kind: "separateFryer",
    value: "yes",
    detail: "",
    source: { type: "restaurantStatement", label: "Phone call" },
    checkedAt: "2026-09-21",
    authorUid: "ava-uid",
    authorName: "Ava",
    createdAt: new Date("2026-09-21T10:00:00Z"),
    ...over,
  };
}

describe("evidenceStatus — default 12-month anniversary", () => {
  const c = { checkedAt: "2025-09-21" };
  it("is current the day before the anniversary", () => expect(evidenceStatus(c, "2026-09-20")).toBe("current"));
  it("needs rechecking on the anniversary day", () => expect(evidenceStatus(c, "2026-09-21")).toBe("needsRechecking"));
  it("needs rechecking after the anniversary", () => expect(evidenceStatus(c, "2026-09-22")).toBe("needsRechecking"));
  it("clamps a leap-day anniversary to 28 February", () => {
    expect(evidenceStatus({ checkedAt: "2028-02-29" }, "2029-02-27")).toBe("current");
    expect(evidenceStatus({ checkedAt: "2028-02-29" }, "2029-02-28")).toBe("needsRechecking");
  });
});

describe("evidenceStatus — explicit expiresAt", () => {
  const c = { checkedAt: "2026-01-10", expiresAt: "2026-09-30" };
  it("is current on the expiry day itself", () => expect(evidenceStatus(c, "2026-09-30")).toBe("current"));
  it("needs rechecking the day after expiry", () => expect(evidenceStatus(c, "2026-10-01")).toBe("needsRechecking"));
  it("takes precedence over the anniversary in both directions", () => {
    expect(evidenceStatus({ checkedAt: "2020-01-01", expiresAt: "2099-01-01" }, "2026-09-21")).toBe("current");
    expect(evidenceStatus({ checkedAt: "2026-09-01", expiresAt: "2026-09-10" }, "2026-09-21")).toBe("needsRechecking");
  });
});

describe("sortClaims", () => {
  it("orders by checkedAt desc, then createdAt desc, then id asc", () => {
    const sorted = sortClaims([
      claim({ id: "b", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T09:00:00Z") }),
      claim({ id: "a", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T09:00:00Z") }),
      claim({ id: "c", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T12:00:00Z") }),
      claim({ id: "d", checkedAt: "2026-09-15" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["d", "c", "a", "b"]);
  });
});

describe("summariseEvidence", () => {
  const today = "2026-09-21";

  it("returns one entry per kind in CLAIM_KINDS order, unknown when there is no claim", () => {
    const summary = summariseEvidence([], today);
    expect(summary.map((s) => s.kind)).toEqual(["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"]);
    expect(summary.every((s) => s.state === "unknown")).toBe(true);
  });

  it("the newest claim is current and older ones are history", () => {
    const summary = summariseEvidence([claim({ id: "old", checkedAt: "2025-01-01", value: "no" }), claim({ id: "new", checkedAt: "2026-09-01", value: "yes" })], today);
    const fryer = summary.find((s) => s.kind === "separateFryer")!;
    expect(fryer.state).toBe("current");
    if (fryer.state === "current") {
      expect(fryer.latest.id).toBe("new");
      expect(fryer.history.map((c) => c.id)).toEqual(["old"]);
    }
  });

  it("an expired newest claim is needsRechecking, not hidden", () => {
    const summary = summariseEvidence([claim({ id: "stale", checkedAt: "2025-06-01" })], today);
    expect(summary.find((s) => s.kind === "separateFryer")!.state).toBe("needsRechecking");
  });

  it("same-day claims that disagree are conflicting, with equal prominence", () => {
    const summary = summariseEvidence(
      [
        claim({ id: "yes", checkedAt: "2026-09-01", value: "yes", source: { type: "restaurantStatement", label: "Waiter" } }),
        claim({ id: "no", checkedAt: "2026-09-01", value: "no", source: { type: "ownVisit", label: "Saw shared fryer" } }),
        claim({ id: "older", checkedAt: "2026-01-01", value: "yes" }),
      ],
      today,
    );
    const fryer = summary.find((s) => s.kind === "separateFryer")!;
    expect(fryer.state).toBe("conflicting");
    if (fryer.state === "conflicting") {
      expect(fryer.tied.map((c) => c.id).sort()).toEqual(["no", "yes"]);
      expect(fryer.history.map((c) => c.id)).toEqual(["older"]);
    }
  });

  it("same-day claims that agree are simply current with the later-created one as latest", () => {
    const summary = summariseEvidence(
      [
        claim({ id: "first", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T09:00:00Z") }),
        claim({ id: "second", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T10:00:00Z") }),
      ],
      today,
    );
    const fryer = summary.find((s) => s.kind === "separateFryer")!;
    expect(fryer.state).toBe("current");
    if (fryer.state === "current") expect(fryer.latest.id).toBe("second");
  });
});
```

- [ ] **Step 5: Run to verify failure, then implement `evidence.ts`**

Create `web/src/records/evidence.ts`:
```ts
import { addMonths, compareCalendarDates } from "./dates";
import { CLAIM_KINDS, type CalendarDate, type Claim, type ClaimKind } from "./types";

/** Owner ruling 2026-09-21: a claim without expiresAt needs rechecking 12 months after checkedAt. */
export const DEFAULT_EVIDENCE_MONTHS = 12;

export type EvidenceStatus = "current" | "needsRechecking";

/**
 * With an explicit expiry the claim is current through the expiry day and needs rechecking from
 * the day after. Without one, it needs rechecking on and after the 12-month anniversary (a
 * missing 29 February anniversary falls on 28 February — see addMonths). Never stored.
 */
export function evidenceStatus(claim: Pick<Claim, "checkedAt" | "expiresAt">, today: CalendarDate): EvidenceStatus {
  if (claim.expiresAt !== undefined) {
    return compareCalendarDates(today, claim.expiresAt) > 0 ? "needsRechecking" : "current";
  }
  const anniversary = addMonths(claim.checkedAt, DEFAULT_EVIDENCE_MONTHS);
  return compareCalendarDates(today, anniversary) >= 0 ? "needsRechecking" : "current";
}

/** Newest checked first; same day → later created first; then id, so the order is deterministic. */
export function sortClaims(claims: readonly Claim[]): Claim[] {
  return [...claims].sort(
    (a, b) => compareCalendarDates(b.checkedAt, a.checkedAt) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
  );
}

export type KindEvidence =
  | { kind: ClaimKind; state: "unknown" }
  | { kind: ClaimKind; state: EvidenceStatus; latest: Claim; history: Claim[] }
  | { kind: ClaimKind; state: "conflicting"; tied: Claim[]; history: Claim[] };

/**
 * One entry per kind. If the newest checked day holds claims that disagree on `value`, the kind
 * is "conflicting" and every tied claim is shown with equal prominence — an incidental
 * tie-break must never pick the reassuring answer (audit F3).
 */
export function summariseEvidence(claims: readonly Claim[], today: CalendarDate): KindEvidence[] {
  return CLAIM_KINDS.map((kind): KindEvidence => {
    const ofKind = sortClaims(claims.filter((c) => c.kind === kind));
    if (ofKind.length === 0) return { kind, state: "unknown" };
    const newestDay = ofKind[0]!.checkedAt;
    const tied = ofKind.filter((c) => c.checkedAt === newestDay);
    const rest = ofKind.slice(tied.length);
    if (tied.length > 1 && new Set(tied.map((c) => c.value)).size > 1) {
      return { kind, state: "conflicting", tied, history: rest };
    }
    const [latest, ...history] = ofKind;
    return { kind, state: evidenceStatus(latest!, today), latest: latest!, history };
  });
}
```

Run: `npm --prefix web test -- src/records/evidence.test.ts` → PASS, 13 tests.

- [ ] **Step 6: Write the failing validation tests**

Create `web/src/records/validation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { ClaimInput } from "./types";
import { LIMITS, isHttpUrl, normaliseRestaurantInput, validateClaimInput, validateRestaurantInput } from "./validation";

describe("isHttpUrl", () => {
  it("accepts http(s) URLs and rejects everything else", () => {
    expect(isHttpUrl("https://coeliac.org.uk/venues/1")).toBe(true);
    expect(isHttpUrl("http://example.test")).toBe(true);
    expect(isHttpUrl("ftp://example.test")).toBe(false);
    expect(isHttpUrl("example.test")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("normaliseRestaurantInput", () => {
  it("trims and drops blank optionals", () => {
    expect(normaliseRestaurantInput({ name: "  Da Marco ", address: " Via Roma 1 ", phone: "  ", website: "" })).toEqual({ name: "Da Marco", address: "Via Roma 1" });
    expect(normaliseRestaurantInput({ name: "A", address: "B", phone: " +39 1 ", website: " https://x.test " })).toEqual({ name: "A", address: "B", phone: "+39 1", website: "https://x.test" });
  });
});

describe("validateRestaurantInput", () => {
  it("passes a minimal valid input", () => {
    expect(validateRestaurantInput({ name: "Da Marco", address: "Via Roma 1, Rome" })).toEqual({});
  });
  it("requires non-blank name and address", () => {
    expect(validateRestaurantInput({ name: "   ", address: "" })).toEqual({ name: "Enter the restaurant's name.", address: "Enter the address." });
  });
  it("enforces the length limits", () => {
    const errors = validateRestaurantInput({ name: "x".repeat(LIMITS.name + 1), address: "y".repeat(LIMITS.address + 1), phone: "1".repeat(LIMITS.phone + 1) });
    expect(errors.name).toContain(String(LIMITS.name));
    expect(errors.address).toContain(String(LIMITS.address));
    expect(errors.phone).toContain(String(LIMITS.phone));
  });
  it("requires a full http(s) website when given", () => {
    expect(validateRestaurantInput({ name: "A", address: "B", website: "damarco.it" }).website).toBe("Enter a full web address starting with http:// or https://.");
    expect(validateRestaurantInput({ name: "A", address: "B", website: "https://damarco.it" })).toEqual({});
  });
});

describe("validateClaimInput", () => {
  const today = "2026-09-21";
  const base: ClaimInput = {
    kind: "separateFryer",
    value: "yes",
    detail: "Dedicated fryer for chips, confirmed by the manager.",
    source: { type: "restaurantStatement", label: "Phone call with the manager" },
    checkedAt: "2026-09-20",
  };

  it("passes a valid statement claim", () => expect(validateClaimInput(base, today)).toEqual({}));
  it("accepts today as the checked date and refuses tomorrow", () => {
    expect(validateClaimInput({ ...base, checkedAt: today }, today)).toEqual({});
    expect(validateClaimInput({ ...base, checkedAt: "2026-09-22" }, today).checkedAt).toBe("The checked date cannot be in the future.");
  });
  it("refuses a malformed checked date", () => {
    expect(validateClaimInput({ ...base, checkedAt: "21/09/2026" }, today).checkedAt).toBe("Enter the date you checked.");
  });
  it("requires the expiry date to follow the checked date", () => {
    expect(validateClaimInput({ ...base, expiresAt: "2026-09-20" }, today).expiresAt).toBe("The expiry date must be after the checked date.");
    expect(validateClaimInput({ ...base, expiresAt: "2027-09-20" }, today)).toEqual({});
  });
  it("URL policy: an accrediting body needs a link; the link must be http(s); the limit applies", () => {
    expect(validateClaimInput({ ...base, source: { type: "accreditingBody", label: "Coeliac UK" } }, today).sourceUrl).toBe("An accrediting body needs a link to its listing.");
    expect(validateClaimInput({ ...base, source: { type: "accreditingBody", label: "Coeliac UK", url: "coeliac.org.uk" } }, today).sourceUrl).toBe("Enter a full web address starting with http:// or https://.");
    expect(validateClaimInput({ ...base, source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/" + "a".repeat(LIMITS.sourceUrl) } }, today).sourceUrl).toContain(String(LIMITS.sourceUrl));
    expect(validateClaimInput({ ...base, source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/venues/1" } }, today)).toEqual({});
  });
  it("URL policy: accreditation must come from an accrediting body", () => {
    expect(validateClaimInput({ ...base, kind: "accreditation", source: { type: "thirdParty", label: "Blog", url: "https://blog.test" } }, today).sourceType).toBe("Accreditation must come from the accrediting body.");
    expect(validateClaimInput({ ...base, kind: "accreditation", source: { type: "accreditingBody", label: "AIC", url: "https://celiachia.it/x" } }, today)).toEqual({});
  });
  it("requires a non-blank source label and caps detail", () => {
    expect(validateClaimInput({ ...base, source: { type: "ownVisit", label: "  " } }, today).sourceLabel).toBe("Say where this information came from.");
    expect(validateClaimInput({ ...base, detail: "d".repeat(LIMITS.detail + 1) }, today).detail).toContain(String(LIMITS.detail));
    expect(validateClaimInput({ ...base, detail: "" }, today)).toEqual({});
  });
  it("rejects unknown kind, value and source type (defensive: the UI uses selects)", () => {
    const errors = validateClaimInput({ ...base, kind: "score" as never, value: "maybe" as never, source: { type: "rumour" as never, label: "x" } }, today);
    expect(errors.kind).toBeDefined();
    expect(errors.value).toBeDefined();
    expect(errors.sourceType).toBeDefined();
  });
});
```

- [ ] **Step 7: Run to verify failure, then implement `validation.ts`**

Create `web/src/records/validation.ts`:
```ts
import { compareCalendarDates, isCalendarDate } from "./dates";
import { CLAIM_KINDS, CLAIM_VALUES, SOURCE_TYPES, type CalendarDate, type ClaimInput, type RestaurantInput } from "./types";

/** Identical to the limits in firestore.rules (validRestaurant / validClaim / validSource). */
export const LIMITS = { name: 120, address: 300, phone: 40, website: 300, detail: 1000, sourceLabel: 200, sourceUrl: 500, googlePlaceId: 200 } as const;

export type FieldErrors<F extends string> = Partial<Record<F, string>>;
export type RestaurantField = "name" | "address" | "phone" | "website";
export type ClaimField = "kind" | "value" | "detail" | "sourceType" | "sourceLabel" | "sourceUrl" | "checkedAt" | "expiresAt";

const URL_MESSAGE = "Enter a full web address starting with http:// or https://.";

/** Stricter than the rules' `https?://.+` (a bare "http://" fails here); the rules are the floor. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface RawRestaurantForm {
  name: string;
  address: string;
  phone: string;
  website: string;
}

/** Form strings → write input: trimmed, blank optionals dropped (the rules refuse empty optionals). */
export function normaliseRestaurantInput(raw: RawRestaurantForm): RestaurantInput {
  const input: RestaurantInput = { name: raw.name.trim(), address: raw.address.trim() };
  const phone = raw.phone.trim();
  if (phone !== "") input.phone = phone;
  const website = raw.website.trim();
  if (website !== "") input.website = website;
  return input;
}

function tooLong(limit: number): string {
  return `Keep this to ${limit} characters.`;
}

export function validateRestaurantInput(input: RestaurantInput): FieldErrors<RestaurantField> {
  const errors: FieldErrors<RestaurantField> = {};
  if (input.name.trim() === "") errors.name = "Enter the restaurant's name.";
  else if (input.name.length > LIMITS.name) errors.name = tooLong(LIMITS.name);
  if (input.address.trim() === "") errors.address = "Enter the address.";
  else if (input.address.length > LIMITS.address) errors.address = tooLong(LIMITS.address);
  if (input.phone !== undefined && input.phone.length > LIMITS.phone) errors.phone = tooLong(LIMITS.phone);
  if (input.website !== undefined) {
    if (!isHttpUrl(input.website)) errors.website = URL_MESSAGE;
    else if (input.website.length > LIMITS.website) errors.website = tooLong(LIMITS.website);
  }
  return errors;
}

export function validateClaimInput(input: ClaimInput, today: CalendarDate): FieldErrors<ClaimField> {
  const errors: FieldErrors<ClaimField> = {};
  if (!(CLAIM_KINDS as readonly string[]).includes(input.kind)) errors.kind = "Choose what this evidence is about.";
  if (!(CLAIM_VALUES as readonly string[]).includes(input.value)) errors.value = "Choose yes, no or partly.";
  if (input.detail.length > LIMITS.detail) errors.detail = tooLong(LIMITS.detail);

  const { source } = input;
  if (!(SOURCE_TYPES as readonly string[]).includes(source.type)) errors.sourceType = "Choose where this information came from.";
  else if (input.kind === "accreditation" && source.type !== "accreditingBody") errors.sourceType = "Accreditation must come from the accrediting body.";
  if (source.label.trim() === "") errors.sourceLabel = "Say where this information came from.";
  else if (source.label.length > LIMITS.sourceLabel) errors.sourceLabel = tooLong(LIMITS.sourceLabel);
  if (source.type === "accreditingBody" && (source.url === undefined || source.url.trim() === "")) {
    errors.sourceUrl = "An accrediting body needs a link to its listing.";
  } else if (source.url !== undefined) {
    if (!isHttpUrl(source.url)) errors.sourceUrl = URL_MESSAGE;
    else if (source.url.length > LIMITS.sourceUrl) errors.sourceUrl = tooLong(LIMITS.sourceUrl);
  }

  if (!isCalendarDate(input.checkedAt)) errors.checkedAt = "Enter the date you checked.";
  else if (compareCalendarDates(input.checkedAt, today) > 0) errors.checkedAt = "The checked date cannot be in the future.";
  if (input.expiresAt !== undefined) {
    if (!isCalendarDate(input.expiresAt) || !isCalendarDate(input.checkedAt) || compareCalendarDates(input.expiresAt, input.checkedAt) <= 0) {
      errors.expiresAt = "The expiry date must be after the checked date.";
    }
  }
  return errors;
}
```

Run: `npm --prefix web test -- src/records` → PASS (dates 11, evidence 13, validation 14).

- [ ] **Step 8: Gate and commit**

Run: `npm run typecheck && npm run test:unit`. Expected: green; unit count = previous + 38.

```bash
git add web/src/records
git commit -m "feat(web): records domain — types, UTC calendar dates, evidence states, input validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Firestore rules for `restaurants` with table-driven emulator tests

**Files:**
- Modify: `firestore.rules`
- Create: `functions/test/rules.records.test.ts`

**Interfaces:**
- Produces: rules for `households/{hid}/restaurants/{rid}` (read/create/update/delete) and helper functions `nonBlankString`, `optionalString`, `httpUrl`, `optionalHttpUrl`, `validCoordinates`, `validRestaurant`, `isMarkingDeleting`. Task 7 adds `claims` inside the same nested block.
- The Task 7 claims rules rely on `restaurants` documents having `deleting: bool`.

- [ ] **Step 1: Write the failing rules tests (restaurants section)**

Create `functions/test/rules.records.test.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from "firebase/firestore";

const PROJECT_ID = "demo-safebite";
const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/home"), { name: "Home", memberIds: ["ava", "bogdan"], createdAt: new Date() });
    await setDoc(doc(db, "households/other"), { name: "Other", memberIds: ["stranger"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/bogdan"), { householdId: "home", displayName: "Bogdan" });
    await setDoc(doc(db, "users/stranger"), { householdId: "other", displayName: "Stranger" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore();
const R = "households/home/restaurants";

/** A valid create payload as the client writes it (server timestamps, version 1, not deleting). */
function restaurantCreate(uid = "ava", over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Da Marco",
    address: "Via Roma 1, Rome",
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1,
    deleting: false,
    ...over,
  };
}

/** Seeds an existing restaurant bypassing rules; returns its path. */
async function seedRestaurant(id: string, over: Record<string, unknown> = {}): Promise<string> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `${R}/${id}`), {
      name: "Seeded",
      address: "Somewhere 1",
      createdBy: "ava",
      createdAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
      updatedAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
      version: 3,
      deleting: false,
      ...over,
    });
  });
  return `${R}/${id}`;
}

describe("restaurants — reads", () => {
  it("members read a document and list the collection; others do not", async () => {
    await seedRestaurant("r1");
    await assertSucceeds(getDoc(doc(as("ava"), `${R}/r1`)));
    await assertSucceeds(getDoc(doc(as("bogdan"), `${R}/r1`)));
    await assertSucceeds(getDocs(collection(as("ava"), R)));
    await assertFails(getDoc(doc(as("stranger"), `${R}/r1`)));
    await assertFails(getDocs(collection(as("stranger"), R)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${R}/r1`)));
  });

  it("a member of one household cannot read another household's restaurants", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "households/other/restaurants/x"), restaurantCreate("stranger", { createdAt: new Date(), updatedAt: new Date() }));
    });
    await assertFails(getDoc(doc(as("ava"), "households/other/restaurants/x")));
  });
});

describe("restaurants — create", () => {
  it.each([
    ["minimal", {}],
    ["with phone and website", { phone: "+39 06 123", website: "https://damarco.it" }],
    ["with a coordinate pair", { lat: 41.9, lng: 12.5 }],
    ["with a Google place id", { googlePlaceId: "ChIJexample" }],
    ["at the length limits", { name: "n".repeat(120), address: "a".repeat(300), phone: "1".repeat(40) }],
  ])("accepts a valid create: %s", async (_label, over) => {
    await assertSucceeds(setDoc(doc(as("ava"), `${R}/new`), restaurantCreate("ava", over)));
  });

  it.each([
    ["createdBy is someone else", { createdBy: "bogdan" }],
    ["version is not 1", { version: 2 }],
    ["deleting is true", { deleting: true }],
    ["an unknown key", { rating: 5 }],
    ["website is not http(s)", { website: "ftp://damarco.it" }],
    ["lat without lng", { lat: 41.9 }],
    ["lat out of range", { lat: 91, lng: 0 }],
    ["lng out of range", { lat: 0, lng: -181 }],
    ["lat is a string", { lat: "41.9", lng: 12.5 }],
    ["whitespace-only name", { name: "   " }],
    ["name too long", { name: "n".repeat(121) }],
    ["address too long", { address: "a".repeat(301) }],
    ["phone too long", { phone: "1".repeat(41) }],
    ["empty optional phone", { phone: "" }],
    ["client-supplied createdAt", { createdAt: new Date() }],
    ["client-supplied updatedAt", { updatedAt: new Date() }],
    ["missing deleting flag", { deleting: undefined }],
  ])("rejects a create where %s", async (_label, over) => {
    const data = restaurantCreate("ava", over);
    for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
    await assertFails(setDoc(doc(as("ava"), `${R}/bad`), data));
  });

  it("rejects a create by a non-member and by an unauthenticated client", async () => {
    await assertFails(setDoc(doc(as("stranger"), `${R}/bad`), restaurantCreate("stranger")));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `${R}/bad`), restaurantCreate("ava")));
  });
});

describe("restaurants — update", () => {
  it("accepts the next version with a server updatedAt and unchanged createdBy/createdAt", async () => {
    const p = await seedRestaurant("r1");
    await assertSucceeds(updateDoc(doc(as("bogdan"), p), { name: "Renamed", version: 4, updatedAt: serverTimestamp() }));
  });

  it.each([
    ["the version is stale (same as stored)", { name: "x", version: 3, updatedAt: serverTimestamp() }],
    ["the version skips ahead", { name: "x", version: 5, updatedAt: serverTimestamp() }],
    ["updatedAt is client-supplied", { name: "x", version: 4, updatedAt: new Date() }],
    ["updatedAt is missing", { name: "x", version: 4 }],
    ["createdBy changes", { createdBy: "bogdan", version: 4, updatedAt: serverTimestamp() }],
    ["createdAt changes", { createdAt: new Date(), version: 4, updatedAt: serverTimestamp() }],
    ["an unknown key is added", { score: 90, version: 4, updatedAt: serverTimestamp() }],
    ["the website becomes invalid", { website: "damarco.it", version: 4, updatedAt: serverTimestamp() }],
    ["marking deleting also changes a field", { deleting: true, name: "x", version: 4, updatedAt: serverTimestamp() }],
  ])("rejects an update where %s", async (_label, patch) => {
    const p = await seedRestaurant("r1");
    await assertFails(updateDoc(doc(as("ava"), p), patch));
  });

  it("accepts the deleting mark (only deleting, version and updatedAt change)", async () => {
    const p = await seedRestaurant("r1");
    await assertSucceeds(updateDoc(doc(as("ava"), p), { deleting: true, version: 4, updatedAt: serverTimestamp() }));
  });

  it("rejects every update once deleting is true, including un-marking", async () => {
    const p = await seedRestaurant("r1", { deleting: true });
    await assertFails(updateDoc(doc(as("ava"), p), { name: "x", version: 4, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("ava"), p), { deleting: false, version: 4, updatedAt: serverTimestamp() }));
  });

  it("rejects updates by non-members", async () => {
    const p = await seedRestaurant("r1");
    await assertFails(updateDoc(doc(as("stranger"), p), { name: "x", version: 4, updatedAt: serverTimestamp() }));
  });
});

describe("restaurants — delete", () => {
  it("rejects deleting a restaurant that is not marked deleting", async () => {
    const p = await seedRestaurant("r1");
    await assertFails(deleteDoc(doc(as("ava"), p)));
  });

  it("accepts deleting a marked restaurant by either member, never by a non-member", async () => {
    const p = await seedRestaurant("r1", { deleting: true });
    await assertFails(deleteDoc(doc(as("stranger"), p)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), p)));
  });
});
```

- [ ] **Step 2: Run the new file to verify it fails**

Run (root, 5 min timeout): `npm run emu:test -- --project functions 2>&1 | tail -40` — or directly `npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:exec --only auth,firestore,functions --project demo-safebite "npm --prefix functions test -- test/rules.records.test.ts"`.
Expected: the read/create/update/delete "accepts" cases FAIL (default deny); the existing `rules.test.ts` default-deny case for `households/home/restaurants/x` still passes.

- [ ] **Step 3: Write the rules**

Replace `firestore.rules` entirely with:
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

    // ---- field validators (limits mirror web/src/records/validation.ts LIMITS) ----
    function nonBlankString(v, max) {
      return v is string && v.trim() != '' && v.size() <= max;
    }
    // Optional strings must be absent or non-empty (the client drops blanks before writing).
    function optionalString(data, key, max) {
      return !(key in data) || nonBlankString(data[key], max);
    }
    function httpUrl(v, max) {
      return v is string && v.size() <= max && v.matches('https?://.+');
    }
    function optionalHttpUrl(data, key, max) {
      return !(key in data) || httpUrl(data[key], max);
    }
    // Coordinates come as a pair or not at all; optional until Plan 3 fills them from Places.
    function validCoordinates(data) {
      return (!('lat' in data) && !('lng' in data))
        || (('lat' in data) && ('lng' in data)
            && data.lat is number && data.lng is number
            && data.lat >= -90 && data.lat <= 90 && data.lng >= -180 && data.lng <= 180);
    }

    function validRestaurant(data) {
      return data.keys().hasOnly(['name', 'address', 'phone', 'website', 'lat', 'lng', 'googlePlaceId', 'createdBy', 'createdAt', 'updatedAt', 'version', 'deleting'])
        && data.keys().hasAll(['name', 'address', 'createdBy', 'createdAt', 'updatedAt', 'version', 'deleting'])
        && nonBlankString(data.name, 120)
        && nonBlankString(data.address, 300)
        && optionalString(data, 'phone', 40)
        && optionalHttpUrl(data, 'website', 300)
        && optionalString(data, 'googlePlaceId', 200)
        && validCoordinates(data)
        && data.createdBy is string
        && data.createdAt is timestamp
        && data.updatedAt is timestamp
        && data.version is int
        && data.deleting is bool;
    }

    // Deletion protocol step 1 (spec §3.5): the mark changes only these keys.
    function isMarkingDeleting() {
      return request.resource.data.deleting == true
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['deleting', 'version', 'updatedAt']);
    }

    match /users/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow write: if false;
    }

    match /households/{hid} {
      // Read the membership list off the document itself: no second get() per read.
      allow read: if signedIn() && request.auth.uid in resource.data.memberIds;
      allow write: if false;

      match /restaurants/{rid} {
        allow read: if isMember(hid);

        allow create: if isMember(hid)
          && validRestaurant(request.resource.data)
          && request.resource.data.createdBy == request.auth.uid
          && request.resource.data.version == 1
          && request.resource.data.deleting == false
          && request.resource.data.createdAt == request.time
          && request.resource.data.updatedAt == request.time;

        // Optimistic concurrency: exactly the next version, server-stamped. Once deleting is true
        // nothing may change until the document is removed (so a claim sweep cannot be undercut).
        allow update: if isMember(hid)
          && validRestaurant(request.resource.data)
          && resource.data.deleting == false
          && request.resource.data.createdBy == resource.data.createdBy
          && request.resource.data.createdAt == resource.data.createdAt
          && request.resource.data.updatedAt == request.time
          && request.resource.data.version == resource.data.version + 1
          && (request.resource.data.deleting == false || isMarkingDeleting());

        // Step 3 of the protocol: only a marked restaurant can go.
        allow delete: if isMember(hid) && resource.data.deleting == true;
      }
    }
  }
}
```

- [ ] **Step 4: Run both rules files and the rest of the functions suite**

Run (root, 5 min timeout): `npm run emu:test`
Expected: one **existing** test now fails for a legitimate reason: `rules.test.ts` → `default-deny` → "denies reads under an unmatched subcollection" reads `households/home/restaurants/x` as ava, and `restaurants` is no longer unmatched — a member's `getDoc` of a missing document under an allowed read rule succeeds with `exists() == false`. Change that test to read `households/other/restaurants/x` as ava (ava is not a member of `other`) and rename it "denies reads under another household's subcollection"; keep the assertion `assertFails`. Then rerun: all previous 27 pass and the new file's 40 test cases pass (reads 2, create accepts 5, create rejects 17 + 1, update accepts 1, update rejects 9 + 1 + 1 + 1, delete 2).

- [ ] **Step 5: Gate and commit**

Run: `npm run typecheck && npm run test:unit`. Expected: green, counts unchanged.

```bash
git add firestore.rules functions/test/rules.records.test.ts functions/test/rules.test.ts
git commit -m "feat(rules): household restaurants — member-only, validated fields, version+1 updates, deleting mark and delete-after-mark

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Firestore rules for `claims`, table-driven tests, literal parity smoke test

**Files:**
- Modify: `firestore.rules`, `functions/test/rules.records.test.ts`
- Create: `web/src/records/rulesParity.test.ts`

**Interfaces:**
- Consumes: `restaurants` rules and helpers from Task 6; `CLAIM_KINDS`, `CLAIM_VALUES`, `SOURCE_TYPES`, `LIMITS` from Task 5.
- Produces: rules for `households/{hid}/restaurants/{rid}/claims/{cid}` and helpers `utcMidnight`, `validSource`, `validClaim`. Claim documents carry `authorName` equal to the caller's `users/{uid}.displayName`.

- [ ] **Step 1: Append the failing claims tests**

Append to `functions/test/rules.records.test.ts` (extend the import line with `Timestamp` — already imported — and nothing else):
```ts
const utcDate = (d: string) => Timestamp.fromDate(new Date(`${d}T00:00:00.000Z`));
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const daysAhead = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));

const KINDS = ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"] as const;
const VALUES = ["yes", "no", "partial"] as const;
const SOURCE_TYPES = ["restaurantStatement", "accreditingBody", "ownVisit", "thirdParty"] as const;

function claimCreate(uid: "ava" | "bogdan" = "ava", over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "separateFryer",
    value: "yes",
    detail: "Dedicated fryer for chips, confirmed by the manager.",
    source: { type: "restaurantStatement", label: "Phone call with the manager" },
    checkedAt: utcDate("2026-09-20"),
    authorUid: uid,
    authorName: uid === "ava" ? "Ava" : "Bogdan",
    createdAt: serverTimestamp(),
    ...over,
  };
}

const C = `${R}/r1/claims`;

describe("claims — reads", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${C}/c1`), claimCreate("ava", { createdAt: new Date() }));
    });
  });

  it("members read and list; non-members and anonymous do not", async () => {
    await assertSucceeds(getDoc(doc(as("ava"), `${C}/c1`)));
    await assertSucceeds(getDocs(collection(as("bogdan"), C)));
    await assertFails(getDoc(doc(as("stranger"), `${C}/c1`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${C}/c1`)));
  });
});

describe("claims — create, every valid combination", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
  });

  const combos: Array<[string, Record<string, unknown>]> = [];
  for (const kind of KINDS) {
    for (const value of VALUES) {
      for (const type of SOURCE_TYPES) {
        if (kind === "accreditation" && type !== "accreditingBody") continue;
        const source: Record<string, unknown> = { type, label: `${type} source` };
        if (type === "accreditingBody") source.url = "https://accreditor.test/listing/1";
        combos.push([`${kind} / ${value} / ${type}`, { kind, value, source }]);
      }
    }
  }
  it.each(combos)("accepts %s", async (_label, over) => {
    await assertSucceeds(setDoc(doc(as("ava"), `${C}/new`), claimCreate("ava", over)));
  });

  it("accepts an optional expiry after the checked date, an empty detail, and a checked date one day ahead of UTC", async () => {
    await assertSucceeds(setDoc(doc(as("ava"), `${C}/a`), claimCreate("ava", { expiresAt: utcDate("2027-03-01") })));
    await assertSucceeds(setDoc(doc(as("ava"), `${C}/b`), claimCreate("ava", { detail: "" })));
    await assertSucceeds(setDoc(doc(as("bogdan"), `${C}/c`), claimCreate("bogdan", { checkedAt: utcDate(daysAhead(1)) })));
    await assertSucceeds(setDoc(doc(as("ava"), `${C}/d`), claimCreate("ava", { source: { type: "thirdParty", label: "Blog", url: "http://blog.test/post" } })));
  });
});

describe("claims — create, rejected", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
  });

  it.each([
    ["unknown kind", { kind: "score" }],
    ["unknown value", { value: "maybe" }],
    ["unknown source type", { source: { type: "rumour", label: "x" } }],
    ["source missing label", { source: { type: "ownVisit" } }],
    ["source with an extra key", { source: { type: "ownVisit", label: "x", rating: 5 } }],
    ["source label whitespace-only", { source: { type: "ownVisit", label: "   " } }],
    ["source label too long", { source: { type: "ownVisit", label: "l".repeat(201) } }],
    ["source url not http(s)", { source: { type: "thirdParty", label: "x", url: "ftp://x.test" } }],
    ["source url too long", { source: { type: "thirdParty", label: "x", url: "https://x.test/" + "a".repeat(500) } }],
    ["accrediting body without url", { source: { type: "accreditingBody", label: "Coeliac UK" } }],
    ["accreditation from a third party even with a url", { kind: "accreditation", source: { type: "thirdParty", label: "Blog", url: "https://blog.test" } }],
    ["detail too long", { detail: "d".repeat(1001) }],
    ["detail not a string", { detail: 42 }],
    ["checkedAt not at UTC midnight", { checkedAt: Timestamp.fromDate(new Date("2026-09-20T10:00:00.000Z")) }],
    ["checkedAt is 'now' (not midnight)", { checkedAt: new Date() }],
    ["checkedAt two days ahead", { checkedAt: utcDate(daysAhead(2)) }],
    ["checkedAt a string", { checkedAt: "2026-09-20" }],
    ["expiresAt equal to checkedAt", { expiresAt: utcDate("2026-09-20") }],
    ["expiresAt before checkedAt", { expiresAt: utcDate("2026-09-19") }],
    ["expiresAt not at UTC midnight", { expiresAt: Timestamp.fromDate(new Date("2027-01-01T12:00:00.000Z")) }],
    ["authorUid is someone else", { authorUid: "bogdan" }],
    ["authorName is not the caller's display name", { authorName: "Somebody" }],
    ["client-supplied createdAt", { createdAt: new Date() }],
    ["an extra top-level key", { verified: true }],
    ["missing kind", { kind: undefined }],
  ])("rejects a create where %s", async (_label, over) => {
    const data = claimCreate("ava", over);
    for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
    await assertFails(setDoc(doc(as("ava"), `${C}/bad`), data));
  });

  it("rejects a create by a non-member or anonymous client", async () => {
    await assertFails(setDoc(doc(as("stranger"), `${C}/bad`), claimCreate("ava", { authorUid: "stranger", authorName: "Stranger" })));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `${C}/bad`), claimCreate("ava")));
  });

  it("rejects a create under a missing parent (F1: no orphans)", async () => {
    await assertFails(setDoc(doc(as("ava"), `${R}/ghost/claims/bad`), claimCreate("ava")));
  });

  it("rejects a create under a parent marked deleting (F1: the mark closes the door before the sweep)", async () => {
    await seedRestaurant("r2", { deleting: true });
    await assertFails(setDoc(doc(as("ava"), `${R}/r2/claims/bad`), claimCreate("ava")));
  });
});

describe("claims — immutability and deletion", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${C}/c1`), claimCreate("ava", { createdAt: new Date() }));
    });
  });

  it("rejects every update, even by the author", async () => {
    await assertFails(updateDoc(doc(as("ava"), `${C}/c1`), { detail: "edited" }));
    await assertFails(updateDoc(doc(as("ava"), `${C}/c1`), { value: "no" }));
  });

  it("either member may delete; a non-member may not", async () => {
    await assertFails(deleteDoc(doc(as("stranger"), `${C}/c1`)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), `${C}/c1`)));
  });

  it("claims can still be deleted while the parent is marked deleting (the sweep needs this)", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertSucceeds(deleteDoc(doc(as("ava"), `${C}/c1`)));
  });
});
```

- [ ] **Step 2: Run to verify the "accepts" cases fail (no claims rules yet)**

Run (root, 5 min timeout): `npm run emu:test`
Expected: the claims "accepts" cases FAIL; the restaurants cases and everything else pass.

- [ ] **Step 3: Add the claims rules**

In `firestore.rules`, add these helpers after `isMarkingDeleting()` (still inside `match /databases/{database}/documents`):
```
    // Calendar dates are timestamps at 00:00:00 UTC (spec §3.5, audit F3).
    function utcMidnight(ts) {
      return ts is timestamp && ts == ts.date();
    }

    // URL policy: an accrediting body always carries a link to its listing.
    function validSource(s) {
      return s is map
        && s.keys().hasOnly(['type', 'label', 'url'])
        && s.keys().hasAll(['type', 'label'])
        && s.type in ['restaurantStatement', 'accreditingBody', 'ownVisit', 'thirdParty']
        && nonBlankString(s.label, 200)
        && optionalHttpUrl(s, 'url', 500)
        && (s.type != 'accreditingBody' || 'url' in s);
    }

    function validClaim(data) {
      return data.keys().hasOnly(['kind', 'value', 'detail', 'source', 'checkedAt', 'expiresAt', 'authorUid', 'authorName', 'createdAt'])
        && data.keys().hasAll(['kind', 'value', 'detail', 'source', 'checkedAt', 'authorUid', 'authorName', 'createdAt'])
        && data.kind in ['dedicatedKitchen', 'separateFryer', 'trainedStaff', 'gfMenu', 'preparationPractice', 'accreditation']
        && data.value in ['yes', 'no', 'partial']
        && data.detail is string && data.detail.size() <= 1000
        && validSource(data.source)
        && (data.kind != 'accreditation' || data.source.type == 'accreditingBody')
        && utcMidnight(data.checkedAt)
        // A user anywhere from UTC-12 to UTC+14 may enter their local "today"; two days ahead is never valid.
        && data.checkedAt <= request.time + duration.value(1, 'd')
        && (!('expiresAt' in data) || (utcMidnight(data.expiresAt) && data.expiresAt > data.checkedAt))
        && data.authorUid is string
        && data.authorName is string
        && data.createdAt is timestamp;
    }
```
Inside `match /restaurants/{rid} { … }`, after the `allow delete` line, add:
```
        match /claims/{cid} {
          function parentRestaurant() {
            return get(/databases/$(database)/documents/households/$(hid)/restaurants/$(rid));
          }
          // The caller's own users/{uid} document; rules get() is not subject to the read rules,
          // so no peer-user read is introduced (the client also may read its own document).
          function callerDisplayName() {
            return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.displayName;
          }

          allow read: if isMember(hid);

          // Immutable evidence: create with the caller's identity, under an existing parent that is
          // not being deleted (deletion protocol step 1 makes this false before the sweep).
          allow create: if isMember(hid)
            && validClaim(request.resource.data)
            && exists(/databases/$(database)/documents/households/$(hid)/restaurants/$(rid))
            && parentRestaurant().data.deleting == false
            && request.resource.data.authorUid == request.auth.uid
            && request.resource.data.authorName == callerDisplayName()
            && request.resource.data.createdAt == request.time;

          allow update: if false;
          allow delete: if isMember(hid);
        }
```

- [ ] **Step 4: Run the emulator suite**

Run (root, 5 min timeout): `npm run emu:test`
Expected: all green — `rules.records.test.ts` now holds Task 6's 40 plus 96 claims cases (reads 1, valid combinations 63, extra accepts 1, rejections 25, non-member 1, missing parent 1, deleting parent 1, immutability/deletion 3). Counts are for orientation; state them as "previous + new".

- [ ] **Step 5: The literal parity smoke test in web**

Create `web/src/records/rulesParity.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAIM_KINDS, CLAIM_VALUES, SOURCE_TYPES } from "./types";
import { LIMITS } from "./validation";

// Smoke check only: a literal missing from the rules is caught here; real parity (which literal
// is accepted where, and the rejected ones) is proven by functions/test/rules.records.test.ts.
const rules = readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");

describe("firestore.rules mentions every TypeScript literal", () => {
  it.each([...CLAIM_KINDS, ...CLAIM_VALUES, ...SOURCE_TYPES])("'%s'", (literal) => {
    expect(rules).toContain(`'${literal}'`);
  });

  it("carries the same field limits as validation.ts", () => {
    expect(rules).toContain(`nonBlankString(data.name, ${LIMITS.name})`);
    expect(rules).toContain(`nonBlankString(data.address, ${LIMITS.address})`);
    expect(rules).toContain(`optionalString(data, 'phone', ${LIMITS.phone})`);
    expect(rules).toContain(`optionalHttpUrl(data, 'website', ${LIMITS.website})`);
    expect(rules).toContain(`optionalString(data, 'googlePlaceId', ${LIMITS.googlePlaceId})`);
    expect(rules).toContain(`data.detail.size() <= ${LIMITS.detail}`);
    expect(rules).toContain(`nonBlankString(s.label, ${LIMITS.sourceLabel})`);
    expect(rules).toContain(`optionalHttpUrl(s, 'url', ${LIMITS.sourceUrl})`);
  });
});
```

Run: `npm --prefix web test -- src/records/rulesParity.test.ts` → PASS, 14 tests.

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run test:unit`. Expected: green; unit count = previous + 14.

```bash
git add firestore.rules functions/test/rules.records.test.ts web/src/records/rulesParity.test.ts
git commit -m "feat(rules): immutable evidence claims — validated fields, URL policy, UTC calendar dates, author identity, parent must exist and not be deleting

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Repository — listeners with read states, transaction-only writes with typed outcomes, deletion protocol

**Files:**
- Create: `web/src/records/repository.ts`, `web/src/records/repository.test.ts`

**Interfaces:**
- Consumes: `db` from `web/src/firebase.ts`; Task 5 types and `fromCalendarDate`/`toCalendarDate`.
- Produces:
  ```ts
  export type Snapshot<T> =
    | { status: "ready" | "offline"; value: T }   // offline = served from the memory cache
    | { status: "gone" } | { status: "denied" } | { status: "error"; message: string };
  export type WriteOutcome<T = void> =
    | { kind: "ok"; value: T } | { kind: "conflict" } | { kind: "notFound" }
    | { kind: "permission" } | { kind: "offline" } | { kind: "failed"; message: string };
  export type DeleteStep = "marking" | "sweeping" | "removing";
  export const SWEEP_PAGE = 100;
  export function toRestaurant(snap: DocumentSnapshot): Restaurant;
  export function toClaim(snap: DocumentSnapshot): Claim;
  export function watchRestaurants(hid: string, cb: (s: Snapshot<Restaurant[]>) => void): () => void;
  export function watchRestaurant(hid: string, rid: string, cb: (s: Snapshot<Restaurant>) => void): () => void;
  export function watchClaims(hid: string, rid: string, cb: (s: Snapshot<Claim[]>) => void): () => void;
  export function createRestaurant(hid: string, uid: string, input: RestaurantInput): Promise<WriteOutcome<string>>;
  export function updateRestaurant(hid: string, rid: string, baseVersion: number, input: RestaurantInput): Promise<WriteOutcome<number>>;
  export function markDeleting(hid: string, rid: string, baseVersion: number): Promise<WriteOutcome<number>>;
  export function sweepClaims(hid: string, rid: string): Promise<WriteOutcome<number>>;
  export function removeRestaurant(hid: string, rid: string): Promise<WriteOutcome>;
  export function deleteRestaurant(hid: string, rid: string, baseVersion: number, onProgress?: (step: DeleteStep) => void): Promise<WriteOutcome>;
  export function finishDeleting(hid: string, rid: string, onProgress?: (step: DeleteStep) => void): Promise<WriteOutcome>;
  export function addClaim(hid: string, rid: string, author: Author, input: ClaimInput): Promise<WriteOutcome<string>>;
  export function deleteClaim(hid: string, rid: string, cid: string): Promise<WriteOutcome>;
  ```

- [ ] **Step 1: Write the failing repository tests**

Create `web/src/records/repository.test.ts`:
```ts
import { Timestamp, deleteField, serverTimestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
  getDocsFromServer: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: { fake: true } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  let generated = 0;
  return {
    ...actual,
    runTransaction: m.runTransaction,
    onSnapshot: m.onSnapshot,
    getDocsFromServer: m.getDocsFromServer,
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    doc: (parent: unknown, ...segments: string[]) => {
      const base = typeof (parent as { path?: string }).path === "string" ? (parent as { path: string }).path : "";
      const id = segments.length > 0 ? segments[segments.length - 1]! : `gen-${++generated}`;
      const path = segments.length > 0 ? [base, ...segments].filter(Boolean).join("/") : `${base}/${id}`;
      return { id, path };
    },
    query: (source: unknown) => source,
    orderBy: () => undefined,
    limit: () => undefined,
  };
});

import {
  addClaim,
  createRestaurant,
  deleteRestaurant,
  markDeleting,
  sweepClaims,
  toClaim,
  toRestaurant,
  updateRestaurant,
  watchRestaurant,
  watchRestaurants,
} from "./repository";

function fakeTx(getResult: { exists: boolean; data?: Record<string, unknown> }) {
  const tx = {
    get: vi.fn(async (ref: { id: string }) => ({ id: ref.id, ref, exists: () => getResult.exists, data: () => getResult.data })),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  m.runTransaction.mockImplementation(async (_db: unknown, run: (t: typeof tx) => Promise<unknown>) => run(tx));
  return tx;
}

const storedRestaurant = {
  name: "Da Marco",
  address: "Via Roma 1",
  createdBy: "ava-uid",
  createdAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
  updatedAt: Timestamp.fromDate(new Date("2026-09-02T10:00:00Z")),
  version: 3,
  deleting: false,
};

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("parsing", () => {
  it("toRestaurant keeps optional fields only when present and converts timestamps", () => {
    const snap = { id: "r1", exists: () => true, data: () => ({ ...storedRestaurant, phone: "+39", lat: 41.9, lng: 12.5 }) };
    const r = toRestaurant(snap as never);
    expect(r).toMatchObject({ id: "r1", name: "Da Marco", phone: "+39", lat: 41.9, lng: 12.5, version: 3, deleting: false });
    expect(r.createdAt.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect("website" in r).toBe(false);
  });

  it("toClaim converts UTC-midnight timestamps to calendar dates and omits an absent expiresAt", () => {
    const snap = {
      id: "c1",
      exists: () => true,
      data: () => ({
        kind: "separateFryer",
        value: "yes",
        detail: "",
        source: { type: "ownVisit", label: "Visit" },
        checkedAt: Timestamp.fromDate(new Date("2026-09-20T00:00:00Z")),
        authorUid: "ava-uid",
        authorName: "Ava",
        createdAt: Timestamp.fromDate(new Date("2026-09-20T09:00:00Z")),
      }),
    };
    const c = toClaim(snap as never);
    expect(c.checkedAt).toBe("2026-09-20");
    expect("expiresAt" in c).toBe(false);
    expect(c.createdAt.toISOString()).toBe("2026-09-20T09:00:00.000Z");
  });
});

describe("createRestaurant", () => {
  it("writes version 1, deleting false, the caller as createdBy and server timestamps in one transaction", async () => {
    const tx = fakeTx({ exists: false });
    const outcome = await createRestaurant("home", "ava-uid", { name: "Da Marco", address: "Via Roma 1", website: "https://damarco.it" });
    expect(outcome).toEqual({ kind: "ok", value: expect.stringMatching(/^gen-/) });
    expect(tx.set).toHaveBeenCalledTimes(1);
    const data = tx.set.mock.calls[0]![1] as Record<string, unknown>;
    expect(data).toMatchObject({ name: "Da Marco", address: "Via Roma 1", website: "https://damarco.it", createdBy: "ava-uid", version: 1, deleting: false });
    expect(data.createdAt).toEqual(serverTimestamp());
    expect(data.updatedAt).toEqual(serverTimestamp());
    expect("phone" in data).toBe(false);
  });
});

describe("updateRestaurant", () => {
  it("bumps to baseVersion + 1 and clears dropped optionals with deleteField", async () => {
    const tx = fakeTx({ exists: true, data: { ...storedRestaurant, phone: "+39" } });
    const outcome = await updateRestaurant("home", "r1", 3, { name: "Renamed", address: "Via Roma 1" });
    expect(outcome).toEqual({ kind: "ok", value: 4 });
    const patch = tx.update.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch).toMatchObject({ name: "Renamed", address: "Via Roma 1", version: 4 });
    expect(patch.phone).toEqual(deleteField());
    expect(patch.website).toEqual(deleteField());
    expect(patch.updatedAt).toEqual(serverTimestamp());
    expect("lat" in patch).toBe(false);
  });

  it("reports conflict when the stored version differs from the base version, without writing", async () => {
    const tx = fakeTx({ exists: true, data: { ...storedRestaurant, version: 4 } });
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "conflict" });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("reports notFound for a missing or deleting restaurant", async () => {
    fakeTx({ exists: false });
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "notFound" });
    fakeTx({ exists: true, data: { ...storedRestaurant, deleting: true } });
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "notFound" });
  });
});

describe("outcome classification", () => {
  it("permission-denied → permission; unavailable → offline; anything else → failed with the message", async () => {
    m.runTransaction.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "permission" });
    m.runTransaction.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" }));
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "offline" });
    m.runTransaction.mockRejectedValueOnce(new Error("boom"));
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "failed", message: "boom" });
  });

  it("reports offline before starting a transaction when the browser says it is offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await createRestaurant("home", "ava-uid", { name: "x", address: "y" })).toEqual({ kind: "offline" });
    expect(m.runTransaction).not.toHaveBeenCalled();
  });
});

describe("deletion protocol", () => {
  it("markDeleting bumps the version and sets deleting; conflicts on a stale base; is idempotent when already marked", async () => {
    const tx = fakeTx({ exists: true, data: storedRestaurant });
    expect(await markDeleting("home", "r1", 3)).toEqual({ kind: "ok", value: 4 });
    expect(tx.update.mock.calls[0]![1]).toMatchObject({ deleting: true, version: 4 });
    fakeTx({ exists: true, data: storedRestaurant });
    expect(await markDeleting("home", "r1", 2)).toEqual({ kind: "conflict" });
    const tx3 = fakeTx({ exists: true, data: { ...storedRestaurant, deleting: true } });
    expect(await markDeleting("home", "r1", 99)).toEqual({ kind: "ok", value: 3 });
    expect(tx3.update).not.toHaveBeenCalled();
  });

  it("sweepClaims deletes server-read pages until empty and reports the count", async () => {
    const tx = fakeTx({ exists: true });
    m.getDocsFromServer
      .mockResolvedValueOnce({ size: 2, empty: false, docs: [{ ref: { id: "a" } }, { ref: { id: "b" } }] })
      .mockResolvedValueOnce({ size: 0, empty: true, docs: [] });
    expect(await sweepClaims("home", "r1")).toEqual({ kind: "ok", value: 2 });
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(m.getDocsFromServer).toHaveBeenCalledTimes(2);
  });

  it("deleteRestaurant runs mark → sweep → remove and reports progress; stops at the first non-ok outcome", async () => {
    const steps: string[] = [];
    const tx = fakeTx({ exists: true, data: storedRestaurant });
    m.getDocsFromServer.mockResolvedValue({ size: 0, empty: true, docs: [] });
    expect(await deleteRestaurant("home", "r1", 3, (s) => steps.push(s))).toEqual({ kind: "ok", value: undefined });
    expect(steps).toEqual(["marking", "sweeping", "removing"]);
    expect(tx.delete).toHaveBeenCalledTimes(1); // the restaurant document

    const stopped: string[] = [];
    fakeTx({ exists: true, data: { ...storedRestaurant, version: 9 } });
    expect(await deleteRestaurant("home", "r1", 3, (s) => stopped.push(s))).toEqual({ kind: "conflict" });
    expect(stopped).toEqual(["marking"]);
  });
});

describe("addClaim", () => {
  it("stores UTC-midnight timestamps, the author's identity and a server createdAt; notFound under a deleting parent", async () => {
    const tx = fakeTx({ exists: true, data: storedRestaurant });
    const outcome = await addClaim("home", "r1", { uid: "ava-uid", displayName: "Ava" }, {
      kind: "accreditation",
      value: "yes",
      detail: "",
      source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/x" },
      checkedAt: "2026-09-20",
      expiresAt: "2027-09-20",
    });
    expect(outcome.kind).toBe("ok");
    const data = tx.set.mock.calls[0]![1] as Record<string, unknown>;
    expect((data.checkedAt as Timestamp).toDate().toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect((data.expiresAt as Timestamp).toDate().toISOString()).toBe("2027-09-20T00:00:00.000Z");
    expect(data).toMatchObject({ authorUid: "ava-uid", authorName: "Ava", source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/x" } });
    expect(data.createdAt).toEqual(serverTimestamp());

    fakeTx({ exists: true, data: { ...storedRestaurant, deleting: true } });
    expect((await addClaim("home", "r1", { uid: "ava-uid", displayName: "Ava" }, { kind: "gfMenu", value: "yes", detail: "", source: { type: "ownVisit", label: "x" }, checkedAt: "2026-09-20" })).kind).toBe("notFound");
  });
});

describe("watchers", () => {
  function emit(onNext: (s: unknown) => void, snapshot: unknown) {
    onNext(snapshot);
  }

  it("watchRestaurants reports ready from the server, offline from the cache, denied on permission errors", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_q: unknown, _opts: unknown, onNext: (s: unknown) => void, onError: (e: unknown) => void) => {
      emit(onNext, { metadata: { fromCache: false }, docs: [{ id: "r1", exists: () => true, data: () => storedRestaurant }] });
      emit(onNext, { metadata: { fromCache: true }, docs: [] });
      onError(Object.assign(new Error("denied"), { code: "permission-denied" }));
      return () => {};
    });
    watchRestaurants("home", (s) => seen.push(s));
    expect(seen[0]).toMatchObject({ status: "ready", value: [{ id: "r1", name: "Da Marco" }] });
    expect(seen[1]).toMatchObject({ status: "offline", value: [] });
    expect(seen[2]).toEqual({ status: "denied" });
  });

  it("watchRestaurant reports gone only for an authoritative miss, and an error for a cached miss", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_r: unknown, _opts: unknown, onNext: (s: unknown) => void) => {
      emit(onNext, { id: "r1", metadata: { fromCache: false }, exists: () => false });
      emit(onNext, { id: "r1", metadata: { fromCache: true }, exists: () => false });
      return () => {};
    });
    watchRestaurant("home", "r1", (s) => seen.push(s));
    expect(seen[0]).toEqual({ status: "gone" });
    expect(seen[1]).toMatchObject({ status: "error" });
  });

  it("passes includeMetadataChanges so cache → server transitions are reported", () => {
    m.onSnapshot.mockImplementation(() => () => {});
    watchRestaurants("home", () => {});
    expect(m.onSnapshot.mock.calls[0]![1]).toEqual({ includeMetadataChanges: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- src/records/repository.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the repository**

Create `web/src/records/repository.ts`:
```ts
import {
  collection,
  deleteField,
  doc,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  type Transaction,
} from "firebase/firestore";
import { db } from "../firebase";
import { fromCalendarDate, toCalendarDate } from "./dates";
import type { Author, Claim, ClaimInput, ClaimSource, Restaurant, RestaurantInput } from "./types";

/**
 * The only module that talks to Firestore for records (spec §3.5 "Online-only writes and read
 * states"). Every write is a runTransaction: transactions need the server, are never queued
 * offline, and are not applied to the local cache before commit, so snapshots never show
 * pending data and "ok" means the server accepted it. Listeners report where their data came
 * from so the UI can say "offline" instead of pretending a cached copy is current.
 */

export type Snapshot<T> =
  | { status: "ready" | "offline"; value: T }
  | { status: "gone" }
  | { status: "denied" }
  | { status: "error"; message: string };

export type WriteOutcome<T = void> =
  | { kind: "ok"; value: T }
  | { kind: "conflict" }
  | { kind: "notFound" }
  | { kind: "permission" }
  | { kind: "offline" }
  | { kind: "failed"; message: string };

export type DeleteStep = "marking" | "sweeping" | "removing";

/** Claims deleted per transaction during a sweep (well under Firestore's per-transaction limit). */
export const SWEEP_PAGE = 100;

class ConflictError extends Error {}
class NotFoundError extends Error {}

const restaurantsCol = (hid: string) => collection(db, "households", hid, "restaurants");
const restaurantRef = (hid: string, rid: string) => doc(db, "households", hid, "restaurants", rid);
const claimsCol = (hid: string, rid: string) => collection(db, "households", hid, "restaurants", rid, "claims");

function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date(0);
}

export function toRestaurant(snap: DocumentSnapshot): Restaurant {
  const d = snap.data() as DocumentData;
  const r: Restaurant = {
    id: snap.id,
    name: String(d.name),
    address: String(d.address),
    createdBy: String(d.createdBy),
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    version: Number(d.version),
    deleting: d.deleting === true,
  };
  if (typeof d.phone === "string") r.phone = d.phone;
  if (typeof d.website === "string") r.website = d.website;
  if (typeof d.lat === "number" && typeof d.lng === "number") {
    r.lat = d.lat;
    r.lng = d.lng;
  }
  if (typeof d.googlePlaceId === "string") r.googlePlaceId = d.googlePlaceId;
  return r;
}

export function toClaim(snap: DocumentSnapshot): Claim {
  const d = snap.data() as DocumentData;
  const source = d.source as ClaimSource;
  const c: Claim = {
    id: snap.id,
    kind: d.kind,
    value: d.value,
    detail: typeof d.detail === "string" ? d.detail : "",
    source: typeof source.url === "string" ? { type: source.type, label: source.label, url: source.url } : { type: source.type, label: source.label },
    checkedAt: toCalendarDate(d.checkedAt as Timestamp),
    authorUid: String(d.authorUid),
    authorName: String(d.authorName),
    createdAt: toDate(d.createdAt),
  };
  if (d.expiresAt instanceof Timestamp) c.expiresAt = toCalendarDate(d.expiresAt);
  return c;
}

function listenerFailure(err: FirestoreError): Snapshot<never> {
  return err.code === "permission-denied" ? { status: "denied" } : { status: "error", message: err.message };
}

/** includeMetadataChanges: a cache→server transition with identical data must still flip offline→ready. */
const LISTEN = { includeMetadataChanges: true } as const;

export function watchRestaurants(hid: string, cb: (s: Snapshot<Restaurant[]>) => void): () => void {
  return onSnapshot(
    query(restaurantsCol(hid), orderBy("name")),
    LISTEN,
    (snap) => cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: snap.docs.map(toRestaurant) }),
    (err) => cb(listenerFailure(err)),
  );
}

export function watchRestaurant(hid: string, rid: string, cb: (s: Snapshot<Restaurant>) => void): () => void {
  return onSnapshot(
    restaurantRef(hid, rid),
    LISTEN,
    (snap) => {
      if (!snap.exists()) {
        // A cached miss is not proof of deletion; only the server may say "gone".
        cb(snap.metadata.fromCache ? { status: "error", message: "You are offline and this restaurant has not been loaded on this device." } : { status: "gone" });
        return;
      }
      cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: toRestaurant(snap) });
    },
    (err) => cb(listenerFailure(err)),
  );
}

export function watchClaims(hid: string, rid: string, cb: (s: Snapshot<Claim[]>) => void): () => void {
  return onSnapshot(
    query(claimsCol(hid, rid)),
    LISTEN,
    (snap) => cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: snap.docs.map(toClaim) }),
    (err) => cb(listenerFailure(err)),
  );
}

function classify(err: unknown): WriteOutcome<never> {
  if (err instanceof ConflictError) return { kind: "conflict" };
  if (err instanceof NotFoundError) return { kind: "notFound" };
  const code = (err as { code?: string }).code;
  if (code === "permission-denied") return { kind: "permission" };
  if (code === "unavailable" || code === "deadline-exceeded") return { kind: "offline" };
  return { kind: "failed", message: err instanceof Error ? err.message : String(err) };
}

/** All writes go through here: offline pre-check, one transaction, typed outcome. Never throws. */
async function write<T>(run: (tx: Transaction) => Promise<T>): Promise<WriteOutcome<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };
  try {
    const value = await runTransaction(db, run);
    return { kind: "ok", value };
  } catch (err) {
    return classify(err);
  }
}

export function createRestaurant(hid: string, uid: string, input: RestaurantInput): Promise<WriteOutcome<string>> {
  return write(async (tx) => {
    const ref = doc(restaurantsCol(hid));
    const data: DocumentData = { name: input.name, address: input.address, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1, deleting: false };
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.website !== undefined) data.website = input.website;
    tx.set(ref, data);
    return ref.id;
  });
}

/**
 * The version check runs inside the transaction, so it re-runs on every retry: a newer edit can
 * never be overwritten by a retried stale one (audit F2). Only the form's fields plus
 * version/updatedAt are written, so lat/lng/googlePlaceId are preserved.
 */
export function updateRestaurant(hid: string, rid: string, baseVersion: number, input: RestaurantInput): Promise<WriteOutcome<number>> {
  return write(async (tx) => {
    const snap = await tx.get(restaurantRef(hid, rid));
    if (!snap.exists()) throw new NotFoundError();
    const current = toRestaurant(snap);
    if (current.deleting) throw new NotFoundError();
    if (current.version !== baseVersion) throw new ConflictError();
    const next = baseVersion + 1;
    tx.update(snap.ref, {
      name: input.name,
      address: input.address,
      phone: input.phone ?? deleteField(),
      website: input.website ?? deleteField(),
      updatedAt: serverTimestamp(),
      version: next,
    });
    return next;
  });
}

/** Deletion step 1. Idempotent: an already-marked restaurant is left alone (resume path). */
export function markDeleting(hid: string, rid: string, baseVersion: number): Promise<WriteOutcome<number>> {
  return write(async (tx) => {
    const snap = await tx.get(restaurantRef(hid, rid));
    if (!snap.exists()) throw new NotFoundError();
    const current = toRestaurant(snap);
    if (current.deleting) return current.version;
    if (current.version !== baseVersion) throw new ConflictError();
    const next = baseVersion + 1;
    tx.update(snap.ref, { deleting: true, version: next, updatedAt: serverTimestamp() });
    return next;
  });
}

/** Deletion step 2: server-read pages of claims, each deleted in one transaction, until none remain. */
export async function sweepClaims(hid: string, rid: string): Promise<WriteOutcome<number>> {
  let deleted = 0;
  for (;;) {
    let page;
    try {
      page = await getDocsFromServer(query(claimsCol(hid, rid), limit(SWEEP_PAGE)));
    } catch (err) {
      return classify(err);
    }
    if (page.empty) return { kind: "ok", value: deleted };
    const refs = page.docs.map((d) => d.ref);
    const outcome = await write(async (tx) => {
      for (const ref of refs) tx.delete(ref);
    });
    if (outcome.kind !== "ok") return outcome;
    deleted += refs.length;
  }
}

/** Deletion step 3. The rules refuse this unless the restaurant is marked deleting. */
export function removeRestaurant(hid: string, rid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    tx.delete(restaurantRef(hid, rid));
  });
}

export async function finishDeleting(hid: string, rid: string, onProgress?: (step: DeleteStep) => void): Promise<WriteOutcome> {
  onProgress?.("sweeping");
  const swept = await sweepClaims(hid, rid);
  if (swept.kind !== "ok") return swept;
  onProgress?.("removing");
  return removeRestaurant(hid, rid);
}

/** The whole protocol (spec §3.5 "Deletion protocol"). Stops at the first non-ok step. */
export async function deleteRestaurant(hid: string, rid: string, baseVersion: number, onProgress?: (step: DeleteStep) => void): Promise<WriteOutcome> {
  onProgress?.("marking");
  const marked = await markDeleting(hid, rid, baseVersion);
  if (marked.kind !== "ok") return marked;
  return finishDeleting(hid, rid, onProgress);
}

export function addClaim(hid: string, rid: string, author: Author, input: ClaimInput): Promise<WriteOutcome<string>> {
  return write(async (tx) => {
    const parent = await tx.get(restaurantRef(hid, rid));
    if (!parent.exists() || (parent.data() as DocumentData).deleting === true) throw new NotFoundError();
    const ref = doc(claimsCol(hid, rid));
    const source: DocumentData = { type: input.source.type, label: input.source.label };
    if (input.source.url !== undefined && input.source.url !== "") source.url = input.source.url;
    const data: DocumentData = {
      kind: input.kind,
      value: input.value,
      detail: input.detail,
      source,
      checkedAt: fromCalendarDate(input.checkedAt),
      authorUid: author.uid,
      authorName: author.displayName,
      createdAt: serverTimestamp(),
    };
    if (input.expiresAt !== undefined) data.expiresAt = fromCalendarDate(input.expiresAt);
    tx.set(ref, data);
    return ref.id;
  });
}

export function deleteClaim(hid: string, rid: string, cid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    tx.delete(doc(claimsCol(hid, rid), cid));
  });
}
```

- [ ] **Step 4: Run the repository tests**

Run: `npm --prefix web test -- src/records/repository.test.ts` → PASS, 15 tests. If the `doc()` mock's generated ids or paths do not line up with an assertion, fix the mock (it is test plumbing), not the repository.

- [ ] **Step 5: Enforce the "transactions only" constraint**

Run: `grep -rn "addDoc\|setDoc\|updateDoc\|deleteDoc\|writeBatch" web/src --include=*.ts --include=*.tsx | grep -v "\.test\."`
Expected: no output.

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run test:unit`. Expected: green; unit count = previous + 15.

```bash
git add web/src/records/repository.ts web/src/records/repository.test.ts
git commit -m "feat(web): records repository — snapshot listeners with read states, transaction-only writes with typed outcomes, mark/sweep/remove deletion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Shared page plumbing and the restaurants list (Saved tab)

**Files:**
- Create: `web/src/records/useMember.ts`, `web/src/records/useWatch.ts`, `web/src/records/useToday.ts`, `web/src/records/ReadStateNotice.tsx`, `web/src/records/RestaurantsPage.tsx`, `web/src/records/RestaurantsPage.test.tsx`
- Modify: `web/src/AppShell.tsx`, `web/src/styles.css`
- Delete: `web/src/pages/SavedPage.tsx`

**Interfaces:**
- Consumes: `watchRestaurants`, `finishDeleting`, `Snapshot`, `DeleteStep` (Task 8); `localToday`, `msUntilNextLocalMidnight` (Task 5); `useAuth` (existing).
- Produces:
  ```ts
  export function useMember(): { uid: string; householdId: string; displayName: string }; // throws outside a member session
  export type WatchState<T> = Snapshot<T> | { status: "loading" };
  export function useWatch<T>(subscribe: (cb: (s: Snapshot<T>) => void) => () => void, deps: readonly unknown[]): { state: WatchState<T>; retry: () => void };
  export function useToday(): CalendarDate;
  export function ReadStateNotice(props: { state: WatchState<unknown>; onRetry: () => void; gone?: ReactNode }): JSX.Element | null;
  // testids: read-loading, read-offline, read-denied (+ signout-denied), read-error (+ read-retry), read-gone
  export function RestaurantsPage(): JSX.Element;
  // testids: add-restaurant, restaurant-list, restaurant-row (data-rid), restaurant-deleting (data-rid), finish-deleting, restaurants-empty
  ```
- Routes added: `/restaurants` → `RestaurantsPage`; `/saved` → redirect to `/restaurants`. Tasks 10–11 add the deeper routes.

- [ ] **Step 1: Write the failing list-page test**

Create `web/src/records/RestaurantsPage.test.tsx`:
```tsx
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "./types";
import type { Snapshot } from "./repository";

const m = vi.hoisted(() => ({
  watchRestaurants: vi.fn(),
  finishDeleting: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("./repository", () => ({ watchRestaurants: m.watchRestaurants, finishDeleting: m.finishDeleting }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: m.signOut }),
}));

import { RestaurantsPage } from "./RestaurantsPage";

let emit: (s: Snapshot<Restaurant[]>) => void = () => {};
beforeEach(() => {
  m.watchRestaurants.mockImplementation((_hid: string, cb: (s: Snapshot<Restaurant[]>) => void) => {
    emit = cb;
    return () => {};
  });
  m.finishDeleting.mockResolvedValue({ kind: "ok", value: undefined });
});
afterEach(() => vi.clearAllMocks());

const r = (over: Partial<Restaurant> & Pick<Restaurant, "id" | "name">): Restaurant => ({
  address: "Somewhere 1",
  createdBy: "ava-uid",
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 1,
  deleting: false,
  ...over,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RestaurantsPage />
    </MemoryRouter>,
  );
}

describe("RestaurantsPage", () => {
  it("shows loading, then the household's restaurants as links", () => {
    renderPage();
    expect(screen.getByTestId("read-loading")).toBeInTheDocument();
    act(() => emit({ status: "ready", value: [r({ id: "a", name: "Da Marco" }), r({ id: "b", name: "Zest" })] }));
    const rows = screen.getAllByTestId("restaurant-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Da Marco");
    expect(rows[0]!.querySelector("a")).toHaveAttribute("href", "/restaurants/a");
    expect(screen.queryByTestId("restaurants-empty")).toBeNull();
  });

  it("renders the empty state only from an authoritative empty snapshot", () => {
    renderPage();
    act(() => emit({ status: "offline", value: [] }));
    expect(screen.queryByTestId("restaurants-empty")).toBeNull();
    expect(screen.getByTestId("read-offline")).toBeInTheDocument();
    act(() => emit({ status: "ready", value: [] }));
    expect(screen.getByTestId("restaurants-empty")).toBeInTheDocument();
  });

  it("disables Add while offline and shows the offline notice with the cached rows", () => {
    renderPage();
    act(() => emit({ status: "offline", value: [r({ id: "a", name: "Da Marco" })] }));
    expect(screen.getByTestId("add-restaurant")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("restaurant-row")).toHaveTextContent("Da Marco");
  });

  it("shows denied with a sign-out control, and error with retry that re-subscribes", async () => {
    renderPage();
    act(() => emit({ status: "denied" }));
    await userEvent.click(screen.getByTestId("signout-denied"));
    expect(m.signOut).toHaveBeenCalledTimes(1);
    act(() => emit({ status: "error", message: "boom" }));
    const before = m.watchRestaurants.mock.calls.length;
    await userEvent.click(screen.getByTestId("read-retry"));
    expect(m.watchRestaurants.mock.calls.length).toBe(before + 1);
  });

  it("resumes an interrupted deletion once per mount (even under StrictMode) and offers Finish deleting", async () => {
    render(
      <StrictMode>
        <MemoryRouter>
          <RestaurantsPage />
        </MemoryRouter>
      </StrictMode>,
    );
    act(() => emit({ status: "ready", value: [r({ id: "d", name: "Doomed", deleting: true, version: 4 })] }));
    const row = screen.getByTestId("restaurant-deleting");
    expect(row).toHaveTextContent("Deleting…");
    await waitFor(() => expect(m.finishDeleting).toHaveBeenCalledTimes(1));
    expect(m.finishDeleting).toHaveBeenCalledWith("home", "d", expect.any(Function));
    act(() => emit({ status: "ready", value: [r({ id: "d", name: "Doomed", deleting: true, version: 4 })] }));
    expect(m.finishDeleting).toHaveBeenCalledTimes(1);
    m.finishDeleting.mockResolvedValueOnce({ kind: "offline" });
    await userEvent.click(screen.getByTestId("finish-deleting"));
    await waitFor(() => expect(m.finishDeleting).toHaveBeenCalledTimes(2));
    expect(row).toHaveTextContent("You are offline");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- src/records/RestaurantsPage.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Implement the hooks and the notice**

Create `web/src/records/useMember.ts`:
```ts
import { useAuth } from "../auth/AuthProvider";

/** Pages under the member shell only render for members; anything else is a programming error. */
export function useMember(): { uid: string; householdId: string; displayName: string } {
  const { state } = useAuth();
  if (state.status !== "member") throw new Error("useMember used outside a member session");
  return { uid: state.uid, householdId: state.householdId, displayName: state.displayName };
}
```

Create `web/src/records/useWatch.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "./repository";

export type WatchState<T> = Snapshot<T> | { status: "loading" };

/**
 * Subscribes to a repository watcher for the lifetime of `deps`; callbacks from a superseded
 * subscription are ignored (generation counter, as in AuthProvider), so an account or route
 * change can never paint stale data. `retry` tears down and re-subscribes.
 */
export function useWatch<T>(subscribe: (cb: (s: Snapshot<T>) => void) => () => void, deps: readonly unknown[]): { state: WatchState<T>; retry: () => void } {
  const [state, setState] = useState<WatchState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const mine = ++generation.current;
    setState({ status: "loading" });
    const unsubscribe = subscribe((s) => {
      if (mine === generation.current) setState(s);
    });
    return () => {
      generation.current += 1;
      unsubscribe();
    };
    // `subscribe` is recreated each render by callers; the real inputs are `deps` and `attempt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
}
```

Create `web/src/records/useToday.ts`:
```ts
import { useEffect, useState } from "react";
import { localToday, msUntilNextLocalMidnight } from "./dates";
import type { CalendarDate } from "./types";

/** The device's local calendar day; refreshed when the tab becomes visible and at local midnight. */
export function useToday(): CalendarDate {
  const [today, setToday] = useState<CalendarDate>(() => localToday());
  useEffect(() => {
    const refresh = () => setToday(localToday());
    let timer = window.setTimeout(function tick() {
      refresh();
      timer = window.setTimeout(tick, msUntilNextLocalMidnight(new Date()));
    }, msUntilNextLocalMidnight(new Date()));
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
```

Create `web/src/records/ReadStateNotice.tsx`:
```tsx
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { WatchState } from "./useWatch";

/** Renders the non-ready read states (spec §3.5). Returns null for `ready` so callers just render data. */
export function ReadStateNotice({ state, onRetry, gone }: { state: WatchState<unknown>; onRetry: () => void; gone?: ReactNode }) {
  const { signOut } = useAuth();
  switch (state.status) {
    case "loading":
      return <p data-testid="read-loading">Loading…</p>;
    case "offline":
      return (
        <p className="notice" role="status" data-testid="read-offline">
          Showing last loaded data — you are offline. Adding and editing need a connection.
        </p>
      );
    case "denied":
      return (
        <div className="notice" role="alert" data-testid="read-denied">
          <p>You no longer have access to this household.</p>
          <button type="button" data-testid="signout-denied" onClick={() => void signOut()}>Sign out</button>
        </div>
      );
    case "error":
      return (
        <div className="notice" role="alert" data-testid="read-error">
          <p>Could not load: {state.message}</p>
          <button type="button" data-testid="read-retry" onClick={onRetry}>Retry</button>
        </div>
      );
    case "gone":
      return <div className="notice" role="alert" data-testid="read-gone">{gone ?? <p>This restaurant was deleted.</p>}</div>;
    case "ready":
      return null;
  }
}
```

- [ ] **Step 4: Implement the list page and the routes**

Create `web/src/records/RestaurantsPage.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { finishDeleting, watchRestaurants, type DeleteStep, type Snapshot } from "./repository";
import { ReadStateNotice } from "./ReadStateNotice";
import type { Restaurant } from "./types";
import { useMember } from "./useMember";
import { useWatch } from "./useWatch";

const STEP_TEXT: Record<DeleteStep, string> = { marking: "Marking…", sweeping: "Removing evidence…", removing: "Removing restaurant…" };

function outcomeText(kind: string): string {
  switch (kind) {
    case "offline": return "You are offline. Connect and tap Finish deleting.";
    case "permission": return "You no longer have access to this household.";
    case "notFound": return "Already removed.";
    default: return "Could not finish deleting. Tap to try again.";
  }
}

export function RestaurantsPage() {
  const { householdId } = useMember();
  const { state, retry } = useWatch<Restaurant[]>((cb) => watchRestaurants(householdId, cb), [householdId]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const resumed = useRef(new Set<string>());
  const offline = state.status === "offline";
  const rows = state.status === "ready" || state.status === "offline" ? state.value : [];

  async function finish(rid: string) {
    setProgress((p) => ({ ...p, [rid]: STEP_TEXT.sweeping }));
    const outcome = await finishDeleting(householdId, rid, (step) => setProgress((p) => ({ ...p, [rid]: STEP_TEXT[step] })));
    if (outcome.kind !== "ok") setProgress((p) => ({ ...p, [rid]: outcomeText(outcome.kind) }));
  }

  // Resume interrupted deletions once per mount (deletion protocol is resumable, spec §3.5).
  useEffect(() => {
    if (state.status !== "ready") return;
    for (const r of state.value) {
      if (r.deleting && !resumed.current.has(r.id)) {
        resumed.current.add(r.id);
        void finish(r.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <section>
      <h2>Saved</h2>
      <p>Our restaurant records.</p>
      <ReadStateNotice state={state} onRetry={retry} />
      <p>
        <Link
          to="/restaurants/new"
          data-testid="add-restaurant"
          aria-disabled={offline ? "true" : undefined}
          onClick={(e) => { if (offline) e.preventDefault(); }}
          className={offline ? "disabled-link" : undefined}
        >
          Add restaurant
        </Link>
      </p>
      {state.status === "ready" && rows.length === 0 && <p data-testid="restaurants-empty">No restaurants yet. Add the first one.</p>}
      {rows.length > 0 && (
        <ul className="list" data-testid="restaurant-list">
          {rows.map((r) =>
            r.deleting ? (
              <li key={r.id} className="card" data-testid="restaurant-deleting" data-rid={r.id}>
                <strong>{r.name}</strong> — Deleting…
                <div className="actions">
                  <span>{progress[r.id]}</span>
                  <button type="button" data-testid="finish-deleting" disabled={offline} onClick={() => void finish(r.id)}>Finish deleting</button>
                </div>
              </li>
            ) : (
              <li key={r.id} className="card" data-testid="restaurant-row" data-rid={r.id}>
                <Link to={`/restaurants/${r.id}`}>
                  <strong>{r.name}</strong>
                  <br />
                  <span>{r.address}</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
```

`web/src/AppShell.tsx`: replace the `SavedPage` import with `import { RestaurantsPage } from "./records/RestaurantsPage";`, replace the `/saved` route with:
```tsx
          <Route path="/saved" element={<Navigate to="/restaurants" replace />} />
          <Route path="/restaurants" element={<RestaurantsPage />} />
```
and change the nav link to `<NavLink data-testid="nav-saved" to="/restaurants">Saved</NavLink>`. Delete `web/src/pages/SavedPage.tsx` (`git rm web/src/pages/SavedPage.tsx`).

Append to `web/src/styles.css`:
```css
.notice { padding: 0.6rem var(--gap); border: 1px solid #8884; border-radius: 0.5rem; margin: var(--gap) 0; }
.list { list-style: none; padding: 0; margin: var(--gap) 0; display: grid; gap: 0.75rem; }
.card { border: 1px solid #8884; border-radius: 0.5rem; padding: 0.75rem var(--gap); }
.card a { text-decoration: none; color: inherit; display: block; }
.actions { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
.disabled-link { opacity: 0.5; pointer-events: none; }
.field-error { color: #b00020; font-size: 0.9rem; }
.form { display: grid; gap: var(--gap); }
.form label { display: grid; gap: 0.25rem; }
.form input, .form select, .form textarea { font-size: 1rem; padding: 0.6rem; }
.evidence { display: grid; gap: 0.75rem; }
.evidence-kind { border-left: 4px solid #8884; padding-left: 0.75rem; }
.evidence-kind[data-state="needsRechecking"] { border-left-color: #c77700; }
.evidence-kind[data-state="conflicting"] { border-left-color: #b00020; }
.evidence-kind[data-state="current"] { border-left-color: #1f7a4d; }
```

- [ ] **Step 5: Run the page test, then the emulator browser suite**

Run: `npm --prefix web test -- src/records/RestaurantsPage.test.tsx` → PASS, 5 tests.
Run (root, 5 min timeout): `npm run emu:e2e` → the five `auth.spec.ts` scenarios still pass (the `nav-saved` link now leads to `/restaurants`; nothing in those tests clicks it).

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run test:unit`. Expected: green; unit count = previous + 5.

```bash
git add web/src/records web/src/AppShell.tsx web/src/styles.css
git rm -q web/src/pages/SavedPage.tsx
git commit -m "feat(web): Saved tab lists the household's restaurant records with read states and resumable deletion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Restaurant form — create, edit with draft/base version, typed outcomes, deletion protocol UI

**Files:**
- Create: `web/src/records/RestaurantFormPage.tsx`, `web/src/records/RestaurantFormPage.test.tsx`
- Modify: `web/src/AppShell.tsx`

**Interfaces:**
- Consumes: `createRestaurant`, `updateRestaurant`, `deleteRestaurant`, `watchRestaurant`, `WriteOutcome`, `DeleteStep` (Task 8); `normaliseRestaurantInput`, `validateRestaurantInput` (Task 5); `useMember`, `useWatch`, `ReadStateNotice` (Task 9).
- Produces: `RestaurantFormPage({ mode: "create" | "edit" })`; routes `/restaurants/new`, `/restaurants/:rid/edit`.
  Testids: `restaurant-form`, `field-name`, `field-address`, `field-phone`, `field-website`, `error-<field>`, `save-restaurant`, `save-outcome` (data-kind), `changed-elsewhere`, `reload-draft`, `delete-restaurant`, `delete-confirm`, `delete-cancel`, `delete-progress`.
  Exported helper for tests and Task 11: `export function outcomeMessage(kind: WriteOutcome["kind"], what: string): string`.

- [ ] **Step 1: Write the failing form tests**

Create `web/src/records/RestaurantFormPage.test.tsx`:
```tsx
import { MemoryRouter, Route, Routes } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "./types";
import type { Snapshot } from "./repository";

const m = vi.hoisted(() => ({
  createRestaurant: vi.fn(),
  updateRestaurant: vi.fn(),
  deleteRestaurant: vi.fn(),
  watchRestaurant: vi.fn(),
}));
vi.mock("./repository", () => m);
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));

import { RestaurantFormPage } from "./RestaurantFormPage";

let emit: (s: Snapshot<Restaurant>) => void = () => {};
const stored: Restaurant = {
  id: "r1",
  name: "Da Marco",
  address: "Via Roma 1",
  phone: "+39 06",
  lat: 41.9,
  lng: 12.5,
  createdBy: "ava-uid",
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 3,
  deleting: false,
};

beforeEach(() => {
  m.watchRestaurant.mockImplementation((_h: string, _r: string, cb: (s: Snapshot<Restaurant>) => void) => {
    emit = cb;
    return () => {};
  });
});
afterEach(() => vi.clearAllMocks());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/restaurants" element={<p data-testid="list-page">list</p>} />
        <Route path="/restaurants/new" element={<RestaurantFormPage mode="create" />} />
        <Route path="/restaurants/:rid" element={<p data-testid="detail-page">detail</p>} />
        <Route path="/restaurants/:rid/edit" element={<RestaurantFormPage mode="edit" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RestaurantFormPage — create", () => {
  it("validates before writing and shows field errors", async () => {
    renderAt("/restaurants/new");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    expect(screen.getByTestId("error-name")).toHaveTextContent("Enter the restaurant's name.");
    expect(screen.getByTestId("error-address")).toHaveTextContent("Enter the address.");
    expect(m.createRestaurant).not.toHaveBeenCalled();
  });

  it("normalises the input, creates, and navigates to the new detail page", async () => {
    m.createRestaurant.mockResolvedValue({ kind: "ok", value: "new-id" });
    renderAt("/restaurants/new");
    await userEvent.type(screen.getByTestId("field-name"), "  Da Marco ");
    await userEvent.type(screen.getByTestId("field-address"), "Via Roma 1");
    await userEvent.type(screen.getByTestId("field-website"), " https://damarco.it ");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("detail-page")).toBeInTheDocument());
    expect(m.createRestaurant).toHaveBeenCalledWith("home", "ava-uid", { name: "Da Marco", address: "Via Roma 1", website: "https://damarco.it" });
  });

  it("shows the offline outcome and keeps the draft", async () => {
    m.createRestaurant.mockResolvedValue({ kind: "offline" });
    renderAt("/restaurants/new");
    await userEvent.type(screen.getByTestId("field-name"), "Da Marco");
    await userEvent.type(screen.getByTestId("field-address"), "Via Roma 1");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("save-outcome")).toHaveAttribute("data-kind", "offline"));
    expect(screen.getByTestId("field-name")).toHaveValue("Da Marco");
  });
});

describe("RestaurantFormPage — edit", () => {
  it("seeds the draft once from the first snapshot and keeps dirty fields when a newer snapshot arrives", async () => {
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    expect(screen.getByTestId("field-name")).toHaveValue("Da Marco");
    await userEvent.clear(screen.getByTestId("field-name"));
    await userEvent.type(screen.getByTestId("field-name"), "My rename");
    act(() => emit({ status: "ready", value: { ...stored, name: "Bogdan's rename", version: 4 } }));
    expect(screen.getByTestId("field-name")).toHaveValue("My rename");
    expect(screen.getByTestId("changed-elsewhere")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("reload-draft"));
    expect(screen.getByTestId("field-name")).toHaveValue("Bogdan's rename");
    expect(screen.queryByTestId("changed-elsewhere")).toBeNull();
  });

  it("re-seeds silently when the draft is clean and a newer snapshot arrives", () => {
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    act(() => emit({ status: "ready", value: { ...stored, name: "Renamed remotely", version: 4 } }));
    expect(screen.getByTestId("field-name")).toHaveValue("Renamed remotely");
    expect(screen.queryByTestId("changed-elsewhere")).toBeNull();
  });

  it("saves with the base version it was seeded from, and reports a conflict with Reload draft", async () => {
    m.updateRestaurant.mockResolvedValue({ kind: "conflict" });
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    await userEvent.clear(screen.getByTestId("field-phone"));
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("save-outcome")).toHaveAttribute("data-kind", "conflict"));
    expect(m.updateRestaurant).toHaveBeenCalledWith("home", "r1", 3, { name: "Da Marco", address: "Via Roma 1" });
    expect(screen.getByTestId("reload-draft")).toBeInTheDocument();
  });

  it("shows gone when the restaurant disappears, with a link back to the list", () => {
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "gone" }));
    expect(screen.getByTestId("read-gone")).toHaveTextContent("This restaurant was deleted.");
    expect(screen.queryByTestId("restaurant-form")).toBeNull();
  });

  it("deletes only after the in-page confirm, shows progress, then navigates to the list", async () => {
    m.deleteRestaurant.mockImplementation(async (_h: string, _r: string, _v: number, onProgress: (s: string) => void) => {
      onProgress("marking");
      onProgress("sweeping");
      onProgress("removing");
      return { kind: "ok", value: undefined };
    });
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    await userEvent.click(screen.getByTestId("delete-restaurant"));
    expect(m.deleteRestaurant).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(screen.getByTestId("list-page")).toBeInTheDocument());
    expect(m.deleteRestaurant).toHaveBeenCalledWith("home", "r1", 3, expect.any(Function));
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement the page**

Run: `npm --prefix web test -- src/records/RestaurantFormPage.test.tsx` → FAIL (module missing).

Create `web/src/records/RestaurantFormPage.tsx`:
```tsx
import { useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { createRestaurant, deleteRestaurant, updateRestaurant, watchRestaurant, type DeleteStep, type WriteOutcome } from "./repository";
import { ReadStateNotice } from "./ReadStateNotice";
import type { Restaurant } from "./types";
import { useMember } from "./useMember";
import { useWatch } from "./useWatch";
import { normaliseRestaurantInput, validateRestaurantInput, type FieldErrors, type RawRestaurantForm, type RestaurantField } from "./validation";

/** One message per outcome kind; only `conflict` invites a reload (spec §3.5, audit F2). */
export function outcomeMessage(kind: WriteOutcome["kind"], what: string): string {
  switch (kind) {
    case "ok": return `${what} saved.`;
    case "conflict": return `${what} was changed on another device. Reload the draft to see the latest, then apply your change again.`;
    case "notFound": return `${what} was deleted.`;
    case "permission": return "You no longer have access to this household.";
    case "offline": return "You are offline. Connect and try again.";
    case "failed": return `Could not save ${what.toLowerCase()}. Try again.`;
  }
}

const EMPTY: RawRestaurantForm = { name: "", address: "", phone: "", website: "" };
const STEP_TEXT: Record<DeleteStep, string> = { marking: "Marking…", sweeping: "Removing evidence…", removing: "Removing restaurant…" };

function toForm(r: Restaurant): RawRestaurantForm {
  return { name: r.name, address: r.address, phone: r.phone ?? "", website: r.website ?? "" };
}
function same(a: RawRestaurantForm, b: RawRestaurantForm): boolean {
  return a.name === b.name && a.address === b.address && a.phone === b.phone && a.website === b.website;
}

interface Draft {
  form: RawRestaurantForm;
  seededFrom: RawRestaurantForm;
  baseVersion: number;
}

export function RestaurantFormPage({ mode }: { mode: "create" | "edit" }) {
  const { householdId, uid } = useMember();
  const { rid } = useParams();
  const navigate = useNavigate();
  const { state, retry } = useWatch<Restaurant>((cb) => (mode === "edit" && rid ? watchRestaurant(householdId, rid, cb) : () => {}), [householdId, rid, mode]);
  const remote = state.status === "ready" || state.status === "offline" ? state.value : null;

  // The draft is seeded once from the first snapshot; later snapshots only update `remote`
  // (audit F2). A clean draft follows remote silently; a dirty one keeps its fields.
  const [draft, setDraft] = useState<Draft | null>(mode === "create" ? { form: EMPTY, seededFrom: EMPTY, baseVersion: 0 } : null);
  const [errors, setErrors] = useState<FieldErrors<RestaurantField>>({});
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<string | null>(null);

  if (mode === "edit" && remote) {
    if (draft === null) {
      setDraft({ form: toForm(remote), seededFrom: toForm(remote), baseVersion: remote.version });
    } else if (remote.version !== draft.baseVersion && same(draft.form, draft.seededFrom)) {
      setDraft({ form: toForm(remote), seededFrom: toForm(remote), baseVersion: remote.version });
    }
  }

  const dirty = draft !== null && !same(draft.form, draft.seededFrom);
  const changedElsewhere = mode === "edit" && remote !== null && draft !== null && remote.version !== draft.baseVersion && dirty;
  const offline = state.status === "offline";

  function reloadDraft() {
    if (!remote) return;
    setDraft({ form: toForm(remote), seededFrom: toForm(remote), baseVersion: remote.version });
    setOutcome(null);
  }

  function setField(field: RestaurantField, value: string) {
    setDraft((d) => (d ? { ...d, form: { ...d.form, [field]: value } } : d));
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const input = normaliseRestaurantInput(draft.form);
    const problems = validateRestaurantInput(input);
    setErrors(problems);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    const result = mode === "create" ? await createRestaurant(householdId, uid, input) : await updateRestaurant(householdId, rid!, draft.baseVersion, input);
    setBusy(false);
    if (result.kind === "ok") {
      void navigate(mode === "create" ? `/restaurants/${result.value}` : `/restaurants/${rid}`);
      return;
    }
    setOutcome(result.kind);
  }

  async function onDelete() {
    if (!draft || !rid) return;
    setBusy(true);
    const result = await deleteRestaurant(householdId, rid, draft.baseVersion, (step) => setDeleteProgress(STEP_TEXT[step]));
    setBusy(false);
    if (result.kind === "ok") {
      void navigate("/restaurants");
      return;
    }
    setDeleteProgress(null);
    setConfirming(false);
    setOutcome(result.kind);
  }

  if (mode === "edit" && state.status !== "ready" && state.status !== "offline") {
    return (
      <section>
        <h2>Edit restaurant</h2>
        <ReadStateNotice state={state} onRetry={retry} gone={<p>This restaurant was deleted. <Link to="/restaurants">Back to Saved</Link></p>} />
      </section>
    );
  }
  if (!draft) return null;

  return (
    <section>
      <h2>{mode === "create" ? "Add restaurant" : "Edit restaurant"}</h2>
      {mode === "edit" && <ReadStateNotice state={state} onRetry={retry} />}
      {changedElsewhere && (
        <div className="notice" role="status" data-testid="changed-elsewhere">
          <p>This restaurant was changed on another device while you were editing.</p>
          <button type="button" data-testid="reload-draft" onClick={reloadDraft}>Reload draft</button>
        </div>
      )}
      <form className="form" data-testid="restaurant-form" onSubmit={onSubmit} noValidate>
        <label>
          Name
          <input data-testid="field-name" value={draft.form.name} maxLength={200} onChange={(e) => setField("name", e.target.value)} />
          {errors.name && <span className="field-error" data-testid="error-name">{errors.name}</span>}
        </label>
        <label>
          Address
          <input data-testid="field-address" value={draft.form.address} maxLength={400} onChange={(e) => setField("address", e.target.value)} />
          {errors.address && <span className="field-error" data-testid="error-address">{errors.address}</span>}
        </label>
        <label>
          Phone (optional)
          <input data-testid="field-phone" type="tel" value={draft.form.phone} maxLength={60} onChange={(e) => setField("phone", e.target.value)} />
          {errors.phone && <span className="field-error" data-testid="error-phone">{errors.phone}</span>}
        </label>
        <label>
          Website (optional)
          <input data-testid="field-website" type="url" inputMode="url" value={draft.form.website} maxLength={400} onChange={(e) => setField("website", e.target.value)} />
          {errors.website && <span className="field-error" data-testid="error-website">{errors.website}</span>}
        </label>
        <button type="submit" data-testid="save-restaurant" disabled={busy || offline}>
          {busy ? "Saving…" : "Save"}
        </button>
        {outcome && outcome !== "ok" && (
          <div role="alert" data-testid="save-outcome" data-kind={outcome}>
            <p>{outcomeMessage(outcome, "This restaurant")}</p>
            {outcome === "conflict" && <button type="button" data-testid="reload-draft" onClick={reloadDraft}>Reload draft</button>}
            {outcome === "notFound" && <Link to="/restaurants">Back to Saved</Link>}
          </div>
        )}
      </form>
      {mode === "edit" && (
        <div className="actions">
          {!confirming && (
            <button type="button" data-testid="delete-restaurant" disabled={busy || offline} onClick={() => setConfirming(true)}>Delete restaurant</button>
          )}
          {confirming && deleteProgress === null && (
            <>
              <span>Delete this restaurant and all of its evidence?</span>
              <button type="button" data-testid="delete-confirm" onClick={() => void onDelete()}>Yes, delete</button>
              <button type="button" data-testid="delete-cancel" onClick={() => setConfirming(false)}>Cancel</button>
            </>
          )}
          {deleteProgress !== null && <span data-testid="delete-progress">{deleteProgress}</span>}
        </div>
      )}
    </section>
  );
}
```
Note: `setDraft` during render (the two seeding branches) is React's sanctioned "derive state from props" pattern: it happens only when `draft` lags `remote`, and React re-renders immediately without committing. If the linter complains, keep the behaviour and add an inline comment; do not move seeding into an effect (an effect would flash the old values).

Routes in `web/src/AppShell.tsx` (add import `import { RestaurantFormPage } from "./records/RestaurantFormPage";`), after the `/restaurants` route:
```tsx
          <Route path="/restaurants/new" element={<RestaurantFormPage mode="create" />} />
          <Route path="/restaurants/:rid/edit" element={<RestaurantFormPage mode="edit" />} />
```

- [ ] **Step 3: Run the form tests**

Run: `npm --prefix web test -- src/records/RestaurantFormPage.test.tsx` → PASS, 8 tests. If the two-`reload-draft` testid collision (notice + conflict block) makes `getByTestId` ambiguous in the conflict test, that test triggers only the conflict block (the draft is not dirty relative to a changed remote), so it is unambiguous; if it still collides, use `getAllByTestId(...)[0]` in the test.

- [ ] **Step 4: Gate and commit**

Run: `npm run typecheck && npm run test:unit`. Expected: green; unit count = previous + 8.

```bash
git add web/src/records/RestaurantFormPage.tsx web/src/records/RestaurantFormPage.test.tsx web/src/AppShell.tsx
git commit -m "feat(web): restaurant form — create/edit with a draft kept apart from snapshots, typed save outcomes, in-page delete confirm running the deletion protocol

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Restaurant detail with evidence by kind, claim form, call-ahead prompts

**Files:**
- Create: `web/src/records/callAhead.ts`, `web/src/records/RestaurantDetailPage.tsx`, `web/src/records/RestaurantDetailPage.test.tsx`, `web/src/records/ClaimFormPage.tsx`, `web/src/records/ClaimFormPage.test.tsx`
- Modify: `web/src/AppShell.tsx`

**Interfaces:**
- Consumes: Task 5 (`summariseEvidence`, `evidenceStatus`, `formatCalendarDate`, labels, `validateClaimInput`, `isCalendarDate`), Task 8 (`watchRestaurant`, `watchClaims`, `addClaim`, `deleteClaim`), Task 9 hooks/notice, Task 10 `outcomeMessage`.
- Produces: `RestaurantDetailPage`, `ClaimFormPage`, `CALL_AHEAD_GROUPS`. Routes `/restaurants/:rid`, `/restaurants/:rid/evidence/new`.
  Detail testids: `restaurant-name`, `restaurant-address`, `restaurant-phone`, `restaurant-website`, `edit-restaurant`, `add-evidence`, `evidence-<kind>` (data-state unknown|current|needsRechecking|conflicting), `claim-<id>`, `claim-delete-<id>`, `claim-delete-confirm-<id>`, `claim-outcome`, `call-ahead`.
  Claim form testids: `claim-form`, `claim-kind`, `claim-value`, `claim-detail`, `claim-source-type`, `claim-source-label`, `claim-source-url`, `claim-checked-at`, `claim-expires-at`, `claim-submit`, `claim-error-<field>`, `claim-save-outcome` (data-kind).

- [ ] **Step 1: Create the call-ahead copy**

Create `web/src/records/callAhead.ts`:
```ts
/**
 * "Call ahead and ask" prompts, ported from the Swift app's Localizable.strings (ask_general,
 * ask_italian, ask_asian, ask_bakery) and labelled by group; only the first group is general.
 */
export const CALL_AHEAD_GROUPS: ReadonlyArray<{ label: string; questions: readonly string[] }> = [
  { label: "Anywhere", questions: ["Do you have a dedicated fryer for gluten-free items?", "How do you prevent cross-contamination?"] },
  { label: "Italian", questions: ["Does your pasta come from a dedicated cooking station?", "Is your pizza base made in a separate area?"] },
  { label: "Asian", questions: ["Does your soy sauce contain wheat?", "Do you use a separate wok for gluten-free orders?"] },
  { label: "Bakeries", questions: ["Are gluten-free items prepared in a separate area?", "Do you change gloves between orders?"] },
];
```

- [ ] **Step 2: Write the failing detail-page test**

Create `web/src/records/RestaurantDetailPage.test.tsx`:
```tsx
import { MemoryRouter, Route, Routes } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Claim, Restaurant } from "./types";
import type { Snapshot } from "./repository";

const m = vi.hoisted(() => ({ watchRestaurant: vi.fn(), watchClaims: vi.fn(), deleteClaim: vi.fn() }));
vi.mock("./repository", () => m);
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));
vi.mock("./useToday", () => ({ useToday: () => "2026-09-21" }));

import { RestaurantDetailPage } from "./RestaurantDetailPage";

let emitRestaurant: (s: Snapshot<Restaurant>) => void = () => {};
let emitClaims: (s: Snapshot<Claim[]>) => void = () => {};
const restaurant: Restaurant = { id: "r1", name: "Da Marco", address: "Via Roma 1", phone: "+39 06 1", website: "https://damarco.it", createdBy: "ava-uid", createdAt: new Date(), updatedAt: new Date(), version: 2, deleting: false };
const claim = (over: Partial<Claim> & Pick<Claim, "id">): Claim => ({
  kind: "separateFryer", value: "yes", detail: "", source: { type: "restaurantStatement", label: "Manager" }, checkedAt: "2026-09-01",
  authorUid: "ava-uid", authorName: "Ava", createdAt: new Date("2026-09-01T10:00:00Z"), ...over,
});

beforeEach(() => {
  m.watchRestaurant.mockImplementation((_h: string, _r: string, cb: (s: Snapshot<Restaurant>) => void) => { emitRestaurant = cb; return () => {}; });
  m.watchClaims.mockImplementation((_h: string, _r: string, cb: (s: Snapshot<Claim[]>) => void) => { emitClaims = cb; return () => {}; });
  m.deleteClaim.mockResolvedValue({ kind: "ok", value: undefined });
});
afterEach(() => vi.clearAllMocks());

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/restaurants/r1"]}>
      <Routes>
        <Route path="/restaurants/:rid" element={<RestaurantDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RestaurantDetailPage", () => {
  it("shows facts, six unknown kinds and the call-ahead block when there are no claims", () => {
    renderPage();
    act(() => { emitRestaurant({ status: "ready", value: restaurant }); emitClaims({ status: "ready", value: [] }); });
    expect(screen.getByTestId("restaurant-name")).toHaveTextContent("Da Marco");
    expect(screen.getByTestId("restaurant-phone")).toHaveAttribute("href", "tel:+39 06 1");
    expect(screen.getByTestId("restaurant-website")).toHaveAttribute("href", "https://damarco.it");
    for (const kind of ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"]) {
      expect(screen.getByTestId(`evidence-${kind}`)).toHaveAttribute("data-state", "unknown");
    }
    const callAhead = screen.getByTestId("call-ahead");
    expect(callAhead).toHaveTextContent("Anywhere");
    expect(callAhead).toHaveTextContent("Italian");
    expect(callAhead).toHaveTextContent("Do you have a dedicated fryer for gluten-free items?");
    expect(screen.getByTestId("edit-restaurant")).toHaveAttribute("href", "/restaurants/r1/edit");
    expect(screen.getByTestId("add-evidence")).toHaveAttribute("href", "/restaurants/r1/evidence/new");
  });

  it("renders current, needs-rechecking and conflicting states with dates, sources and authors", () => {
    renderPage();
    act(() => {
      emitRestaurant({ status: "ready", value: restaurant });
      emitClaims({
        status: "ready",
        value: [
          claim({ id: "acc", kind: "accreditation", source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/v/1" }, checkedAt: "2026-06-01" }),
          claim({ id: "stale", kind: "gfMenu", checkedAt: "2025-01-15", authorName: "Bogdan" }),
          claim({ id: "y", kind: "separateFryer", value: "yes", checkedAt: "2026-09-10" }),
          claim({ id: "n", kind: "separateFryer", value: "no", checkedAt: "2026-09-10", source: { type: "ownVisit", label: "Saw a shared fryer" } }),
        ],
      });
    });
    const acc = screen.getByTestId("evidence-accreditation");
    expect(acc).toHaveAttribute("data-state", "current");
    expect(acc).toHaveTextContent("Coeliac UK");
    expect(acc.querySelector("a[href='https://coeliac.org.uk/v/1']")).not.toBeNull();
    expect(acc).toHaveTextContent("1 June 2026");
    const menu = screen.getByTestId("evidence-gfMenu");
    expect(menu).toHaveAttribute("data-state", "needsRechecking");
    expect(menu).toHaveTextContent("Needs rechecking");
    expect(menu).toHaveTextContent("Bogdan");
    const fryer = screen.getByTestId("evidence-separateFryer");
    expect(fryer).toHaveAttribute("data-state", "conflicting");
    expect(fryer).toHaveTextContent("Conflicting evidence — check before you go");
    expect(screen.getByTestId("claim-y")).toBeInTheDocument();
    expect(screen.getByTestId("claim-n")).toBeInTheDocument();
  });

  it("deletes a claim only after its in-page confirm", async () => {
    renderPage();
    act(() => { emitRestaurant({ status: "ready", value: restaurant }); emitClaims({ status: "ready", value: [claim({ id: "c1" })] }); });
    await userEvent.click(screen.getByTestId("claim-delete-c1"));
    expect(m.deleteClaim).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("claim-delete-confirm-c1"));
    await waitFor(() => expect(m.deleteClaim).toHaveBeenCalledWith("home", "r1", "c1"));
  });

  it("shows gone when the restaurant is deleted and disables Add evidence when offline", () => {
    const { unmount } = renderPage();
    act(() => emitRestaurant({ status: "gone" }));
    expect(screen.getByTestId("read-gone")).toHaveTextContent("This restaurant was deleted.");
    unmount();
    renderPage();
    act(() => { emitRestaurant({ status: "offline", value: restaurant }); emitClaims({ status: "offline", value: [] }); });
    expect(screen.getByTestId("add-evidence")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("read-offline")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement the detail page**

Create `web/src/records/RestaurantDetailPage.tsx`:
```tsx
import { useState } from "react";
import { Link, useParams } from "react-router";
import { CALL_AHEAD_GROUPS } from "./callAhead";
import { formatCalendarDate } from "./dates";
import { evidenceStatus, summariseEvidence, type KindEvidence } from "./evidence";
import { deleteClaim, watchClaims, watchRestaurant, type WriteOutcome } from "./repository";
import { ReadStateNotice } from "./ReadStateNotice";
import { outcomeMessage } from "./RestaurantFormPage";
import { CLAIM_KIND_LABELS, CLAIM_VALUE_LABELS, SOURCE_TYPE_LABELS, type CalendarDate, type Claim, type Restaurant } from "./types";
import { useMember } from "./useMember";
import { useToday } from "./useToday";
import { useWatch } from "./useWatch";

const STATE_TEXT: Record<KindEvidence["state"], string> = {
  unknown: "Unknown — no evidence recorded yet.",
  current: "Current",
  needsRechecking: "Needs rechecking",
  conflicting: "Conflicting evidence — check before you go",
};

function ClaimCard({ claim, today, disabled, onDelete }: { claim: Claim; today: CalendarDate; disabled: boolean; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const status = evidenceStatus(claim, today);
  return (
    <div className="card" data-testid={`claim-${claim.id}`} data-status={status}>
      <p>
        <strong>{CLAIM_VALUE_LABELS[claim.value]}</strong>
        {claim.detail && <> — {claim.detail}</>}
      </p>
      <p>
        Source: {SOURCE_TYPE_LABELS[claim.source.type]} — {claim.source.url ? <a href={claim.source.url} target="_blank" rel="noreferrer">{claim.source.label}</a> : claim.source.label}
      </p>
      <p>
        Checked {formatCalendarDate(claim.checkedAt)}
        {claim.expiresAt && <> · valid until {formatCalendarDate(claim.expiresAt)}</>} · by {claim.authorName}
        {status === "needsRechecking" && <> · <em>needs rechecking</em></>}
      </p>
      <div className="actions">
        {!confirming && <button type="button" data-testid={`claim-delete-${claim.id}`} disabled={disabled} onClick={() => setConfirming(true)}>Delete</button>}
        {confirming && (
          <>
            <span>Delete this evidence?</span>
            <button type="button" data-testid={`claim-delete-confirm-${claim.id}`} onClick={() => onDelete(claim.id)}>Yes, delete</button>
            <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

export function RestaurantDetailPage() {
  const { householdId } = useMember();
  const { rid } = useParams();
  const today = useToday();
  const restaurantWatch = useWatch<Restaurant>((cb) => watchRestaurant(householdId, rid!, cb), [householdId, rid]);
  const claimsWatch = useWatch<Claim[]>((cb) => watchClaims(householdId, rid!, cb), [householdId, rid]);
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);

  const rs = restaurantWatch.state;
  const cs = claimsWatch.state;
  if (rs.status !== "ready" && rs.status !== "offline") {
    return (
      <section>
        <ReadStateNotice state={rs} onRetry={restaurantWatch.retry} gone={<p>This restaurant was deleted. <Link to="/restaurants">Back to Saved</Link></p>} />
      </section>
    );
  }
  const restaurant = rs.value;
  const offline = rs.status === "offline" || cs.status === "offline";
  const claims = cs.status === "ready" || cs.status === "offline" ? cs.value : [];
  const summary = summariseEvidence(claims, today);

  async function onDeleteClaim(cid: string) {
    const result = await deleteClaim(householdId, rid!, cid);
    setOutcome(result.kind === "ok" ? null : result.kind);
  }

  return (
    <section>
      <ReadStateNotice state={rs} onRetry={restaurantWatch.retry} />
      {rs.status === "ready" && cs.status !== "ready" && cs.status !== "loading" && <ReadStateNotice state={cs} onRetry={claimsWatch.retry} />}
      <h2 data-testid="restaurant-name">{restaurant.name}</h2>
      <p data-testid="restaurant-address">{restaurant.address}</p>
      <p className="actions">
        {restaurant.phone && <a data-testid="restaurant-phone" href={`tel:${restaurant.phone}`}>Call {restaurant.phone}</a>}
        {restaurant.website && <a data-testid="restaurant-website" href={restaurant.website} target="_blank" rel="noreferrer">Website</a>}
        <Link data-testid="edit-restaurant" to={`/restaurants/${restaurant.id}/edit`}>Edit</Link>
      </p>

      <h3>Evidence</h3>
      <p>
        <Link
          to={`/restaurants/${restaurant.id}/evidence/new`}
          data-testid="add-evidence"
          aria-disabled={offline ? "true" : undefined}
          className={offline ? "disabled-link" : undefined}
          onClick={(e) => { if (offline) e.preventDefault(); }}
        >
          Add evidence
        </Link>
      </p>
      {outcome && <p role="alert" data-testid="claim-outcome" data-kind={outcome}>{outcomeMessage(outcome, "This evidence")}</p>}
      <div className="evidence">
        {summary.map((entry) => (
          <div key={entry.kind} className="evidence-kind" data-testid={`evidence-${entry.kind}`} data-state={entry.state}>
            <h4>{CLAIM_KIND_LABELS[entry.kind]}</h4>
            <p>{STATE_TEXT[entry.state]}</p>
            {entry.state === "conflicting" && entry.tied.map((c) => <ClaimCard key={c.id} claim={c} today={today} disabled={offline} onDelete={(id) => void onDeleteClaim(id)} />)}
            {(entry.state === "current" || entry.state === "needsRechecking") && (
              <ClaimCard claim={entry.latest} today={today} disabled={offline} onDelete={(id) => void onDeleteClaim(id)} />
            )}
            {entry.state !== "unknown" && entry.history.length > 0 && (
              <details>
                <summary>Older evidence ({entry.history.length})</summary>
                {entry.history.map((c) => <ClaimCard key={c.id} claim={c} today={today} disabled={offline} onDelete={(id) => void onDeleteClaim(id)} />)}
              </details>
            )}
          </div>
        ))}
      </div>

      <section className="notice" data-testid="call-ahead">
        <h3>Call ahead and ask</h3>
        <p>Evidence goes out of date. Before you go, ring and ask:</p>
        {CALL_AHEAD_GROUPS.map((group) => (
          <div key={group.label}>
            <strong>{group.label}</strong>
            <ul>
              {group.questions.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </div>
        ))}
      </section>
    </section>
  );
}
```

Run: `npm --prefix web test -- src/records/RestaurantDetailPage.test.tsx` → PASS, 4 tests.

- [ ] **Step 4: Write the failing claim-form test**

Create `web/src/records/ClaimFormPage.test.tsx`:
```tsx
import { MemoryRouter, Route, Routes } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ addClaim: vi.fn() }));
vi.mock("./repository", () => m);
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));
vi.mock("./useToday", () => ({ useToday: () => "2026-09-21" }));

import { ClaimFormPage } from "./ClaimFormPage";

afterEach(() => vi.clearAllMocks());

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/restaurants/r1/evidence/new"]}>
      <Routes>
        <Route path="/restaurants/:rid" element={<p data-testid="detail-page">detail</p>} />
        <Route path="/restaurants/:rid/evidence/new" element={<ClaimFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClaimFormPage", () => {
  it("defaults the checked date to today and caps it there", () => {
    renderPage();
    const checked = screen.getByTestId("claim-checked-at");
    expect(checked).toHaveValue("2026-09-21");
    expect(checked).toHaveAttribute("max", "2026-09-21");
  });

  it("requires a URL for an accrediting body and forces that source type for accreditation", async () => {
    renderPage();
    await userEvent.selectOptions(screen.getByTestId("claim-kind"), "accreditation");
    expect(screen.getByTestId("claim-source-type")).toHaveValue("accreditingBody");
    expect(screen.getByTestId("claim-source-type")).toBeDisabled();
    await userEvent.type(screen.getByTestId("claim-source-label"), "Coeliac UK");
    await userEvent.click(screen.getByTestId("claim-submit"));
    expect(screen.getByTestId("claim-error-sourceUrl")).toHaveTextContent("An accrediting body needs a link to its listing.");
    expect(m.addClaim).not.toHaveBeenCalled();
  });

  it("submits a normalised claim (blank expiry omitted) and navigates back to the detail page", async () => {
    m.addClaim.mockResolvedValue({ kind: "ok", value: "c9" });
    renderPage();
    await userEvent.selectOptions(screen.getByTestId("claim-kind"), "separateFryer");
    await userEvent.selectOptions(screen.getByTestId("claim-value"), "no");
    await userEvent.type(screen.getByTestId("claim-detail"), " Shared fryer with battered fish. ");
    await userEvent.selectOptions(screen.getByTestId("claim-source-type"), "ownVisit");
    await userEvent.type(screen.getByTestId("claim-source-label"), " Visit on a Friday ");
    // jsdom date inputs reject character-by-character typing; set the value directly.
    fireEvent.change(screen.getByTestId("claim-checked-at"), { target: { value: "2026-09-19" } });
    await userEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(screen.getByTestId("detail-page")).toBeInTheDocument());
    expect(m.addClaim).toHaveBeenCalledWith("home", "r1", { uid: "ava-uid", displayName: "Ava" }, {
      kind: "separateFryer",
      value: "no",
      detail: "Shared fryer with battered fish.",
      source: { type: "ownVisit", label: "Visit on a Friday" },
      checkedAt: "2026-09-19",
    });
  });

  it("shows the not-found outcome when the restaurant was deleted meanwhile", async () => {
    m.addClaim.mockResolvedValue({ kind: "notFound" });
    renderPage();
    await userEvent.type(screen.getByTestId("claim-source-label"), "Manager");
    await userEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(screen.getByTestId("claim-save-outcome")).toHaveAttribute("data-kind", "notFound"));
    expect(screen.getByTestId("claim-save-outcome")).toHaveTextContent("This restaurant was deleted.");
  });
});
```

- [ ] **Step 5: Run to verify failure, then implement the claim form**

Create `web/src/records/ClaimFormPage.tsx`:
```tsx
import { useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { addClaim, type WriteOutcome } from "./repository";
import { outcomeMessage } from "./RestaurantFormPage";
import { CLAIM_KINDS, CLAIM_KIND_LABELS, CLAIM_VALUES, CLAIM_VALUE_LABELS, SOURCE_TYPES, SOURCE_TYPE_LABELS, type ClaimInput, type ClaimKind, type ClaimValue, type SourceType } from "./types";
import { useMember } from "./useMember";
import { useToday } from "./useToday";
import { validateClaimInput, type ClaimField, type FieldErrors } from "./validation";

interface RawClaimForm {
  kind: ClaimKind;
  value: ClaimValue;
  detail: string;
  sourceType: SourceType;
  sourceLabel: string;
  sourceUrl: string;
  checkedAt: string;
  expiresAt: string;
}

/** Form strings → write input: trimmed, blank optionals omitted (the rules refuse empty optionals). */
export function toClaimInput(form: RawClaimForm): ClaimInput {
  const input: ClaimInput = {
    kind: form.kind,
    value: form.value,
    detail: form.detail.trim(),
    source: { type: form.sourceType, label: form.sourceLabel.trim() },
    checkedAt: form.checkedAt,
  };
  const url = form.sourceUrl.trim();
  if (url !== "") input.source.url = url;
  if (form.expiresAt.trim() !== "") input.expiresAt = form.expiresAt.trim();
  return input;
}

export function ClaimFormPage() {
  const { householdId, uid, displayName } = useMember();
  const { rid } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const [form, setForm] = useState<RawClaimForm>({ kind: "dedicatedKitchen", value: "yes", detail: "", sourceType: "restaurantStatement", sourceLabel: "", sourceUrl: "", checkedAt: today, expiresAt: "" });
  const [errors, setErrors] = useState<FieldErrors<ClaimField>>({});
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [busy, setBusy] = useState(false);

  const accreditation = form.kind === "accreditation";
  const urlRequired = form.sourceType === "accreditingBody";

  function set<K extends keyof RawClaimForm>(key: K, value: RawClaimForm[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Owner rule: accreditation must come from the accrediting body (spec §2.1, §3.5 URL policy).
      if (key === "kind" && value === "accreditation") next.sourceType = "accreditingBody";
      return next;
    });
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = toClaimInput(form);
    const problems = validateClaimInput(input, today);
    setErrors(problems);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    const result = await addClaim(householdId, rid!, { uid, displayName }, input);
    setBusy(false);
    if (result.kind === "ok") {
      void navigate(`/restaurants/${rid}`);
      return;
    }
    setOutcome(result.kind);
  }

  const err = (field: ClaimField) => errors[field] && <span className="field-error" data-testid={`claim-error-${field}`}>{errors[field]}</span>;

  return (
    <section>
      <h2>Add evidence</h2>
      <p>Record one fact you checked, where it came from and when. Unknown stays unknown; a note never counts as accreditation.</p>
      <form className="form" data-testid="claim-form" onSubmit={onSubmit} noValidate>
        <label>
          What is this about?
          <select data-testid="claim-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as ClaimKind)}>
            {CLAIM_KINDS.map((k) => <option key={k} value={k}>{CLAIM_KIND_LABELS[k]}</option>)}
          </select>
          {err("kind")}
        </label>
        <label>
          Answer
          <select data-testid="claim-value" value={form.value} onChange={(e) => set("value", e.target.value as ClaimValue)}>
            {CLAIM_VALUES.map((v) => <option key={v} value={v}>{CLAIM_VALUE_LABELS[v]}</option>)}
          </select>
          {err("value")}
        </label>
        <label>
          Details (optional)
          <textarea data-testid="claim-detail" rows={3} value={form.detail} onChange={(e) => set("detail", e.target.value)} />
          {err("detail")}
        </label>
        <label>
          Where did this come from?
          <select data-testid="claim-source-type" value={form.sourceType} disabled={accreditation} onChange={(e) => set("sourceType", e.target.value as SourceType)}>
            {SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}
          </select>
          {err("sourceType")}
        </label>
        <label>
          Source description
          <input data-testid="claim-source-label" value={form.sourceLabel} placeholder="e.g. Phone call with the manager" onChange={(e) => set("sourceLabel", e.target.value)} />
          {err("sourceLabel")}
        </label>
        <label>
          Link {urlRequired ? "(required for an accrediting body)" : "(optional)"}
          <input data-testid="claim-source-url" type="url" inputMode="url" value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} />
          {err("sourceUrl")}
        </label>
        <label>
          Date checked
          <input data-testid="claim-checked-at" type="date" max={today} value={form.checkedAt} onChange={(e) => set("checkedAt", e.target.value)} />
          {err("checkedAt")}
        </label>
        <label>
          Valid until (optional, e.g. an accreditation's expiry)
          <input data-testid="claim-expires-at" type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
          {err("expiresAt")}
        </label>
        <button type="submit" data-testid="claim-submit" disabled={busy}>{busy ? "Saving…" : "Save evidence"}</button>
        {outcome && outcome !== "ok" && (
          <div role="alert" data-testid="claim-save-outcome" data-kind={outcome}>
            <p>{outcomeMessage(outcome, "This restaurant")}</p>
            {outcome === "notFound" && <Link to="/restaurants">Back to Saved</Link>}
          </div>
        )}
      </form>
    </section>
  );
}
```
Note: `outcomeMessage(kind, "This restaurant")` deliberately names the restaurant for `notFound` (the parent is what disappeared); for `offline`/`permission` the message is subject-free.

Routes in `web/src/AppShell.tsx` (add imports for `RestaurantDetailPage` and `ClaimFormPage`), after the `/restaurants/:rid/edit` route — order matters for React Router only by specificity, so place them anywhere inside `<Routes>`:
```tsx
          <Route path="/restaurants/:rid" element={<RestaurantDetailPage />} />
          <Route path="/restaurants/:rid/evidence/new" element={<ClaimFormPage />} />
```

Run: `npm --prefix web test -- src/records` → PASS (all records tests; ClaimFormPage 4).

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run test:unit`. Expected: green; unit count = previous + 8.

```bash
git add web/src/records web/src/AppShell.tsx
git commit -m "feat(web): restaurant detail with evidence by kind (unknown/current/needs rechecking/conflicting), claim form with the URL policy, call-ahead prompts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Browser suite for records (seven scenarios), documentation, spec bookkeeping

**Files:**
- Create: `web/e2e/emulator-rest.ts`, `web/e2e/records.spec.ts`
- Modify: `README.md`, `planning/specs/2026-09-20-safebite-pwa-design.md`

**Interfaces:**
- Consumes: every testid from Tasks 9–11; the seeded accounts `ava@safebite.test`, `bogdan@safebite.test`, `stranger@safebite.test` / `pilot-password-1` (functions/src/seed-emulator.ts); household id `home`.
- Produces (test-only):
  ```ts
  // web/e2e/emulator-rest.ts — Firestore emulator REST with the emulator's admin bearer token
  export async function clearRecords(request: APIRequestContext): Promise<void>;
  export async function seedRestaurant(request: APIRequestContext, id: string, over?: { name?: string; deleting?: boolean; version?: number }): Promise<void>;
  export async function seedClaim(request: APIRequestContext, rid: string, id: string, over?: { kind?: string; value?: string; checkedAt?: string }): Promise<void>;
  export async function markDeletingViaRest(request: APIRequestContext, rid: string): Promise<void>;
  export async function listRestaurantIds(request: APIRequestContext): Promise<string[]>;
  export async function listClaimIds(request: APIRequestContext, rid: string): Promise<string[]>;
  export async function restaurantExists(request: APIRequestContext, rid: string): Promise<boolean>;
  ```

- [ ] **Step 1: Verify the emulator's admin token empirically (zero-assumption)**

Run (root, 5 min timeout):
```bash
FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:exec --only firestore --project demo-safebite \
  "curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer owner' -H 'Content-Type: application/json' -X POST 'http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents/households/home/restaurants?documentId=probe' -d '{\"fields\":{\"name\":{\"stringValue\":\"probe\"}}}' && curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer owner' -X DELETE 'http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents/households/home/restaurants/probe'"
```
Expected: `200` twice (the emulator treats `Bearer owner` as the Admin SDK and bypasses rules). If either is not `200`, stop and report; the helpers below depend on it.

- [ ] **Step 2: Write the REST helpers**

Create `web/e2e/emulator-rest.ts`:
```ts
import type { APIRequestContext } from "@playwright/test";

/**
 * Direct Firestore-emulator access for test setup and verification, bypassing rules with the
 * emulator's admin token. Only ever talks to 127.0.0.1:8080 (project demo-safebite).
 */
const BASE = "http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents";
const HEADERS = { Authorization: "Bearer owner", "Content-Type": "application/json" };

interface RestDoc { name: string; fields?: Record<string, unknown> }

async function listDocs(request: APIRequestContext, collectionPath: string): Promise<RestDoc[]> {
  const res = await request.get(`${BASE}/${collectionPath}?pageSize=300`, { headers: HEADERS });
  if (!res.ok()) throw new Error(`list ${collectionPath}: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { documents?: RestDoc[] };
  return body.documents ?? [];
}

const idOf = (d: RestDoc) => d.name.slice(d.name.lastIndexOf("/") + 1);

async function del(request: APIRequestContext, docPath: string): Promise<void> {
  const res = await request.delete(`${BASE}/${docPath}`, { headers: HEADERS });
  if (!res.ok()) throw new Error(`delete ${docPath}: ${res.status()} ${await res.text()}`);
}

/** Removes every restaurant (and its claims) under households/home. Seeds (users/households) are untouched. */
export async function clearRecords(request: APIRequestContext): Promise<void> {
  for (const r of await listDocs(request, "households/home/restaurants")) {
    const rid = idOf(r);
    for (const c of await listDocs(request, `households/home/restaurants/${rid}/claims`)) {
      await del(request, `households/home/restaurants/${rid}/claims/${idOf(c)}`);
    }
    await del(request, `households/home/restaurants/${rid}`);
  }
}

const s = (v: string) => ({ stringValue: v });
const ts = (iso: string) => ({ timestampValue: iso });

export async function seedRestaurant(request: APIRequestContext, id: string, over: { name?: string; deleting?: boolean; version?: number } = {}): Promise<void> {
  const res = await request.post(`${BASE}/households/home/restaurants?documentId=${id}`, {
    headers: HEADERS,
    data: {
      fields: {
        name: s(over.name ?? `Seeded ${id}`),
        address: s("1 Seed Street, Testville"),
        createdBy: s("ava-uid"),
        createdAt: ts("2026-09-01T10:00:00Z"),
        updatedAt: ts("2026-09-01T10:00:00Z"),
        version: { integerValue: String(over.version ?? 1) },
        deleting: { booleanValue: over.deleting ?? false },
      },
    },
  });
  if (!res.ok()) throw new Error(`seedRestaurant ${id}: ${res.status()} ${await res.text()}`);
}

export async function seedClaim(request: APIRequestContext, rid: string, id: string, over: { kind?: string; value?: string; checkedAt?: string } = {}): Promise<void> {
  const res = await request.post(`${BASE}/households/home/restaurants/${rid}/claims?documentId=${id}`, {
    headers: HEADERS,
    data: {
      fields: {
        kind: s(over.kind ?? "gfMenu"),
        value: s(over.value ?? "yes"),
        detail: s("Seeded claim"),
        source: { mapValue: { fields: { type: s("restaurantStatement"), label: s("Seed") } } },
        checkedAt: ts(`${over.checkedAt ?? "2026-09-01"}T00:00:00Z`),
        authorUid: s("ava-uid"),
        authorName: s("Ava"),
        createdAt: ts("2026-09-01T10:00:00Z"),
      },
    },
  });
  if (!res.ok()) throw new Error(`seedClaim ${rid}/${id}: ${res.status()} ${await res.text()}`);
}

/** Models an interrupted deletion: step 1 (the mark) committed, nothing else. */
export async function markDeletingViaRest(request: APIRequestContext, rid: string): Promise<void> {
  const url = `${BASE}/households/home/restaurants/${rid}?updateMask.fieldPaths=deleting&updateMask.fieldPaths=version&updateMask.fieldPaths=updatedAt`;
  const res = await request.patch(url, {
    headers: HEADERS,
    data: { fields: { deleting: { booleanValue: true }, version: { integerValue: "2" }, updatedAt: ts("2026-09-02T10:00:00Z") } },
  });
  if (!res.ok()) throw new Error(`markDeleting ${rid}: ${res.status()} ${await res.text()}`);
}

export async function listRestaurantIds(request: APIRequestContext): Promise<string[]> {
  return (await listDocs(request, "households/home/restaurants")).map(idOf);
}

export async function listClaimIds(request: APIRequestContext, rid: string): Promise<string[]> {
  return (await listDocs(request, `households/home/restaurants/${rid}/claims`)).map(idOf);
}

export async function restaurantExists(request: APIRequestContext, rid: string): Promise<boolean> {
  const res = await request.get(`${BASE}/households/home/restaurants/${rid}`, { headers: HEADERS });
  return res.status() === 200;
}
```

- [ ] **Step 3: Write the seven scenarios**

Create `web/e2e/records.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { clearRecords, listClaimIds, listRestaurantIds, markDeletingViaRest, restaurantExists, seedClaim, seedRestaurant } from "./emulator-rest";

const PASSWORD = "pilot-password-1";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-saved").or(page.getByTestId("not-invited"))).toBeVisible();
}

async function signOutAndWait(page: Page) {
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible();
}

const KINDS = ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return isoDay(d);
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test.beforeEach(async ({ request }) => {
  await clearRecords(request);
});

test("1. a member adds a restaurant and sees it with six unknown kinds and the call-ahead prompts", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurants-empty")).toBeVisible();
  await page.getByTestId("add-restaurant").click();
  await page.getByTestId("field-name").fill("Da Marco");
  await page.getByTestId("field-address").fill("Via Roma 1, Rome");
  await page.getByTestId("field-website").fill("https://damarco.test");
  await page.getByTestId("save-restaurant").click();

  await expect(page.getByTestId("restaurant-name")).toHaveText("Da Marco");
  await expect(page.getByTestId("restaurant-website")).toHaveAttribute("href", "https://damarco.test");
  for (const kind of KINDS) await expect(page.getByTestId(`evidence-${kind}`)).toHaveAttribute("data-state", "unknown");
  await expect(page.getByTestId("call-ahead")).toContainText("Do you have a dedicated fryer for gluten-free items?");
  await expect(page.getByTestId("call-ahead")).toContainText("Italian");

  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurant-row")).toContainText("Da Marco");
});

test("2. evidence: accreditation needs a link; current, needs-rechecking and conflicting states render", async ({ page, request }) => {
  await seedRestaurant(request, "r-ev", { name: "Evidence Place" });
  await signIn(page, "ava@safebite.test");

  await page.goto("/restaurants/r-ev/evidence/new");
  await page.getByTestId("claim-kind").selectOption("accreditation");
  await expect(page.getByTestId("claim-source-type")).toHaveValue("accreditingBody");
  await page.getByTestId("claim-source-label").fill("Coeliac UK");
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("claim-error-sourceUrl")).toContainText("needs a link");
  await page.getByTestId("claim-source-url").fill("https://coeliac.org.uk/venues/1");
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("evidence-accreditation")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("evidence-accreditation")).toContainText("Coeliac UK");

  await page.getByTestId("add-evidence").click();
  await page.getByTestId("claim-kind").selectOption("separateFryer");
  await page.getByTestId("claim-source-type").selectOption("restaurantStatement");
  await page.getByTestId("claim-source-label").fill("Manager, last year");
  await page.getByTestId("claim-checked-at").fill(monthsAgo(13));
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("evidence-separateFryer")).toHaveAttribute("data-state", "needsRechecking");
  await expect(page.getByTestId("evidence-separateFryer")).toContainText("Needs rechecking");

  for (const value of ["yes", "no"]) {
    await page.getByTestId("add-evidence").click();
    await page.getByTestId("claim-kind").selectOption("separateFryer");
    await page.getByTestId("claim-value").selectOption(value);
    await page.getByTestId("claim-source-type").selectOption(value === "yes" ? "restaurantStatement" : "ownVisit");
    await page.getByTestId("claim-source-label").fill(value === "yes" ? "Waiter" : "Saw a shared fryer");
    await page.getByTestId("claim-checked-at").fill(localToday());
    await page.getByTestId("claim-submit").click();
    await expect(page.getByTestId("restaurant-name")).toBeVisible();
  }
  await expect(page.getByTestId("evidence-separateFryer")).toHaveAttribute("data-state", "conflicting");
  await expect(page.getByTestId("evidence-separateFryer")).toContainText("Conflicting evidence");
  expect(await listClaimIds(request, "r-ev")).toHaveLength(4);
});

test("3. a stale draft is told the restaurant changed elsewhere, its save conflicts, and Reload draft shows the other member's values", async ({ page, browser, request }) => {
  await seedRestaurant(request, "r-conflict", { name: "Before" });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-conflict/edit");
  await expect(page.getByTestId("field-name")).toHaveValue("Before");
  await page.getByTestId("field-phone").fill("+44 20 1234"); // Ava's draft is now dirty

  const bogdanContext = await browser.newContext();
  const bogdan = await bogdanContext.newPage();
  await signIn(bogdan, "bogdan@safebite.test");
  await bogdan.goto("/restaurants/r-conflict/edit");
  await expect(bogdan.getByTestId("field-name")).toHaveValue("Before");
  await bogdan.getByTestId("field-name").fill("Bogdan's name");
  await bogdan.getByTestId("save-restaurant").click();
  await expect(bogdan.getByTestId("restaurant-name")).toHaveText("Bogdan's name");
  await bogdanContext.close();

  await expect(page.getByTestId("changed-elsewhere")).toBeVisible();
  await expect(page.getByTestId("field-phone")).toHaveValue("+44 20 1234");
  await page.getByTestId("save-restaurant").click();
  await expect(page.getByTestId("save-outcome")).toHaveAttribute("data-kind", "conflict");
  await page.getByTestId("reload-draft").first().click();
  await expect(page.getByTestId("field-name")).toHaveValue("Bogdan's name");
  await expect(page.getByTestId("changed-elsewhere")).toHaveCount(0);
});

test("4. deleting a restaurant with evidence leaves nothing behind; a concurrent Add evidence sees not-found", async ({ page, browser, request }) => {
  await seedRestaurant(request, "r-del", { name: "Doomed" });
  await seedClaim(request, "r-del", "c1");
  await seedClaim(request, "r-del", "c2", { kind: "separateFryer" });

  const bogdanContext = await browser.newContext();
  const bogdan = await bogdanContext.newPage();
  await signIn(bogdan, "bogdan@safebite.test");
  await bogdan.goto("/restaurants/r-del/evidence/new");
  await bogdan.getByTestId("claim-source-label").fill("Too late");

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-del/edit");
  await expect(page.getByTestId("field-name")).toHaveValue("Doomed");
  await page.getByTestId("delete-restaurant").click();
  await page.getByTestId("delete-confirm").click();
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });

  await bogdan.getByTestId("claim-submit").click();
  await expect(bogdan.getByTestId("claim-save-outcome")).toHaveAttribute("data-kind", "notFound");
  await bogdan.goto("/restaurants/r-del");
  await expect(bogdan.getByTestId("read-gone")).toContainText("This restaurant was deleted.");
  await bogdanContext.close();

  expect(await listClaimIds(request, "r-del")).toEqual([]);
  expect(await restaurantExists(request, "r-del")).toBe(false);
  expect(await listRestaurantIds(request)).toEqual([]);
});

test("5. an interrupted deletion (marked, not swept) is finished from the list", async ({ page, request }) => {
  await seedRestaurant(request, "r-stuck", { name: "Stuck" });
  await seedClaim(request, "r-stuck", "c1");
  await markDeletingViaRest(request, "r-stuck");

  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-saved").click();
  // The list resumes the protocol on mount (Task 9). The intermediate "Deleting…" row and the
  // Finish deleting button are asserted by RestaurantsPage.test.tsx; here the end state matters.
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("restaurant-deleting")).toHaveCount(0);
  expect(await listClaimIds(request, "r-stuck")).toEqual([]);
  expect(await restaurantExists(request, "r-stuck")).toBe(false);
});

test("6. saving while offline is refused, nothing is queued, and nothing appears after reconnecting", async ({ page, context, request }) => {
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/new");
  await page.getByTestId("field-name").fill("Ghost");
  await page.getByTestId("field-address").fill("Nowhere 1");
  await context.setOffline(true);
  await page.getByTestId("save-restaurant").click();
  await expect(page.getByTestId("save-outcome")).toHaveAttribute("data-kind", "offline");
  await expect(page.getByTestId("field-name")).toHaveValue("Ghost");
  await context.setOffline(false);
  await page.goto("/restaurants");
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });
  expect(await listRestaurantIds(request)).toEqual([]);
});

test("7. after an account switch no record of the previous member is rendered and no page error fires", async ({ page, request }) => {
  await seedRestaurant(request, "r-ava", { name: "Ava's place" });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurant-row")).toContainText("Ava's place");
  await signOutAndWait(page);

  await signIn(page, "stranger@safebite.test");
  await expect(page.getByTestId("not-invited")).toBeVisible();
  await expect(page.getByTestId("restaurant-row")).toHaveCount(0);
  await expect(page.getByTestId("nav-saved")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
```

- [ ] **Step 4: Run the browser suite (twice, the second time as the stress variant)**

Run (root, 5 min timeout each): `npm run emu:e2e` then `npm run emu:e2e:stress`
Expected: 5 (auth) + 7 (records) = 12 scenarios pass; stress: 36 runs pass with `retries: 0`. If scenario 6's offline outcome does not appear, confirm Chromium reports `navigator.onLine === false` under `setOffline` (`await page.evaluate(() => navigator.onLine)` in a scratch test); if it reports true, the repository's transaction still fails with `unavailable` after the SDK's backoff, so raise that assertion's timeout to 30 s rather than changing product code. If scenario 2's conflicting state does not appear, check both claims were created with the same UTC date (the fill uses the device's local today; the rules accept it), and that `summariseEvidence` received both.

- [ ] **Step 5: Documentation and spec bookkeeping**

`README.md`:
- In "### Tests", change the `emu:e2e:stress` comment to `# 12 browser scenarios × 3 repeats, retries disabled (flakiness gate)`.
- Replace the line `\`npm run test:unit\` currently reports 59 tests.` with the number the run actually prints (`npm run test:unit 2>&1 | grep -E "Tests +[0-9]+ passed"`).
- Under Guardrails add:
```
- Records are member-only and written only through Firestore transactions (online-only; a save is reported as saved only after the server accepted it). Restaurants carry a `version` the rules require to increase by exactly one; claims are immutable (add/delete only); deleting a restaurant marks it, sweeps its claims, then removes it, and an interrupted deletion is resumed from the list.
- Evidence dates are UTC calendar days stored at 00:00 UTC; a claim needs rechecking 12 months after it was checked unless it carries its own expiry. Same-day contradicting claims are shown as "Conflicting evidence". No numerical score anywhere.
```
- Under "Local development", after the Emulator UI line, add: `Records live under households/home/restaurants in the emulator; \`npm run emu:e2e\` clears them before each scenario via the emulator's REST API.`

`planning/specs/2026-09-20-safebite-pwa-design.md`: in the block "Carried from the Plan 2a final review", prefix the `registerType: "autoUpdate"` bullet and the `.env.e2e`-style bullet with `Done in Plan 2b:`; in "Carried from the Plan 2a-h final review", prefix all four bullets with `Done in Plan 2b:`; leave the `abortable()` bullet and the icon bullet untouched. In §3.3's plan table, append to the Plan 2 row: ` — 2a, 2a-h and 2b executed 2026-09-21 (see §3.5 and \`planning/plans/2026-09-21-safebite-pwa-02b-records.md\`)`.

- [ ] **Step 6: Full gate, guardrail grep, commit**

Run (root): `npm run typecheck && npm run test:unit && npm run emu:test && npm run emu:e2e && npm run build && npm --prefix web run build:e2e && npm --prefix web run e2e:boot-guard && npm --prefix web run e2e:preview && npm --prefix web run e2e:upgrade`
Expected: everything green. Then:
```bash
git grep -n "safebite-production-13ba1" -- ':!SafeBite/**' ':!*.md' ':!docs/**' ':!.github/workflows/ci.yml' ':!web/src/config/firebaseEnv.ts' ':!web/src/config/firebaseEnv.test.ts'; echo "grep exit $? (1 = clean)"
grep -rn "window.confirm\|window.alert\|window.prompt" web/src; echo "grep exit $? (1 = clean)"
git diff --check
```

```bash
git add web/e2e/emulator-rest.ts web/e2e/records.spec.ts README.md planning/specs/2026-09-20-safebite-pwa-design.md
git commit -m "test(web): seven browser scenarios for restaurant records (evidence states, conflict, deletion, offline, account switch); docs and spec bookkeeping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Controller notes (for the subagent-driven-development session)

- Tasks are sequential. 1 → 2 (scripts and stamps build on the fixtures), 3 → 4 (Task 4's upgrade tests assume Task 3's precache artefact test exists), 5 → 6 → 7 → 8 (rules before the repository so the emulator proves the shapes the repository writes), 9 → 10 → 11 → 12.
- Reviewers for Tasks 1–2 should run the refusal commands themselves (ambient `VITE_FIREBASE_PROJECT_ID`, stale dist) — they are the point of the tasks.
- The reviewer for Task 4 should run `npm --prefix web run e2e:upgrade` once and watch that the two-tab test's `other` page really stays on the v1 entry chunk before its own Reload; if it flips early, the `requestedHere` gate is wrong, not the test.
- Task 6 Step 4 changes one existing `default-deny` test (a member reading a missing document under a now-allowed rule succeeds); the reviewer confirms the test was moved to `households/other/...` and not deleted or inverted.
- Task 7's `it.each` over 63 valid combinations is intentionally exhaustive; do not let an implementer collapse it to a sample.
- Task 12 Step 1 is a hard stop if the emulator does not honour `Bearer owner`; report back before writing the helpers.
- Unit counts (orientation only; state as "previous + N"): T1 +6, T2 +4, T4 +10, T5 +38, T7 +14, T8 +15, T9 +5, T10 +8, T11 +8. Rules tests: T6 +40, T7 +96 (63 valid combinations, 25 rejections, the rest). Browser: +7 in `emu:e2e`; upgrade suite 4 → 7 (+2 artefact in T3, valid→valid rewritten and +1 two-tab in T4).
- Emulator suites need Java 21 and take one to two minutes; every emulator-backed step gets a 5 minute timeout.
- Line endings: everything touched is LF. `.env.*` fixture files must end with a newline and have no CRLF.
- Never `git push`, never `firebase deploy`. Commits go on `worktree-pwa-01-foundation`.

## Self-review record

- **Spec coverage (§3.5):** rulings 1 (T9 routes/nav, T10–T11 deeper routes), 2 (T7 `allow update: if false`, T11 delete-only UI), 3 (T8 protocol, T10 confirm UI, T9 resume, T6 rules), 4 (T8 `onSnapshot` + `includeMetadataChanges`, T9 read states), 5 (T4 store/banner/per-tab reload), 6 (Global Constraints: no `functions/src`, no Places, `abortable()` untouched). Pre-work: F5 (T4), hermetic builds + stamp (T1–T2), F6 (T3), manifest suppression (T3). Data model and calendar dates (T5 types/dates, T6–T7 rules incl. `utcMidnight` and the one-day tolerance). Deletion protocol (T6 `isMarkingDeleting`/delete-after-mark, T7 parent checks, T8 mark/sweep/remove, T9 resume, T12 scenarios 4–5). Rules parity (T6–T7 tables, T7 smoke test). Online-only writes and read states (T8, T9 notice, T12 scenario 6). Draft vs snapshot (T10, T12 scenario 3). Pages (T9–T11), call-ahead groups (T11 `callAhead.ts`). Tests: unit (T1, T2, T4, T5, T7, T8, T9, T10, T11), rules (T6–T7), browser (T12), upgrade (T3–T4), boot-guard (T3), build refusals (T1 Step 8, T2 Step 9, CI step in T2).
- **Not covered, by design:** `useToday`'s midnight timer has no unit test (jsdom fake timers around `Intl` proved brittle in Plan 2a); the visibility/midnight refresh is a one-line effect reviewed by reading. The interrupted-deletion browser scenario asserts the end state; the intermediate row and button are unit-tested (T9).
- **Placeholder scan:** none ("TBD", "TODO", "similar to", "add validation" absent). Every code step shows the code.
- **Type consistency:** `Snapshot<T>`/`WriteOutcome<T>`/`DeleteStep` defined in T8 and used verbatim in T9–T11; `WatchState<T>` from T9 used by T10–T11; `outcomeMessage` exported from T10 and imported by T11; `RawRestaurantForm`, `normaliseRestaurantInput`, `validateRestaurantInput`, `FieldErrors`, `RestaurantField`, `ClaimField` from T5 used by T10–T11; `CALL_AHEAD_GROUPS` from T11 used within T11; `assertFreshDist(webRoot, outDir, mode)` and `computeSourceHash(webRoot, mode)` consistent between T2's tooling, configs and tests; `FIXTURE_MODES`/`isFixtureMode`/`parseEnvFile`/`fixtureMismatches` consistent between T1's module, test and config; store functions `updateAvailable`/`workerActivated`/`applyUpdate`/`getUpdateState`/`subscribeToUpdates`/`resetUpdatesForTests` consistent across T4's four files. Testids used in T12 all appear in T9–T11 (`add-restaurant`, `restaurants-empty`, `restaurant-row`, `restaurant-deleting`, `field-*`, `save-restaurant`, `save-outcome`, `changed-elsewhere`, `reload-draft`, `delete-restaurant`, `delete-confirm`, `restaurant-name`, `restaurant-website`, `evidence-<kind>`, `add-evidence`, `claim-*`, `call-ahead`, `read-gone`).
