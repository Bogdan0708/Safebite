import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type CollectionReference, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { runDeletion, type DeletionDeps, type HookPoint } from "../src/account/deletion";
import { startReceipt } from "../src/account/receipts";
import { createEmulatorUser, ensureAdminApp } from "./emulator-helpers";

let db: Firestore;
const H = "households/home";
const T0 = Timestamp.fromDate(new Date("2026-09-01T10:00:00Z"));
const PW = "pilot-password-1";

/**
 * recursiveDelete with a fresh BulkWriter. The default one is shared per Firestore instance and
 * keeps a rate-limiter clock; a host clock that steps backwards (WSL does, about 1.8 s every
 * 30 s) makes it throw "Request time should not be before the last token refill time" and
 * wedges every later recursiveDelete in the process.
 */
const rd = (ref: DocumentReference | CollectionReference) => db.recursiveDelete(ref, db.bulkWriter());

function deps(over: Partial<DeletionDeps> = {}): DeletionDeps {
  return { db, auth: getAuth(), deleteTree: (ref: DocumentReference) => rd(ref), now: () => Date.now(), ...over };
}

/** A hook that throws once at `point`, simulating a crash before that step. */
function crashBefore(point: HookPoint) {
  let fired = false;
  return async (p: HookPoint) => {
    if (p === point && !fired) { fired = true; throw new Error(`injected crash before ${point}`); }
  };
}

const get = async (path: string) => (await db.doc(path).get()).data();
const exists = async (path: string) => (await db.doc(path).get()).exists;
const authExists = async (uid: string) => getAuth().getUser(uid).then(() => true, () => false);

async function seedHousehold(memberIds: string[]) {
  await rd(db.collection("households"));
  await rd(db.collection("users"));
  await rd(db.collection("accountDeletions"));
  await rd(db.collection("accountDeletionReceipts"));
  await db.doc(H).set({ name: "Home", memberIds, createdAt: T0 });
  await db.doc("users/ava-uid").set({ householdId: "home", displayName: "Ava" });
  await db.doc("users/bogdan-uid").set({ householdId: "home", displayName: "Bogdan" });
  await createEmulatorUser("ava-uid", "ava@safebite.test", PW);
  await createEmulatorUser("bogdan-uid", "bogdan@safebite.test", PW);
  const base = { address: "1 Street", createdAt: T0, updatedAt: T0, version: 3, deleting: false };
  await db.doc(`${H}/restaurants/r1`).set({ name: "R1", createdBy: "ava-uid", ...base });
  await db.doc(`${H}/restaurants/r2`).set({ name: "R2", createdBy: "bogdan-uid", ...base });
  const claim = { kind: "gfMenu", value: "yes", detail: "Menu", source: { type: "ownVisit", label: "Visit" }, checkedAt: T0, createdAt: T0 };
  await db.doc(`${H}/restaurants/r1/claims/c1`).set({ ...claim, authorUid: "ava-uid", authorName: "Ava" });
  await db.doc(`${H}/restaurants/r1/claims/c2`).set({ ...claim, authorUid: "bogdan-uid", authorName: "Bogdan" });
  const note = { createdAt: T0, updatedAt: T0, version: 1 };
  await db.doc(`${H}/restaurants/r1/notes/n1`).set({ ...note, text: "Ava's note", authorUid: "ava-uid", authorName: "Ava" });
  await db.doc(`${H}/restaurants/r1/notes/n2`).set({ ...note, text: "Bogdan's note", authorUid: "bogdan-uid", authorName: "Bogdan" });
  await db.doc(`${H}/collection/r1`).set({ shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: T0, version: 2 });
  await db.doc(`${H}/usage/20261001`).set({ searches: 4 });
}

