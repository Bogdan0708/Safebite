import { afterEach, describe, expect, it, vi } from "vitest";

// The runtime guard must key on "this is a built bundle", not on NODE_ENV: a compile-only
// bundle built with NODE_ENV=development has PROD=false and previously started against demo values.
vi.mock("firebase/app", () => ({ initializeApp: () => ({}) }));
vi.mock("firebase/auth", () => ({ getAuth: () => ({}), connectAuthEmulator: () => {} }));
vi.mock("firebase/firestore", () => ({ getFirestore: () => ({}), connectFirestoreEmulator: () => {} }));
vi.mock("firebase/functions", () => ({ getFunctions: () => ({}), connectFunctionsEmulator: () => {} }));

const demo = {
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "localhost",
  VITE_FIREBASE_PROJECT_ID: "demo-safebite",
  VITE_FIREBASE_APP_ID: "demo-app-id",
  VITE_USE_EMULATORS: "true",
};

function stubEnv(values: Record<string, string>, { prod, dev }: { prod: boolean; dev: boolean }) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  vi.stubEnv("PROD", prod);
  vi.stubEnv("DEV", dev);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("firebase.ts startup guard", () => {
  it("refuses to start a built bundle with demo values even when NODE_ENV was development", async () => {
    stubEnv(demo, { prod: false, dev: true });
    vi.stubGlobal("__SAFEBITE_BUILD__", true);
    await expect(import("./firebase")).rejects.toThrow(/not deployable \(bundle startup\).*demo-safebite/s);
  });

  it("refuses to start a production-mode bundle with demo values", async () => {
    stubEnv(demo, { prod: true, dev: false });
    vi.stubGlobal("__SAFEBITE_BUILD__", true);
    await expect(import("./firebase")).rejects.toThrow(/not deployable \(bundle startup\)/);
  });

  it("starts the dev server against the emulators with demo values", async () => {
    stubEnv(demo, { prod: false, dev: true });
    vi.stubGlobal("__SAFEBITE_BUILD__", false);
    await expect(import("./firebase")).resolves.toMatchObject({ usingEmulators: true });
  });
});
