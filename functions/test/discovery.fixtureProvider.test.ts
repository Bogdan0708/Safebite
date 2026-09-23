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
