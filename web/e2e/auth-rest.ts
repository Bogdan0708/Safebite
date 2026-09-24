import type { APIRequestContext } from "@playwright/test";

/**
 * Admin password reset in the Auth emulator (127.0.0.1:9099, project demo-safebite), used to
 * restore the shared fixture password after a test changes it. Never talks to a real project.
 */
export async function setPasswordViaAdmin(request: APIRequestContext, uid: string, password: string): Promise<void> {
  const res = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-safebite/accounts:update", {
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    data: { localId: uid, password },
  });
  if (!res.ok()) throw new Error(`setPassword ${uid}: ${res.status()} ${await res.text()}`);
}
