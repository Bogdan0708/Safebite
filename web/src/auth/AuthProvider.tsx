import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { DELETED_UIDS_KEY, forgetDeletedUid, isDeletedUid } from "../account/deletedSessions";
import { discardDeletedNoticeUnlessFor } from "../account/storage";
import { clearDeviceData } from "../device/cleanup";
import { resolveMembership } from "./membership";
import { resetDocument } from "./resetDocument";

export type AuthState =
  | { status: "loading" }
  | { status: "resetting" }
  | { status: "signedOut" }
  | { status: "notMember"; uid: string; email: string | null; canDeleteSignIn: boolean }
  | { status: "deletionPending"; uid: string; email: string | null }
  | { status: "deletedSession"; uid: string; email: string | null }
  | { status: "member"; uid: string; email: string | null; householdId: string; displayName: string }
  | { status: "error"; email: string | null; message: string };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readDoc(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const snapshot = await getDoc(doc(db, path));
    return snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined;
  } catch (err) {
    if ((err as { code?: string }).code === "permission-denied") {
      // The rules deny this read precisely when the caller is not a member; treat that as "no document".
      return undefined;
    }
    // Any other failure (offline, outage, etc.) is not evidence of non-membership; let it propagate
    // so the caller can distinguish "not a member" from "couldn't find out".
    throw err;
  }
}

async function stateForUser(user: User): Promise<AuthState> {
  if (isDeletedUid(user.uid)) return { status: "deletedSession", uid: user.uid, email: user.email };
  const userDoc = await readDoc(`users/${user.uid}`);
  const householdId = userDoc?.householdId;
  const householdDoc = typeof householdId === "string" ? await readDoc(`households/${householdId}`) : undefined;
  const membership = resolveMembership(user.uid, userDoc, householdDoc);
  if (membership.kind === "member") {
    return { status: "member", uid: user.uid, email: user.email, householdId: membership.householdId, displayName: membership.displayName };
  }
  // An interrupted account deletion (spec §3.8): the owner may read their own record.
  const record = await readDoc(`accountDeletions/${user.uid}`);
  if (record !== undefined) return { status: "deletionPending", uid: user.uid, email: user.email };
  return { status: "notMember", uid: user.uid, email: user.email, canDeleteSignIn: userDoc === undefined };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const generationRef = useRef(0);
  const lastUidRef = useRef<string | null>(null);

  const resolveForUser = useCallback((user: User) => {
    const mine = ++generationRef.current;
    setState({ status: "loading" });
    void stateForUser(user)
      .then((next) => {
        if (mine !== generationRef.current) return;
        if (next.status !== "deletedSession") discardDeletedNoticeUnlessFor(user.uid);
        setState(next);
      })
      .catch(() => {
        if (mine === generationRef.current) {
          setState({ status: "error", email: user.email, message: "Couldn't check your membership. Check your connection and try again." });
        }
      });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const previous = lastUidRef.current;
      // Auth state is shared by every same-origin tab (audit F2): whichever tab signed out or
      // switched user, each document that had a user resets itself. Starting signed out, or a
      // repeat of the same UID, is not a change.
      if (previous !== null && (user === null || user.uid !== previous)) {
        generationRef.current += 1;
        setState({ status: "resetting" });
        // Device data goes first (spec §3.8). The reset proceeds whatever the result: a failure
        // leaves the pendingClear marker set, and the next start finishes the job before rendering.
        void clearDeviceData().finally(() => resetDocument());
        return;
      }
      if (!user) {
        generationRef.current += 1;
        setState({ status: "signedOut" });
        return;
      }
      lastUidRef.current = user.uid;
      resolveForUser(user);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DELETED_UIDS_KEY) return;
      const uid = lastUidRef.current;
      if (uid === null || !isDeletedUid(uid)) return;
      generationRef.current += 1;
      setState({ status: "resetting" });
      void clearDeviceData().finally(() => resetDocument());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribe();
    };
  }, [resolveForUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    // A successful sign-in proves the account exists (e.g. re-created by an admin): forget it, then
    // re-resolve in case the listener already resolved deletedSession for it.
    if (isDeletedUid(user.uid)) { forgetDeletedUid(user.uid); resolveForUser(user); }
  }, [resolveForUser]);

  const signOut = useCallback(async () => {
    // The listener resets this document (and every other tab) when the user becomes null.
    await firebaseSignOut(auth);
  }, []);

  const retry = useCallback(() => {
    const user = auth.currentUser;
    if (!user) {
      generationRef.current += 1;
      setState({ status: "signedOut" });
      return;
    }
    resolveForUser(user);
  }, [resolveForUser]);

  const value = useMemo(() => ({ state, signIn, signOut, retry }), [state, signIn, signOut, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
