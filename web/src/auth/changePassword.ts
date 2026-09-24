import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "../firebase";

/**
 * Change password (spec §3.7, amended after audit F3). The 8-character minimum is a client rule;
 * a server password policy may be stricter, so its rejection has its own outcome. "uncertain" means
 * the update request was sent and may have succeeded (implementation audit F3, 2026-09-24).
 */
export type ChangePasswordResult = "ok" | "wrongCurrent" | "tooManyRequests" | "offline" | "policy" | "recentLogin" | "failed" | "uncertain";

export const MIN_PASSWORD_LENGTH = 8;

export const CHANGE_PASSWORD_MESSAGES: Record<Exclude<ChangePasswordResult, "ok">, string> = {
  wrongCurrent: "That isn't your current password.",
  tooManyRequests: "Too many attempts. Wait a few minutes and try again.",
  offline: "You are offline. Connect and try again.",
  policy: "Your new password doesn't meet this account's password rules. Choose a different one.",
  recentLogin: "For security, sign out and back in, then try again.",
  failed: "Couldn't change your password. Your old password still works.",
  uncertain: "We couldn't confirm whether your password changed. Sign out, then sign in with your new password; if that doesn't work, use your old one.",
};

export function validateNewPassword(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next !== confirm) return "The two new passwords don't match.";
  return null;
}

const code = (err: unknown) => (err as { code?: string }).code;

function reauthFailure(err: unknown): ChangePasswordResult {
  switch (code(err)) {
    case "auth/invalid-credential":
    case "auth/wrong-password": return "wrongCurrent";
    case "auth/too-many-requests": return "tooManyRequests";
    case "auth/network-request-failed": return "offline";
    default: return "failed";
  }
}

/**
 * Only these rejections prove the password was not changed. The SDK looks the account up after the
 * update request succeeds, so any other failure (network, rate limit, unknown) may follow a
 * committed change.
 */
function updateFailure(err: unknown): ChangePasswordResult {
  switch (code(err)) {
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements": return "policy";
    case "auth/requires-recent-login": return "recentLogin";
    default: return "uncertain";
  }
}

export async function changePassword(current: string, next: string): Promise<ChangePasswordResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const user = auth.currentUser;
  if (!user || !user.email) return "failed";
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  } catch (err) {
    return reauthFailure(err); // never attempt the update after a failed reauthentication
  }
  try {
    await updatePassword(user, next);
  } catch (err) {
    return updateFailure(err);
  }
  return "ok";
}
