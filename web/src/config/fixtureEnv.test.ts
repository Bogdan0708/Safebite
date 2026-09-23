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
