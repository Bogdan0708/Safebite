# Plan 2a-h independent re-check

Date: 2026-09-21. Commit: `17ebe57476010f856feb5c1a614c27b57ef93121`.

## Verdict

The P2 from `2026-09-21-plan-2a-audit.md` is closed on this commit. No new blocking finding was identified in the targeted hardening review. Plan 2b can proceed to brainstorming and planning. This does not authorise merging, deployment, or skipping the remaining Plan 2b prerequisites.

## Evidence

- Local HEAD, the remote branch and draft PR #1 all resolve to the audited SHA. [Hosted CI run 35620041610](https://github.com/Bogdan0708/Safebite/actions/runs/35620041610) succeeded on that SHA.
- Independently reran the full typecheck and all 59 web unit tests: pass.
- Independently rebuilt valid v1/v2 and invalid outputs and ran the four upgrade tests, one boot-guard test and four preview tests: all pass, without retries.
- The same-origin invalid upgrade now finishes with no registrations, no caches and no controlling worker, and the invalid App chunk is never requested. The separate unchanged-worker scenario exercises the page-side purge/reload; valid-to-valid upgrade still replaces the release and removes its old cached entry.
- Inspected the emitted invalid `sw.js`: it unregisters, navigates clients and deletes caches; it contains no precaching logic. The plugin's cleanup is best-effort without `waitUntil`, so retaining the page-side purge is appropriate.
- Independently supplied a different `envDir` containing synthetic valid values while the config's initial environment resolution was invalid. Even with the compile-only bypass enabled, Vite exited 1 with the expected worker-decision disagreement error.
- Functions/rules and emulator auth code are unchanged from the previous audit. Their hosted CI steps passed; those emulator suites were not rerun locally in this targeted re-check.
- `git diff --check` passed. The legacy Swift tree, public docs and `AGENTS.md` are unchanged.

## Plan 2b entry conditions

1. Land the update prompt before the first editable form. Change `registerType` from `autoUpdate` to `prompt`, wire `onNeedRefresh` and user-confirmed activation, and update the valid-to-valid upgrade test in the same change. Adding a callback while retaining `autoUpdate` is insufficient: the installed plugin takes a separate automatic-reload branch. Test that pending updates preserve unsaved input until explicit confirmation.
2. Carry both spec pre-work blocks into the plan: consolidate synthetic build environments, remove redundant preview rebuilding, and clean up duplicate precache entries. Suppress the manifest for invalid outputs if they will be served deliberately. These are not reopened P2 findings.
3. Then define restaurant/claim interfaces and rules, pure evidence-expiry behaviour, editing/concurrency handling, and UI/browser acceptance tests. Preserve optional coordinates/place IDs, source-backed accreditation, expired/unknown states, and call-ahead prompts.

The upgrade test's wording about reloading "exactly once" is stronger than its direct browser assertions: it checks the session flag and final state, not a navigation count. The unit-tested one-shot guard and passing lifecycle checks support this closure; tighten the assertion or wording when updating that suite for the prompt.

Real iPhone/Safari behaviour and the deployed Firebase/Hosting configuration still require staging acceptance. Browser API refusal can prevent cleanup; the error screen remains visible and the reload guard favours avoiding a loop. This review verifies the normal supported Chromium lifecycle, not guaranteed recovery when browser storage APIs are unavailable.
