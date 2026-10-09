import { initializeApp } from "firebase/app";
import { connectAuthEmulator, initializeAuth, indexedDBLocalPersistence, inMemoryPersistence } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { assertDeployableFirebaseEnv } from "./config/firebaseEnv";

import { firebaseConfig } from "./config/firebaseConfig";
import { persistentAuthAllowed } from "./account/authPersistence";

// A built bundle must never start against the emulator-only demo project or placeholders.
// Keyed on the build marker (vite.config.ts), not on import.meta.env.PROD, which a
// NODE_ENV=development build would turn off.
if (__SAFEBITE_BUILD__) {
  assertDeployableFirebaseEnv(import.meta.env, "bundle startup");
}

export const app = initializeApp(firebaseConfig);
// Never include browserLocalPersistence: its shared key has no atomic compare-and-delete.
// The bootstrap checks deletion tombstones before permitting the SDK to read IndexedDB.
// Imports outside that bootstrap default to memory, so they cannot bypass the gate.
export const auth = initializeAuth(app, {
  persistence: persistentAuthAllowed() ? indexedDBLocalPersistence : inMemoryPersistence,
});
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west2");

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

if (import.meta.env.DEV && usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
