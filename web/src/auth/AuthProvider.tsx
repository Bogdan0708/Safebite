import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "../firebase";
import { forgetAuthGuard } from "../account/authCleanupGuard";
import { DELETED_UIDS_KEY, forgetDeletedUid, isDeletedUid } from "../account/deletedSessions";
import { discardDeletedNoticeUnlessFor, readDeletionRequest } from "../account/storage";
import { clearDeviceData } from "../device/cleanup";
import { decideNoAnswer, prepareMemberCopy } from "../offline/decide";
import { isServingCopy, setCopySession, setDeniedHandler, startCopyWatch } from "../offline/session";
import { REFRESH_INTERVAL_MS } from "../offline/types";
import { membershipWithTimeout, type MembershipAnswer } from "./membershipCheck";
import { resetDocument } from "./resetDocument";

export type AuthState =
  | { status: "loading" }
  | { status: "resetting" }
  | { status: "signedOut" }
  | { status: "notMember"; uid: string; email: string | null; canDeleteSignIn: boolean }
  | { status: "deletionPending"; uid: string; email: string | null }
  | { status: "deletedSession"; uid: string; email: string | null }
  | { status: "member"; uid: string; email: string | null; householdId: string; displayName: string; householdChanged?: true }
  /** Reading the device copy because the server could not answer (spec §3.9). */
  | { status: "offlineMember"; uid: string; email: string | null; householdId: string; displayName: string; downloadedAt: number; provisional?: true }
  | { status: "error"; email: string | null; message: string };

