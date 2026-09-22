# SafeBite PWA — Plan 3: Discovery through functions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the two `abortable()` pre-work items, then discovery: two member-only callables (`searchDestination`, `searchNearby`) backed by a `PlacesProvider` interface with a Google Places API (New) adapter and a fixture provider, a `PLACES_API_KEY` secret with a deploy-time fixture refusal, a fail-closed kill switch and per-household daily cap, a Discover page with every failure state, Google Maps attribution and links, and "Add to our records" that prefills the existing restaurant form with name, address and place ID — proven by functions unit, callable emulator, rules, web unit and browser tests.

**Architecture:** Same branch and layout as Plans 1–2b (`web/`, `functions/`, root scripts, `firestore.rules`, `.github/workflows/ci.yml`). Backend code lives in `functions/src/discovery/`: pure modules (`types`, `validate`, `usageDay`, `provider`, `fixtureProvider`, `googleProvider`) unit-tested without the emulator; `search.ts` is the handler core taking its dependencies (Firestore, provider selection, clock) as arguments and tested against the Firestore emulator; `callables.ts` wires `defineSecret`, `requireMember`, input parsing and `runSearch`. Client code lives in `web/src/discover/`: `api.ts` (typed callables + error classification), `search.ts` (sequence-numbered controller + hook), `links.ts` (Maps URLs from stored fields), `DiscoverPage.tsx`. The restaurant form learns a router-state prefill; the repository writes `googlePlaceId` on create. Nothing from a search is ever persisted or cached.

**Tech Stack:** Vite 8.3, React 19, react-router 8, TypeScript 6 strict (web) / 5.9 (functions), Vitest 5, Playwright 1.63 (Chromium only), Firebase JS SDK 12, `firebase-functions` 7 (v2 API, `defineSecret`), `firebase-admin` 14, `@firebase/rules-unit-testing` 5, firebase-tools 15.30, Node 22 (global `fetch`).

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md` — **§3.6 is the binding design for this plan** (rulings 1–4, verified external facts, pre-work, callables, provider selection and the secret, kill switch/caps/usage, error mapping, client, tests, decisions, exclusions). Also §2.1 non-negotiable rules ("never fall back to sample venues when a provider fails"), §2.4 security model (`requireMember` first, identity only from `request.auth`, server key never in `web/`), §2.5 discovery and Places compliance, §2.6 privacy (no query text in logs, coordinates to 2 dp), §2.7 testing strategy, §3.2 guardrails. Previous plan: `planning/plans/2026-09-21-safebite-pwa-02b-records.md` (repository, form, detail page, e2e helpers this plan extends).

## Global Constraints

- Emulators only (`demo-safebite`); no `firebase deploy`, no `git push`, no billing or console changes, no `firebase functions:secrets:*`. The string `safebite-production-13ba1` must not appear in new files. **No real Google API key anywhere**: the only secret value this plan ever writes is the literal `fixture`, in `functions/.secret.local.example` (committed) and `functions/.secret.local` (gitignored).
- Working directory is the worktree `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-01-foundation` on branch `worktree-pwa-01-foundation`. Never run anything in `/home/godja/Dev/AvaGF` itself or in the old `/mnt/c` checkout.
- Every callable begins with `requireMember(request)`; identity comes only from `request.auth`; `request.data` is parsed after membership is established.
- The Google adapter requests exactly the field mask `places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus` — never `places.location`, phone, website, rating or opening hours (spec §3.6 rulings 1–2; every call must stay at the Pro tier).
- Nothing from a Places response is written to Firestore, IndexedDB, `localStorage`, `sessionStorage` or any cache. `grep -rn "localStorage\|sessionStorage\|indexedDB" web/src/discover` must print nothing. The only Places-derived values that reach a Firestore document are the name and address the member saw prefilled and chose to save, plus `googlePlaceId` (ruling 1).
- Never fall back to sample venues: the fixture provider runs only inside the emulator (`process.env.FUNCTIONS_EMULATOR === "true"`) and only when the secret value is `fixture`; the deployed refusal for that value is unit-tested.
- Logs from `functions/src/discovery` never contain the query text or coordinates with more than 2 decimal places.
- Every write to Firestore from `web/` still goes through `runTransaction` (Plan 2b constraint). Never `window.confirm`/`alert`/`prompt` in `web/src`.
- Existing browser scenarios (`web/e2e/auth.spec.ts` 5, `web/e2e/records.spec.ts` 7) and their testids stay unchanged. Existing route `/discover` and testid `nav-discover` stay.
- No numerical safety score anywhere; copy uses British spelling; Google Maps attribution uses the unaltered official asset with the accessibility label "Google Maps" (spec §3.6, Places policies).
- Line endings: every file this plan touches is LF. Edit with tools that preserve endings.
- Node 22; TS strict; commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (implementers may see a different attribution reminder; use the line above).
- Emulator-backed runs (`npm run emu:test`, `npm run emu:e2e`) take one to three minutes here; give those shell commands a 10 minute timeout. Vite builds take ~10 s each.
- Every task ends with `npm run typecheck` and `npm run test:unit` green, plus `npm run emu:test` when it touched `functions/` or `firestore.rules`, plus `npm run emu:e2e` when it touched `web/e2e`. State unit counts as "previous + N new" — do not assert absolute totals in commit messages.

---

## File map

| Path | Responsibility |
|------|----------------|
| `web/src/api/callable.ts` (+test) | Pre-work: `abortable` preserves `signal.reason`; new `anySignal`, `isTimeoutError` |
| `functions/src/discovery/types.ts` (new) | `DiscoveryResult`, `DiscoveryResponse`, limits (`MAX_RESULTS`, `NEARBY_RADIUS_M`, `MAX_QUERY_LENGTH`) |
| `functions/src/discovery/validate.ts` (+test, new) | `parseDestinationInput`, `parseNearbyInput` → `HttpsError("invalid-argument")` |
| `functions/src/discovery/usageDay.ts` (+test, new) | `usageDayKey(now)` → `yyyymmdd` (UTC) |
| `functions/src/discovery/provider.ts` (new) | `PlacesProvider` interface, `ProviderError`, `ProviderSelection` |
| `functions/src/discovery/fixtureProvider.ts` (+test, new) | Twelve fake restaurants, magic queries, injectable `sleep` |
| `functions/src/discovery/googleProvider.ts` (+test, new) | `fetch` adapter: headers, bodies, 8 s timeout, mapping, error mapping |
| `functions/src/discovery/select.ts` (+test, new) | `selectProvider(secretValue, isEmulator)` — the four branches |
| `functions/test/fixtures/places-searchText.json` (new) | Response in the documented Places API (New) shape used by the mapping test |
| `functions/src/discovery/search.ts` (+test, new) | `runSearch(deps, member, request)`: not-configured, kill switch, cap transaction, provider call, error mapping, logging |
| `functions/src/discovery/callables.ts` (new) | `PLACES_API_KEY = defineSecret(...)`, `searchDestination`, `searchNearby` |
| `functions/src/index.ts` | Re-exports the two callables |
| `functions/src/seed-emulator.ts` (+test) | Seeds `config/discovery { enabled: true, dailySearchCap: 50 }` |
| `functions/.secret.local.example` (new, committed) | `PLACES_API_KEY=fixture` |
| `tooling/ensure-secret-local.mjs` (new, root) | Copies the example to `functions/.secret.local` only when missing |
| `.gitignore`, `firebase.json` | Ignore `functions/.secret.local`; exclude both secret files from the functions deploy package |
| `package.json` (root) | `emu:*` scripts run `ensure-secret-local` first |
| `functions/test/discovery.callables.test.ts` (new) | HTTP tests against the functions emulator (fixture provider) |
| `functions/test/rules.discovery.test.ts` (new) | Members cannot read/write `config/discovery` or `usage` |
| `web/src/discover/api.ts` (+test, new) | Typed callables, `DiscoveryResult`, `SearchErrorReason`, `classifySearchError` |
| `web/src/discover/search.ts` (+test, new) | `createSearchController`, `useDiscoverySearch` |
| `web/src/discover/links.ts` (+test, new) | `directionsUrl`, `placeUrl` |
| `web/src/discover/geolocation.ts` (+test, new) | `requestPosition(geo)` → coordinates or a `locationDenied`/`locationUnavailable` reason |
| `web/public/google/GoogleMaps_Logo_Gray.svg` (new) | Official attribution asset, byte-identical to Google's download |
| `web/src/discover/DiscoverPage.tsx` (+test, new) | Search box, Near me, states, results, attribution, add / in-our-records |
| `web/src/pages/DiscoverPage.tsx` | Deleted (placeholder) |
| `web/src/AppShell.tsx` | Import path for `DiscoverPage` |
| `web/src/styles.css` | `.attribution`, `.hint`, `.result-actions` |
| `web/src/records/types.ts` | `RestaurantInput.googlePlaceId?: string` |
| `web/src/records/repository.ts` (+test) | `createRestaurant` writes `googlePlaceId` when present |
| `web/src/records/RestaurantFormPage.tsx` (+test) | Router-state prefill, "From Google Maps" notice, duplicate guard |
| `web/src/records/RestaurantDetailPage.tsx` (+test) | "Open in Google Maps" link |
| `web/e2e/emulator-rest.ts` | `setDiscoveryConfig`, `deleteDiscoveryConfig`, `setUsage`, `clearUsage`; `seedRestaurant` gains `googlePlaceId` |
| `web/e2e/discover.spec.ts` (new) | Eleven browser scenarios |
| `web/playwright.config.ts` | `globalTimeout` 900 s; comment counts |
| `README.md` | Discover section, secret handling, test counts, guardrails |

---

### Task 1: Pre-work — `abortable` keeps the abort reason; `anySignal`; `isTimeoutError`

**Files:**
- Modify: `web/src/api/callable.ts`
- Test: `web/src/api/callable.test.ts`

**Interfaces:**
- Consumes: existing `abortable`, `isAbortError`, `callable` in `web/src/api/callable.ts`.
- Produces (used by Task 7):
  ```ts
  export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T>; // rejects with signal.reason (AbortError DOMException when reason is undefined)
  export function anySignal(...signals: AbortSignal[]): AbortSignal;                  // aborts with the first source's reason
  export function isAbortError(err: unknown): boolean;                                 // unchanged
  export function isTimeoutError(err: unknown): boolean;                               // DOMException named "TimeoutError" (what AbortSignal.timeout produces)
  ```

- [ ] **Step 1: Add the failing tests**

Append to `web/src/api/callable.test.ts` (keep every existing test; the `abortable` describe block gains two cases, and two new describe blocks follow):

```ts
describe("abortable — reasons", () => {
  it("rejects with the signal's own reason when one was given", async () => {
    const controller = new AbortController();
    const reason = new Error("superseded by a newer search");
    const pending = abortable(new Promise<number>(() => {}), controller.signal);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  it("rejects with a TimeoutError when the signal came from AbortSignal.timeout", async () => {
    const pending = abortable(new Promise<number>(() => {}), AbortSignal.timeout(20));
    await expect(pending).rejects.toSatisfy(isTimeoutError);
    await expect(pending).rejects.not.toSatisfy(isAbortError);
  });
});

describe("anySignal", () => {
  it("aborts with the reason of whichever source fires first", async () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = anySignal(a.signal, b.signal);
    expect(combined.aborted).toBe(false);
    const reason = new Error("b first");
    b.abort(reason);
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe(reason);
    a.abort(new Error("too late"));
    expect(combined.reason).toBe(reason);
  });

  it("is already aborted when any source already is", () => {
    const a = new AbortController();
    a.abort(new Error("early"));
    const combined = anySignal(new AbortController().signal, a.signal);
    expect(combined.aborted).toBe(true);
    expect((combined.reason as Error).message).toBe("early");
  });

  it("carries a TimeoutError through from AbortSignal.timeout", async () => {
    const combined = anySignal(new AbortController().signal, AbortSignal.timeout(20));
    await new Promise((r) => setTimeout(r, 60));
    expect(combined.aborted).toBe(true);
    expect(isTimeoutError(combined.reason)).toBe(true);
  });
});

describe("isTimeoutError", () => {
  it("recognises only TimeoutError", () => {
    expect(isTimeoutError(new DOMException("x", "TimeoutError"))).toBe(true);
    expect(isTimeoutError(new DOMException("x", "AbortError"))).toBe(false);
    expect(isTimeoutError(new Error("x"))).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
  });
});
```

Change the import line at the top of the test file to:

```ts
import { abortable, anySignal, callable, isAbortError, isTimeoutError } from "./callable";
```

- [ ] **Step 2: Run the test file to verify the new cases fail**

Run: `npm --prefix web test -- src/api/callable.test.ts`
Expected: FAIL — `anySignal`/`isTimeoutError` are not exported; "rejects with the signal's own reason" fails because the current code rejects with a fresh AbortError.

- [ ] **Step 3: Implement**

Replace the `abortable` function and append the two helpers in `web/src/api/callable.ts` (keep `callable` and `isAbortError` as they are; keep the existing doc comment on `abortable` and add the sentence about reasons):

```ts
/**
 * Cancellation semantics for a promise that cannot itself be cancelled (the Firebase callable
 * SDK exposes no AbortSignal): once `signal` fires, the returned promise rejects with the
 * signal's own `reason` (an AbortError DOMException when none was given, a TimeoutError when
 * the signal came from AbortSignal.timeout) and the underlying promise's later outcome is
 * ignored. Preserving the reason is what lets a caller tell a timeout from a user abort.
 *
 * The underlying callable is NOT cancelled: it keeps running on the client and server, and any
 * paid upstream call it makes is still billed. `abortable` only changes which outcome this
 * caller observes.
 *
 * Intended pattern for searches: one `AbortController` per submission — abort the previous
 * controller when the next submit fires, so a slow, superseded response can never overwrite a
 * newer one.
 *
 * `SettingsPage`'s ref-held promise is the opposite pattern: it reuses one in-flight request
 * across React StrictMode remounts instead of superseding it. Do not copy that pattern for
 * searches, where each submission must be independently abortable.
 */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const reasonOf = (): unknown => (signal.reason === undefined ? new DOMException("Aborted", "AbortError") : signal.reason);
  if (signal.aborted) {
    // Drain the underlying promise so its later rejection (if any) doesn't surface as an
    // unhandled promise rejection now that nothing else is attached to it.
    promise.catch(() => {});
    return Promise.reject(reasonOf());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(reasonOf());
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

/**
 * A signal that aborts as soon as any source does, carrying that source's reason. Hand-written
 * because `AbortSignal.any` only arrived in iOS 17.4 and the app targets iOS 17.
 */
export function anySignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
  }
  const onAbort = (event: Event) => {
    for (const s of signals) s.removeEventListener("abort", onAbort);
    controller.abort((event.target as AbortSignal).reason);
  };
  for (const s of signals) s.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

export function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix web test -- src/api/callable.test.ts`
Expected: PASS — previous 7 + 6 new. Then `npm --prefix web test` (whole suite) and `npm run typecheck`: green. `SettingsPage.test.tsx` must still pass unchanged (it only relies on `isAbortError`, which still holds for a reason-less abort because jsdom's `AbortController.abort()` sets an AbortError reason).

- [ ] **Step 5: Commit**

```bash
git add web/src/api/callable.ts web/src/api/callable.test.ts
git commit -m "feat(web): abortable keeps the abort reason; anySignal and isTimeoutError for per-request timeouts (Plan 3 pre-work)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Discovery domain (functions) — types, input validation, usage-day key

**Files:**
- Create: `functions/src/discovery/types.ts`, `functions/src/discovery/validate.ts`, `functions/src/discovery/usageDay.ts`
- Test: `functions/test/discovery.validate.test.ts`, `functions/test/discovery.usageDay.test.ts`

**Interfaces:**
- Produces (used by Tasks 3–6):
  ```ts
  // types.ts
  export interface DiscoveryResult { placeId: string; name: string; address: string; googleMapsUri: string }
  export interface DiscoveryResponse { results: DiscoveryResult[]; provider: "google" }
  export const MAX_RESULTS = 10;
  export const NEARBY_RADIUS_M = 1500;
  export const MAX_QUERY_LENGTH = 120;
  // validate.ts
  export function parseDestinationInput(data: unknown): { query: string };   // trimmed; throws HttpsError("invalid-argument")
  export function parseNearbyInput(data: unknown): { lat: number; lng: number };
  // usageDay.ts
  export function usageDayKey(now: Date): string;                            // "yyyymmdd" in UTC
  ```

Note on running functions tests: `functions/vitest.config.mts` includes `test/**/*.test.ts`; the pure tests in this task need no emulator, but `npm --prefix functions test` is normally run through `npm run emu:test`. For a quick loop on a single pure file: `npm --prefix functions run build && cd functions && npx vitest run test/discovery.validate.test.ts` (the build is only needed for `tsconfig.test.json` typechecking parity; vitest itself transpiles). Emulator-backed files in the same run will fail without emulators — that is expected during the quick loop; the task's gate is `npm run emu:test`.

- [ ] **Step 1: Write the failing tests**

`functions/test/discovery.validate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseDestinationInput, parseNearbyInput } from "../src/discovery/validate";

describe("parseDestinationInput", () => {
  it("trims the query", () => {
    expect(parseDestinationInput({ query: "  Lisbon gluten free  " })).toEqual({ query: "Lisbon gluten free" });
  });

  it("ignores unknown keys (identity never comes from data)", () => {
    expect(parseDestinationInput({ query: "Porto", uid: "ava-uid", householdId: "home" })).toEqual({ query: "Porto" });
  });

  it.each([
    ["not an object", "Porto"],
    ["null", null],
    ["missing query", {}],
    ["non-string query", { query: 42 }],
    ["blank query", { query: "   " }],
    ["too long", { query: "x".repeat(121) }],
  ])("rejects %s with invalid-argument", (_label, data) => {
    expect(() => parseDestinationInput(data)).toThrowError(expect.objectContaining({ code: "invalid-argument" }));
  });

  it("accepts a query of exactly 120 characters after trimming", () => {
    expect(parseDestinationInput({ query: ` ${"y".repeat(120)} ` }).query).toHaveLength(120);
  });
});

describe("parseNearbyInput", () => {
  it("returns the coordinates", () => {
    expect(parseNearbyInput({ lat: 51.5, lng: -0.12 })).toEqual({ lat: 51.5, lng: -0.12 });
  });

  it.each([
    ["missing lng", { lat: 1 }],
    ["string lat", { lat: "51.5", lng: 0 }],
    ["NaN", { lat: Number.NaN, lng: 0 }],
    ["lat over 90", { lat: 90.1, lng: 0 }],
    ["lat under -90", { lat: -90.1, lng: 0 }],
    ["lng over 180", { lat: 0, lng: 180.1 }],
    ["lng under -180", { lat: 0, lng: -180.1 }],
    ["not an object", [51.5, 0]],
  ])("rejects %s with invalid-argument", (_label, data) => {
    expect(() => parseNearbyInput(data)).toThrowError(expect.objectContaining({ code: "invalid-argument" }));
  });

  it("accepts the boundaries", () => {
    expect(parseNearbyInput({ lat: 90, lng: -180 })).toEqual({ lat: 90, lng: -180 });
    expect(parseNearbyInput({ lat: -90, lng: 180 })).toEqual({ lat: -90, lng: 180 });
  });
});
```

`functions/test/discovery.usageDay.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { usageDayKey } from "../src/discovery/usageDay";

describe("usageDayKey", () => {
  it("formats the UTC calendar day as yyyymmdd with zero padding", () => {
    expect(usageDayKey(new Date("2026-01-05T12:00:00Z"))).toBe("20260105");
  });

  // Bracket the boundary, never test the exact instant (Plan 2b lesson).
  it("uses the UTC day, not the local one", () => {
    expect(usageDayKey(new Date("2026-09-22T23:30:00Z"))).toBe("20260922");
    expect(usageDayKey(new Date("2026-09-23T00:30:00Z"))).toBe("20260923");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd functions && npx vitest run test/discovery.validate.test.ts test/discovery.usageDay.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`functions/src/discovery/types.ts`:
```ts
/**
 * Discovery results (spec §3.6). Exactly the four fields the Discover page shows; nothing from
 * Google beyond these ever reaches the client, and nothing here is ever persisted by the client.
 */
export interface DiscoveryResult {
  placeId: string;
  name: string;
  address: string;
  googleMapsUri: string;
}

export interface DiscoveryResponse {
  results: DiscoveryResult[];
  provider: "google";
}

/** Fixed server-side (spec §3.6 decisions): the client sends no radius or result count. */
export const MAX_RESULTS = 10;
export const NEARBY_RADIUS_M = 1500;
export const MAX_QUERY_LENGTH = 120;
```

`functions/src/discovery/validate.ts`:
```ts
import { HttpsError } from "firebase-functions/v2/https";
import { MAX_QUERY_LENGTH } from "./types";

function asRecord(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Expected an object.");
  }
  return data as Record<string, unknown>;
}

