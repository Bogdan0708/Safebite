import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listeners, unsubscribes, getDocMock } = vi.hoisted(() => ({
  listeners: [] as Array<(user: unknown) => void>,
  unsubscribes: [] as Array<ReturnType<typeof vi.fn>>,
  getDocMock: vi.fn(),
}));
const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));
const { resetDocument } = vi.hoisted(() => ({ resetDocument: vi.fn() }));
vi.mock("./resetDocument", () => ({ resetDocument }));
const { clearDeviceData } = vi.hoisted(() => ({ clearDeviceData: vi.fn() }));
vi.mock("../device/cleanup", async (importOriginal) => ({ ...(await importOriginal<typeof import("../device/cleanup")>()), clearDeviceData }));
const { isDeletedUid, forgetDeletedUid, discardDeletedNoticeUnlessFor } = vi.hoisted(() => ({
  isDeletedUid: vi.fn((_uid: string) => false),
  forgetDeletedUid: vi.fn(),
  discardDeletedNoticeUnlessFor: vi.fn(),
}));
vi.mock("../account/deletedSessions", () => ({ DELETED_UIDS_KEY: "safebite.deletedUids", isDeletedUid, forgetDeletedUid }));
vi.mock("../account/storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("../account/storage")>()), discardDeletedNoticeUnlessFor }));

vi.mock("../firebase", () => ({ auth: {}, db: {}, functions: {}, usingEmulators: true }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    listeners.push(cb);
    const unsubscribe = vi.fn();
    unsubscribes.push(unsubscribe);
    return unsubscribe;
  },
  signInWithEmailAndPassword: signInMock,
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, path: string) => ({ path }),
  getDocFromServer: (ref: { path: string }) => getDocMock(ref.path),
}));
const refresh = vi.hoisted(() => ({ requestFull: vi.fn(async () => {}), requestPartial: vi.fn(async () => {}) }));
vi.mock("../offline/refresher", () => ({ refresher: refresh, useOptInVersion: () => 0 }));
const t = vi.hoisted(() => ({ timeout: undefined as number | undefined }));
vi.mock("./membershipCheck", async (importOriginal) => {
  const real = await importOriginal<typeof import("./membershipCheck")>();
  return { ...real, membershipWithTimeout: (uid: string) => real.membershipWithTimeout(uid, t.timeout ?? real.MEMBERSHIP_TIMEOUT_MS) };
});
const early = vi.hoisted(() => ({ candidate: null as null | { uid: string; householdId: string; displayName: string; downloadedAt: number } }));
vi.mock("../offline/early", () => ({ earlyCopyCandidate: async () => early.candidate }));
vi.mock("../offline/types", async (importOriginal) => ({ ...(await importOriginal<typeof import("../offline/types")>()), EARLY_OPEN_MS: 20 }));

import { AuthProvider, useAuth } from "./AuthProvider";
import { auth as authMock } from "../firebase";
import { getCopySession, reportDenied, setCopySession } from "../offline/session";
import { readMeta, readToken, replaceCopy, setOptIn } from "../offline/store";
import { observed } from "../records/repository";
import { COPY_MAX_AGE_MS } from "../offline/types";
import { EXPIRED_MESSAGE, NO_ANSWER_MESSAGE } from "./AuthProvider";

function Probe() {
  const { state } = useAuth();
  return <div data-testid="state">{JSON.stringify(state)}</div>;
}

function snap(data: Record<string, unknown> | undefined) {
  return { exists: () => data !== undefined, data: () => data, metadata: { fromCache: false } };
}

