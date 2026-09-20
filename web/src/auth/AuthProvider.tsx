import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { resolveMembership } from "./membership";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "notMember"; email: string | null }
  | { status: "member"; uid: string; email: string | null; householdId: string; displayName: string };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readDoc(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const snapshot = await getDoc(doc(db, path));
    return snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined;
  } catch {
    // A permission-denied read is the rules saying "not a member". Any other read failure is
    // treated the same way for safety; the user can sign out and retry.
    return undefined;
  }
}

async function stateForUser(user: User): Promise<AuthState> {
  const userDoc = await readDoc(`users/${user.uid}`);
  const householdId = userDoc?.householdId;
  const householdDoc = typeof householdId === "string" ? await readDoc(`households/${householdId}`) : undefined;
  const membership = resolveMembership(user.uid, userDoc, householdDoc);
  if (membership.kind === "member") {
    return { status: "member", uid: user.uid, email: user.email, householdId: membership.householdId, displayName: membership.displayName };
  }
  return { status: "notMember", email: user.email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const mine = ++generation;
      if (!user) {
        setState({ status: "signedOut" });
        return;
      }
      setState({ status: "loading" });
      void stateForUser(user).then((next) => {
        if (mine === generation) setState(next);
      });
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
