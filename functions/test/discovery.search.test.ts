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