/** `{ query }`: trimmed, 1–120 characters. Unknown keys are ignored; identity never comes from data. */
export function parseDestinationInput(data: unknown): { query: string } {
  const record = asRecord(data);
  const raw = record.query;
  if (typeof raw !== "string") throw new HttpsError("invalid-argument", "query must be a string.");
  const query = raw.trim();
  if (query.length === 0) throw new HttpsError("invalid-argument", "query must not be blank.");
  if (query.length > MAX_QUERY_LENGTH) throw new HttpsError("invalid-argument", `query must be at most ${MAX_QUERY_LENGTH} characters.`);
  return { query };
}

function finiteNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new HttpsError("invalid-argument", `${name} must be a number.`);
  if (value < min || value > max) throw new HttpsError("invalid-argument", `${name} must be between ${min} and ${max}.`);
  return value;
}

/** `{ lat, lng }`: finite numbers in range. */
export function parseNearbyInput(data: unknown): { lat: number; lng: number } {
  const record = asRecord(data);
  return { lat: finiteNumber(record.lat, "lat", -90, 90), lng: finiteNumber(record.lng, "lng", -180, 180) };
}
```

`functions/src/discovery/usageDay.ts`:
```ts
/** The UTC calendar day a search counts against: households/{hid}/usage/{yyyymmdd} (spec §3.6). */
export function usageDayKey(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd functions && npx vitest run test/discovery.validate.test.ts test/discovery.usageDay.test.ts`
Expected: PASS (10 destination + 10 nearby + 2 usage-day cases). Then from the root: `npm run typecheck` green.

- [ ] **Step 5: Commit**

```bash
git add functions/src/discovery/types.ts functions/src/discovery/validate.ts functions/src/discovery/usageDay.ts functions/test/discovery.validate.test.ts functions/test/discovery.usageDay.test.ts
git commit -m "feat(functions): discovery domain — result types, input parsing, UTC usage-day key

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Provider interface, `ProviderError`, fixture provider

**Files:**
- Create: `functions/src/discovery/provider.ts`, `functions/src/discovery/fixtureProvider.ts`
- Test: `functions/test/discovery.fixtureProvider.test.ts`

**Interfaces:**
- Consumes: `DiscoveryResult` from Task 2.
- Produces (used by Tasks 4–6 and by the browser tests' magic queries in Task 10):
  ```ts
  // provider.ts
  export interface PlacesProvider {
    searchText(query: string, limit: number): Promise<DiscoveryResult[]>;
    searchNearby(lat: number, lng: number, radiusM: number, limit: number): Promise<DiscoveryResult[]>;
  }
  export type ProviderFailureKind = "quota" | "unavailable" | "badRequest";
  export class ProviderError extends Error { readonly kind: ProviderFailureKind; readonly status?: number }
  export type ProviderSelection = { kind: "provider"; provider: PlacesProvider } | { kind: "notConfigured" };
  // fixtureProvider.ts
  export const MAGIC = { empty: "__empty__", unavailable: "__unavailable__", quota: "__quota__", slow: "__slow__", delayed: "__delayed__" } as const;
  export const SLOW_DELAY_MS = 25_000;      // longer than the client's 20 s timeout (Task 7)
  export const DELAYED_MS = 3_000;          // long enough for a second search to overtake it
  export const FIXTURE_RESULTS: readonly DiscoveryResult[]; // 12 fake restaurants
  export const DELAYED_RESULT: DiscoveryResult;             // the single result of "__delayed__"
  export function createFixtureProvider(sleep?: (ms: number) => Promise<void>): PlacesProvider;
  ```

- [ ] **Step 1: Write the failing tests**

`functions/test/discovery.fixtureProvider.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { DELAYED_MS, DELAYED_RESULT, FIXTURE_RESULTS, MAGIC, SLOW_DELAY_MS, createFixtureProvider } from "../src/discovery/fixtureProvider";
import { ProviderError } from "../src/discovery/provider";

const noSleep = vi.fn(async () => {});

describe("fixture provider", () => {
  it("holds twelve clearly fake restaurants with the four result fields", () => {
    expect(FIXTURE_RESULTS).toHaveLength(12);
    for (const r of FIXTURE_RESULTS) {
      expect(r.placeId).toMatch(/^fixture-\d{2}$/);
      expect(r.name).not.toBe("");
      expect(r.address).toContain("Testville");
      expect(r.googleMapsUri).toMatch(/^https:\/\/example\.invalid\//);
    }
    expect(new Set(FIXTURE_RESULTS.map((r) => r.placeId)).size).toBe(12);
  });

  it("returns at most `limit` results for an ordinary query, without sleeping", async () => {
    const provider = createFixtureProvider(noSleep);
    const results = await provider.searchText("pizza", 10);
    expect(results).toEqual(FIXTURE_RESULTS.slice(0, 10));
    expect(noSleep).not.toHaveBeenCalled();
  });

  it("returns the same list for nearby searches", async () => {
    const provider = createFixtureProvider(noSleep);
    await expect(provider.searchNearby(51.5, -0.12, 1500, 3)).resolves.toEqual(FIXTURE_RESULTS.slice(0, 3));
  });

  it("__empty__ returns no results", async () => {
    await expect(createFixtureProvider(noSleep).searchText(MAGIC.empty, 10)).resolves.toEqual([]);
  });

  it("__unavailable__ throws a ProviderError of kind unavailable", async () => {
    await expect(createFixtureProvider(noSleep).searchText(MAGIC.unavailable, 10)).rejects.toMatchObject({ kind: "unavailable" });
    await expect(createFixtureProvider(noSleep).searchText(MAGIC.unavailable, 10)).rejects.toBeInstanceOf(ProviderError);
  });

  it("__quota__ throws a ProviderError of kind quota", async () => {
    await expect(createFixtureProvider(noSleep).searchText(MAGIC.quota, 10)).rejects.toMatchObject({ kind: "quota" });
  });

  it("__delayed__ sleeps DELAYED_MS then returns the single delayed result", async () => {
    const sleep = vi.fn(async () => {});
    const results = await createFixtureProvider(sleep).searchText(MAGIC.delayed, 10);
    expect(sleep).toHaveBeenCalledWith(DELAYED_MS);
    expect(results).toEqual([DELAYED_RESULT]);
    expect(DELAYED_RESULT.name).toBe("Delayed Diner");
  });

  it("__slow__ sleeps SLOW_DELAY_MS then returns the ordinary list", async () => {
    const sleep = vi.fn(async () => {});
    const results = await createFixtureProvider(sleep).searchText(MAGIC.slow, 10);
    expect(sleep).toHaveBeenCalledWith(SLOW_DELAY_MS);
    expect(results).toEqual(FIXTURE_RESULTS.slice(0, 10));
    expect(SLOW_DELAY_MS).toBeGreaterThan(20_000);
  });

  it("matches magic queries after trimming and case-folding", async () => {
    await expect(createFixtureProvider(noSleep).searchText("  __EMPTY__ ", 10)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && npx vitest run test/discovery.fixtureProvider.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`functions/src/discovery/provider.ts`:
```ts
import type { DiscoveryResult } from "./types";

/** What the callables need from a places backend (spec §3.6). */
export interface PlacesProvider {
  searchText(query: string, limit: number): Promise<DiscoveryResult[]>;
  searchNearby(lat: number, lng: number, radiusM: number, limit: number): Promise<DiscoveryResult[]>;
}

/**
 * quota       → the provider refused for quota reasons (HTTP 429 / RESOURCE_EXHAUSTED)
 * unavailable → timeout, network failure, HTTP 5xx
 * badRequest  → HTTP 4xx other than 429: our own request shape is wrong (logged as internal)
 */
export type ProviderFailureKind = "quota" | "unavailable" | "badRequest";

export class ProviderError extends Error {
  readonly kind: ProviderFailureKind;
  readonly status?: number;
  constructor(kind: ProviderFailureKind, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
  }
}

export type ProviderSelection = { kind: "provider"; provider: PlacesProvider } | { kind: "notConfigured" };
```

`functions/src/discovery/fixtureProvider.ts`:
```ts
import { ProviderError, type PlacesProvider } from "./provider";
import type { DiscoveryResult } from "./types";

/**
 * Serves the emulator, CI and browser tests in place of Google (spec §3.6 ruling 4). Selected
 * only by select.ts when the secret value is "fixture" AND the process is the emulator. Every
 * venue below is invented and the links point at the reserved `example.invalid` domain, so a
 * fixture result can never be mistaken for a real place (spec §2.1: never sample venues).
 */
export const MAGIC = {
  empty: "__empty__",
  unavailable: "__unavailable__",
  quota: "__quota__",
  slow: "__slow__",
  delayed: "__delayed__",
} as const;

/** Longer than the client's 20 s timeout (web/src/discover/search.ts), so __slow__ times out there. */
export const SLOW_DELAY_MS = 25_000;
/** Long enough for a second search to overtake it, short enough for a browser test. */
export const DELAYED_MS = 3_000;

const fake = (n: number, name: string, street: string): DiscoveryResult => ({
  placeId: `fixture-${String(n).padStart(2, "0")}`,
  name,
  address: `${n} ${street}, Testville`,
  googleMapsUri: `https://example.invalid/maps/fixture-${String(n).padStart(2, "0")}`,
});

export const FIXTURE_RESULTS: readonly DiscoveryResult[] = [
  fake(1, "Fixture Trattoria", "Fixture Street"),
  fake(2, "Testville Bakehouse", "Sample Road"),
  fake(3, "Sample Sushi", "Mock Lane"),
  fake(4, "Placeholder Pizza", "Dummy Drive"),
  fake(5, "Mock Mezze", "Stub Square"),
  fake(6, "Dummy Dumplings", "Example Avenue"),
  fake(7, "Stub Steakhouse", "Fixture Street"),
  fake(8, "Example Eatery", "Sample Road"),
  fake(9, "Fixture Falafel", "Mock Lane"),
  fake(10, "Demo Dosa House", "Dummy Drive"),
  fake(11, "Sample Sandwich Bar", "Stub Square"),
  fake(12, "Trial Tapas", "Example Avenue"),
];

export const DELAYED_RESULT: DiscoveryResult = {
  placeId: "fixture-delayed",
  name: "Delayed Diner",
  address: "99 Latecomer Lane, Testville",
  googleMapsUri: "https://example.invalid/maps/fixture-delayed",
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFixtureProvider(sleep: (ms: number) => Promise<void> = defaultSleep): PlacesProvider {
  return {
    async searchText(query, limit) {
      switch (query.trim().toLowerCase()) {
        case MAGIC.empty:
          return [];
        case MAGIC.unavailable:
          throw new ProviderError("unavailable", "fixture: provider unavailable", 503);
        case MAGIC.quota:
          throw new ProviderError("quota", "fixture: quota exceeded", 429);
        case MAGIC.delayed:
          await sleep(DELAYED_MS);
          return [DELAYED_RESULT];
        case MAGIC.slow:
          await sleep(SLOW_DELAY_MS);
          return FIXTURE_RESULTS.slice(0, limit);
        default:
          return FIXTURE_RESULTS.slice(0, limit);
      }
    },
    async searchNearby(_lat, _lng, _radiusM, limit) {
      return FIXTURE_RESULTS.slice(0, limit);
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd functions && npx vitest run test/discovery.fixtureProvider.test.ts`
Expected: PASS (9). `npm run typecheck` green.

- [ ] **Step 5: Commit**

```bash
git add functions/src/discovery/provider.ts functions/src/discovery/fixtureProvider.ts functions/test/discovery.fixtureProvider.test.ts
git commit -m "feat(functions): PlacesProvider interface, ProviderError, fixture provider with magic queries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Google Places adapter and provider selection

**Files:**
- Create: `functions/src/discovery/googleProvider.ts`, `functions/src/discovery/select.ts`, `functions/test/fixtures/places-searchText.json`
- Test: `functions/test/discovery.googleProvider.test.ts`, `functions/test/discovery.select.test.ts`

**Interfaces:**
- Consumes: `PlacesProvider`, `ProviderError`, `ProviderSelection` (Task 3); `DiscoveryResult` (Task 2); `createFixtureProvider` (Task 3).
- Produces (used by Task 5):
  ```ts
  // googleProvider.ts
  export const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus";
  export const REQUEST_TIMEOUT_MS = 8_000;
  export function createGoogleProvider(apiKey: string, fetchImpl?: typeof fetch): PlacesProvider;
  export function mapPlacesResponse(body: unknown): DiscoveryResult[];   // exported for the mapping test
  // select.ts
  export const FIXTURE_SECRET_VALUE = "fixture";
  export function selectProvider(secretValue: string | undefined, isEmulator: boolean, make?: { google: (key: string) => PlacesProvider; fixture: () => PlacesProvider }): ProviderSelection;
  ```

Verified facts this task encodes (spec §3.6, Google documentation, 2026-09-22): Text Search is `POST https://places.googleapis.com/v1/places:searchText`, Nearby Search is `POST https://places.googleapis.com/v1/places:searchNearby`; both take `X-Goog-Api-Key` and `X-Goog-FieldMask` headers; `maxResultCount` is 1–20; Nearby takes `locationRestriction.circle { center { latitude, longitude }, radius }` and `includedTypes`; responses are `{ places: [...] }` with `displayName: { text, languageCode }`, `formattedAddress`, `googleMapsUri`, `businessStatus` (`OPERATIONAL` | `CLOSED_TEMPORARILY` | `CLOSED_PERMANENTLY`). A missing `places` key means no results.

- [ ] **Step 1: Write the fixture and the failing tests**

`functions/test/fixtures/places-searchText.json` — the documented response shape. It is **not** a captured response (no key exists yet; owner action O4); the ids below follow the documented `ChIJ…` form but are invented. Replace with a captured response once the owner has a key, keeping the same three cases (operational, closed, missing name):
```json
{
  "places": [
    {
      "id": "ChIJfixture0000000000000001",
      "formattedAddress": "12 Rua Exemplo, 1100-000 Lisboa, Portugal",
      "googleMapsUri": "https://maps.google.com/?cid=1111111111111111111",
      "businessStatus": "OPERATIONAL",
      "displayName": { "text": "Casa Sem Glúten", "languageCode": "pt" }
    },
    {
      "id": "ChIJfixture0000000000000002",
      "formattedAddress": "3 Largo Exemplo, 1200-000 Lisboa, Portugal",
      "googleMapsUri": "https://maps.google.com/?cid=2222222222222222222",
      "businessStatus": "CLOSED_PERMANENTLY",
      "displayName": { "text": "Fechado Para Sempre", "languageCode": "pt" }
    },
    {
      "id": "ChIJfixture0000000000000003",
      "formattedAddress": "7 Travessa Exemplo, 1300-000 Lisboa, Portugal",
      "businessStatus": "OPERATIONAL"
    },
    {
      "id": "ChIJfixture0000000000000004",
      "displayName": { "text": "Sem Morada", "languageCode": "pt" }
    }
  ]
}
```

`functions/test/discovery.googleProvider.test.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FIELD_MASK, REQUEST_TIMEOUT_MS, createGoogleProvider, mapPlacesResponse } from "../src/discovery/googleProvider";

const recorded = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures/places-searchText.json"), "utf8")) as unknown;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("mapPlacesResponse", () => {
  it("keeps operational places with an id and a name; skips closed and nameless ones; defaults the address and link", () => {
    const results = mapPlacesResponse(recorded);
    expect(results).toEqual([
      {
        placeId: "ChIJfixture0000000000000001",
        name: "Casa Sem Glúten",
        address: "12 Rua Exemplo, 1100-000 Lisboa, Portugal",
        googleMapsUri: "https://maps.google.com/?cid=1111111111111111111",
      },
      {
        placeId: "ChIJfixture0000000000000004",
        name: "Sem Morada",
        address: "",
        googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJfixture0000000000000004",
      },
    ]);
  });

  it("treats a response without places as empty", () => {
    expect(mapPlacesResponse({})).toEqual([]);
    expect(mapPlacesResponse(null)).toEqual([]);
  });
});

describe("createGoogleProvider — requests", () => {
  it("sends Text Search with the key, the exact field mask, the query and the result count", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, recorded));
    const provider = createGoogleProvider("test-key", fetchMock as unknown as typeof fetch);
    await provider.searchText("Lisbon gluten free", 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "test-key",
      "X-Goog-FieldMask": FIELD_MASK,
    });
    expect(JSON.parse(init.body as string)).toEqual({ textQuery: "Lisbon gluten free", maxResultCount: 10 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never asks for coordinates, phone, website or rating", () => {
    expect(FIELD_MASK).toBe("places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus");
    for (const forbidden of ["location", "PhoneNumber", "websiteUri", "rating", "OpeningHours", "priceLevel"]) {
      expect(FIELD_MASK).not.toContain(forbidden);
    }
  });

  it("sends Nearby Search with a restaurant type and a circle restriction", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { places: [] }));
    const provider = createGoogleProvider("test-key", fetchMock as unknown as typeof fetch);
    await expect(provider.searchNearby(51.5, -0.12, 1500, 10)).resolves.toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(JSON.parse(init.body as string)).toEqual({
      includedTypes: ["restaurant"],
      maxResultCount: 10,
      locationRestriction: { circle: { center: { latitude: 51.5, longitude: -0.12 }, radius: 1500 } },
    });
  });

  it("uses an 8 second timeout signal", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(8_000);
  });
});

describe("createGoogleProvider — failures", () => {
  it.each([
    [429, "quota"],
    [500, "unavailable"],
    [503, "unavailable"],
    [400, "badRequest"],
    [403, "badRequest"],
  ])("maps HTTP %s to %s", async (status, kind) => {
    const fetchMock = vi.fn(async () => jsonResponse(status, { error: { message: `status ${status}`, status: "X" } }));
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ name: "ProviderError", kind, status });
  });

  it("maps a network failure to unavailable", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("maps a timeout to unavailable", async () => {
    const fetchMock = vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); });
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("carries Google's error message on a bad request so the callable can log it", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { error: { message: "Invalid field mask", status: "INVALID_ARGUMENT" } }));
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ kind: "badRequest", message: expect.stringContaining("Invalid field mask") });
  });
});
```

`functions/test/discovery.select.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { PlacesProvider } from "../src/discovery/provider";
import { FIXTURE_SECRET_VALUE, selectProvider } from "../src/discovery/select";

const stub = (label: string): PlacesProvider => ({ searchText: vi.fn(async () => []), searchNearby: vi.fn(async () => []), ...({ label } as object) });

describe("selectProvider", () => {
  const make = { google: vi.fn((key: string) => stub(`google:${key}`)), fixture: vi.fn(() => stub("fixture")) };

  it("fixture value inside the emulator → fixture provider", () => {
    const selection = selectProvider(FIXTURE_SECRET_VALUE, true, make);
    expect(selection).toMatchObject({ kind: "provider", provider: { label: "fixture" } });
    expect(make.google).not.toHaveBeenCalled();
  });

  it("fixture value outside the emulator → not configured (sample venues never reach a deployment)", () => {
    expect(selectProvider(FIXTURE_SECRET_VALUE, false, make)).toEqual({ kind: "notConfigured" });
  });

  it.each([undefined, "", "   "])("empty or missing value (%j) → not configured, in or out of the emulator", (value) => {
    expect(selectProvider(value, true, make)).toEqual({ kind: "notConfigured" });
    expect(selectProvider(value, false, make)).toEqual({ kind: "notConfigured" });
  });

  it("any other value → Google adapter with that key, in or out of the emulator", () => {
    expect(selectProvider("AIza-real-looking", false, make)).toMatchObject({ kind: "provider", provider: { label: "google:AIza-real-looking" } });
    expect(selectProvider("AIza-real-looking", true, make)).toMatchObject({ kind: "provider", provider: { label: "google:AIza-real-looking" } });
  });

  it("matches the fixture value case-sensitively and untrimmed (a stray space is not a key either)", () => {
    expect(selectProvider("Fixture", true, make)).toMatchObject({ kind: "provider", provider: { label: "google:Fixture" } });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd functions && npx vitest run test/discovery.googleProvider.test.ts test/discovery.select.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`functions/src/discovery/googleProvider.ts`:
```ts
import { ProviderError, type PlacesProvider } from "./provider";
import type { DiscoveryResult } from "./types";

/**
 * Google Places API (New) adapter (spec §3.6). Exactly five fields are requested; all are Pro
 * tier for Text and Nearby Search, so every call bills at that tier and nothing the client must
 * not store (coordinates) or does not need (phone, website, rating) is ever fetched.
 */
const BASE = "https://places.googleapis.com/v1";
export const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus";
export const REQUEST_TIMEOUT_MS = 8_000;

interface PlaceJson {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  googleMapsUri?: unknown;
  businessStatus?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Keeps operational places with an id and a name. Exported for the mapping test. */
export function mapPlacesResponse(body: unknown): DiscoveryResult[] {
  const places = (body as { places?: unknown } | null)?.places;
  if (!Array.isArray(places)) return [];
  const results: DiscoveryResult[] = [];
  for (const raw of places as PlaceJson[]) {
    const placeId = str(raw?.id);
    const name = str(raw?.displayName?.text);
    if (!placeId || !name) continue;
    const status = str(raw.businessStatus);
    if (status !== undefined && status !== "OPERATIONAL") continue;
    results.push({
      placeId,
      name,
      address: str(raw.formattedAddress) ?? "",
      googleMapsUri: str(raw.googleMapsUri) ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    });
  }
  return results;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    const message = body?.error?.message;
    return typeof message === "string" ? message : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function createGoogleProvider(apiKey: string, fetchImpl: typeof fetch = fetch): PlacesProvider {
  async function post(pathname: string, body: unknown): Promise<DiscoveryResult[]> {
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}/${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Timeouts (TimeoutError), aborted or failed connections: all "try again later".
      throw new ProviderError("unavailable", err instanceof Error ? err.message : "fetch failed");
    }
    if (res.status === 429) throw new ProviderError("quota", await errorMessage(res), res.status);
    if (res.status >= 500) throw new ProviderError("unavailable", await errorMessage(res), res.status);
    if (res.status >= 400) throw new ProviderError("badRequest", await errorMessage(res), res.status);
    return mapPlacesResponse(await res.json());
  }

  return {
    searchText(query, limit) {
      return post("places:searchText", { textQuery: query, maxResultCount: limit });
    },
    searchNearby(lat, lng, radiusM, limit) {
      return post("places:searchNearby", {
        includedTypes: ["restaurant"],
        maxResultCount: limit,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
      });
    },
  };
}
```

`functions/src/discovery/select.ts`:
```ts
import { createFixtureProvider } from "./fixtureProvider";
import { createGoogleProvider } from "./googleProvider";
import type { PlacesProvider, ProviderSelection } from "./provider";

export const FIXTURE_SECRET_VALUE = "fixture";

const defaultMake = { google: (key: string) => createGoogleProvider(key), fixture: () => createFixtureProvider() };

/**
 * The four branches of spec §3.6:
 *   "fixture" + emulator      → fixture provider
 *   "fixture" elsewhere       → notConfigured (the fixture can never serve a deployment)
 *   empty / missing           → notConfigured
 *   anything else             → Google adapter with that key
 * Matching is exact: no trimming, no case folding — a value that is not exactly "fixture" is a key.
 */
export function selectProvider(
  secretValue: string | undefined,
  isEmulator: boolean,
  make: { google: (key: string) => PlacesProvider; fixture: () => PlacesProvider } = defaultMake,
): ProviderSelection {
  if (secretValue === undefined || secretValue.trim() === "") return { kind: "notConfigured" };
  if (secretValue === FIXTURE_SECRET_VALUE) {
    return isEmulator ? { kind: "provider", provider: make.fixture() } : { kind: "notConfigured" };
  }
  return { kind: "provider", provider: make.google(secretValue) };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd functions && npx vitest run test/discovery.googleProvider.test.ts test/discovery.select.test.ts`
Expected: PASS (2 + 4 + 8 + 5 = 19). `npm run typecheck` green (the test tsconfig includes `test/`; `__dirname` is available because the functions test config is CommonJS via `module: node16` — if TypeScript complains about `__dirname`, use `path.resolve(process.cwd(), "test/fixtures/places-searchText.json")` instead, which is what the rules tests already do with `process.cwd()`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/discovery/googleProvider.ts functions/src/discovery/select.ts functions/test/fixtures/places-searchText.json functions/test/discovery.googleProvider.test.ts functions/test/discovery.select.test.ts
git commit -m "feat(functions): Google Places (New) adapter with a five-field mask and 8 s timeout; provider selection with the deployed fixture refusal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `runSearch` — not-configured, kill switch, daily cap, provider call, error mapping, logging; the two callables

**Files:**
- Create: `functions/src/discovery/search.ts`, `functions/src/discovery/callables.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/test/discovery.search.test.ts` (Firestore emulator, like `membership.test.ts`)

**Interfaces:**
- Consumes: `Member`, `requireMember` (`functions/src/membership.ts`); `parseDestinationInput`, `parseNearbyInput`, `usageDayKey`, `MAX_RESULTS`, `NEARBY_RADIUS_M`, `DiscoveryResponse` (Task 2); `ProviderError`, `ProviderSelection` (Task 3); `selectProvider` (Task 4).
- Produces:
  ```ts
  // search.ts
  export interface SearchDeps { db: Firestore; selection: ProviderSelection; now: () => Date }
  export type SearchRequest = { kind: "destination"; query: string } | { kind: "nearby"; lat: number; lng: number };
  export const CONFIG_PATH = "config/discovery";
  export function usagePath(householdId: string, now: Date): string;   // households/{hid}/usage/{yyyymmdd}
  export async function runSearch(deps: SearchDeps, member: Member, request: SearchRequest): Promise<DiscoveryResponse>;
  // callables.ts
  export const PLACES_API_KEY: SecretParam;
  export const searchDestination: CallableFunction<unknown, Promise<DiscoveryResponse>>;
  export const searchNearby: CallableFunction<unknown, Promise<DiscoveryResponse>>;
  ```

Verified from installed sources (2026-09-22, `firebase-tools` 15.30 `lib/emulator/functionsEmulator.js` `resolveSecretEnvs`, `firebase-functions` 7 `lib/params/types.js` `SecretParam.runtimeValue`): the emulator reads `functions/.secret.local` in dotenv format; a **missing** file is silently ignored, after which the emulator tries Google Secret Manager, logs `ERROR functions: Unable to access secret environment variables from Google Cloud Secret Manager …` when that fails, and keeps running with the secret unset; `PLACES_API_KEY.value()` then returns `""` (with a `No value found for secret parameter` warning). So the "empty or missing → not configured" branch is exactly what a bare checkout hits, and nothing crashes. Task 6 confirms this empirically once.

- [ ] **Step 1: Write the failing tests**

`functions/test/discovery.search.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Member } from "../src/membership";
import { ProviderError, type PlacesProvider, type ProviderSelection } from "../src/discovery/provider";
import { CONFIG_PATH, runSearch, usagePath, type SearchDeps } from "../src/discovery/search";
import type { DiscoveryResult } from "../src/discovery/types";

const member: Member = { uid: "ava", householdId: "home", displayName: "Ava" };
const NOW = new Date("2026-09-22T10:00:00Z");
const USAGE = "households/home/usage/20260922";
const result: DiscoveryResult = { placeId: "p1", name: "Casa", address: "1 Rua", googleMapsUri: "https://maps.google.com/?cid=1" };

let db: Firestore;

function stubProvider(impl: Partial<PlacesProvider> = {}): { provider: PlacesProvider; selection: ProviderSelection } {
  const provider: PlacesProvider = {
    searchText: vi.fn(async () => [result]),
    searchNearby: vi.fn(async () => [result]),
    ...impl,
  };
  return { provider, selection: { kind: "provider", provider } };
}

function deps(selection: ProviderSelection): SearchDeps {
  return { db, selection, now: () => NOW };
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run emu:test` so FIRESTORE_EMULATOR_HOST is set.");
  if (getApps().length === 0) initializeApp({ projectId: "demo-safebite" });
  db = getFirestore();
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("config"));
  await db.recursiveDelete(db.collection("households"));
  await db.doc(CONFIG_PATH).set({ enabled: true, dailySearchCap: 3 });
});

describe("usagePath", () => {
  it("names the household's UTC day document", () => {
    expect(usagePath("home", NOW)).toBe(USAGE);
  });
});

describe("runSearch — gates", () => {
  it("refuses when no provider is configured, before touching config or usage", async () => {
    await expect(runSearch(deps({ kind: "notConfigured" }), member, { kind: "destination", query: "x" }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "Search is not configured." });
    expect((await db.doc(USAGE).get()).exists).toBe(false);
  });

  it("refuses when the config document is missing (fail closed)", async () => {
    await db.doc(CONFIG_PATH).delete();
    await expect(runSearch(deps(stubProvider().selection), member, { kind: "destination", query: "x" }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "Search is switched off." });
    expect((await db.doc(USAGE).get()).exists).toBe(false);
  });

  it("refuses when disabled", async () => {
    await db.doc(CONFIG_PATH).set({ enabled: false, dailySearchCap: 3 });
    await expect(runSearch(deps(stubProvider().selection), member, { kind: "destination", query: "x" }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "Search is switched off." });
  });

  it("treats a non-boolean enabled as switched off and a non-numeric cap as zero", async () => {
    await db.doc(CONFIG_PATH).set({ enabled: "yes", dailySearchCap: 3 });
    await expect(runSearch(deps(stubProvider().selection), member, { kind: "destination", query: "x" })).rejects.toMatchObject({ code: "failed-precondition" });
    await db.doc(CONFIG_PATH).set({ enabled: true, dailySearchCap: "3" });
    await expect(runSearch(deps(stubProvider().selection), member, { kind: "destination", query: "x" })).rejects.toMatchObject({ code: "resource-exhausted", details: { reason: "dailyCap" } });
  });
});

describe("runSearch — usage and cap", () => {
  it("counts each call in the household's day document and passes results through", async () => {
    const { provider, selection } = stubProvider();
    const response = await runSearch(deps(selection), member, { kind: "destination", query: "Lisbon" });
    expect(response).toEqual({ results: [result], provider: "google" });
    expect(provider.searchText).toHaveBeenCalledWith("Lisbon", 10);
    expect((await db.doc(USAGE).get()).get("searches")).toBe(1);
    await runSearch(deps(selection), member, { kind: "nearby", lat: 51.5, lng: -0.12 });
    expect(provider.searchNearby).toHaveBeenCalledWith(51.5, -0.12, 1500, 10);
    expect((await db.doc(USAGE).get()).get("searches")).toBe(2);
  });

  it("refuses the call that would exceed the cap, at exactly the cap, without calling the provider", async () => {
    const { provider, selection } = stubProvider();
    await db.doc(USAGE).set({ searches: 3 });
    await expect(runSearch(deps(selection), member, { kind: "destination", query: "x" }))
      .rejects.toMatchObject({ code: "resource-exhausted", details: { reason: "dailyCap" } });
    expect(provider.searchText).not.toHaveBeenCalled();
    expect((await db.doc(USAGE).get()).get("searches")).toBe(3);
  });

  it("still allows the last call under the cap", async () => {
    await db.doc(USAGE).set({ searches: 2 });
    await expect(runSearch(deps(stubProvider().selection), member, { kind: "destination", query: "x" })).resolves.toBeDefined();
    expect((await db.doc(USAGE).get()).get("searches")).toBe(3);
  });

  it("counts a call whose provider fails (cost-safe)", async () => {
    const { selection } = stubProvider({ searchText: vi.fn(async () => { throw new ProviderError("unavailable", "down", 503); }) });
    await expect(runSearch(deps(selection), member, { kind: "destination", query: "x" })).rejects.toMatchObject({ code: "unavailable" });
    expect((await db.doc(USAGE).get()).get("searches")).toBe(1);
  });

  it("keys usage by the clock it is given", async () => {
    const later = { ...deps(stubProvider().selection), now: () => new Date("2026-09-23T00:30:00Z") };
    await runSearch(later, member, { kind: "destination", query: "x" });
    expect((await db.doc("households/home/usage/20260923").get()).get("searches")).toBe(1);
    expect((await db.doc(USAGE).get()).exists).toBe(false);
  });
});

describe("runSearch — provider error mapping", () => {
  it.each([
    ["quota", { code: "resource-exhausted", details: { reason: "providerQuota" } }],
    ["unavailable", { code: "unavailable" }],
    ["badRequest", { code: "internal" }],
  ] as const)("maps ProviderError %s", async (kind, expected) => {
    const { selection } = stubProvider({ searchText: vi.fn(async () => { throw new ProviderError(kind, `fixture ${kind}`, 400); }) });
    await expect(runSearch(deps(selection), member, { kind: "destination", query: "x" })).rejects.toMatchObject(expected);
  });

  it("maps an unexpected error to internal", async () => {
    const { selection } = stubProvider({ searchText: vi.fn(async () => { throw new TypeError("boom"); }) });
    await expect(runSearch(deps(selection), member, { kind: "destination", query: "x" })).rejects.toMatchObject({ code: "internal" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run emu:test` (from the root; gives the emulators to every functions test). Expected: the new file fails with module not found; every pre-existing test still passes.

- [ ] **Step 3: Implement**

`functions/src/discovery/search.ts`:
```ts
import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type { Member } from "../membership";
import { ProviderError, type ProviderSelection } from "./provider";
import { MAX_RESULTS, NEARBY_RADIUS_M, type DiscoveryResponse } from "./types";
import { usageDayKey } from "./usageDay";

export interface SearchDeps {
  db: Firestore;
  selection: ProviderSelection;
  now: () => Date;
}

export type SearchRequest = { kind: "destination"; query: string } | { kind: "nearby"; lat: number; lng: number };

/** Admin-only kill switch and cap: { enabled: boolean, dailySearchCap: number }. Missing = off. */
export const CONFIG_PATH = "config/discovery";

export function usagePath(householdId: string, now: Date): string {
  return `households/${householdId}/usage/${usageDayKey(now)}`;
}

/** Logs never carry the query text; coordinates are rounded to 2 dp (spec §2.6, §3.6). */
const round2 = (n: number) => Math.round(n * 100) / 100;

function readConfig(data: DocumentData | undefined): { enabled: boolean; cap: number } {
  const enabled = data?.enabled === true;
  const rawCap = data?.dailySearchCap;
  const cap = typeof rawCap === "number" && Number.isFinite(rawCap) && rawCap >= 0 ? Math.floor(rawCap) : 0;
  return { enabled, cap };
}

/**
 * Order matters and is what the tests pin down:
 *   1. a missing provider refuses before any read (nothing to bill, nothing to count);
 *   2. the kill switch is read on every call and fails closed;
 *   3. the usage transaction increments BEFORE the provider is called, so a failed upstream
 *      call still counts (a flapping provider cannot burn unlimited calls);
 *   4. provider failures map to the codes the client turns into states.
 */
export async function runSearch(deps: SearchDeps, member: Member, request: SearchRequest): Promise<DiscoveryResponse> {
  if (deps.selection.kind === "notConfigured") {
    throw new HttpsError("failed-precondition", "Search is not configured.");
  }
  const provider = deps.selection.provider;
  const now = deps.now();

  const config = readConfig((await deps.db.doc(CONFIG_PATH).get()).data());
  if (!config.enabled) throw new HttpsError("failed-precondition", "Search is switched off.");

  const usageRef = deps.db.doc(usagePath(member.householdId, now));
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const current = snap.get("searches");
    const searches = typeof current === "number" ? current : 0;
    if (searches >= config.cap) {
      throw new HttpsError("resource-exhausted", "Daily search limit reached.", { reason: "dailyCap" });
    }
    tx.set(usageRef, { searches: FieldValue.increment(1) }, { merge: true });
  });

  const started = Date.now();
  const logBase = {
    kind: request.kind,
    uid: member.uid,
    householdId: member.householdId,
    ...(request.kind === "nearby" ? { lat: round2(request.lat), lng: round2(request.lng) } : {}),
  };
  try {
    const results =
      request.kind === "destination"
        ? await provider.searchText(request.query, MAX_RESULTS)
        : await provider.searchNearby(request.lat, request.lng, NEARBY_RADIUS_M, MAX_RESULTS);
    logger.info("discovery.search", { ...logBase, resultCount: results.length, durationMs: Date.now() - started, outcome: "ok" });
    return { results, provider: "google" };
  } catch (err) {
    const durationMs = Date.now() - started;
    if (err instanceof ProviderError) {
      logger.warn("discovery.search", { ...logBase, durationMs, outcome: err.kind, status: err.status, message: err.message });
      switch (err.kind) {
        case "quota":
          throw new HttpsError("resource-exhausted", "The search provider's quota is exhausted.", { reason: "providerQuota" });
        case "unavailable":
          throw new HttpsError("unavailable", "The search provider is unavailable.");
        case "badRequest":
          throw new HttpsError("internal", "Search failed.");
      }
    }
    logger.error("discovery.search", { ...logBase, durationMs, outcome: "unexpected", message: err instanceof Error ? err.message : String(err) });
    throw new HttpsError("internal", "Search failed.");
  }
}
```

`functions/src/discovery/callables.ts`:
```ts
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { requireMember } from "../membership";
import { runSearch, type SearchDeps } from "./search";
import { selectProvider } from "./select";
import type { DiscoveryResponse } from "./types";
import { parseDestinationInput, parseNearbyInput } from "./validate";

/**
 * The Places server key (spec §2.4: never in web/). Locally the emulator reads the gitignored
 * functions/.secret.local; the committed .secret.local.example sets it to "fixture", which
 * select.ts honours only inside the emulator. Staging binds a real Secret Manager value (owner
 * action O4); agents never set one.
 */
export const PLACES_API_KEY = defineSecret("PLACES_API_KEY");

function deps(): SearchDeps {
  return {
    db: getFirestore(),
    selection: selectProvider(PLACES_API_KEY.value(), process.env.FUNCTIONS_EMULATOR === "true"),
    now: () => new Date(),
  };
}

export const searchDestination = onCall<unknown, Promise<DiscoveryResponse>>({ secrets: [PLACES_API_KEY] }, async (request) => {
  const member = await requireMember(request);
  const { query } = parseDestinationInput(request.data);
  return runSearch(deps(), member, { kind: "destination", query });
});

export const searchNearby = onCall<unknown, Promise<DiscoveryResponse>>({ secrets: [PLACES_API_KEY] }, async (request) => {
  const member = await requireMember(request);
  const { lat, lng } = parseNearbyInput(request.data);
  return runSearch(deps(), member, { kind: "nearby", lat, lng });
});
```

`functions/src/index.ts` — add after the `whoami` export:
```ts
export { searchDestination, searchNearby } from "./discovery/callables";
```

- [ ] **Step 4: Run the tests**

Run: `npm run emu:test`
Expected: PASS — previous functions/rules total + the Task 2–4 files (they run under the same command) + 15 new here. `npm run typecheck` green. Note `firebase-functions/logger` is a documented subpath export of `firebase-functions` 7 (`package.json` `exports["./logger"]`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/discovery/search.ts functions/src/discovery/callables.ts functions/src/index.ts functions/test/discovery.search.test.ts
git commit -m "feat(functions): searchDestination and searchNearby — member-only, fail-closed kill switch, per-day cap counted before the provider call, provider error mapping, privacy-safe logs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Secret handling, seed config, deploy-package exclusions, callable and rules emulator tests, the secret-absent probe

**Files:**
- Create: `functions/.secret.local.example`, `tooling/ensure-secret-local.mjs`, `functions/test/discovery.callables.test.ts`, `functions/test/rules.discovery.test.ts`, `planning/audits/plan-3-secret-absent-probe.mjs`
- Modify: `.gitignore`, `firebase.json`, `package.json` (root), `functions/src/seed-emulator.ts`, `functions/test/seed-emulator.test.ts`

**Interfaces:**
- Consumes: `callFunction`, `createEmulatorUser`, `signInForIdToken`, `warmUpFunctions`, `ensureAdminApp` (`functions/test/emulator-helpers.ts`); `CONFIG_PATH` (Task 5); `MAGIC`, `FIXTURE_RESULTS` (Task 3).
- Produces: `functions/.secret.local` present in every `emu:*` run (fixture value); `config/discovery` seeded; HTTP-level proof of every callable outcome.

- [ ] **Step 1: Secret files and scripts**

Create `functions/.secret.local.example` (committed; the only secret value this repository ever holds):
```
# Local override for the PLACES_API_KEY secret, read by the Functions emulator only.
# "fixture" selects the fixture places provider (functions/src/discovery/fixtureProvider.ts),
# and only inside the emulator; a deployed function with this value refuses every search.
# To try real Places results locally, copy this file to .secret.local and paste a key
# restricted to Places API (New) — never commit .secret.local.
PLACES_API_KEY=fixture
```

Create `tooling/ensure-secret-local.mjs` (root):
```js
// Copies functions/.secret.local.example to functions/.secret.local when the latter is missing,
// so every emulator run selects the fixture places provider. Never overwrites an existing file:
// a developer's real local key survives.
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "functions", ".secret.local");
const example = path.join(root, "functions", ".secret.local.example");

if (existsSync(target)) {
  console.log("[safebite] functions/.secret.local present; leaving it alone.");
} else {
  copyFileSync(example, target);
  console.log("[safebite] functions/.secret.local created from .secret.local.example (PLACES_API_KEY=fixture).");
}
```

`.gitignore` — append after the `!/web/.env.boot-guard` line:
```
functions/.secret.local
```
(`.env.*` does not match `.secret.local`; the explicit entry is required. The example file is not ignored.)

`firebase.json` — the functions `ignore` list becomes:
```json
"ignore": ["node_modules", ".git", "test", "*.log", ".secret.local", ".secret.local.example"]
```
(Without this, `firebase deploy` would upload a local key inside the functions source package.)

Root `package.json` — every `emu:*` script starts with the ensure step. Replace the four scripts:
```json
"emu:start": "node tooling/ensure-secret-local.mjs && npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:start --only auth,firestore,functions --project demo-safebite",
"emu:test": "node tooling/ensure-secret-local.mjs && npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec --only auth,firestore,functions --project demo-safebite \"npm --prefix functions test\"",
"emu:e2e": "node tooling/ensure-secret-local.mjs && npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec --only auth,firestore,functions --project demo-safebite \"node functions/lib/seed-emulator.js && npm --prefix web run e2e\"",
"emu:e2e:stress": "node tooling/ensure-secret-local.mjs && npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec --only auth,firestore,functions --project demo-safebite \"node functions/lib/seed-emulator.js && npm --prefix web run e2e -- --repeat-each=3 --retries=0\""
```
(`emu:seed` is unchanged.)

- [ ] **Step 2: Seed the config document**

`functions/src/seed-emulator.ts` — in `seedEmulator()`, after the `users/stranger-uid` delete:
```ts
  // Discovery kill switch and cap (spec §3.6). A missing document means "switched off", so the
  // emulator must seed it or every search refuses.
  await db.doc("config/discovery").set({ enabled: true, dailySearchCap: 50 });
```
Update the console message in the `require.main` block to end with `Discovery enabled with a cap of 50 searches/day.`

`functions/test/seed-emulator.test.ts` — inside the first test, after the `stranger-uid` assertion:
```ts
    expect((await db.doc("config/discovery").get()).data()).toEqual({ enabled: true, dailySearchCap: 50 });
```

- [ ] **Step 3: Write the callable emulator tests**

`functions/test/discovery.callables.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import { callFunction, createEmulatorUser, ensureAdminApp, signInForIdToken, warmUpFunctions } from "./emulator-helpers";
import { FIXTURE_RESULTS, MAGIC } from "../src/discovery/fixtureProvider";
import { CONFIG_PATH } from "../src/discovery/search";

const PASSWORD = "pilot-password-1";
let avaToken: string;
let strangerToken: string;

beforeAll(async () => {
  await warmUpFunctions("searchDestination");
  ensureAdminApp();
  const db = getFirestore();
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("households"));
  await db.doc("households/home").set({ name: "Home", memberIds: ["ava-uid"], createdAt: new Date() });
  await db.doc("users/ava-uid").set({ householdId: "home", displayName: "Ava" });
  await createEmulatorUser("ava-uid", "ava@safebite.test", PASSWORD);
  await createEmulatorUser("stranger-uid", "stranger@safebite.test", PASSWORD);
  avaToken = await signInForIdToken("ava@safebite.test", PASSWORD);
  strangerToken = await signInForIdToken("stranger@safebite.test", PASSWORD);
}, 300000);

beforeEach(async () => {
  const db = getFirestore();
  await db.recursiveDelete(db.collection("config"));
  await db.recursiveDelete(db.collection("households/home/usage"));
  await db.doc(CONFIG_PATH).set({ enabled: true, dailySearchCap: 5 });
});

describe("searchDestination (fixture provider via functions/.secret.local)", () => {
  it("returns fixture results to a member — proves FUNCTIONS_EMULATOR selection and the secret file", async () => {
    const res = await callFunction("searchDestination", { query: "Lisbon" }, avaToken);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ results: FIXTURE_RESULTS.slice(0, 10), provider: "google" });
  });

  it("rejects an unauthenticated call", async () => {
    const res = await callFunction("searchDestination", { query: "Lisbon" });
    expect(res.status).toBe(401);
    expect(res.body.error?.status).toBe("UNAUTHENTICATED");
  });

  it("rejects a signed-in non-member before validating input", async () => {
    const res = await callFunction("searchDestination", { query: "" }, strangerToken);
    expect(res.status).toBe(403);
    expect(res.body.error?.status).toBe("PERMISSION_DENIED");
  });

  it("ignores a spoofed identity in request.data", async () => {
    const res = await callFunction("searchDestination", { query: "Lisbon", uid: "ava-uid", householdId: "home" }, strangerToken);
    expect(res.status).toBe(403);
  });

  it("rejects invalid input", async () => {
    const res = await callFunction("searchDestination", { query: "   " }, avaToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.status).toBe("INVALID_ARGUMENT");
  });

  it("refuses when the config document is missing", async () => {
    await getFirestore().doc(CONFIG_PATH).delete();
    const res = await callFunction("searchDestination", { query: "Lisbon" }, avaToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.status).toBe("FAILED_PRECONDITION");
    expect(res.body.error?.message).toBe("Search is switched off.");
  });

  it("refuses when disabled", async () => {
    await getFirestore().doc(CONFIG_PATH).set({ enabled: false, dailySearchCap: 5 });
    const res = await callFunction("searchDestination", { query: "Lisbon" }, avaToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toBe("Search is switched off.");
  });

  it("refuses at exactly the cap with reason dailyCap", async () => {
    await getFirestore().doc(CONFIG_PATH).set({ enabled: true, dailySearchCap: 1 });
    expect((await callFunction("searchDestination", { query: "one" }, avaToken)).status).toBe(200);
    const res = await callFunction("searchDestination", { query: "two" }, avaToken);
    expect(res.status).toBe(429);
    expect(res.body.error?.status).toBe("RESOURCE_EXHAUSTED");
    expect((res.body.error as { details?: unknown }).details).toEqual({ reason: "dailyCap" });
  });

  it("counts a failed provider call", async () => {
    const res = await callFunction("searchDestination", { query: MAGIC.unavailable }, avaToken);
    expect(res.status).toBe(503);
    expect(res.body.error?.status).toBe("UNAVAILABLE");
    const usage = await getFirestore().collection("households/home/usage").get();
    expect(usage.docs.map((d) => d.get("searches"))).toEqual([1]);
  });

  it("maps the quota magic query to RESOURCE_EXHAUSTED providerQuota", async () => {
    const res = await callFunction("searchDestination", { query: MAGIC.quota }, avaToken);
    expect(res.status).toBe(429);
    expect((res.body.error as { details?: unknown }).details).toEqual({ reason: "providerQuota" });
  });

  it("maps the empty magic query to no results", async () => {
    const res = await callFunction("searchDestination", { query: MAGIC.empty }, avaToken);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ results: [], provider: "google" });
  });
});

describe("searchNearby", () => {
  it("returns fixture results for valid coordinates", async () => {
    const res = await callFunction("searchNearby", { lat: 51.5, lng: -0.12 }, avaToken);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ results: FIXTURE_RESULTS.slice(0, 10), provider: "google" });
  });

  it("rejects out-of-range coordinates", async () => {
    const res = await callFunction("searchNearby", { lat: 91, lng: 0 }, avaToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.status).toBe("INVALID_ARGUMENT");
  });

  it("shares the household's daily cap with destination searches", async () => {
    await getFirestore().doc(CONFIG_PATH).set({ enabled: true, dailySearchCap: 1 });
    expect((await callFunction("searchNearby", { lat: 51.5, lng: -0.12 }, avaToken)).status).toBe(200);
    expect((await callFunction("searchDestination", { query: "x" }, avaToken)).status).toBe(429);
  });
});
```

Note on `details`: the callable protocol serialises `HttpsError.details` under `error.details`; `CallResult["body"]["error"]` in `emulator-helpers.ts` types only `status`/`message`, hence the local cast. Do not widen the helper's type unless the reviewer prefers it.

- [ ] **Step 4: Write the rules tests**

`functions/test/rules.discovery.test.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

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
    await setDoc(doc(db, "households/home"), { name: "Home", memberIds: ["ava"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "config/discovery"), { enabled: true, dailySearchCap: 50 });
    await setDoc(doc(db, "households/home/usage/20260922"), { searches: 3 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

// No match block exists for these paths, so default-deny applies; these tests pin that down
// (spec §3.6: clients get no rules access to config or usage; functions use the Admin SDK).
describe("config/discovery", () => {
  it("denies a member reading the kill switch", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext("ava").firestore(), "config/discovery")));
  });
  it("denies a member enabling search or raising the cap", async () => {
    await assertFails(setDoc(doc(env.authenticatedContext("ava").firestore(), "config/discovery"), { enabled: true, dailySearchCap: 1000 }));
  });
});

describe("households/{hid}/usage/{day}", () => {
  it("denies a member reading their household's usage", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext("ava").firestore(), "households/home/usage/20260922")));
  });
  it("denies a member resetting or deleting usage", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(setDoc(doc(db, "households/home/usage/20260922"), { searches: 0 }));
    await assertFails(deleteDoc(doc(db, "households/home/usage/20260922")));
  });
});
```

- [ ] **Step 5: Run the emulator suites**

Run: `npm run emu:test`
Expected: PASS — Task 5's total + 1 (seed) + 14 (callables) + 4 (rules). The first run prints `[safebite] functions/.secret.local created from .secret.local.example`. `git status` must show `functions/.secret.local` as ignored (not untracked): `git status --short --ignored | grep secret.local` prints `!! functions/.secret.local`.

- [ ] **Step 6: The secret-absent probe (empirical confirmation, once)**

Create `planning/audits/plan-3-secret-absent-probe.mjs`:
```js
// Plan 3 probe: what does a member's search return when functions/.secret.local is ABSENT?
// Expected (verified from firebase-tools 15.30 and firebase-functions 7 sources, 2026-09-22):
// the emulator logs "Unable to access secret environment variables from Google Cloud Secret
// Manager", the function still runs, PLACES_API_KEY.value() is "", and the callable answers
// 400 FAILED_PRECONDITION "Search is not configured." — never a fixture result.
// Run from the repo root, with the emulators already started WITHOUT the secret file:
//   mv functions/.secret.local /tmp/secret.bak   # if present
//   npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec \
//     --only auth,firestore,functions --project demo-safebite "node planning/audits/plan-3-secret-absent-probe.mjs"
//   mv /tmp/secret.bak functions/.secret.local   # restore
const AUTH = "http://127.0.0.1:9099";
const FS = "http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents";
const FN = "http://127.0.0.1:5001/demo-safebite/europe-west2/searchDestination";
const json = { "Content-Type": "application/json" };
const owner = { ...json, Authorization: "Bearer owner" };

async function put(path, fields) {
  const res = await fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
}
await put("households/probe-home", { name: { stringValue: "Probe" }, memberIds: { arrayValue: { values: [{ stringValue: "probe-uid" }] } }, createdAt: { timestampValue: new Date().toISOString() } });
await put("users/probe-uid", { householdId: { stringValue: "probe-home" }, displayName: { stringValue: "Probe" } });
await put("config/discovery", { enabled: { booleanValue: true }, dailySearchCap: { integerValue: "5" } });

const signUp = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
  method: "POST", headers: json, body: JSON.stringify({ email: "probe@safebite.test", password: "probe-password-1", returnSecureToken: true }),
});
let token = (await signUp.json()).idToken;
if (!token) {
  const signIn = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST", headers: json, body: JSON.stringify({ email: "probe@safebite.test", password: "probe-password-1", returnSecureToken: true }),
  });
  token = (await signIn.json()).idToken;
}
// The Auth emulator assigns its own uid on signUp; rewrite the membership docs to that uid.
const lookup = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key`, { method: "POST", headers: json, body: JSON.stringify({ idToken: token }) });
const uid = (await lookup.json()).users[0].localId;
await put("households/probe-home", { name: { stringValue: "Probe" }, memberIds: { arrayValue: { values: [{ stringValue: uid }] } }, createdAt: { timestampValue: new Date().toISOString() } });
await put(`users/${uid}`, { householdId: { stringValue: "probe-home" }, displayName: { stringValue: "Probe" } });

const res = await fetch(FN, { method: "POST", headers: { ...json, Authorization: `Bearer ${token}` }, body: JSON.stringify({ data: { query: "probe" } }) });
console.log("PROBE status", res.status);
console.log("PROBE body", await res.text());
```

Run the three commands from the file header (move the secret file away, run, restore). Record the observed emulator log line and the `PROBE status`/`PROBE body` output in the task report, and add a one-line comment above `PLACES_API_KEY` in `functions/src/discovery/callables.ts`: `// Probed 2026-09-22 (planning/audits/plan-3-secret-absent-probe.mjs): with no .secret.local the emulator logs a Secret Manager error, value() is "", and searches answer 400 "Search is not configured."`. **Hard stop:** if the observed status is anything but 400 with `Search is not configured.`, or a fixture result appears, stop and report before continuing to Task 7. Restore `functions/.secret.local` afterwards (`npm run emu:test` recreates it anyway).

- [ ] **Step 7: Full gate and commit**

Run: `npm run typecheck && npm run test:unit && npm run emu:test` — all green. `git status` must not list `functions/.secret.local`.

```bash
git add functions/.secret.local.example tooling/ensure-secret-local.mjs .gitignore firebase.json package.json functions/src/seed-emulator.ts functions/test/seed-emulator.test.ts functions/test/discovery.callables.test.ts functions/test/rules.discovery.test.ts functions/src/discovery/callables.ts planning/audits/plan-3-secret-absent-probe.mjs
git commit -m "feat(functions): fixture secret for emulator runs, seeded discovery config, deploy-package exclusions; callable and rules emulator tests; secret-absent probe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Web discovery API and the sequence-numbered search controller

**Files:**
- Create: `web/src/discover/api.ts`, `web/src/discover/search.ts`
- Test: `web/src/discover/api.test.ts`, `web/src/discover/search.test.ts`

**Interfaces:**
- Consumes: `callable`, `abortable`, `anySignal`, `isAbortError`, `isTimeoutError` (Task 1).
- Produces (used by Task 8):
  ```ts
  // api.ts
  export interface DiscoveryResult { placeId: string; name: string; address: string; googleMapsUri: string }
  export interface DiscoveryResponse { results: DiscoveryResult[]; provider: "google" }
  export const searchDestination: (data: { query: string }) => Promise<DiscoveryResponse>;
  export const searchNearby: (data: { lat: number; lng: number }) => Promise<DiscoveryResponse>;
  export type SearchErrorReason = "off" | "dailyCap" | "providerQuota" | "unavailable" | "offline" | "timeout" | "locationDenied" | "locationUnavailable" | "invalid";
  export function classifySearchError(err: unknown, online?: boolean): SearchErrorReason;
  // search.ts
  export const CLIENT_TIMEOUT_MS = 20_000;
  export type SearchRun = { kind: "destination"; query: string } | { kind: "nearby"; lat: number; lng: number };
  export type SearchState =
    | { status: "idle" }
    | { status: "searching"; label: string }
    | { status: "results"; label: string; results: DiscoveryResult[] }
    | { status: "empty"; label: string }
    | { status: "error"; label: string; reason: SearchErrorReason };
  export function labelFor(run: SearchRun): string;                       // the query, or "near you"
  export interface SearchController { submit(run: SearchRun): void; fail(reason: SearchErrorReason, label: string): void; cancel(): void }
  export interface ControllerOptions { onChange: (s: SearchState) => void; call?: (run: SearchRun) => Promise<DiscoveryResponse>; isOnline?: () => boolean; timeoutMs?: number }
  export function createSearchController(options: ControllerOptions): SearchController;
  export function useDiscoverySearch(options?: Pick<ControllerOptions, "call">): { state: SearchState; submitDestination(query: string): void; submitNearby(lat: number, lng: number): void; fail(reason: SearchErrorReason, label: string): void };
  ```

- [ ] **Step 1: Write the failing tests**

`web/src/discover/api.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

const { httpsCallableMock } = vi.hoisted(() => ({ httpsCallableMock: vi.fn(() => async () => ({ data: {} })) }));
vi.mock("../firebase", () => ({ functions: { app: "fake" } }));
vi.mock("firebase/functions", () => ({ httpsCallable: httpsCallableMock }));

import { classifySearchError } from "./api";

const fnError = (code: string, details?: unknown) => Object.assign(new Error(code), { code, details });

describe("classifySearchError", () => {
  it("maps the callable codes to reasons", () => {
    expect(classifySearchError(fnError("functions/failed-precondition"), true)).toBe("off");
    expect(classifySearchError(fnError("functions/resource-exhausted", { reason: "dailyCap" }), true)).toBe("dailyCap");
    expect(classifySearchError(fnError("functions/resource-exhausted", { reason: "providerQuota" }), true)).toBe("providerQuota");
    expect(classifySearchError(fnError("functions/resource-exhausted"), true)).toBe("providerQuota");
    expect(classifySearchError(fnError("functions/unavailable"), true)).toBe("unavailable");
    expect(classifySearchError(fnError("functions/invalid-argument"), true)).toBe("invalid");
    expect(classifySearchError(fnError("functions/internal"), true)).toBe("unavailable");
    expect(classifySearchError(fnError("functions/permission-denied"), true)).toBe("unavailable");
  });

  it("reports a timeout abort as timeout", () => {
    expect(classifySearchError(new DOMException("x", "TimeoutError"), true)).toBe("timeout");
  });

  it("reports an unknown failure as offline when the browser is offline, otherwise unavailable", () => {
    expect(classifySearchError(new TypeError("Failed to fetch"), false)).toBe("offline");
    expect(classifySearchError(new TypeError("Failed to fetch"), true)).toBe("unavailable");
    expect(classifySearchError(undefined, true)).toBe("unavailable");
  });

  it("declares the two callables by name", () => {
    expect(httpsCallableMock).toHaveBeenCalledWith({ app: "fake" }, "searchDestination");
    expect(httpsCallableMock).toHaveBeenCalledWith({ app: "fake" }, "searchNearby");
  });
});
```

`web/src/discover/search.test.ts`:
```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveryResponse } from "./api";

vi.mock("./api", () => ({
  searchDestination: vi.fn(),
  searchNearby: vi.fn(),
  classifySearchError: (err: unknown) => {
    if (err instanceof DOMException && err.name === "TimeoutError") return "timeout";
    return (err as { code?: string })?.code === "functions/failed-precondition" ? "off" : "unavailable";
  },
}));

import { CLIENT_TIMEOUT_MS, createSearchController, labelFor, useDiscoverySearch, type SearchRun, type SearchState } from "./search";

const result = { placeId: "p1", name: "Casa", address: "1 Rua", googleMapsUri: "https://maps.google.com/?cid=1" };
const ok = (results = [result]): DiscoveryResponse => ({ results, provider: "google" });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness(overrides: { isOnline?: () => boolean; timeoutMs?: number } = {}) {
  const calls: Array<{ run: SearchRun; d: ReturnType<typeof deferred<DiscoveryResponse>> }> = [];
  const states: SearchState[] = [];
  const controller = createSearchController({
    onChange: (s) => states.push(s),
    call: (run) => {
      const d = deferred<DiscoveryResponse>();
      calls.push({ run, d });
      return d.promise;
    },
    isOnline: overrides.isOnline ?? (() => true),
    timeoutMs: overrides.timeoutMs,
  });
  return { controller, calls, states, last: () => states[states.length - 1] };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("labelFor", () => {
  it("uses the query for destination searches and 'near you' for nearby", () => {
    expect(labelFor({ kind: "destination", query: "Lisbon" })).toBe("Lisbon");
    expect(labelFor({ kind: "nearby", lat: 1, lng: 2 })).toBe("near you");
  });
});

describe("createSearchController", () => {
  it("goes searching → results", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "Lisbon" });
    expect(h.last()).toEqual({ status: "searching", label: "Lisbon" });
    h.calls[0]!.d.resolve(ok());
    await flush();
    expect(h.last()).toEqual({ status: "results", label: "Lisbon", results: [result] });
  });

  it("goes searching → empty when there are no results", async () => {
    const h = harness();
    h.controller.submit({ kind: "nearby", lat: 51.5, lng: -0.12 });
    h.calls[0]!.d.resolve(ok([]));
    await flush();
    expect(h.last()).toEqual({ status: "empty", label: "near you" });
  });

  it("drops a late response for a superseded search", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "slow" });
    h.controller.submit({ kind: "destination", query: "fast" });
    h.calls[1]!.d.resolve(ok([{ ...result, name: "Fast" }]));
    await flush();
    expect(h.last()).toMatchObject({ status: "results", label: "fast" });
    h.calls[0]!.d.resolve(ok([{ ...result, name: "Slow" }]));
    await flush();
    expect(h.last()).toMatchObject({ status: "results", label: "fast", results: [{ name: "Fast" }] });
  });

  it("drops a late error for a superseded search", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "first" });
    h.controller.submit({ kind: "destination", query: "second" });
    h.calls[0]!.d.reject(Object.assign(new Error("x"), { code: "functions/failed-precondition" }));
    await flush();
    expect(h.last()).toEqual({ status: "searching", label: "second" });
  });

  it("maps a rejected call to an error state", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "q" });
    h.calls[0]!.d.reject(Object.assign(new Error("x"), { code: "functions/failed-precondition" }));
    await flush();
    expect(h.last()).toEqual({ status: "error", label: "q", reason: "off" });
  });

  it("short-circuits to offline without calling when the browser is offline", () => {
    const h = harness({ isOnline: () => false });
    h.controller.submit({ kind: "destination", query: "q" });
    expect(h.calls).toHaveLength(0);
    expect(h.last()).toEqual({ status: "error", label: "q", reason: "offline" });
  });

  it("times out a call that never answers", async () => {
    const h = harness({ timeoutMs: 30 });
    h.controller.submit({ kind: "destination", query: "q" });
    await new Promise((r) => setTimeout(r, 80));
    expect(h.last()).toEqual({ status: "error", label: "q", reason: "timeout" });
  });

  it("fail() reports a location reason and supersedes any in-flight search", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "q" });
    h.controller.fail("locationDenied", "near you");
    expect(h.last()).toEqual({ status: "error", label: "near you", reason: "locationDenied" });
    h.calls[0]!.d.resolve(ok());
    await flush();
    expect(h.last()).toEqual({ status: "error", label: "near you", reason: "locationDenied" });
  });

  it("cancel() leaves the last state alone and ignores the in-flight outcome", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "q" });
    h.controller.cancel();
    h.calls[0]!.d.resolve(ok());
    await flush();
    expect(h.last()).toEqual({ status: "searching", label: "q" });
  });

  it("uses a 20 second default timeout", () => {
    expect(CLIENT_TIMEOUT_MS).toBe(20_000);
  });
});

