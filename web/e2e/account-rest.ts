import type { APIRequestContext } from "@playwright/test";
import { setPasswordViaAdmin } from "./auth-rest";

/**
 * Emulator-only (127.0.0.1, project demo-safebite) helpers for the account-deletion scenarios.
 * Deletion removes real emulator accounts, so every scenario restores the seed afterwards.
 */
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-safebite";
const FS = "http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents";
const HEADERS = { Authorization: "Bearer owner", "Content-Type": "application/json" };
export const PASSWORD = "pilot-password-1";
const SEED = [
  { uid: "ava-uid", email: "ava@safebite.test", name: "Ava" },
  { uid: "bogdan-uid", email: "bogdan@safebite.test", name: "Bogdan" },
] as const;

const s = (v: string) => ({ stringValue: v });

async function put(request: APIRequestContext, path: string, fields: Record<string, unknown>): Promise<void> {
  const res = await request.patch(`${FS}/${path}`, { headers: HEADERS, data: { fields } });
  if (!res.ok()) throw new Error(`put ${path}: ${res.status()} ${await res.text()}`);
}

export async function setMemberIds(request: APIRequestContext, ids: string[]): Promise<void> {
  await put(request, "households/home", {
    name: s("Home"),
    memberIds: { arrayValue: { values: ids.map(s) } },
    createdAt: { timestampValue: "2026-09-01T00:00:00Z" },
  });
}

export async function restoreSeedAccounts(request: APIRequestContext): Promise<void> {
  for (const a of SEED) {
    const res = await request.post(`${AUTH}/accounts`, {
      headers: HEADERS,
      data: { localId: a.uid, email: a.email, password: PASSWORD, displayName: a.name, emailVerified: true },
    });
    if (!res.ok()) {
      const text = await res.text();
      if (!text.includes("DUPLICATE")) throw new Error(`restore ${a.uid}: ${res.status()} ${text}`);
      await setPasswordViaAdmin(request, a.uid, PASSWORD);
    }
    await put(request, `users/${a.uid}`, { householdId: s("home"), displayName: s(a.name) });
    await request.delete(`${FS}/accountDeletions/${a.uid}`, { headers: HEADERS });
  }
  await setMemberIds(request, SEED.map((a) => a.uid));
}

export async function householdExists(request: APIRequestContext): Promise<boolean> {
  return (await request.get(`${FS}/households/home`, { headers: HEADERS })).status() === 200;
}

/** An interrupted deletion after step 2: the record exists and the uid has left memberIds. */
export async function seedDeletionRecord(request: APIRequestContext, uid: string): Promise<void> {
  await put(request, `accountDeletions/${uid}`, {
    householdId: s("home"),
    lastMember: { booleanValue: false },
    startedAt: { timestampValue: "2026-10-01T10:00:00Z" },
    step2At: { timestampValue: "2026-10-01T10:00:01Z" },
  });
}