/** A getDoc result the test resolves by hand, to order overlapping membership lookups. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  listeners.length = 0;
  unsubscribes.length = 0;
  getDocMock.mockReset();
  resetDocument.mockReset();
  clearDeviceData.mockReset();
  isDeletedUid.mockReset();
  isDeletedUid.mockImplementation(() => false);
  forgetDeletedUid.mockReset();
  discardDeletedNoticeUnlessFor.mockReset();
  clearDeviceData.mockResolvedValue({ failed: [] });
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
  setCopySession(null);
  t.timeout = undefined;
  early.candidate = null;
  (authMock as { currentUser?: unknown }).currentUser = undefined;
  refresh.requestFull.mockClear();
  refresh.requestPartial.mockClear();
});

describe("AuthProvider", () => {
  it("starts loading, then reports signedOut when there is no user", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId("state")).toHaveTextContent('"loading"');
    listeners[0](null);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"signedOut"'));
  });

  it("reports member when user and household docs agree", async () => {
    getDocMock.mockImplementation(async (path: string) => {
      if (path === "users/ava-uid") return snap({ householdId: "home", displayName: "Ava" });
      if (path === "households/home") return snap({ name: "Home", memberIds: ["ava-uid"] });
      return snap(undefined);
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"status":"member"'));
    expect(screen.getByTestId("state")).toHaveTextContent('"householdId":"home"');
  });

  it("reports notMember when the user doc is missing", async () => {
    getDocMock.mockImplementation(async () => snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "stranger-uid", email: "stranger@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
  });

  it("reports notMember when reading the household is denied by rules", async () => {
    getDocMock.mockImplementation(async (path: string) => {
      if (path === "users/x") return snap({ householdId: "home", displayName: "X" });
      throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "x", email: null });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
  });

  it("reports an error when checking membership fails for a reason other than permission", async () => {
    getDocMock.mockImplementation(async () => {
      throw Object.assign(new Error("unavailable"), { code: "unavailable" });
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "y", email: "y@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"status":"error"'));
  });

  it("a sign-out after a sign-in resets the document and a slow lookup never lands", async () => {
    const slowUserDoc = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => {
      if (path === "users/ava-uid") return slowUserDoc.promise;
      if (path === "households/home") return Promise.resolve(snap({ name: "Home", memberIds: ["ava-uid"] }));
      return Promise.resolve(snap(undefined));
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    listeners[0](null);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"resetting"'));
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    slowUserDoc.resolve(snap({ householdId: "home", displayName: "Ava" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("state")).toHaveTextContent('"resetting"');
  });

  it("a different user in the same document resets it; the earlier lookup never lands", async () => {
    const slowUserDoc = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => {
      if (path === "users/slow-uid") return slowUserDoc.promise;
      return Promise.resolve(snap(undefined));
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "slow-uid", email: "slow@safebite.test" });
    listeners[0]({ uid: "fast-uid", email: "fast@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"resetting"'));
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    slowUserDoc.resolve(snap({ householdId: "home", displayName: "Slow" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("state")).toHaveTextContent('"resetting"');
  });

  it("never resets a document that starts signed out, then signs in", async () => {
    getDocMock.mockResolvedValue(snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](null);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("never resets on a repeated callback for the same user", async () => {
    getDocMock.mockResolvedValue(snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("signOut only signs out; the reset comes from the listener", async () => {
    const { signOut: firebaseSignOut } = await import("firebase/auth");
    function SignOutButton() {
      const { signOut } = useAuth();
      return <button type="button" onClick={() => void signOut()}>out</button>;
    }
    render(<AuthProvider><SignOutButton /></AuthProvider>);
    screen.getByText("out").click();
    await waitFor(() => expect(firebaseSignOut).toHaveBeenCalledTimes(1));
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("unsubscribes from auth state changes on unmount", () => {
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
    expect(unsubscribes).toHaveLength(1);
    expect(unsubscribes[0]).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
  });

  it("clears device data before resetting, and resets even when clearing failed", async () => {
    let finish!: (v: { failed: string[] }) => void;
    clearDeviceData.mockReturnValue(new Promise((r) => (finish = r)));
    getDocMock.mockImplementation(async (path: string) =>
      path === "users/u1" ? snap({ householdId: "home", displayName: "Ava" }) : snap({ memberIds: ["u1"] }));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "u1", email: "a@x" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"member"'));
    listeners[0](null);
    await waitFor(() => expect(clearDeviceData).toHaveBeenCalledTimes(1));
    expect(resetDocument).not.toHaveBeenCalled();
    finish({ failed: ["store"] });
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
  });

it("a non-member with an unfinished deletion record is deletionPending", async () => {
  getDocMock.mockImplementation(async (path: string) => (path === "accountDeletions/u1" ? snap({ householdId: "home" }) : snap(undefined)));
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"deletionPending"'));
  expect(screen.getByTestId("state")).toHaveTextContent('"uid":"u1"');
});

it("canDeleteSignIn is true only without a users document and without a record", async () => {
  getDocMock.mockImplementation(async () => snap(undefined));
  const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"canDeleteSignIn":true'));
  expect(screen.getByTestId("state")).toHaveTextContent('"uid":"u1"');
  unmount();
  getDocMock.mockImplementation(async (path: string) => (path === "users/u2" ? snap({ householdId: "home", displayName: "X" }) : snap(undefined)));
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[1]({ uid: "u2", email: "b@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"canDeleteSignIn":false'));
  expect(screen.getByTestId("state")).toHaveTextContent('"uid":"u2"');
});

it("an offline failure reading the record is the error state, not notMember", async () => {
  getDocMock.mockImplementation(async (path: string) => {
    if (path.startsWith("accountDeletions/")) throw Object.assign(new Error("x"), { code: "unavailable" });
    return snap(undefined);
  });
  render(<AuthProvider><Probe /></AuthProvider>);
  listeners[0]({ uid: "u1", email: "a@x" });
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"error"'));
});

  it("a recorded deleted uid resolves deletedSession without any membership read (final review P2)", async () => {
    isDeletedUid.mockImplementation((uid: string) => uid === "u1");
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "u1", email: "a@x" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"deletedSession"'));
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it("a storage event recording the current uid resets this tab; another uid does not", async () => {
    getDocMock.mockImplementation(async (path: string) =>
      path === "users/u1" ? snap({ householdId: "home", displayName: "Ava" }) : snap({ memberIds: ["u1"] }));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "u1", email: "a@x" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"member"'));
    isDeletedUid.mockImplementation((uid: string) => uid === "someone-else");
    const ev = (oldValue: string[] | null, newValue: string[]) =>
      new StorageEvent("storage", { key: "safebite.deletedUids", oldValue: oldValue && JSON.stringify(oldValue), newValue: JSON.stringify(newValue) });
    window.dispatchEvent(ev(null, ["someone-else"]));
    await new Promise((r) => setTimeout(r, 0));
    expect(resetDocument).not.toHaveBeenCalled();
    isDeletedUid.mockImplementation((uid: string) => uid === "u1");
    window.dispatchEvent(ev(["someone-else"], ["u1", "someone-else"]));
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
  });

  it("an unrelated record write that already contained the current uid does not reset", async () => {
    getDocMock.mockImplementation(async (path: string) =>
      path === "users/u1" ? snap({ householdId: "home", displayName: "Ava" }) : snap({ memberIds: ["u1"] }));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "u1", email: "a@x" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"member"'));
    isDeletedUid.mockImplementation((uid: string) => uid === "u1");
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.deletedUids", oldValue: JSON.stringify(["u1"]), newValue: JSON.stringify(["other", "u1"]) }));
    await new Promise((r) => setTimeout(r, 0));
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("a notice for another account is discarded even when the membership lookup fails", async () => {
    getDocMock.mockRejectedValue(new Error("offline"));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "u3", email: "c@x" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"error"'));
    expect(discardDeletedNoticeUnlessFor).toHaveBeenCalledWith("u3");
  });

  it("signing in as a recorded deleted uid forgets it and re-resolves, when it is the current user", async () => {
    getDocMock.mockImplementation(async (path: string) =>
      path === "users/u1" ? snap({ householdId: "home", displayName: "Ava" }) : snap({ memberIds: ["u1"] }));
    isDeletedUid.mockImplementation((uid: string) => uid === "u1");
    let signIn!: (e: string, p: string) => Promise<void>;
    function Grab() { signIn = useAuth().signIn; return null; }
    render(<AuthProvider><Probe /><Grab /></AuthProvider>);
    const user = { uid: "u1", email: "a@x" };
    listeners[0](user);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"deletedSession"'));
    forgetDeletedUid.mockImplementation(() => { isDeletedUid.mockImplementation(() => false); });
    signInMock.mockResolvedValue({ user });
    await signIn("a@x", "pw");
    expect(forgetDeletedUid).toHaveBeenCalledWith("u1");
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"member"'));
  });

  it("signing in as a deleted uid that is not this document's current user only forgets it", async () => {
    isDeletedUid.mockImplementation((uid: string) => uid === "u9");
    let signIn!: (e: string, p: string) => Promise<void>;
    function Grab() { signIn = useAuth().signIn; return null; }
    render(<AuthProvider><Probe /><Grab /></AuthProvider>);
    listeners[0](null);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"signedOut"'));
    signInMock.mockResolvedValue({ user: { uid: "u9", email: "z@x" } });
    await signIn("z@x", "pw");
    expect(forgetDeletedUid).toHaveBeenCalledWith("u9");
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it("resolving any account discards a notice flag that names a different account", async () => {
    getDocMock.mockImplementation(async (path: string) =>
      path === "users/u2" ? snap({ householdId: "home", displayName: "B" }) : snap({ memberIds: ["u2"] }));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "u2", email: "b@x" });
    await waitFor(() => expect(discardDeletedNoticeUnlessFor).toHaveBeenCalledWith("u2"));
  });
});

const unavailable = () => Object.assign(new Error("unavailable"), { code: "unavailable" });
const AVA = { uid: "ava-uid", email: "ava@safebite.test" };

async function seedCopy(householdId = "home", checkedAt = Date.now()) {
  await setOptIn("ava-uid", true);
  await replaceCopy({ uid: "ava-uid", householdId, displayName: "Ava" }, await readToken(), { restaurants: [], claims: {}, collection: {}, notes: {} }, checkedAt);
}

function memberDocs() {
  getDocMock.mockImplementation(async (path: string) => {
    if (path === "users/ava-uid") return snap({ householdId: "home", displayName: "Ava" });
    if (path === "households/home") return snap({ name: "Home", memberIds: ["ava-uid"] });
    return snap(undefined);
  });
}

function stateText() {
  return screen.getByTestId("state").textContent ?? "";
}

describe("AuthProvider offline (spec §3.9)", () => {
  it("no answer with a usable copy opens offlineMember from the copy", async () => {
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    expect(stateText()).toContain('"householdId":"home"');
    expect(stateText()).toContain('"displayName":"Ava"');
    expect(getCopySession()).toEqual({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
  });

  it("no answer with a copy past 30 days says it needs a connection", async () => {
    await seedCopy("home", Date.now() - COPY_MAX_AGE_MS - 1000);
    getDocMock.mockRejectedValue(unavailable());
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain(EXPIRED_MESSAGE));
  });

  it("no answer with another account's copy is the plain membership error", async () => {
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "bogdan-uid", email: "bogdan@safebite.test" });
    await waitFor(() => expect(stateText()).toContain(NO_ANSWER_MESSAGE));
  });

  it("a member answer renews the 30-day window", async () => {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await seedCopy("home", old);
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    await waitFor(async () => expect((await readMeta())!.membershipCheckedAt).toBeGreaterThan(old));
  });

  it("a member of a different household loses the old copy and is told (ruling 8)", async () => {
    await seedCopy("old-home");
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"householdChanged":true'));
    await expect(readMeta()).resolves.toBeNull();
  });

  it("a confirmed loss of access wipes the device before showing the screen", async () => {
    getDocMock.mockImplementation(async () => snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"notMember"'));
    expect(clearDeviceData).toHaveBeenCalledTimes(1);
  });

  it("a late member answer after the timeout switches offlineMember to member in place (review P3-7)", async () => {
    t.timeout = 50;
    await seedCopy();
    const slow = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => (path === "users/ava-uid" ? slow.promise : Promise.resolve(snap({ name: "Home", memberIds: ["ava-uid"] }))));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    slow.resolve(snap({ householdId: "home", displayName: "Ava" }));
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("a late not-a-member answer wipes the copy and resets an offline session", async () => {
    t.timeout = 50;
    await seedCopy();
    const slow = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => (path === "users/ava-uid" ? slow.promise : Promise.resolve(snap(undefined))));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    slow.resolve(snap(undefined));
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    expect(clearDeviceData).toHaveBeenCalled();
  });

  it("in offlineMember, the online event re-checks membership quietly", async () => {
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    memberDocs();
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
  });

  it("a listener denial while member re-reads membership once (review R2-4)", async () => {
    memberDocs();
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    getDocMock.mockReset();
    getDocMock.mockImplementation(async () => snap(undefined));
    reportDenied();
    reportDenied();
    await waitFor(() => expect(stateText()).toContain('"notMember"'));
    expect(getDocMock.mock.calls.filter(([p]) => p === "users/ava-uid")).toHaveLength(1);
    expect(clearDeviceData).toHaveBeenCalled();
  });

  // Controller ruling 2: at most one read per denial episode, even while that read is slow.
  it("further denials during a slow denial read add no reads; a later denial starts a new episode", async () => {
    memberDocs();
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    const slow = deferred<ReturnType<typeof snap>>();
    getDocMock.mockReset();
    getDocMock.mockImplementation((path: string) => (path === "users/ava-uid" ? slow.promise : Promise.resolve(snap({ name: "Home", memberIds: ["ava-uid"] }))));
    const userReads = () => getDocMock.mock.calls.filter(([p]) => p === "users/ava-uid").length;
    reportDenied();
    await new Promise((r) => setTimeout(r, 10));
    reportDenied();
    reportDenied();
    expect(userReads()).toBe(1);
    slow.resolve(snap({ householdId: "home", displayName: "Ava" }));
    await waitFor(() => expect(getDocMock.mock.calls.filter(([p]) => p === "households/home")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(stateText()).toContain('"status":"member"');
    memberDocs();
    reportDenied();
    await waitFor(() => expect(userReads()).toBe(2));
    expect(clearDeviceData).not.toHaveBeenCalled();
  });

  it("a denial outside a member session is ignored", async () => {
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    const before = getDocMock.mock.calls.length;
    reportDenied();
    await new Promise((r) => setTimeout(r, 10));
    expect(getDocMock.mock.calls.length).toBe(before);
  });

  // Found by the browser suite: a denial during a deletion ran a second wipe whose pending-clear
  // key a reload could orphan, leaving tabs on "Some data on this device couldn't be cleared."
  it("a denial during this tab's own account deletion is left to the deletion flow", async () => {
    memberDocs();
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    sessionStorage.setItem("safebite.deletionRequest", JSON.stringify({ requestId: "r1", uid: "ava-uid" }));
    const before = getDocMock.mock.calls.length;
    reportDenied();
    await new Promise((r) => setTimeout(r, 10));
    expect(getDocMock.mock.calls.length).toBe(before);
    expect(stateText()).toContain('"status":"member"');
  });

  it("a denial for an account already recorded as deleted is left to the reset", async () => {
    memberDocs();
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    isDeletedUid.mockImplementation((uid: string) => uid === "ava-uid");
    const before = getDocMock.mock.calls.length;
    reportDenied();
    await new Promise((r) => setTimeout(r, 10));
    expect(getDocMock.mock.calls.length).toBe(before);
    expect(stateText()).toContain('"status":"member"');
  });

  it("an account change waits for a loss-of-access wipe still running before it resets", async () => {
    memberDocs();
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    const slowWipe = deferred<{ failed: string[] }>();
    clearDeviceData.mockReturnValueOnce(slowWipe.promise);
    getDocMock.mockImplementation(async () => snap(undefined));
    reportDenied();
    await waitFor(() => expect(clearDeviceData).toHaveBeenCalledTimes(1));
    listeners[0](null);
    await waitFor(() => expect(clearDeviceData).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(resetDocument).not.toHaveBeenCalled();
    slowWipe.resolve({ failed: [] });
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
  });

  // Controller ruling 3: `first` rejects on an unclassified read error.
  it("an unclassified read error at start-up is today's error screen", async () => {
    getDocMock.mockRejectedValue(Object.assign(new Error("boom"), { code: "internal" }));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain(NO_ANSWER_MESSAGE));
    expect(stateText()).toContain('"status":"error"');
  });

  it("an unclassified read error during a quiet retry keeps offlineMember", async () => {
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    (authMock as { currentUser?: unknown }).currentUser = AVA;
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    getDocMock.mockReset();
    getDocMock.mockRejectedValue(Object.assign(new Error("boom"), { code: "internal" }));
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(getDocMock).toHaveBeenCalled(), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 20));
    expect(stateText()).toContain('"status":"offlineMember"');
  });
});

describe("early opening (spec §3.9 ruling 7)", () => {
  const candidate = { uid: "ava-uid", householdId: "home", displayName: "Ava", downloadedAt: 123 };

  it("opens a provisional offlineMember when Auth has not answered in time", async () => {
    early.candidate = candidate;
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"status":"offlineMember"'));
    expect(stateText()).toContain('"provisional":true');
    expect(getCopySession()).toEqual({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
  });

  it("the same user from Auth reconciles in place: no reset, no loading flash", async () => {
    early.candidate = candidate;
    await seedCopy();
    getDocMock.mockRejectedValue(unavailable());
    const seen: string[] = [];
    function Recorder() {
      const { state } = useAuth();
      seen.push(state.status);
      return null;
    }
    render(<AuthProvider><Probe /><Recorder /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"provisional":true'));
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).not.toContain("provisional"));
    expect(stateText()).toContain('"status":"offlineMember"');
    expect(seen.slice(seen.indexOf("offlineMember"))).not.toContain("loading");
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("Auth answering with no user, or another user, is an account change: clear and reset", async () => {
    early.candidate = candidate;
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"provisional":true'));
    listeners[0](null);
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    expect(clearDeviceData).toHaveBeenCalled();
  });

  it("never opens early once Auth has answered", async () => {
    early.candidate = candidate;
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    await new Promise((r) => setTimeout(r, 60));
    expect(stateText()).toContain('"status":"member"');
  });

  it("another user from Auth is an account change too", async () => {
    early.candidate = candidate;
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"provisional":true'));
    listeners[0]({ uid: "bogdan-uid", email: "b@safebite.test" });
    await waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    expect(clearDeviceData).toHaveBeenCalled();
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it("the same user confirmed as a member becomes member in place", async () => {
    early.candidate = candidate;
    await seedCopy();
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"provisional":true'));
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    expect(getCopySession()).toEqual({ uid: "ava-uid", householdId: "home", mode: "member" });
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("an unclassified read error after a provisional opening is today's error screen, not a lasting provisional copy", async () => {
    early.candidate = candidate;
    getDocMock.mockRejectedValue(Object.assign(new Error("boom"), { code: "internal" }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(stateText()).toContain('"provisional":true'));
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"error"'));
    expect(stateText()).toContain(NO_ANSWER_MESSAGE);
    expect(getCopySession()).toBeNull();
  });
});

describe("refresh start (spec §3.9 Refresh step 4)", () => {
  it("an opted-out member starts no refresh", async () => {
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(stateText()).toContain('"status":"member"'));
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh.requestFull).not.toHaveBeenCalled();
  });

  it("starts a full refresh, and a successful write requests a partial one", async () => {
    await setOptIn("ava-uid", true);
    memberDocs();
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](AVA);
    await waitFor(() => expect(refresh.requestFull).toHaveBeenCalledWith({ uid: "ava-uid", householdId: "home", displayName: "Ava" }));
    await observed("home", "r1", Promise.resolve({ kind: "ok" as const, value: undefined }));
    await waitFor(() => expect(refresh.requestPartial).toHaveBeenCalledWith({ uid: "ava-uid", householdId: "home", displayName: "Ava" }, "r1"));
  });
});
