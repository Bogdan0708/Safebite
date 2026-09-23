# Plan 2a independent audit

Date: 2026-09-21. Audited commit: `b054ea7a8f004bd3d10d2f622cec43ed8aaacd94`.

## Decision

Plan 2b planning can proceed. Close the P2 service-worker update defect below before treating Plan 2a as fully signed off or starting the restaurant editing implementation. Include the already-recorded update prompt as a prerequisite to the first editable form. No critical finding was identified within this audit's scope; this is not a staging or release approval.

## Publication and history

- Replaced the false-positive fixture in the twelve local commits after `4d5af30`. Verified every rewritten tree differs from its original only by that string replacement in the plan document and validator test. Author/committer metadata and messages were preserved.
- Original `eca3680c4d5f3c71941900b554912b828387047f` remains under local tag `backup/pre-secret-rewrite`. The tag was not pushed.
- Normal fast-forward push succeeded from remote `e60090f` to `b054ea7`; no force-push or GitHub secret-scanning bypass was used. Local HEAD and the remote branch match.
- The GitHub repository is public. [PR #1](https://github.com/Bogdan0708/Safebite/pull/1) remains open and draft. Nothing was merged or deployed.

## Open finding

### P2: an installed worker can precache a misconfigured update before the page guard runs

Locations: `web/vite.config.ts:39-71`, `web/src/pwa/serviceWorker.ts:7-21`, `web/src/main.tsx:13-19`. Coverage gap: `web/e2e-boot-guard/boot-guard.spec.ts:7-24` starts with a fresh browser context; `web/e2e-preview/pwa-shell.spec.ts:48-60` tests a single valid release.

The PWA plugin emits an ordinary caching `sw.js` for compile-only builds carrying invalid Firebase configuration. The page checks configuration before registering a worker, but a previously installed worker's update lifecycle operates independently of that page check. Consequently the comment that a misconfigured bundle is "never precached" is false for upgrades.

**Reproduced in Chromium against the actual built outputs:**

1. Serve the validated synthetic preview build on localhost; open it and wait for worker activation/control.
2. Change that same origin to serve the demo-valued compile-only build.
3. Call the existing registration's `update()` to trigger the browser update check deterministically.
4. The replacement worker reaches `activated`; the app reloads automatically and shows the misconfiguration screen.
5. The registration count becomes zero, but `navigator.serviceWorker.controller` remains present for the open document and Workbox Cache Storage still contains the invalid release's `/index.html`, `/assets/index-BgZpe6f4.js`, and `/assets/App-X_Wv5tc7.js`.
6. The local server records fetching that invalid App chunk during worker installation. This proves precaching of the Firebase-containing chunk, not Firebase initialization or execution by the misconfigured page. No page error was observed.

This requires an invalid compile-only artifact to be served over a previously valid installation. The validated Hosting predeploy command protects the normal deployment path, but the advertised runtime/worker defence for an invalid served artifact is incomplete. No private restaurant data exists in this plan, and the probe did not establish any data disclosure.

**Correction direction:** decide whether a build may emit a caching worker using the same resolved Firebase validation as the app. Invalid compile-only builds must not emit a normal precaching update; use an explicit non-caching cleanup worker if replacement of an installed worker is required. Remove SafeBite-owned Workbox caches during misconfiguration recovery, and account for the fact that unregistering does not immediately remove control from an open document. Cache deletion alone does not meet the stronger promise that invalid assets never enter the cache.

Add a same-origin valid-to-invalid upgrade regression, plus a valid-to-valid update test. Check network requests, Cache Storage, recovery, and worker registration/control separately. Retain the existing fresh-install tests.

Reproduction: after building both outputs with `npm --prefix web run e2e:boot-guard` and `npm --prefix web run e2e:preview`, run `node planning/audits/plan-2a-update-probe.mjs` from the repository root. The probe uses an ephemeral localhost server, blocks off-origin page requests, and writes `/tmp/safebite-plan2a-update-audit.json`. It intentionally reports the current defect rather than asserting a passing recovery contract.

The captured successful reproduction is retained in `planning/audits/plan-2a-update-evidence.json`.

The broader lifecycle behaviour is documented by [MDN's unregister reference](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/unregister) and [Vite PWA's update behaviour guide](https://vite-pwa-org.netlify.app/guide/auto-update); the finding above is based on the local reproduction, not solely those documents.

## Verification

| Check on the audited commit | Local result | Hosted CI |
| --- | --- | --- |
| Typecheck: functions source/tests, web app/node/e2e | Pass | Pass |
| Web unit tests | 53 pass | 53 pass |
| Root compile-only build | Pass; worker/manifest generated | Pass |
| Functions and Firestore rules | 27 pass | 27 pass |
| Emulator browser suite | 5 pass, no retries | 5 pass, no retries reported |
| Misconfigured fresh-install browser test | 1 pass | 1 pass |
| Preview manifest/worker/offline/chunk-failure tests | 4 pass | 4 pass |
| Unconfigured deployable build | Expected validator rejection | Expected rejection |
| Shell NODE_ENV=development + compile-only bypass | Expected production-state rejection | Expected rejection |
| Shell NODE_ENV=test; .env NODE_ENV=development | Expected production-state rejection | Not separate CI cases |
| Valid-to-invalid installed-worker update | P2 reproduced | Not covered |

[Hosted run 35610108045](https://github.com/Bogdan0708/Safebite/actions/runs/35610108045) completed successfully on the exact audited SHA. The job took approximately 2 minutes 27 seconds. Logs confirm all test totals and retained-artifact upload; a green run does not cover the missing upgrade scenario.

`git diff --check` passed. `SafeBite/`, `SafeBiteTests/`, `docs/`, root `Package.swift`, and `AGENTS.md` are byte-identical to `4d5af30`. Current household reads remain membership-gated and all client writes default-deny; no restaurants/claims access was introduced. Settings request deduplication and cancellation, auth race tests, validator shape checks, and test-project typechecking match the Plan 2a requirements.

## Remaining Plan 2b and later gates

- **Before editing forms:** replace automatic reload with an explicit update prompt and test that unsaved input survives discovery of a new worker. The current plugin registration reloads on an update; the lifecycle probe observed this. This was already recorded in the spec.
- The emitted manifest/icons contain four duplicated precache URLs, but each duplicate has the same revision. Current installation succeeds; this is cleanup, not evidence of an installation failure.
- The broad bootstrap catch includes the synchronous registration call. Ordinary asynchronous registration failures are handled inside the installed plugin; no separate user-visible failure was reproduced here. Narrowing that catch remains a reasonable cleanup.
- Keep `abortable()`'s documented distinction: it stops observing the result, not the underlying Firebase/server request. Preserve abort reasons and introduce timeout handling before paid discovery in Plan 3.
- Real iPhone/Safari installation, deployed Hosting headers and `/__/auth/handler`, actual pilot Firebase settings, budget alerts, and owner-controlled staging acceptance remain unverified and belong to their existing staging gates.

Once the P2 upgrade fix passes its regression, Plan 2b can build the household-scoped restaurants/claims model, field-validation and version rules, evidence-expiry function, private form, and evidence display. Preserve optional coordinates/place IDs, source requirements for accreditation, expired/unknown states, and call-ahead prompts. This audit does not implement or approve a merge/deployment of Plan 2b.
