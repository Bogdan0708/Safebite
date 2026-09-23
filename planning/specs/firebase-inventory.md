# Firebase and Google Cloud inventory (O3–O6)

Recorded 2026-09-23. On that day the owner authorised the primary assistant to carry out O3–O6 through the official `gcloud` and `firebase` CLIs, running as `<owner email>`. Every result below was read back after the change was made.

## O3 — legacy project `safebite-production-13ba1`

Not reachable. `gcloud projects describe`, the Firebase Management API (403) and `firebase projects:list` all refuse or omit it for the owner account. It is not in the account's pending-deletion list (the last 30 days). The legacy iOS config (`SafeBite/SafeBite/GoogleService-Info.plist`) gives project number `113380788016`. The pilot does not depend on this project, so no inventory is possible or needed. If it ever reappears under another account, treat its rules (public read) and seeded data as untrusted.

## O4 — historical key from commit `e7c0268`

The API Keys lookup was denied (`apikeys.keys.lookup`), but the error names the key's parent as project number `776764264965`. The owner could not find that project under any account they hold. The key therefore belongs to a deleted or foreign project and cannot be restricted from here. The pilot never uses it. The replacement key was created in the pilot project on 2026-09-23 (see O5 below). `config/discovery` is still absent, so discovery stays switched off until deploy.

## O5 — pilot project

| Item | Value |
|---|---|
| Project ID / number | `safebite-pilot-urfs3v` / `1081260388315` |
| `.firebaserc` alias | `staging` (default stays `demo-safebite`) |
| Billing | Blaze, billing account `<billing account ID — owner's private notes>` |
| Budget | "SafeBite pilot £10": £10/month, scoped to this project only; alerts at 50 %, 90 %, 100 % actual and 100 % forecast (the account-wide £10 budget is separate and unchanged) |
| Firestore | `(default)`, Native mode, `europe-west2`, delete protection enabled |
| Firestore rules | None released yet, so all client access is denied until `firestore.rules` is deployed |
| Auth | Firebase Auth (not Identity Platform), email + password only, **self sign-up disabled** (`client.permissions.disabledUserSignup`; a public `accounts:signUp` returns `ADMIN_ONLY_OPERATION`) |
| Authorised domains | `localhost`, `safebite-pilot-urfs3v.firebaseapp.com`, `safebite-pilot-urfs3v.web.app` |
| Web app | "SafeBite PWA", app ID `1:1081260388315:web:6696e3bc27a3170e6041fe`; its `VITE_FIREBASE_*` values come from `firebase apps:sdkconfig` and are not committed |
| Places key | API key `<key ID — owner's private notes>` ("SafeBite functions Places (server)"), API restriction `places.googleapis.com` only, no application restriction (server-side use from Cloud Functions). Piped straight into Secret Manager secret `PLACES_API_KEY` (version 1, label `firebase-managed=functions`) without being displayed; verified with one free IDs-only Text Search |
| APIs enabled | Firestore, Identity Toolkit, Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc, Secret Manager, Places (New), Firebase Rules, Firebase Hosting, Billing Budgets, API Keys |

The owner considered reusing `mitch-ai-services`, then chose a new project instead. That project runs an unrelated live Cloud Run service whose default service account holds `roles/editor`, so it could reach household data, and its existing spend would make a £10 SafeBite budget meaningless.

A stray console-created project `safebyte-1` (number `1045562242738`, no billing, no data) appeared during setup; the owner decides whether to delete it.

## O6 — member accounts

Created with a one-off, uncommitted admin script (REST, the owner's gcloud credentials, no service-account key). It writes the same shapes as `functions/src/seed-emulator.ts`:

- `households/home`: `name: "Home"`, `memberIds` = both UIDs, `createdAt`
- `users/<owner-uid>`: Bogdan (`<owner email>`), `householdId: "home"`
- `users/<ava-uid>`: Ava (`<Ava's email>`), `householdId: "home"`

Both accounts signed in successfully. The owner then replaced the generated passwords with chosen ones in `~/.config/safebite/pilot-accounts.txt` (mode 600) on the owner's machine; they were applied through the Admin API and both sign-ins re-verified. The app has no password-change flow yet.

## Still outstanding before staging acceptance

- Create `config/discovery` with `enabled: true` and a daily cap at deploy time.
- Deploy order (landing review): functions, then rules and hosting together.
- Real iPhone/Safari acceptance (Plan 5).
