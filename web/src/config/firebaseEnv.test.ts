import { describe, expect, it } from "vitest";
import { assertDeployableFirebaseEnv, guardViteBuild, validateFirebaseEnv, startupProblems } from "./firebaseEnv";

const good = {
  VITE_FIREBASE_API_KEY: "AIzaSyExampleKey0123456789abcdefghijk",
  VITE_FIREBASE_AUTH_DOMAIN: "safebite-pilot.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "safebite-pilot",
  VITE_FIREBASE_APP_ID: "1:123456789012:web:0123456789abcdef",
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

  it("rejects an api key that does not look like a Firebase web key", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_API_KEY: "AIzaShort" })).toEqual([
      "VITE_FIREBASE_API_KEY does not look like a Firebase web API key (expected AIza… of at least 30 characters)",
    ]);
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_API_KEY: "not-a-firebase-key-0123456789abcdefghijk" })).toHaveLength(1);
  });

  it("rejects an app id that is not a web app id", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_APP_ID: "1:123:ios:abc" })).toEqual([
      "VITE_FIREBASE_APP_ID does not look like a Firebase web app id (expected <digits>:<digits>:web:<hex>)",
    ]);
  });

  it("rejects an auth domain without a dot", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_AUTH_DOMAIN: "localhost" })).toEqual([
      "VITE_FIREBASE_AUTH_DOMAIN does not look like a domain (expected something like <project>.firebaseapp.com)",
    ]);
  });

  it("reports a placeholder once, not also as a shape problem", () => {
    expect(validateFirebaseEnv({ ...good, VITE_FIREBASE_API_KEY: "demo-api-key" })).toEqual([
      "VITE_FIREBASE_API_KEY is the demo placeholder",
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

describe("guardViteBuild", () => {
  const production = { isProduction: true, nodeEnv: "production" };

  it("rejects a non-production build even when validation is skipped", () => {
    expect(() =>
      guardViteBuild({ isProduction: false, nodeEnv: "development", unvalidated: true, env: good, context: "vite build" }),
    ).toThrow(/non-production Vite build \(vite build\).*NODE_ENV=development/s);
  });

  it("rejects a non-production build before validating the Firebase values", () => {
    expect(() =>
      guardViteBuild({ isProduction: false, nodeEnv: undefined, unvalidated: false, env: {}, context: "vite build" }),
    ).toThrow(/NODE_ENV/);
  });

  it("skips validation for a production compile-only build", () => {
    expect(guardViteBuild({ ...production, unvalidated: true, env: {}, context: "vite build" })).toBe("skipped");
  });

  it("validates a production deployable build", () => {
    expect(guardViteBuild({ ...production, unvalidated: false, env: good, context: "vite build" })).toBe("validated");
    expect(() => guardViteBuild({ ...production, unvalidated: false, env: {}, context: "vite build" })).toThrow(
      /Firebase configuration is not deployable \(vite build\)/,
    );
  });
});

describe("startupProblems", () => {
  const demo = { ...good, VITE_FIREBASE_PROJECT_ID: "demo-safebite" };

  it("is empty outside a built bundle, whatever the values", () => {
    expect(startupProblems(demo, false)).toEqual([]);
    expect(startupProblems({}, false)).toEqual([]);
  });

  it("returns the validator's problems inside a built bundle", () => {
    expect(startupProblems(demo, true)).toEqual([
      "VITE_FIREBASE_PROJECT_ID must not be an emulator-only demo- project (got demo-safebite)",
    ]);
    expect(startupProblems(good, true)).toEqual([]);
  });
});