export const NO_ANSWER_MESSAGE = "Couldn't check your membership. Check your connection and try again.";
export const EXPIRED_MESSAGE = "This offline copy needs a connection to confirm your access.";

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function uidsIn(raw: string | null): string[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AuthState>({ status: "loading" });
  const stateRef = useRef<AuthState>(state);
  const setState = useCallback((next: AuthState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);
  const generationRef = useRef(0);
  const lastUidRef = useRef<string | null>(null);
  /**
   * The generation of the membership read a listener denial started, while that read is
   * outstanding. A denial episode ends when the read settles or any newer resolve supersedes it,
   * so each episode costs at most one read however many listeners report it (review R2-4).
   */
  const denialReadRef = useRef<number | null>(null);
  /** Loss-of-access wipes still running in this document; a reset waits for them, so no run's pending-clear key is orphaned. */
  const wipesRef = useRef(new Set<Promise<unknown>>());

  const wipeDevice = useCallback(async (): Promise<void> => {
    const wipe = clearDeviceData();
    wipesRef.current.add(wipe);
    try {
      await wipe;
    } finally {
      wipesRef.current.delete(wipe);
    }
  }, []);

  /** Account change, deleted session elsewhere: clear device data first, then reload (spec §3.8). */
  const resetForChange = useCallback(() => {
    generationRef.current += 1;
    setCopySession(null);
    setState({ status: "resetting" });
    void Promise.allSettled([...wipesRef.current, clearDeviceData()]).finally(() => resetDocument());
  }, [setState]);

  const applyAnswer = useCallback(async (user: User, answer: MembershipAnswer, mine: number): Promise<void> => {
    if (mine !== generationRef.current) return;
    if (answer.kind === "member") {
      const prep = await prepareMemberCopy(user.uid, answer.householdId, Date.now());
      if (mine !== generationRef.current) return;
      setCopySession({ uid: user.uid, householdId: answer.householdId, mode: "member" });
      setState({
        status: "member", uid: user.uid, email: user.email, householdId: answer.householdId, displayName: answer.displayName,
        ...(prep.householdChanged ? { householdChanged: true as const } : {}),
      });
      return;
    }
    if (answer.kind === "notMember" || answer.kind === "deletionPending") {
      // A confirmed loss of access wipes the copy first; a document showing copy data resets (spec §3.9).
      const wasServing = isServingCopy();
      setCopySession(null);
      await wipeDevice();
      if (mine !== generationRef.current) return;
      if (wasServing) {
        generationRef.current += 1;
        setState({ status: "resetting" });
        resetDocument();
        return;
      }
      setState(answer.kind === "notMember"
        ? { status: "notMember", uid: user.uid, email: user.email, canDeleteSignIn: answer.canDeleteSignIn }
        : { status: "deletionPending", uid: user.uid, email: user.email });
      return;
    }
    // No answer: an open session for this account stays as it is.
    const current = stateRef.current;
    if ((current.status === "member" || current.status === "offlineMember") && current.uid === user.uid && !("provisional" in current && current.provisional)) return;
    const outcome = await decideNoAnswer(user.uid, Date.now());
    if (mine !== generationRef.current) return;
    if (outcome.kind === "open") {
      setCopySession({ uid: user.uid, householdId: outcome.householdId, mode: "offlineMember" });
      setState({ status: "offlineMember", uid: user.uid, email: user.email, householdId: outcome.householdId, displayName: outcome.displayName, downloadedAt: outcome.downloadedAt });
      return;
    }
    setState({ status: "error", email: user.email, message: outcome.kind === "expired" ? EXPIRED_MESSAGE : NO_ANSWER_MESSAGE });
  }, [setState, wipeDevice]);

  /**
   * `quiet` keeps the current screen while re-checking (retries, denials, a provisional early
   * open); `denial` marks the read a listener denial started.
   */
  const resolveForUser = useCallback((user: User, options: { quiet?: boolean; denial?: boolean } = {}) => {
    const mine = ++generationRef.current;
    if (options.denial) denialReadRef.current = mine;
    if (!options.quiet) setState({ status: "loading" });
    if (isDeletedUid(user.uid)) {
      setCopySession(null);
      setState({ status: "deletedSession", uid: user.uid, email: user.email });
      return;
    }
    // A notice names one account: resolving any other account discards it, error path included.
    discardDeletedNoticeUnlessFor(user.uid);
    const { first, late } = membershipWithTimeout(user.uid);
    // `first` is applied in full before any late answer, so a late answer cannot be overtaken.
    const firstApplied = first.then(async (answer) => {
      await applyAnswer(user, answer, mine);
      return answer;
    });
    // `first` rejects on an unclassified read error: today's error screen, unless re-checking quietly.
    firstApplied.catch(() => {
      if (mine === generationRef.current && !options.quiet) setState({ status: "error", email: user.email, message: NO_ANSWER_MESSAGE });
    });
    // A read that outlived the timeout is applied when it lands (review P3-7).
    void Promise.allSettled([firstApplied, late]).then(([f, l]) => {
      if (denialReadRef.current === mine) denialReadRef.current = null;
      if (f.status !== "fulfilled" || l.status !== "fulfilled") return;
      if (l.value === f.value || l.value.kind === "noAnswer") return;
      return applyAnswer(user, l.value, mine);
    }).catch(() => {
      // A failed late application leaves the current state; the next retry decides.
    });
  }, [applyAnswer, setState]);

  useEffect(() => startCopyWatch(), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const previous = lastUidRef.current;
      // Auth state is shared by every same-origin tab (audit F2): whichever tab signed out or
      // switched user, each document that had a user resets itself. Starting signed out, or a
      // repeat of the same UID, is not a change.
      if (previous !== null && (user === null || user.uid !== previous)) {
        resetForChange();
        return;
      }
      if (!user) {
        generationRef.current += 1;
        setCopySession(null);
        setState({ status: "signedOut" });
        return;
      }
      lastUidRef.current = user.uid;
      resolveForUser(user);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DELETED_UIDS_KEY) return;
      const uid = lastUidRef.current;
      // Reset only when this write newly added the current uid, not on any unrelated record write.
      if (uid === null || !uidsIn(event.newValue).includes(uid) || uidsIn(event.oldValue).includes(uid)) return;
      if (!isDeletedUid(uid)) return;
      resetForChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribe();
    };
  }, [resolveForUser, resetForChange, setState]);

  // A live listener's permission-denied re-reads membership from the server, once per episode (review R2-4).
  useEffect(() => {
    setDeniedHandler(() => {
      const user = auth.currentUser;
      const current = stateRef.current;
      if (!user || current.status !== "member" || current.uid !== user.uid) return;
      // This tab's own deletion (or one already confirmed) owns the cleanup and the reset (spec §3.8).
      if (readDeletionRequest() !== null || isDeletedUid(user.uid)) return;
      if (denialReadRef.current !== null && denialReadRef.current === generationRef.current) return;
      resolveForUser(user, { quiet: true, denial: true });
    });
    return () => setDeniedHandler(null);
  }, [resolveForUser]);

  // Leaving offlineMember: retry on reconnection and every 15 minutes while visible (spec §3.9).
  useEffect(() => {
    if (state.status !== "offlineMember") return;
    const retryQuietly = () => {
      const user = auth.currentUser;
      const current = stateRef.current;
      if (user && current.status === "offlineMember" && current.uid === user.uid) resolveForUser(user, { quiet: true });
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") retryQuietly();
    }, REFRESH_INTERVAL_MS);
    window.addEventListener("online", retryQuietly);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retryQuietly);
    };
  }, [state.status, resolveForUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    forgetAuthGuard(user.uid);
    // A successful sign-in proves the account exists (e.g. re-created by an admin): forget it, then
    // re-resolve in case the listener already resolved deletedSession for it.
    if (isDeletedUid(user.uid)) {
      forgetDeletedUid(user.uid);
      if (lastUidRef.current === user.uid) resolveForUser(user);
    }
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
  }, [resolveForUser, setState]);

  const value = useMemo(() => ({ state, signIn, signOut, retry }), [state, signIn, signOut, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
