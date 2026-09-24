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

/**
 * Whether the Auth emulator accepts this email/password, checked independently of the page. The
 * emulator accepts any API key. The response carries tokens, so it is consumed and never logged.
 */
export async function passwordAccepted(request: APIRequestContext, email: string, password: string): Promise<boolean> {
  const res = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key", {
    headers: { "Content-Type": "application/json" },
    data: { email, password, returnSecureToken: true },
  });
  await res.body();
  return res.ok();
}
