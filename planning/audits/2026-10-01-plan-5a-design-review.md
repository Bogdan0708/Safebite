# Plan 5a design review — §3.8

Reviewed commit: `b5ec318` on `worktree-pwa-05a-data-rights`. Received from the owner's auditor on
2026-10-01 and recorded verbatim below. Paths are given relative to the repository root. The
responses are in §3.8 ("Design review, 2026-10-01").

## Verdict

**Plan 5a: changes requested before the implementation plan.** I reviewed `b5ec318` against the current code and obtained an independent deletion review. The split and overall direction are sound, but recovery has several blockers.

1. **P1 — Auth failure does not prove deletion completed.** The lost-response mapping (`planning/specs/2026-09-20-safebite-pwa-design.md:1311`) treats expired credentials and a disabled account as success. Both can occur without deleting household data. Even Auth-account absence does not establish that this callable performed cleanup. Replace this inference with server-verifiable completion evidence and define how it remains accessible after Auth deletion. Otherwise report an uncertain outcome. [Firebase documents these distinct conditions](https://firebase.google.com/docs/reference/rest/auth#section-refresh-token).
2. **P1 — A missing household document does not mean recursive deletion finished.** Step 3b (`planning/specs/2026-09-20-safebite-pwa-design.md:1211`) can skip remaining descendants after partial failure, then delete the recovery record and Auth account. Retry the traversal even when the parent is missing; record completion only after the entire operation succeeds. This follows the [Firestore API's explicit failure contract](https://docs.cloud.google.com/nodejs/docs/reference/firestore/latest/firestore/firestore#_google_cloud_firestore_Firestore_recursiveDelete_member_1_).
3. **P1 — Existing server writes can recreate deleted data.** Discovery checks membership before its usage transaction (`functions/src/discovery/search.ts:49`). A request can pass that check, pause, then recreate `households/{hid}/usage/{day}` after last-member deletion. I reproduced this ordering using the existing search function with a controlled database stub. Check membership inside the transaction that writes usage, and include this interaction in 5a's scope.
4. **P2 — Specify concurrency safeguards, beyond sequential idempotency.** In the deletion steps (`planning/specs/2026-09-20-safebite-pwa-design.md:1208`):
   - Two calls from the **same UID** must not recreate a deletion record after one finishes. Revalidate membership and create the record atomically.
   - Collection anonymisation must conditionally recheck `updatedBy`. Otherwise it can read Ava's attribution, race with Bogdan's edit, then overwrite **Bogdan's** attribution with "Former member." Client rules do not constrain Admin writes.
5. **P2 — Export needs a fresh sharing gesture.** The export flow (`planning/specs/2026-09-20-safebite-pwa-design.md:1338`) waits for the callable before invoking `navigator.share()`. A slow response can outlast transient user activation. Generate the file, then show **Share/Save export** for a fresh tap, with a download fallback. `canShare()` does not establish activation. [Web Share specification](https://www.w3.org/TR/web-share/).

Also tighten these contracts before approval:

- **Export:** put membership validation inside the same read-only transaction as the data. Include restaurant-creator and collection-updater names if "with authorship" covers all exported records; the current example omits them.
- **Device cleanup:** define what happens when `failed` is nonempty or a cleaner hangs. Distinguish confirmed server deletion from unsuccessful local clearing, and prevent previous-account data becoming visible during recovery.
- **Security wording:** five-minute `auth_time` proves recent authentication, not password re-entry specifically for this operation. Describe that accurately or require operation-bound proof.
- **Marker:** Firebase UIDs can contain hyphens—the emulator already uses them. Explicitly reserve `former-member`; remove the claimed Firebase guarantee. [UID requirements](https://firebase.google.com/docs/auth/admin/manage-users).
- **Examples/tests:** departed members' notes should be absent, not labelled "Former member." Test exclusion of identity fields rather than promising arbitrary retained free text contains no email or UID.

Add failure-injection and interleaving tests for the first four findings; successful deletions alone won't establish recovery safety.

**Hosting fix `07f4519`: approved for push and PR, followed by a Hosting-only pilot redeploy after the checks pass.** My Hosting-emulator check confirmed `no-cache` on `/`, representative app routes, `/index.html`, the service worker and manifest; hashed assets remain immutable. The rule excludes paths containing dots, so describe its coverage as extensionless app routes. Verify those headers live after deployment.

No repository files were changed, and nothing was pushed or deployed.
