import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const PROJECT_ID = "demo-safebite";
export const REGION = "europe-west2";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";

export function ensureAdminApp(): void {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
}

export async function createEmulatorUser(uid: string, email: string, password: string): Promise<void> {
  ensureAdminApp();
  const auth = getAuth();
  try {
    await auth.deleteUser(uid);
  } catch {
    // user did not exist
  }
  await auth.createUser({ uid, email, password, emailVerified: true });
}

export async function signInForIdToken(email: string, password: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`emulator sign-in failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { idToken: string };
  return body.idToken;
}

export interface CallResult {
  status: number;
  body: { result?: unknown; error?: { status?: string; message?: string } };
}

export async function callFunction(name: string, data: unknown, idToken?: string): Promise<CallResult> {
  const res = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  return { status: res.status, body: (await res.json()) as CallResult["body"] };
}
