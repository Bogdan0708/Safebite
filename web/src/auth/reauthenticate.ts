import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "../firebase";

/** Password re-entry shared by change password and account deletion (spec §3.7, §3.8). */
export type ReauthResult = "ok" | "wrongCurrent" | "tooManyRequests" | "offline" | "failed";

export async function reauthenticate(password: string): Promise<ReauthResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const user = auth.currentUser;
  if (!user || !user.email) return "failed";
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return "ok";
  } catch (err) {
    switch ((err as { code?: string }).code) {
      case "auth/invalid-credential":
      case "auth/wrong-password": return "wrongCurrent";
      case "auth/too-many-requests": return "tooManyRequests";
      case "auth/network-request-failed": return "offline";
      default: return "failed";
    }
  }
}
