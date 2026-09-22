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