/** Everything a deletion of Ava (non-last) must leave behind. */
async function expectAvaGoneNonLast() {
  expect(await get(`${H}/restaurants/r1`)).toMatchObject({ createdBy: "former-member", version: 3, updatedAt: T0 });
  expect(await get(`${H}/restaurants/r2`)).toMatchObject({ createdBy: "bogdan-uid", version: 3 });
  expect(await get(`${H}/restaurants/r1/claims/c1`)).toMatchObject({ authorUid: "former-member", authorName: "Former member" });
  expect(await get(`${H}/restaurants/r1/claims/c2`)).toMatchObject({ authorUid: "bogdan-uid", authorName: "Bogdan" });
  expect(await exists(`${H}/restaurants/r1/notes/n1`)).toBe(false);
  expect(await get(`${H}/restaurants/r1/notes/n2`)).toMatchObject({ text: "Bogdan's note" });
  expect(await get(`${H}/collection/r1`)).toMatchObject({ updatedBy: "former-member", updatedByName: "Former member", version: 2, updatedAt: T0 });
  expect((await get(H))?.memberIds).toEqual(["bogdan-uid"]);
  expect(await exists("users/ava-uid")).toBe(false);
  expect(await exists("accountDeletions/ava-uid")).toBe(false);
  expect(await authExists("ava-uid")).toBe(false);
  expect(await authExists("bogdan-uid")).toBe(true);
  expect(await exists(`${H}/usage/20261001`)).toBe(true);
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run emu:test`.");
  ensureAdminApp();
  db = getFirestore();
});

beforeEach(async () => {
  await seedHousehold(["ava-uid", "bogdan-uid"]);
  await startReceipt(db, "rcpt", "ava-uid", Date.now());
});

describe("runDeletion — clean runs", () => {
  it("a non-last member: anonymised evidence, notes deleted, membership and account gone", async () => {
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: false });
    await expectAvaGoneNonLast();
    expect(await get("accountDeletionReceipts/rcpt")).toMatchObject({ status: "complete" });
    expect(await get("accountDeletionReceipts/rcpt")).not.toHaveProperty("uid");
  });

  it("the last member: the whole household tree is gone, usage included", async () => {
    await seedHousehold(["ava-uid"]);
    await startReceipt(db, "rcpt", "ava-uid", Date.now());
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: true });
    expect(await exists(H)).toBe(false);
    expect((await db.collection(`${H}/restaurants`).get()).size).toBe(0);
    expect((await db.collection(`${H}/usage`).get()).size).toBe(0);
    expect((await db.collection(`${H}/collection`).get()).size).toBe(0);
    expect(await authExists("ava-uid")).toBe(false);
  });

  it("refuses a users document whose uid is not in memberIds (admin-removed)", async () => {
    await db.doc(H).update({ memberIds: ["bogdan-uid"] });
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).rejects.toMatchObject({ code: "permission-denied" });
    expect(await exists("accountDeletions/ava-uid")).toBe(false);
    expect(await authExists("ava-uid")).toBe(true);
  });

  it("an Auth account with no users document and no record only deletes the Auth account", async () => {
    await db.doc("users/ava-uid").delete();
    await db.doc(H).update({ memberIds: ["bogdan-uid"] });
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: false });
    expect(await authExists("ava-uid")).toBe(false);
    expect(await get(`${H}/restaurants/r1/claims/c1`)).toMatchObject({ authorUid: "ava-uid" }); // untouched
  });

  it("anonymises a restaurant with 450 claims in chunks below the 500-write limit (Review Focus 2)", async () => {
    const batch = db.bulkWriter();
    for (let i = 0; i < 450; i++) {
      void batch.set(db.doc(`${H}/restaurants/r1/claims/bulk${i}`), { kind: "gfMenu", value: "yes", detail: "d", source: { type: "ownVisit", label: "v" }, checkedAt: T0, createdAt: T0, authorUid: "ava-uid", authorName: "Ava" });
    }
    await batch.close();
    await runDeletion(deps(), "ava-uid", "rcpt");
    const left = await db.collection(`${H}/restaurants/r1/claims`).where("authorUid", "==", "ava-uid").get();
    expect(left.size).toBe(0);
  });
});

describe("runDeletion — failure injection (review P1-1, P1-2)", () => {
  it.each(["step2", "step3", "step4", "step5", "step6"] as const)("a crash before %s never reports success early, and a retry converges", async (point) => {
    await expect(runDeletion(deps({ hook: crashBefore(point) }), "ava-uid", "rcpt")).rejects.toThrow(`injected crash before ${point}`);
    expect((await get("accountDeletionReceipts/rcpt"))?.status).not.toBe("complete");
    expect(await authExists("ava-uid")).toBe(true);
    if (point !== "step6") expect(await exists("accountDeletions/ava-uid")).toBe(true);
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: false });
    await expectAvaGoneNonLast();
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("complete");
  });

  it("before step 6 the receipt says dataDeleted", async () => {
    await expect(runDeletion(deps({ hook: crashBefore("step6") }), "ava-uid", "rcpt")).rejects.toThrow();
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("dataDeleted");
  });

  it("a tree deletion that removes the household document and then fails is retried in full", async () => {
    await seedHousehold(["ava-uid"]);
    await startReceipt(db, "rcpt", "ava-uid", Date.now());
    const failing = async (ref: DocumentReference) => { await ref.delete(); throw new Error("injected tree failure"); };
    await expect(runDeletion(deps({ deleteTree: failing }), "ava-uid", "rcpt")).rejects.toThrow("injected tree failure");
    expect(await exists(H)).toBe(false);
    expect((await get("accountDeletions/ava-uid"))?.step3At).toBeUndefined();
    expect((await db.collection(`${H}/restaurants`).get()).size).toBe(2); // descendants remain
    expect(await authExists("ava-uid")).toBe(true);
    await runDeletion(deps(), "ava-uid", "rcpt");
    expect((await db.collection(`${H}/restaurants`).get()).size).toBe(0);
    expect((await db.collection(`${H}/usage`).get()).size).toBe(0);
    expect(await authExists("ava-uid")).toBe(false);
  });
});

describe("runDeletion — interleavings (review P2-4)", () => {
  it("two calls from the same uid: the late one cannot recreate the record", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const paused = runDeletion(deps({ hook: async (p) => { if (p === "step1") await gate; } }), "ava-uid", "rcpt-b");
    await startReceipt(db, "rcpt-b", "ava-uid", Date.now());
    await runDeletion(deps(), "ava-uid", "rcpt");
    release();
    await expect(paused).resolves.toEqual({ lastMember: false });
    expect(await exists("accountDeletions/ava-uid")).toBe(false);
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("complete");
    expect((await get("accountDeletionReceipts/rcpt-b"))?.status).toBe("complete");
  });

  it.each(["step2", "step3", "step4"] as const)("a call paused before %s while another finishes still completes its own receipt", async (point) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await startReceipt(db, "rcpt-b", "ava-uid", Date.now());
    let reached!: () => void;
    const at = new Promise<void>((r) => (reached = r));
    const paused = runDeletion(deps({ hook: async (p) => { if (p === point) { reached(); await gate; } } }), "ava-uid", "rcpt-b");
    await at;
    await runDeletion(deps(), "ava-uid", "rcpt");
    release();
    await expect(paused).resolves.toMatchObject({});
    expect(await exists("accountDeletions/ava-uid")).toBe(false);
    expect((await get("accountDeletionReceipts/rcpt-b"))?.status).toBe("complete");
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("complete");
    await expectAvaGoneNonLast();
  });

  it("collection attribution changed by the other member mid-deletion is not overwritten", async () => {
    let edited = false;
    const hook = async (p: HookPoint) => {
      if (p === "step3:restaurant" && !edited) {
        edited = true;
        await db.doc(`${H}/collection/r1`).update({ updatedBy: "bogdan-uid", updatedByName: "Bogdan", version: 3 });
      }
    };
    await runDeletion(deps({ hook }), "ava-uid", "rcpt");
    expect(await get(`${H}/collection/r1`)).toMatchObject({ updatedBy: "bogdan-uid", updatedByName: "Bogdan", version: 3 });
  });

  it("two members deleting at once both finish, and exactly one is the last member", async () => {
    await startReceipt(db, "rcpt-bogdan", "bogdan-uid", Date.now());
    const [a, b] = await Promise.all([runDeletion(deps(), "ava-uid", "rcpt"), runDeletion(deps(), "bogdan-uid", "rcpt-bogdan")]);
    expect([a.lastMember, b.lastMember].filter(Boolean)).toHaveLength(1);
    expect(await exists(H)).toBe(false);
    expect((await db.collection(`${H}/restaurants`).get()).size).toBe(0);
    expect(await authExists("ava-uid")).toBe(false);
    expect(await authExists("bogdan-uid")).toBe(false);
  });
});
