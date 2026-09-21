import { describe, expect, it } from "vitest";
import { assertDeployableFirebaseEnv, validateFirebaseEnv } from "./firebaseEnv";

const good = {
  VITE_FIREBASE_API_KEY: "AIzaSyExampleKey",
  VITE_FIREBASE_AUTH_DOMAIN: "safebite-pilot.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "safebite-pilot",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("validateFirebaseEnv", () => {
  it("accepts a complete non-demo configuration", () => {
    expect(validateFirebaseEnv(good)).toEqual([]);
  });

  it("reports every missing variable", () => {
    const problems = validateFirebaseEnv({});
    expect(problems).toHaveLength(4);
    expect(problems.join("\n")).toContain("VITE_FIREBASE_PROJECT_ID");
  });

  it("treats blank values as missing", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_APP_ID: "   " })).toEqual([
      "VITE_FIREBASE_APP_ID is missing or blank",
    ]);
  });

  it("rejects demo project ids and demo placeholders", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_PROJECT_ID: "demo-safebite" })).toEqual([
      "VITE_FIREBASE_PROJECT_ID must not be an emulator-only demo- project (got demo-safebite)",
    ]);
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_API_KEY: "demo-api-key" })).toEqual([
      "VITE_FIREBASE_API_KEY is the demo placeholder",
    ]);
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_APP_ID: "demo-app-id" })).toEqual([
      "VITE_FIREBASE_APP_ID is the demo placeholder",
    ]);
  });

  it("rejects the legacy production project by name", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_PROJECT_ID: "safebite-production-13ba1" })).toEqual([
      "VITE_FIREBASE_PROJECT_ID must not be the legacy project safebite-production-13ba1 (the pilot uses a separate project)",
    ]);
  });

  it("rejects emulator mode", () => {
    expect(validateFirebaseEnv({ ...good, VITE_USE_EMULATORS: "true" })).toEqual([
      "VITE_USE_EMULATORS must not be true for a deployable build",
    ]);
  });
});

describe("assertDeployableFirebaseEnv", () => {
  it("does nothing for a deployable configuration", () => {
    expect(() => assertDeployableFirebaseEnv(good, "test")).not.toThrow();
  });

  it("throws a message that names the context and every problem", () => {
    expect(() => assertDeployableFirebaseEnv({ ...good, VITE_FIREBASE_PROJECT_ID: "" }, "production startup")).toThrow(
      /production startup.*VITE_FIREBASE_PROJECT_ID is missing or blank/s,
    );
  });
});
