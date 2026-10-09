import type { APIRequestContext } from "@playwright/test";

/**
 * The Auth emulator stamps validSince = floor(wall clock) on every password write (create or
 * accounts:update) and rejects any ID token whose iat is earlier (accounts:lookup -> TOKEN_EXPIRED,
 * shown as "Sign-in failed"). This host's wall clock steps backwards (WSL: hv_utils vs timesyncd,
 * ~-2 s every 30 s), so a sign-in right after a write can get an iat before the stamp. Do not remove
 * this wait as unneeded: it holds until a step of up to ~2.5 s can no longer undercut the stamp.
 */
export const CLOCK_STEP_MARGIN_S = 3;

export async function waitOutValidSince(stampSecond: number): Promise<void> {
  while (Date.now() / 1000 < stampSecond + CLOCK_STEP_MARGIN_S) await new Promise((r) => setTimeout(r, 100));
}

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
  await waitOutValidSince(Math.floor(Date.now() / 1000));
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
