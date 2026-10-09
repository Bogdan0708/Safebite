// Real values are supplied by the owner for staging via environment variables.
// The defaults below only work with the emulators (project demo-safebite).
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "localhost",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-safebite",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "demo-app-id",
};