describe("useDiscoverySearch", () => {
  it("exposes the state and the two submit helpers", async () => {
    const call = vi.fn(async () => ok());
    const { result: hook } = renderHook(() => useDiscoverySearch({ call }));
    expect(hook.current.state).toEqual({ status: "idle" });
    await act(async () => { hook.current.submitDestination("Lisbon"); await flush(); });
    expect(call).toHaveBeenCalledWith({ kind: "destination", query: "Lisbon" });
    expect(hook.current.state).toMatchObject({ status: "results", label: "Lisbon" });
    await act(async () => { hook.current.submitNearby(51.5, -0.12); await flush(); });
    expect(call).toHaveBeenLastCalledWith({ kind: "nearby", lat: 51.5, lng: -0.12 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/discover`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`web/src/discover/api.ts`:
```ts
import { callable, isTimeoutError } from "../api/callable";

/** Mirrors functions/src/discovery/types.ts. Never persisted or cached on the client (spec §3.6). */
export interface DiscoveryResult {
  placeId: string;
  name: string;
  address: string;
  googleMapsUri: string;
}

export interface DiscoveryResponse {
  results: DiscoveryResult[];
  provider: "google";
}

export const searchDestination = callable<{ query: string }, DiscoveryResponse>("searchDestination");
export const searchNearby = callable<{ lat: number; lng: number }, DiscoveryResponse>("searchNearby");

export type SearchErrorReason =
  | "off"
  | "dailyCap"
  | "providerQuota"
  | "unavailable"
  | "offline"
  | "timeout"
  | "locationDenied"
  | "locationUnavailable"
  | "invalid";

/** Callable codes → reasons (spec §3.6 error mapping). Both failed-precondition messages read as "off". */
export function classifySearchError(err: unknown, online: boolean = navigator.onLine): SearchErrorReason {
  if (isTimeoutError(err)) return "timeout";
  const code = (err as { code?: unknown } | null)?.code;
  const details = (err as { details?: { reason?: unknown } } | null)?.details;
  switch (code) {
    case "functions/failed-precondition":
      return "off";
    case "functions/resource-exhausted":
      return details?.reason === "dailyCap" ? "dailyCap" : "providerQuota";
    case "functions/invalid-argument":
      return "invalid";
    case "functions/unavailable":
      return "unavailable";
    default:
      return typeof code === "string" || online ? "unavailable" : "offline";
  }
}
```

`web/src/discover/search.ts`:
```ts
import { useEffect, useRef, useState } from "react";
import { abortable, anySignal, isAbortError } from "../api/callable";
import { classifySearchError, searchDestination, searchNearby, type DiscoveryResponse, type DiscoveryResult, type SearchErrorReason } from "./api";

/** Server-side fetch is 8 s; cold starts add several seconds on top (spec §3.6 decisions). */
export const CLIENT_TIMEOUT_MS = 20_000;

export type SearchRun = { kind: "destination"; query: string } | { kind: "nearby"; lat: number; lng: number };

export type SearchState =
  | { status: "idle" }
  | { status: "searching"; label: string }
  | { status: "results"; label: string; results: DiscoveryResult[] }
  | { status: "empty"; label: string }
  | { status: "error"; label: string; reason: SearchErrorReason };

export function labelFor(run: SearchRun): string {
  return run.kind === "destination" ? run.query : "near you";
}

export interface SearchController {
  submit(run: SearchRun): void;
  /** Report a client-side failure (location) as the current outcome, superseding any search. */
  fail(reason: SearchErrorReason, label: string): void;
  /** Ignore the in-flight outcome (unmount). The controller stays usable. */
  cancel(): void;
}

export interface ControllerOptions {
  onChange: (state: SearchState) => void;
  call?: (run: SearchRun) => Promise<DiscoveryResponse>;
  isOnline?: () => boolean;
  timeoutMs?: number;
}

const defaultCall = (run: SearchRun): Promise<DiscoveryResponse> =>
  run.kind === "destination" ? searchDestination({ query: run.query }) : searchNearby({ lat: run.lat, lng: run.lng });

/**
 * One AbortController per submission; each submit takes a sequence number and aborts the previous
 * controller, and an outcome is applied only if its sequence number is still current. So a slow,
 * superseded response can never replace a newer one (spec §2.5, §3.6). The callable itself is not
 * cancelled (see abortable()); only what this page observes changes.
 */
export function createSearchController(options: ControllerOptions): SearchController {
  const call = options.call ?? defaultCall;
  const isOnline = options.isOnline ?? (() => navigator.onLine);
  const timeoutMs = options.timeoutMs ?? CLIENT_TIMEOUT_MS;
  let seq = 0;
  let current: AbortController | null = null;

  const supersede = (): number => {
    current?.abort(new DOMException("Superseded", "AbortError"));
    current = null;
    return ++seq;
  };

  return {
    submit(run) {
      const mine = supersede();
      const label = labelFor(run);
      if (!isOnline()) {
        options.onChange({ status: "error", label, reason: "offline" });
        return;
      }
      const controller = new AbortController();
      current = controller;
      options.onChange({ status: "searching", label });
      const signal = anySignal(controller.signal, AbortSignal.timeout(timeoutMs));
      abortable(call(run), signal).then(
        (response) => {
          if (mine !== seq) return;
          options.onChange(response.results.length > 0 ? { status: "results", label, results: response.results } : { status: "empty", label });
        },
        (err: unknown) => {
          if (mine !== seq) return;
          if (isAbortError(err)) return;
          options.onChange({ status: "error", label, reason: classifySearchError(err) });
        },
      );
    },
    fail(reason, label) {
      supersede();
      options.onChange({ status: "error", label, reason });
    },
    cancel() {
      supersede();
    },
  };
}

export function useDiscoverySearch(options: Pick<ControllerOptions, "call"> = {}): {
  state: SearchState;
  submitDestination(query: string): void;
  submitNearby(lat: number, lng: number): void;
  fail(reason: SearchErrorReason, label: string): void;
} {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const controller = useRef<SearchController | null>(null);
  // Created once per mounted page; survives React StrictMode's simulated remount because refs do.
  controller.current ??= createSearchController({ onChange: setState, ...(options.call ? { call: options.call } : {}) });
  useEffect(() => () => controller.current?.cancel(), []);
  return {
    state,
    submitDestination: (query) => controller.current!.submit({ kind: "destination", query }),
    submitNearby: (lat, lng) => controller.current!.submit({ kind: "nearby", lat, lng }),
    fail: (reason, label) => controller.current!.fail(reason, label),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix web test -- src/discover`
Expected: PASS (4 + 12). Then `npm --prefix web test` and `npm run typecheck` green.

- [ ] **Step 5: Commit**

```bash
git add web/src/discover/api.ts web/src/discover/api.test.ts web/src/discover/search.ts web/src/discover/search.test.ts
git commit -m "feat(web): discovery callables with error classification; sequence-numbered search controller with per-request timeout and offline short-circuit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Discover page — search box, Near me, states, results, attribution, Maps links

**Files:**
- Create: `web/src/discover/links.ts`, `web/src/discover/links.test.ts`, `web/src/discover/geolocation.ts`, `web/src/discover/geolocation.test.ts`, `web/src/discover/DiscoverPage.tsx`, `web/src/discover/DiscoverPage.test.tsx`, `web/public/google/GoogleMaps_Logo_Gray.svg`
- Modify: `web/src/AppShell.tsx`, `web/src/styles.css`
- Delete: `web/src/pages/DiscoverPage.tsx`

**Interfaces:**
- Consumes: `useDiscoverySearch`, `SearchState` (Task 7); `DiscoveryResult`, `SearchErrorReason` (Task 7); `watchRestaurants` (`web/src/records/repository.ts`), `Restaurant` (`web/src/records/types.ts`), `useMember`, `useWatch` (Plan 2b).
- Produces (used by Task 9 and the browser tests):
  ```ts
  // links.ts
  export function directionsUrl(name: string, placeId: string): string;
  export function placeUrl(name: string, placeId: string): string;
  // geolocation.ts
  export const POSITION_TIMEOUT_MS = 10_000;
  export type PositionOutcome = { kind: "position"; lat: number; lng: number } | { kind: "error"; reason: "locationDenied" | "locationUnavailable" };
  export function requestPosition(geo?: Geolocation | undefined): Promise<PositionOutcome>;
  // DiscoverPage.tsx
  export const REASON_TEXT: Record<SearchErrorReason, string>;
  export interface RestaurantPrefill { name: string; address: string; googlePlaceId: string }   // router state { prefill } for /restaurants/new
  export function DiscoverPage(): JSX.Element;
  ```
- Testids: `discover-form`, `discover-query`, `discover-submit`, `discover-nearby`, `discover-locating`, `discover-state` (attributes `data-status`, `data-reason`), `discover-results`, `discover-result` (attribute `data-place-id`), `result-name`, `result-address`, `result-directions`, `result-add`, `result-in-records`, `google-attribution`, `ranking-note`.

- [ ] **Step 1: Commit the official attribution asset**

The Places policies page (https://developers.google.com/maps/documentation/places/web-service/policies) links `Google_Maps_Attribution_Assets.zip`; the non-outlined grey logo is the one for a plain light background. Fetch and verify the checksum recorded on 2026-09-22:

```bash
cd /home/godja/Dev/AvaGF/.claude/worktrees/pwa-01-foundation
mkdir -p web/public/google /tmp/gmaps-assets && cd /tmp/gmaps-assets
curl -sL --max-time 60 -o assets.zip "https://developers.google.com/static/maps/documentation/images/Google_Maps_Attribution_Assets.zip"
unzip -o -q assets.zip "Google_Maps_Attribution_Assets/GoogleMaps_Logo_Gray/GoogleMaps_Logo_Gray.svg"
sha256sum Google_Maps_Attribution_Assets/GoogleMaps_Logo_Gray/GoogleMaps_Logo_Gray.svg
# expected: 99a08b570afce8ce830d26aeb93ba287f6ad67387e6219fe381234ad7e4016b5
cp Google_Maps_Attribution_Assets/GoogleMaps_Logo_Gray/GoogleMaps_Logo_Gray.svg /home/godja/Dev/AvaGF/.claude/worktrees/pwa-01-foundation/web/public/google/
```

If the download is unavailable, an identical copy from the brainstorm session is at `/tmp/claude-1000/-home-godja-Dev-AvaGF--claude-worktrees-pwa-01-foundation/2b2928dc-e1e1-42a6-abe3-621a6904baf4/scratchpad/Google_Maps_Attribution_Assets/GoogleMaps_Logo_Gray/GoogleMaps_Logo_Gray.svg` (same checksum). The file is committed byte-for-byte; never edit it. It is 98×18 px; rendered at 19 px high (the policy allows 16–19 dp) with 10 px clear space on the top and sides and 5 px below, and the accessible name "Google Maps".

- [ ] **Step 2: Write the failing tests**

`web/src/discover/links.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { directionsUrl, placeUrl } from "./links";

describe("Maps links built from stored fields only", () => {
  it("directions use the Maps URL scheme with the place id as destination", () => {
    expect(directionsUrl("Casa Sem Glúten", "ChIJabc/123")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Casa%20Sem%20Gl%C3%BAten&destination_place_id=ChIJabc%2F123",
    );
  });
  it("place pages use the search form with query_place_id", () => {
    expect(placeUrl("Da Marco", "p1")).toBe("https://www.google.com/maps/search/?api=1&query=Da%20Marco&query_place_id=p1");
  });
});
```

`web/src/discover/geolocation.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { POSITION_TIMEOUT_MS, requestPosition } from "./geolocation";

function geo(impl: (ok: PositionCallback, err: PositionErrorCallback, options?: PositionOptions) => void): Geolocation {
  return { getCurrentPosition: vi.fn(impl), watchPosition: vi.fn(), clearWatch: vi.fn() } as unknown as Geolocation;
}

describe("requestPosition", () => {
  it("resolves the coordinates and asks once, low accuracy, with a 10 s timeout", async () => {
    const g = geo((ok, _err) => ok({ coords: { latitude: 51.5, longitude: -0.12 } } as GeolocationPosition));
    await expect(requestPosition(g)).resolves.toEqual({ kind: "position", lat: 51.5, lng: -0.12 });
    expect(g.getCurrentPosition).toHaveBeenCalledTimes(1);
    const options = (g.getCurrentPosition as ReturnType<typeof vi.fn>).mock.calls[0]![2] as PositionOptions;
    expect(options).toEqual({ enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 });
  });

  it("maps PERMISSION_DENIED to locationDenied", async () => {
    const g = geo((_ok, err) => err({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    await expect(requestPosition(g)).resolves.toEqual({ kind: "error", reason: "locationDenied" });
  });

  it.each([2, 3])("maps error code %s to locationUnavailable", async (code) => {
    const g = geo((_ok, err) => err({ code, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    await expect(requestPosition(g)).resolves.toEqual({ kind: "error", reason: "locationUnavailable" });
  });

  it("reports locationUnavailable when the browser has no geolocation", async () => {
    await expect(requestPosition(undefined)).resolves.toEqual({ kind: "error", reason: "locationUnavailable" });
  });
});
```

`web/src/discover/DiscoverPage.test.tsx`:
```tsx
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../records/repository";
import type { Restaurant } from "../records/types";
import type { DiscoveryResponse } from "./api";

const m = vi.hoisted(() => ({
  searchDestination: vi.fn(),
  searchNearby: vi.fn(),
  watchRestaurants: vi.fn(),
  requestPosition: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, searchDestination: m.searchDestination, searchNearby: m.searchNearby };
});
vi.mock("../firebase", () => ({ functions: { app: "fake" }, db: { fake: true } }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock("../records/repository", () => ({ watchRestaurants: m.watchRestaurants }));
vi.mock("./geolocation", () => ({ requestPosition: m.requestPosition }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));

import { DiscoverPage, REASON_TEXT } from "./DiscoverPage";

const result = (n: number) => ({ placeId: `p${n}`, name: `Place ${n}`, address: `${n} Street`, googleMapsUri: `https://maps.google.com/?cid=${n}` });
const ok = (results = [result(1), result(2)]): DiscoveryResponse => ({ results, provider: "google" });
const fnError = (code: string, details?: unknown) => Object.assign(new Error(code), { code, details });

let emitRestaurants: (s: Snapshot<Restaurant[]>) => void = () => {};
const stored: Restaurant = { id: "r1", name: "Place 1", address: "1 Street", googlePlaceId: "p1", createdBy: "ava-uid", createdAt: new Date(), updatedAt: new Date(), version: 1, deleting: false };

function NewRestaurantProbe() {
  const location = useLocation();
  return <pre data-testid="new-restaurant-state">{JSON.stringify(location.state)}</pre>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/discover"]}>
      <Routes>
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/restaurants/new" element={<NewRestaurantProbe />} />
        <Route path="/restaurants/:rid" element={<p data-testid="detail-page">detail</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  m.watchRestaurants.mockImplementation((_h: string, cb: (s: Snapshot<Restaurant[]>) => void) => {
    emitRestaurants = cb;
    cb({ status: "ready", value: [] });
    return () => {};
  });
});
afterEach(() => vi.clearAllMocks());

async function search(query: string) {
  await userEvent.clear(screen.getByTestId("discover-query"));
  await userEvent.type(screen.getByTestId("discover-query"), query);
  await userEvent.click(screen.getByTestId("discover-submit"));
}

describe("DiscoverPage", () => {
  it("starts idle, requests nothing, and refuses a blank query without calling", async () => {
    renderPage();
    expect(m.searchDestination).not.toHaveBeenCalled();
    expect(m.requestPosition).not.toHaveBeenCalled();
    expect(screen.queryByTestId("discover-results")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("discover-submit"));
    expect(screen.getByTestId("discover-state")).toHaveAttribute("data-reason", "invalid");
    expect(m.searchDestination).not.toHaveBeenCalled();
  });

  it("shows results with links, add buttons, the Google Maps attribution and the ranking note", async () => {
    m.searchDestination.mockResolvedValue(ok());
    renderPage();
    await search("Lisbon");
    expect(m.searchDestination).toHaveBeenCalledWith({ query: "Lisbon" });
    await waitFor(() => expect(screen.getAllByTestId("discover-result")).toHaveLength(2));
    const first = screen.getAllByTestId("discover-result")[0]!;
    expect(first).toHaveAttribute("data-place-id", "p1");
    expect(screen.getAllByTestId("result-name")[0]).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(screen.getAllByTestId("result-name")[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByTestId("result-directions")[0]).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=Place%201&destination_place_id=p1");
    expect(screen.getAllByTestId("result-add")).toHaveLength(2);
    const logo = screen.getByTestId("google-attribution").querySelector("img")!;
    expect(logo).toHaveAttribute("src", "/google/GoogleMaps_Logo_Gray.svg");
    expect(logo).toHaveAttribute("alt", "Google Maps");
    expect(screen.getByTestId("ranking-note")).toHaveTextContent("order Google Maps returns them");
    expect(screen.getByTestId("discover-query")).toHaveValue("Lisbon");
  });

  it("shows the empty state and no attribution when nothing is found", async () => {
    m.searchDestination.mockResolvedValue(ok([]));
    renderPage();
    await search("Nowhere");
    await waitFor(() => expect(screen.getByTestId("discover-state")).toHaveAttribute("data-status", "empty"));
    expect(screen.getByTestId("discover-state")).toHaveTextContent("Nowhere");
    expect(screen.queryByTestId("google-attribution")).not.toBeInTheDocument();
  });

  it.each([
    ["functions/failed-precondition", undefined, "off"],
    ["functions/resource-exhausted", { reason: "dailyCap" }, "dailyCap"],
    ["functions/resource-exhausted", { reason: "providerQuota" }, "providerQuota"],
    ["functions/unavailable", undefined, "unavailable"],
  ])("renders the %s (%j) error as %s with its message", async (code, details, reason) => {
    m.searchDestination.mockRejectedValue(fnError(code, details));
    renderPage();
    await search("x");
    await waitFor(() => expect(screen.getByTestId("discover-state")).toHaveAttribute("data-reason", reason));
    expect(screen.getByTestId("discover-state")).toHaveTextContent(REASON_TEXT[reason as keyof typeof REASON_TEXT]);
    expect(screen.queryByTestId("discover-results")).not.toBeInTheDocument();
  });

  it("Near me asks for the position on tap only and searches nearby", async () => {
    m.requestPosition.mockResolvedValue({ kind: "position", lat: 51.5, lng: -0.12 });
    m.searchNearby.mockResolvedValue(ok());
    renderPage();
    await userEvent.click(screen.getByTestId("discover-nearby"));
    await waitFor(() => expect(m.searchNearby).toHaveBeenCalledWith({ lat: 51.5, lng: -0.12 }));
    await waitFor(() => expect(screen.getAllByTestId("discover-result")).toHaveLength(2));
    expect(m.requestPosition).toHaveBeenCalledTimes(1);
  });

  it("Near me denied shows locationDenied and never calls the server", async () => {
    m.requestPosition.mockResolvedValue({ kind: "error", reason: "locationDenied" });
    renderPage();
    await userEvent.click(screen.getByTestId("discover-nearby"));
    await waitFor(() => expect(screen.getByTestId("discover-state")).toHaveAttribute("data-reason", "locationDenied"));
    expect(m.searchNearby).not.toHaveBeenCalled();
  });

  it("marks a result that is already in our records with a link instead of an add button", async () => {
    m.searchDestination.mockResolvedValue(ok());
    renderPage();
    act(() => emitRestaurants({ status: "ready", value: [stored] }));
    await search("Lisbon");
    await waitFor(() => expect(screen.getAllByTestId("discover-result")).toHaveLength(2));
    expect(screen.getByTestId("result-in-records")).toHaveAttribute("href", "/restaurants/r1");
    expect(screen.getAllByTestId("result-add")).toHaveLength(1);
  });

  it("ignores a deleting record when matching", async () => {
    m.searchDestination.mockResolvedValue(ok());
    renderPage();
    act(() => emitRestaurants({ status: "ready", value: [{ ...stored, deleting: true }] }));
    await search("Lisbon");
    await waitFor(() => expect(screen.getAllByTestId("result-add")).toHaveLength(2));
  });

  it("Add to our records navigates to the create form with a prefill in router state", async () => {
    m.searchDestination.mockResolvedValue(ok());
    renderPage();
    await search("Lisbon");
    await waitFor(() => expect(screen.getAllByTestId("result-add")).toHaveLength(2));
    await userEvent.click(screen.getAllByTestId("result-add")[1]!);
    await waitFor(() => expect(screen.getByTestId("new-restaurant-state")).toBeInTheDocument());
    expect(JSON.parse(screen.getByTestId("new-restaurant-state").textContent!)).toEqual({
      prefill: { name: "Place 2", address: "2 Street", googlePlaceId: "p2" },
    });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm --prefix web test -- src/discover`
Expected: FAIL — `links`, `geolocation`, `DiscoverPage` not found.

- [ ] **Step 4: Implement**

`web/src/discover/links.ts`:
```ts
/**
 * Google Maps URLs built from stored fields only (name + place id), so the record page and the
 * results list need nothing cached from Google (spec §3.6 "Links"). Maps URL scheme reference:
 * https://developers.google.com/maps/documentation/urls/get-started
 */
export function directionsUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}&destination_place_id=${encodeURIComponent(placeId)}`;
}

export function placeUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
}
```

`web/src/discover/geolocation.ts`:
```ts
export const POSITION_TIMEOUT_MS = 10_000;

export type PositionOutcome =
  | { kind: "position"; lat: number; lng: number }
  | { kind: "error"; reason: "locationDenied" | "locationUnavailable" };

/**
 * One position request, on tap only (spec §3.6 ruling 3). Low accuracy is plenty for a 1.5 km
 * search radius and answers faster on a phone. Never called on mount.
 */
export function requestPosition(geo: Geolocation | undefined = typeof navigator === "undefined" ? undefined : navigator.geolocation): Promise<PositionOutcome> {
  if (!geo) return Promise.resolve({ kind: "error", reason: "locationUnavailable" });
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) => resolve({ kind: "position", lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => resolve({ kind: "error", reason: error.code === 1 ? "locationDenied" : "locationUnavailable" }),
      { enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}
```

`web/src/discover/DiscoverPage.tsx`:
```tsx
import { useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { watchRestaurants } from "../records/repository";
import type { Restaurant } from "../records/types";
import { useMember } from "../records/useMember";
import { useWatch } from "../records/useWatch";
import type { DiscoveryResult, SearchErrorReason } from "./api";
import { requestPosition } from "./geolocation";
import { directionsUrl } from "./links";
import { useDiscoverySearch, type SearchState } from "./search";

export const REASON_TEXT: Record<SearchErrorReason, string> = {
  off: "Search is switched off at the moment.",
  dailyCap: "Today's search limit for our household has been reached. Try again tomorrow.",
  providerQuota: "The search provider is over its quota. Try again later.",
  unavailable: "Search is not available right now. Try again in a moment.",
  offline: "You are offline. Connect and try again.",
  timeout: "The search took too long. Check your connection and try again.",
  locationDenied: "Location access was refused. Allow location for SafeBite in your browser settings, or search by destination.",
  locationUnavailable: "Your location could not be determined. Try again, or search by destination.",
  invalid: "Enter a destination to search for.",
};

/** Router state for /restaurants/new (read by RestaurantFormPage). Name and address are what the member saw; nothing else from Google. */
export interface RestaurantPrefill {
  name: string;
  address: string;
  googlePlaceId: string;
}

function StateLine({ state }: { state: SearchState }) {
  switch (state.status) {
    case "idle":
      return <p className="hint" data-testid="discover-state" data-status="idle">Search by destination, or use Near me. Nothing is searched until you ask.</p>;
    case "searching":
      return <p data-testid="discover-state" data-status="searching" role="status">Searching {state.label === "near you" ? "near you" : `for “${state.label}”`}…</p>;
    case "empty":
      return <p data-testid="discover-state" data-status="empty" role="status">No restaurants found {state.label === "near you" ? "near you" : `for “${state.label}”`}.</p>;
    case "error":
      return <p className="notice" data-testid="discover-state" data-status="error" data-reason={state.reason} role="alert">{REASON_TEXT[state.reason]}</p>;
    case "results":
      return null;
  }
}

function ResultRow({ result, existingId, onAdd }: { result: DiscoveryResult; existingId: string | undefined; onAdd: (r: DiscoveryResult) => void }) {
  return (
    <li className="card" data-testid="discover-result" data-place-id={result.placeId}>
      <a data-testid="result-name" href={result.googleMapsUri} target="_blank" rel="noopener noreferrer"><strong>{result.name}</strong></a>
      {result.address && <p data-testid="result-address">{result.address}</p>}
      <div className="actions">
        <a data-testid="result-directions" href={directionsUrl(result.name, result.placeId)} target="_blank" rel="noopener noreferrer">Directions</a>
        {existingId ? (
          <Link data-testid="result-in-records" to={`/restaurants/${existingId}`}>In our records</Link>
        ) : (
          <button type="button" data-testid="result-add" onClick={() => onAdd(result)}>Add to our records</button>
        )}
      </div>
    </li>
  );
}

export function DiscoverPage() {
  const { householdId } = useMember();
  const navigate = useNavigate();
  const { state, submitDestination, submitNearby, fail } = useDiscoverySearch();
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const records = useWatch<Restaurant[]>((cb) => watchRestaurants(householdId, cb), [householdId]);

  // Place id → record id for "In our records"; a record being deleted no longer counts.
  const existing = new Map<string, string>();
  if (records.state.status === "ready" || records.state.status === "offline") {
    for (const r of records.state.value) if (r.googlePlaceId && !r.deleting) existing.set(r.googlePlaceId, r.id);
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") {
      fail("invalid", "");
      return;
    }
    submitDestination(trimmed);
  }

  async function onNearMe() {
    setLocating(true);
    const outcome = await requestPosition();
    setLocating(false);
    if (outcome.kind === "position") submitNearby(outcome.lat, outcome.lng);
    else fail(outcome.reason, "near you");
  }

  function onAdd(result: DiscoveryResult) {
    const prefill: RestaurantPrefill = { name: result.name, address: result.address, googlePlaceId: result.placeId };
    void navigate("/restaurants/new", { state: { prefill } });
  }

  return (
    <section>
      <h2>Discover</h2>
      <form className="form" data-testid="discover-form" onSubmit={onSubmit} noValidate>
        <label>
          Destination
          <input data-testid="discover-query" value={query} maxLength={120} placeholder="Town, area or restaurant name" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="actions">
          <button type="submit" data-testid="discover-submit">Search</button>
          <button type="button" data-testid="discover-nearby" disabled={locating} onClick={() => void onNearMe()}>Near me</button>
          {locating && <span data-testid="discover-locating">Finding your location…</span>}
        </div>
      </form>
      <StateLine state={state} />
      {state.status === "results" && (
        <>
          <ul className="list" data-testid="discover-results">
            {state.results.map((r) => <ResultRow key={r.placeId} result={r} existingId={existing.get(r.placeId)} onAdd={onAdd} />)}
          </ul>
          <p className="attribution" data-testid="google-attribution">
            <img src="/google/GoogleMaps_Logo_Gray.svg" alt="Google Maps" height={19} />
          </p>
          <p className="hint" data-testid="ranking-note">
            Results are shown in the order Google Maps returns them; SafeBite only leaves out places Google reports as closed. Being listed here says nothing about gluten-free safety — check the evidence and call ahead.
          </p>
        </>
      )}
    </section>
  );
}
```

`web/src/AppShell.tsx` — change the import to `import { DiscoverPage } from "./discover/DiscoverPage";` and delete `web/src/pages/DiscoverPage.tsx` (`git rm web/src/pages/DiscoverPage.tsx`).

`web/src/styles.css` — append:
```css
/* Google Maps attribution (Places policies): 16–19 dp high, ≥10 dp clear space above/sides, 5 dp below, never restyled. */
.attribution { margin: 10px 0 5px; padding: 0 10px; }
.attribution img { height: 19px; width: auto; display: block; }
.hint { font-size: 0.9rem; opacity: 0.8; }
```

- [ ] **Step 5: Run the tests**

Run: `npm --prefix web test -- src/discover` → PASS (2 + 5 + 12). Then `npm --prefix web test` and `npm run typecheck` green. Run `grep -rn "localStorage\|sessionStorage\|indexedDB" web/src/discover` → prints nothing.

- [ ] **Step 6: Commit**

```bash
git add web/public/google/GoogleMaps_Logo_Gray.svg web/src/discover/links.ts web/src/discover/links.test.ts web/src/discover/geolocation.ts web/src/discover/geolocation.test.ts web/src/discover/DiscoverPage.tsx web/src/discover/DiscoverPage.test.tsx web/src/AppShell.tsx web/src/styles.css
git rm -q web/src/pages/DiscoverPage.tsx
git commit -m "feat(web): Discover page — destination search and Near me on tap, every failure state, results with Google Maps attribution and links, In our records matching

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Add to our records — prefill, place ID on create, duplicate guard, Maps link on the record

**Files:**
- Modify: `web/src/records/types.ts`, `web/src/records/repository.ts`, `web/src/records/repository.test.ts`, `web/src/records/RestaurantFormPage.tsx`, `web/src/records/RestaurantFormPage.test.tsx`, `web/src/records/RestaurantDetailPage.tsx`, `web/src/records/RestaurantDetailPage.test.tsx`

**Interfaces:**
- Consumes: `RestaurantPrefill` shape from Task 8 (router state `{ prefill: { name, address, googlePlaceId } }`); `placeUrl` (Task 8); `watchRestaurants`, `createRestaurant` (Plan 2b).
- Produces:
  ```ts
  // types.ts
  export interface RestaurantInput { name: string; address: string; phone?: string; website?: string; googlePlaceId?: string }
  // RestaurantFormPage.tsx
  export function readPrefill(state: unknown): RestaurantPrefill | null;   // exported for tests; null for anything malformed
  ```
- Testids added: `prefill-notice`, `prefill-duplicate`, `restaurant-maps`.

- [ ] **Step 1: Write the failing tests**

`web/src/records/repository.test.ts` — inside `describe("createRestaurant", …)` add:
```ts
  it("writes googlePlaceId when the input carries one, and omits it otherwise", async () => {
    const tx = fakeTx({ exists: false });
    await createRestaurant("home", "ava-uid", { name: "Casa", address: "1 Rua", googlePlaceId: "ChIJ-1" });
    expect(tx.set).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ name: "Casa", googlePlaceId: "ChIJ-1", version: 1, deleting: false }));
    await createRestaurant("home", "ava-uid", { name: "Casa", address: "1 Rua" });
    expect((tx.set.mock.calls[1]![1] as Record<string, unknown>)).not.toHaveProperty("googlePlaceId");
  });
```

`web/src/records/RestaurantFormPage.test.tsx` — the hoisted mock gains `watchRestaurants: vi.fn()`; `beforeEach` gains:
```ts
  m.watchRestaurants.mockImplementation((_h: string, cb: (s: Snapshot<Restaurant[]>) => void) => {
    emitList = cb;
    cb({ status: "ready", value: [] });
    return () => {};
  });
```
with `let emitList: (s: Snapshot<Restaurant[]>) => void = () => {};` declared next to `emit`. Add a second render helper and a new describe block:
```tsx
function renderCreateWithState(state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/restaurants/new", state }]}>
      <Routes>
        <Route path="/restaurants/new" element={<RestaurantFormPage mode="create" />} />
        <Route path="/restaurants/:rid" element={<p data-testid="detail-page">detail</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RestaurantFormPage — create from a Discover result", () => {
  const prefill = { name: "Fixture Trattoria", address: "1 Fixture Street, Testville", googlePlaceId: "fixture-01" };

  it("seeds a clean draft from the prefill, shows the From Google Maps notice, and writes the place id", async () => {
    m.createRestaurant.mockResolvedValue({ kind: "ok", value: "new-id" });
    renderCreateWithState({ prefill });
    expect(screen.getByTestId("field-name")).toHaveValue("Fixture Trattoria");
    expect(screen.getByTestId("field-address")).toHaveValue("1 Fixture Street, Testville");
    expect(screen.getByTestId("prefill-notice").querySelector("a")).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Fixture%20Trattoria&query_place_id=fixture-01",
    );
    await userEvent.type(screen.getByTestId("field-phone"), "+351 21 000");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("detail-page")).toBeInTheDocument());
    expect(m.createRestaurant).toHaveBeenCalledWith("home", "ava-uid", {
      name: "Fixture Trattoria",
      address: "1 Fixture Street, Testville",
      phone: "+351 21 000",
      googlePlaceId: "fixture-01",
    });
  });

  it("redirects to the existing record instead of creating a duplicate", async () => {
    renderCreateWithState({ prefill });
    act(() => emitList({ status: "ready", value: [{ ...stored, id: "r-existing", googlePlaceId: "fixture-01" }] }));
    expect(screen.getByTestId("prefill-duplicate").querySelector("a")).toHaveAttribute("href", "/restaurants/r-existing");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("detail-page")).toBeInTheDocument());
    expect(m.createRestaurant).not.toHaveBeenCalled();
  });

  it("does not treat a record being deleted as a duplicate", async () => {
    m.createRestaurant.mockResolvedValue({ kind: "ok", value: "new-id" });
    renderCreateWithState({ prefill });
    act(() => emitList({ status: "ready", value: [{ ...stored, id: "r-old", googlePlaceId: "fixture-01", deleting: true }] }));
    expect(screen.queryByTestId("prefill-duplicate")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(m.createRestaurant).toHaveBeenCalled());
  });

  it("ignores a malformed prefill", () => {
    renderCreateWithState({ prefill: { name: 1, address: "x", googlePlaceId: "" } });
    expect(screen.getByTestId("field-name")).toHaveValue("");
    expect(screen.queryByTestId("prefill-notice")).not.toBeInTheDocument();
    expect(m.watchRestaurants).not.toHaveBeenCalled();
  });

  it("does not subscribe to the records list for a plain create", () => {
    renderAt("/restaurants/new");
    expect(m.watchRestaurants).not.toHaveBeenCalled();
  });
});
```
Also add `readPrefill` unit cases in the same file:
```ts
describe("readPrefill", () => {
  it("accepts a well-formed prefill and trims it", () => {
    expect(readPrefill({ prefill: { name: " A ", address: " B ", googlePlaceId: " p " } })).toEqual({ name: "A", address: "B", googlePlaceId: "p" });
  });
  it.each([null, undefined, {}, { prefill: null }, { prefill: { name: "A", address: "B" } }, { prefill: { name: "", address: "B", googlePlaceId: "p" } }, { prefill: { name: "A", address: "B", googlePlaceId: "x".repeat(201) } }])(
    "returns null for %j",
    (state) => expect(readPrefill(state)).toBeNull(),
  );
});
```
and import it: `import { RestaurantFormPage, readPrefill } from "./RestaurantFormPage";`.

`web/src/records/RestaurantDetailPage.test.tsx` — add two cases:
```tsx
  it("links to Google Maps from stored fields when the record holds a place id", () => {
    renderPage();
    act(() => { emitRestaurant({ status: "ready", value: { ...restaurant, googlePlaceId: "ChIJ-1" } }); emitClaims({ status: "ready", value: [] }); });
    const link = screen.getByTestId("restaurant-maps");
    expect(link).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=Da%20Marco&query_place_id=ChIJ-1");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows no Maps link without a place id", () => {
    renderPage();
    act(() => { emitRestaurant({ status: "ready", value: restaurant }); emitClaims({ status: "ready", value: [] }); });
    expect(screen.queryByTestId("restaurant-maps")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix web test -- src/records`
Expected: FAIL — `googlePlaceId` not written; `readPrefill` missing; no `prefill-notice`; no `restaurant-maps`.

- [ ] **Step 3: Implement**

`web/src/records/types.ts` — replace the `RestaurantInput` block:
```ts
/**
 * What the restaurant form edits. `googlePlaceId` is set only when a record is created from a
 * Discover result (Plan 3 ruling 1); the edit form never shows or changes it. Coordinates are
 * never written (Google's terms allow caching them for 30 days only).
 */
export interface RestaurantInput {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  googlePlaceId?: string;
}
```

`web/src/records/repository.ts` — in `createRestaurant`, after the `website` line:
```ts
    if (input.googlePlaceId !== undefined) data.googlePlaceId = input.googlePlaceId;
```
(`updateRestaurant` already writes only the form's fields, so the place id survives edits — see its comment.)

`web/src/records/RestaurantFormPage.tsx` — changes:

1. Imports: add `useLocation` to the react-router import; add `import { placeUrl } from "../discover/links";`, `import type { RestaurantPrefill } from "../discover/DiscoverPage";`, `import { LIMITS } from "./validation";` (extend the existing validation import), and `watchRestaurants` to the repository import.

2. Add above the component:
```ts
/** Router state from Discover's "Add to our records". Anything malformed is ignored (no prefill). */
export function readPrefill(state: unknown): RestaurantPrefill | null {
  const prefill = (state as { prefill?: unknown } | null)?.prefill;
  if (typeof prefill !== "object" || prefill === null) return null;
  const { name, address, googlePlaceId } = prefill as Record<string, unknown>;
  if (typeof name !== "string" || typeof address !== "string" || typeof googlePlaceId !== "string") return null;
  const trimmed = { name: name.trim(), address: address.trim(), googlePlaceId: googlePlaceId.trim() };
  if (trimmed.name === "" || trimmed.googlePlaceId === "" || trimmed.googlePlaceId.length > LIMITS.googlePlaceId) return null;
  if (trimmed.name.length > LIMITS.name || trimmed.address.length > LIMITS.address) return null;
  return trimmed;
}
```

3. Inside the component, after `const navigate = useNavigate();`:
```ts
  const location = useLocation();
  const prefill = mode === "create" ? readPrefill(location.state) : null;
  const placeId = prefill?.googlePlaceId;
  // Only a prefilled create watches the list: it is how "already in our records" is detected.
  const records = useWatch<Restaurant[]>((cb) => (placeId ? watchRestaurants(householdId, cb) : () => {}), [householdId, placeId]);
  let existingId: string | undefined;
  if (placeId && (records.state.status === "ready" || records.state.status === "offline")) {
    existingId = records.state.value.find((r) => r.googlePlaceId === placeId && !r.deleting)?.id;
  }
```
and change the initial draft:
```ts
  const seed: RawRestaurantForm = prefill ? { name: prefill.name, address: prefill.address, phone: "", website: "" } : EMPTY;
  const [draft, setDraft] = useState<Draft | null>(mode === "create" ? { form: seed, seededFrom: seed, baseVersion: 0 } : null);
```

4. In `onSubmit`, replace the `const input = …` line and the write:
```ts
    const input: RestaurantInput = { ...normaliseRestaurantInput(draft.form), ...(placeId ? { googlePlaceId: placeId } : {}) };
    const problems = validateRestaurantInput(input);
    setErrors(problems);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    if (mode === "create" && existingId) {
      // A member added this place meanwhile (or before): open it rather than create a twin.
      void navigate(`/restaurants/${existingId}`);
      return;
    }
```
(add `RestaurantInput` to the `./types` type import.)

5. In the JSX, directly after the `<h2>`:
```tsx
      {prefill && (
        <p className="notice" data-testid="prefill-notice">
          From Google Maps: <a href={placeUrl(prefill.name, prefill.googlePlaceId)} target="_blank" rel="noopener noreferrer">{prefill.name}</a>. Check the details before saving; only what you save is stored.
        </p>
      )}
      {existingId && (
        <p className="notice" role="status" data-testid="prefill-duplicate">
          This place is already in our records. <Link to={`/restaurants/${existingId}`}>Open it</Link>
        </p>
      )}
```

`web/src/records/RestaurantDetailPage.tsx` — import `placeUrl` from `../discover/links` and, in the `<p className="actions">` block after the Website link:
```tsx
        {restaurant.googlePlaceId && (
          <a data-testid="restaurant-maps" href={placeUrl(restaurant.name, restaurant.googlePlaceId)} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
        )}
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix web test` → PASS (previous + 1 repository + 5 form + 8 readPrefill + 2 detail). `npm run typecheck` green. `grep -rn "addDoc\|setDoc\|updateDoc\|deleteDoc\|writeBatch" web/src --include=*.ts --include=*.tsx | grep -v test` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add web/src/records/types.ts web/src/records/repository.ts web/src/records/repository.test.ts web/src/records/RestaurantFormPage.tsx web/src/records/RestaurantFormPage.test.tsx web/src/records/RestaurantDetailPage.tsx web/src/records/RestaurantDetailPage.test.tsx
git commit -m "feat(web): create a restaurant record from a Discover result — router-state prefill, place id on create, duplicate guard, Open in Google Maps on the record

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Browser scenarios, emulator helpers, Playwright budget, README

**Files:**
- Create: `web/e2e/discover.spec.ts`
- Modify: `web/e2e/emulator-rest.ts`, `web/playwright.config.ts`, `README.md`

**Interfaces:**
- Consumes: testids from Tasks 8–9; `MAGIC` query strings (Task 3, duplicated as literals here because `web/e2e` cannot import from `functions/`); seed accounts; `config/discovery` seeded by `seed-emulator` (Task 6).
- Produces:
  ```ts
  // emulator-rest.ts
  export async function setDiscoveryConfig(request: APIRequestContext, config: { enabled: boolean; dailySearchCap: number }): Promise<void>;
  export async function deleteDiscoveryConfig(request: APIRequestContext): Promise<void>;   // tolerates absent
  export async function setUsage(request: APIRequestContext, day: string, searches: number): Promise<void>;
  export async function clearUsage(request: APIRequestContext): Promise<void>;
  export async function getRestaurant(request: APIRequestContext, rid: string): Promise<Record<string, unknown> | null>; // decoded string fields only
  // seedRestaurant's `over` gains `googlePlaceId?: string`
  ```

- [ ] **Step 1: Extend the emulator REST helpers**

Append to `web/e2e/emulator-rest.ts`:
```ts
/** Discovery kill switch and cap (functions read it with the Admin SDK; clients have no rules access). */
export async function setDiscoveryConfig(request: APIRequestContext, config: { enabled: boolean; dailySearchCap: number }): Promise<void> {
  const res = await request.patch(`${BASE}/config/discovery`, {
    headers: HEADERS,
    data: { fields: { enabled: { booleanValue: config.enabled }, dailySearchCap: { integerValue: String(config.dailySearchCap) } } },
  });
  if (!res.ok()) throw new Error(`setDiscoveryConfig: ${res.status()} ${await res.text()}`);
}

export async function deleteDiscoveryConfig(request: APIRequestContext): Promise<void> {
  const res = await request.delete(`${BASE}/config/discovery`, { headers: HEADERS });
  if (!res.ok() && res.status() !== 404) throw new Error(`deleteDiscoveryConfig: ${res.status()} ${await res.text()}`);
}

/** `day` is the UTC yyyymmdd key the functions use (households/home/usage/{day}). */
export async function setUsage(request: APIRequestContext, day: string, searches: number): Promise<void> {
  const res = await request.patch(`${BASE}/households/home/usage/${day}`, {
    headers: HEADERS,
    data: { fields: { searches: { integerValue: String(searches) } } },
  });
  if (!res.ok()) throw new Error(`setUsage ${day}: ${res.status()} ${await res.text()}`);
}

export async function clearUsage(request: APIRequestContext): Promise<void> {
  for (const d of await listDocs(request, "households/home/usage")) await del(request, `households/home/usage/${idOf(d)}`);
}

/** String fields of one restaurant document, or null when it does not exist. */
export async function getRestaurant(request: APIRequestContext, rid: string): Promise<Record<string, unknown> | null> {
  const res = await request.get(`${BASE}/households/home/restaurants/${rid}`, { headers: HEADERS });
  if (res.status() === 404) return null;
  if (!res.ok()) throw new Error(`getRestaurant ${rid}: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as RestDoc;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body.fields ?? {})) {
    const v = value as { stringValue?: string; booleanValue?: boolean; integerValue?: string };
    if (v.stringValue !== undefined) out[key] = v.stringValue;
    else if (v.booleanValue !== undefined) out[key] = v.booleanValue;
    else if (v.integerValue !== undefined) out[key] = Number(v.integerValue);
  }
  return out;
}
```
and extend `seedRestaurant`'s `over` type with `googlePlaceId?: string`, adding inside `fields`:
```ts
        ...(over.googlePlaceId ? { googlePlaceId: s(over.googlePlaceId) } : {}),
```

- [ ] **Step 2: Write the browser scenarios**

`web/e2e/discover.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { clearRecords, clearUsage, deleteDiscoveryConfig, getRestaurant, listRestaurantIds, seedRestaurant, setDiscoveryConfig, setUsage } from "./emulator-rest";

const PASSWORD = "pilot-password-1";
// Mirrors functions/src/discovery/fixtureProvider.ts MAGIC (web/e2e cannot import from functions/).
const MAGIC = { empty: "__empty__", unavailable: "__unavailable__", quota: "__quota__", slow: "__slow__", delayed: "__delayed__" };
const utcDay = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-discover")).toBeVisible();
}

async function openDiscover(page: Page) {
  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-discover").click();
  await expect(page.getByTestId("discover-state")).toHaveAttribute("data-status", "idle");
}

async function search(page: Page, query: string) {
  await page.getByTestId("discover-query").fill(query);
  await page.getByTestId("discover-submit").click();
}

const stateOf = (page: Page) => page.getByTestId("discover-state");

test.beforeEach(async ({ request }) => {
  await clearRecords(request);
  await clearUsage(request);
  await setDiscoveryConfig(request, { enabled: true, dailySearchCap: 50 });
});

test("1. a destination search lists fixture results with Google Maps attribution, links and add buttons", async ({ page }) => {
  await openDiscover(page);
  await search(page, "Lisbon");
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  await expect(page.getByTestId("discover-result").first()).toContainText("Fixture Trattoria");
  await expect(page.getByTestId("discover-result").first()).toHaveAttribute("data-place-id", "fixture-01");
  await expect(page.getByTestId("result-name").first()).toHaveAttribute("href", "https://example.invalid/maps/fixture-01");
  await expect(page.getByTestId("result-directions").first()).toHaveAttribute("href", /destination_place_id=fixture-01$/);
  await expect(page.getByTestId("result-add")).toHaveCount(10);
  const logo = page.getByTestId("google-attribution").locator("img");
  await expect(logo).toHaveAttribute("alt", "Google Maps");
  await expect(logo).toBeVisible();
  expect((await page.request.get("/google/GoogleMaps_Logo_Gray.svg")).ok()).toBe(true);
  await expect(page.getByTestId("ranking-note")).toContainText("order Google Maps returns them");
  await expect(page.getByTestId("discover-query")).toHaveValue("Lisbon");
});

test("2. no results shows the empty state and no attribution", async ({ page }) => {
  await openDiscover(page);
  await search(page, MAGIC.empty);
  await expect(stateOf(page)).toHaveAttribute("data-status", "empty");
  await expect(stateOf(page)).toContainText("__empty__");
  await expect(page.getByTestId("google-attribution")).toHaveCount(0);
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
});

test("3. the kill switch: disabled and missing config both read as switched off", async ({ page, request }) => {
  await setDiscoveryConfig(request, { enabled: false, dailySearchCap: 50 });
  await openDiscover(page);
  await search(page, "Lisbon");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "off");
  await expect(stateOf(page)).toContainText("switched off");
  await deleteDiscoveryConfig(request);
  await search(page, "Porto");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "off");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
});

test("4. the household's daily cap is enforced and usage is not consumed past it", async ({ page, request }) => {
  await setDiscoveryConfig(request, { enabled: true, dailySearchCap: 2 });
  await setUsage(request, utcDay(), 1);
  await openDiscover(page);
  await search(page, "one");
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  await search(page, "two");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "dailyCap");
  await expect(stateOf(page)).toContainText("limit");
});

test("5. provider failures: unavailable and quota exceeded, never sample venues", async ({ page }) => {
  await openDiscover(page);
  await search(page, MAGIC.unavailable);
  await expect(stateOf(page)).toHaveAttribute("data-reason", "unavailable");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
  await search(page, MAGIC.quota);
  await expect(stateOf(page)).toHaveAttribute("data-reason", "providerQuota");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
});

test("6. a search that never answers times out on the client", async ({ page }) => {
  test.setTimeout(90_000);
  await openDiscover(page);
  await search(page, MAGIC.slow);
  await expect(stateOf(page)).toHaveAttribute("data-status", "searching");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "timeout", { timeout: 30_000 });
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
});

test("7. a newer search supersedes a slower one; the late answer never replaces it", async ({ page }) => {
  await openDiscover(page);
  await search(page, MAGIC.delayed);
  await expect(stateOf(page)).toHaveAttribute("data-status", "searching");
  await search(page, "pizza");
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  await page.waitForTimeout(4_500); // longer than the fixture's 3 s delay
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  await expect(page.getByText("Delayed Diner")).toHaveCount(0);
});

test.describe("Near me with location granted", () => {
  test.use({ geolocation: { latitude: 51.5074, longitude: -0.1278 }, permissions: ["geolocation"] });

  test("8. Near me searches around the granted position", async ({ page }) => {
    await openDiscover(page);
    await page.getByTestId("discover-nearby").click();
    await expect(page.getByTestId("discover-result")).toHaveCount(10);
    await expect(stateOf(page)).toHaveCount(0);
  });
});

test("9. Near me without permission shows the denied state and calls nothing", async ({ page, request }) => {
  await setDiscoveryConfig(request, { enabled: true, dailySearchCap: 1 });
  await openDiscover(page);
  await page.getByTestId("discover-nearby").click();
  // Playwright grants no permissions by default; Chromium answers getCurrentPosition with PERMISSION_DENIED (code 1).
  await expect(stateOf(page)).toHaveAttribute("data-reason", "locationDenied");
  // The cap of 1 is untouched: a destination search still succeeds.
  await search(page, "Lisbon");
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
});

test("10. Add to our records prefills the form; the saved record links to Google Maps and the result shows In our records", async ({ page, request }) => {
  await openDiscover(page);
  await search(page, "Lisbon");
  await page.getByTestId("result-add").first().click();
  await expect(page.getByTestId("field-name")).toHaveValue("Fixture Trattoria");
  await expect(page.getByTestId("field-address")).toHaveValue("1 Fixture Street, Testville");
  await expect(page.getByTestId("prefill-notice")).toContainText("From Google Maps");
  await page.getByTestId("save-restaurant").click();
  await expect(page.getByTestId("restaurant-name")).toHaveText("Fixture Trattoria");
  await expect(page.getByTestId("restaurant-maps")).toHaveAttribute("href", /query_place_id=fixture-01$/);

  const [rid] = await listRestaurantIds(request);
  const stored = await getRestaurant(request, rid!);
  expect(stored).toMatchObject({ name: "Fixture Trattoria", address: "1 Fixture Street, Testville", googlePlaceId: "fixture-01" });
  expect(stored).not.toHaveProperty("lat");
  expect(stored).not.toHaveProperty("lng");

  await page.getByTestId("nav-discover").click();
  await search(page, "Lisbon");
  const first = page.getByTestId("discover-result").first();
  await expect(first.getByTestId("result-in-records")).toHaveAttribute("href", `/restaurants/${rid}`);
  await expect(first.getByTestId("result-add")).toHaveCount(0);
  await expect(page.getByTestId("result-add")).toHaveCount(9);
});

test("11. searching while offline is refused without a request; a seeded record's Maps link needs no network", async ({ page, context, request }) => {
  await seedRestaurant(request, "r-linked", { name: "Linked Place", googlePlaceId: "fixture-07" });
  await openDiscover(page);
  await context.setOffline(true);
  await search(page, "Lisbon");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "offline");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
  await context.setOffline(false);
  await page.goto("/restaurants/r-linked");
  await expect(page.getByTestId("restaurant-maps")).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=Linked%20Place&query_place_id=fixture-07");
});
```

- [ ] **Step 3: Playwright budget**

`web/playwright.config.ts`: `globalTimeout: 900_000` and update its comment to "23 scenarios, one CI retry each; scenario 6 alone waits ~25 s for the client timeout". Per-test `timeout: 30_000` stays (scenario 6 raises its own).

- [ ] **Step 4: Run the browser suite**

Run: `npm run emu:e2e` (10 minute timeout). Expected: 12 existing + 11 new pass. Scenario 9's `locationDenied` assertion is an empirical expectation about Chromium under Playwright: if it reports `locationUnavailable` instead, **stop and report** rather than loosening the assertion — the design (spec §3.6) distinguishes the two states and the owner should rule.

Then `npm run emu:e2e:stress` once (retries 0, 3 repeats): expected green; report any flake with the scenario number.

- [ ] **Step 5: README**

In `README.md`, "Web app (PWA) — private pilot":

- Under **Local development**, after the `npm --prefix web run dev` line block, add:
  > Discovery (the Discover tab) calls the `searchDestination` / `searchNearby` functions, which read the `PLACES_API_KEY` secret. Locally the emulator reads `functions/.secret.local` (gitignored); the `emu:*` scripts create it from `functions/.secret.local.example` (`PLACES_API_KEY=fixture`) when it is missing, which selects a fixture provider with twelve invented venues and the magic queries `__empty__`, `__unavailable__`, `__quota__`, `__delayed__` (3 s) and `__slow__` (25 s). To try real results locally, put a key restricted to Places API (New) in `.secret.local` — never commit it. Search is off until `config/discovery` exists (`{ enabled: true, dailySearchCap: 50 }`, written by `npm run emu:seed`).
- Under **Tests**, change the stress line to `# 23 browser scenarios × 3 repeats, retries disabled (flakiness gate)` and replace the `npm run test:unit currently reports N tests.` sentence with the number the final run prints.
- Under **Guardrails**, append:
  - `- Discovery is server-side only: the Places key is a Cloud Functions secret, every callable checks membership first, the field mask asks for id, name, address, Maps link and business status only (Pro tier; no coordinates, phone, website or ratings), and nothing from a Places response is cached or stored — a record created from a result keeps only the name and address the member saw plus the place id. A deployed function whose secret is the fixture value refuses every search.`
  - `- Search fails closed: a missing or disabled config/discovery document refuses every search; each household has a per-day cap counted before the provider is called (failed calls count too). Results carry the Google Maps logo and are shown in Google's order; a listing says nothing about gluten-free safety.`

- [ ] **Step 6: Full gate and commit**

Run: `npm run typecheck && npm run test:unit && npm run emu:test && npm run emu:e2e && npm --prefix web run build:e2e && npm --prefix web run e2e:boot-guard && npm --prefix web run e2e:preview && npm --prefix web run e2e:upgrade` — all green (the preview/boot-guard/upgrade suites are unaffected by this plan but are the release gate). Also `git grep -n "safebite-production-13ba1" -- ':!SafeBite/**' ':!*.md' ':!docs/**' ':!.github/workflows/ci.yml' ':!web/src/config/firebaseEnv.ts' ':!web/src/config/firebaseEnv.test.ts'` prints nothing, `git status --short --ignored | grep secret.local` prints only `!! functions/.secret.local`, and `grep -rn "localStorage\|sessionStorage\|indexedDB" web/src/discover` prints nothing.

```bash
git add web/e2e/discover.spec.ts web/e2e/emulator-rest.ts web/playwright.config.ts README.md
git commit -m "test(web): eleven browser scenarios for discovery (results, empty, kill switch, cap, provider failures, timeout, supersede, Near me granted/denied, add to records, offline); README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan self-review (2026-09-22)

**Spec §3.6 coverage:** rulings 1–4 → Tasks 8–9 (prefill, no Details, Near me on tap, fixture selection in Task 4); pre-work → Task 1; callables and inputs → Tasks 2, 5; provider selection and the secret (four branches, `.secret.local` handling, hard stop) → Tasks 4, 6; kill switch, caps, usage, rules denial → Tasks 5, 6; error mapping and logging → Task 5; client controller, page, links, prefill, duplicate guard, "nothing persists" → Tasks 7–9; every bullet of the Tests section → Tasks 2–10 (functions unit: validation, selection, adapter request shape and mapping, error mapping, usage day; callable emulator: all nine listed cases; rules: config and usage; web unit: abortable reason, anySignal, sequencing, code mapping, offline short-circuit, page states, prefill and duplicate guard, In our records, detail link; browser: all eleven). Decisions table → constants in Tasks 2, 5, 7 and the README. Exclusions respected: no Details, no coordinates, no Plan 4 items, no index changes.

**Placeholders:** none; every step carries its code.

**Type consistency checked:** `DiscoveryResult` (functions and web mirror the same four fields); `ProviderSelection` `{ kind: "provider" | "notConfigured" }` used identically in Tasks 4–6; `SearchDeps.selection` (not `provider`) in Task 5's tests and implementation; `SearchController.cancel()` (Task 7 tests and hook); `readPrefill` exported from `RestaurantFormPage.tsx` (Task 9); `RestaurantPrefill` declared in `DiscoverPage.tsx` and imported as a type by the form; `HttpsError` `details` `{ reason: "dailyCap" | "providerQuota" }` produced in Task 5 and consumed by `classifySearchError` in Task 7; testids listed in Task 8 match Tasks 9–10.

**Known empirical points (stop and report if they fail):** Task 6 step 6 (secret absent → "Search is not configured."); Task 10 scenario 9 (Chromium reports PERMISSION_DENIED without a granted permission).
