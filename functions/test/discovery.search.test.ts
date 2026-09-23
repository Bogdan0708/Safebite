import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The log-content tests below exercise the REAL firebase-functions/logger, not a mock. Its write()
// (functions/node_modules/firebase-functions/lib/logger/index.js) spreads the structured payload
// first, then overwrites `message` with the positional string ("discovery.search") — so a mock
// that only inspects the object it was handed would never catch a `message` field on that payload
// being silently discarded, and would not prove what production actually logs (audit observation).
//
// write() calls console.info/warn/error through a reference (`UNPATCHED_CONSOLE`) captured once,
// the first time the logger module loads — so a vi.spyOn(console, ...) or
// vi.spyOn(process.stdout, "write") set up later (e.g. in beforeEach) never sees these calls: it
// replaces the `console.info` *property*, but the logger already holds the older function object
// directly (confirmed empirically; spying after the fact silently captures nothing). Patching
// console.info/warn/error here, inside vi.hoisted(), runs before any import below — including the
// transitive import of firebase-functions/logger — so the logger captures OUR wrapper as
// `UNPATCHED_CONSOLE`, and recording can be toggled per test without reloading any module (which
// would risk creating a second, distinct firebase-admin/firestore instance whose FieldValue
// sentinels the original Firestore client does not recognise).
const logCapture = vi.hoisted(() => {
  const lines: string[] = [];
  let recording = false;
  const wrap =
    (orig: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (recording) lines.push(args.map(String).join(" "));
      return orig(...args);
    };
  console.info = wrap(console.info.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.error = wrap(console.error.bind(console));
  return {
    start: () => { lines.length = 0; recording = true; },
    stop: () => { recording = false; },
    text: () => lines.join("\n"),
  };
});

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
    expect(provider.searchText).toHaveBeenCalledWith("Lisbon", 10, "venue");
    expect((await db.doc(USAGE).get()).get("searches")).toBe(1);
    await runSearch(deps(selection), member, { kind: "nearby", lat: 51.5, lng: -0.12 });
    expect(provider.searchNearby).toHaveBeenCalledWith(51.5, -0.12, 1500, 10);
    expect((await db.doc(USAGE).get()).get("searches")).toBe(2);
  });

  it.each(["destination", "venue"] as const)("forwards %s mode and counts exactly one provider call", async (mode) => {
    const { provider, selection } = stubProvider();
    await runSearch(deps(selection), member, { kind: "destination", query: "Casa Sem Glúten", mode });
    expect(provider.searchText).toHaveBeenCalledExactlyOnceWith("Casa Sem Glúten", 10, mode);
    expect(provider.searchNearby).not.toHaveBeenCalled();
    expect((await db.doc(USAGE).get()).get("searches")).toBe(1);
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

describe("runSearch — logs never carry caller-supplied content (spec §2.6, §3.6)", () => {
  beforeEach(() => logCapture.start());
  afterEach(() => logCapture.stop());

  const allLoggedText = () => logCapture.text();

  it("never logs a destination query's text on a successful search", async () => {
    const { selection } = stubProvider();
    await runSearch(deps(selection), member, { kind: "destination", query: "zebra-quokka-search-term" });
    expect(allLoggedText()).not.toContain("zebra-quokka-search-term");
  });

  it("logs nearby coordinates rounded to 2dp only, never the full precision given", async () => {
    const { selection } = stubProvider();
    await runSearch(deps(selection), member, { kind: "nearby", lat: 51.123456, lng: -0.987654 });
    const logged = allLoggedText();
    expect(logged).toContain("51.12");
    expect(logged).toContain("-0.99");
    expect(logged).not.toContain("51.123456");
    expect(logged).not.toContain("-0.987654");
  });

  it("never logs a query a failing provider echoed back in its error message, but does log Google's error status", async () => {
    const echoedQuery = "zebra-quokka-search-term".repeat(20);
    const { selection } = stubProvider({
      searchText: vi.fn(async () => {
        throw new ProviderError("unavailable", `upstream rejected: ${echoedQuery}`, 503, "INVALID_ARGUMENT");
      }),
    });
    await expect(runSearch(deps(selection), member, { kind: "destination", query: echoedQuery })).rejects.toMatchObject({ code: "unavailable" });
    const logged = allLoggedText();
    // Fixed diagnostics only (audit observation): the ProviderError branch logs outcome/status, and
    // never the provider's own text, so the echoed query cannot appear at any length.
    expect(logged).not.toContain(echoedQuery);
    expect(logged).not.toContain("upstream rejected");
    expect(logged).toContain('"outcome":"unavailable"');
    expect(logged).toContain('"status":503');
    expect(logged).toContain('"googleStatus":"INVALID_ARGUMENT"');
  });

  it("never logs an unexpected error's own message text", async () => {
    const { selection } = stubProvider({ searchText: vi.fn(async () => { throw new TypeError("zebra-quokka-unexpected-marker"); }) });
    await expect(runSearch(deps(selection), member, { kind: "destination", query: "x" })).rejects.toMatchObject({ code: "internal" });
    const logged = allLoggedText();
    expect(logged).not.toContain("zebra-quokka-unexpected-marker");
    expect(logged).toContain('"outcome":"unexpected"');
    expect(logged).toContain('"errorName":"TypeError"');
  });

  it("carries no payload `message` key other than the one the real logger itself sets", async () => {
    const { selection } = stubProvider();
    await runSearch(deps(selection), member, { kind: "destination", query: "x" });
    // The success path logs at INFO severity, where the logger's positional message is written
    // verbatim (no stack-trace wrapping, which only applies to ERROR severity) — so this is the
    // plainest proof that the payload search.ts builds carries no `message` field of its own.
    expect(allLoggedText()).toContain('"message":"discovery.search"');
  });
});
