/**
 * Single source of truth for "is this Firebase configuration deployable?".
 * Used at build time by the Vite plugin in vite.config.ts and at runtime by firebase.ts.
 * Pure: no imports, no environment access.
 */
export interface FirebaseEnvLike {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_USE_EMULATORS?: string;
}

export const REQUIRED_FIREBASE_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const LEGACY_PRODUCTION_PROJECT = "safebite-production-13ba1";
const DEMO_PLACEHOLDERS: Partial<Record<(typeof REQUIRED_FIREBASE_VARS)[number], string>> = {
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "demo-app-id",
};

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/** Returns a list of human-readable problems; empty means the configuration is deployable. */
export function validateFirebaseEnv(env: FirebaseEnvLike): string[] {
  const problems: string[] = [];
  for (const name of REQUIRED_FIREBASE_VARS) {
    const value = env[name];
    if (blank(value)) {
      problems.push(`${name} is missing or blank`);
      continue;
    }
    const placeholder = DEMO_PLACEHOLDERS[name];
    if (placeholder !== undefined && value === placeholder) {
      problems.push(`${name} is the demo placeholder`);
    }
  }
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (projectId !== undefined && !blank(projectId)) {
    if (projectId.startsWith("demo-")) {
      problems.push(`VITE_FIREBASE_PROJECT_ID must not be an emulator-only demo- project (got ${projectId})`);
    } else if (projectId === LEGACY_PRODUCTION_PROJECT) {
      problems.push(
        `VITE_FIREBASE_PROJECT_ID must not be the legacy project ${LEGACY_PRODUCTION_PROJECT} (the pilot uses a separate project)`,
      );
    }
  }
  if (env.VITE_USE_EMULATORS === "true") {
    problems.push("VITE_USE_EMULATORS must not be true for a deployable build");
  }
  return problems;
}

/** Throws when the configuration is not deployable. `context` names where the check ran. */
export function assertDeployableFirebaseEnv(env: FirebaseEnvLike, context: string): void {
  const problems = validateFirebaseEnv(env);
  if (problems.length > 0) {
    throw new Error(
      `Firebase configuration is not deployable (${context}):\n- ${problems.join("\n- ")}\n` +
        "Set VITE_FIREBASE_* for the pilot project, or use `npm run build:check` for a compile-only build.",
    );
  }
}
