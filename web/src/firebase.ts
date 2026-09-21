import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { assertDeployableFirebaseEnv } from "./config/firebaseEnv";

// Real values are supplied by the owner for staging via environment variables.
// The defaults below only work with the emulators (project demo-safebite).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "localhost",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-safebite",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "demo-app-id",
};

// A built bundle must never start against the emulator-only demo project or placeholders.
// Keyed on the build marker (vite.config.ts), not on import.meta.env.PROD, which a
// NODE_ENV=development build would turn off.
if (__SAFEBITE_BUILD__) {
  assertDeployableFirebaseEnv(import.meta.env, "bundle startup");
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west2");

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

if (import.meta.env.DEV && usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
