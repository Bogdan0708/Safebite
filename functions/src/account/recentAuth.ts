import { HttpsError } from "firebase-functions/v2/https";

/**
 * Deletion needs a recent authentication (spec §3.8, ruling 2). The UI always reauthenticates
 * with the password first; the server checks only that auth_time is at most five minutes old, so
 * a fresh sign-in also passes. A small future skew is tolerated for clock drift.
 */
export const RECENT_AUTH_SECONDS = 300;
const FUTURE_SKEW_SECONDS = 60;

export function requireRecentAuth(authTime: unknown, nowMs: number): void {
  const now = nowMs / 1000;
  const ok =
    typeof authTime === "number" &&
    Number.isFinite(authTime) &&
    now - authTime <= RECENT_AUTH_SECONDS &&
    authTime - now <= FUTURE_SKEW_SECONDS;
  if (!ok) throw new HttpsError("failed-precondition", "Recent sign-in required.", { reason: "recentLogin" });
}
