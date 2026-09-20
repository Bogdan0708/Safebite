import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { resolveMembership } from "./membership";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "notMember"; email: string | null }
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
  const generationRef = useRef(0);

  const resolveForUser = useCallback((user: User) => {
    const mine = ++generationRef.current;
    setState({ status: "loading" });
    void stateForUser(user)
      .then((next) => {
        if (mine === generationRef.current) setState(next);
      })
      .catch(() => {
        if (mine === generationRef.current) {
          setState({ status: "error", email: user.email, message: "Couldn't check your membership. Check your connection and try again." });
        }
      });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        generationRef.current += 1;
        setState({ status: "signedOut" });
        return;
      }
      resolveForUser(user);
    });
    return unsubscribe;
  }, [resolveForUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
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
