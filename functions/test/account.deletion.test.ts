import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type CollectionReference, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { runDeletion, type DeletionDeps, type HookPoint } from "../src/account/deletion";
import { checkReceipt, startReceipt } from "../src/account/receipts";
import { createEmulatorUser, ensureAdminApp, recursiveDeleteFresh } from "./emulator-helpers";

let db: Firestore;
const H = "households/home";
const T0 = Timestamp.fromDate(new Date("2026-09-01T10:00:00Z"));
const PW = "pilot-password-1";

const rd = (ref: DocumentReference | CollectionReference) => recursiveDeleteFresh(db, ref);

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

  it("anonymises a restaurant with 600 claims in many small chunks, each below the 500-write limit (Review Focus 2, final review F3)", async () => {
    const batch = db.bulkWriter();
    for (let i = 0; i < 600; i++) {
      void batch.set(db.doc(`${H}/restaurants/r1/claims/bulk${i}`), { kind: "gfMenu", value: "yes", detail: "d", source: { type: "ownVisit", label: "v" }, checkedAt: T0, createdAt: T0, authorUid: "ava-uid", authorName: "Ava" });
    }
    await batch.close();
    // The emulator commits a 600-write transaction (probed 2026-10-02), so a run that ignored the
    // chunk would still pass on outcome alone; counting transactions proves 60+ pages of 10.
    const spy = vi.spyOn(db, "runTransaction");
    try {
      await runDeletion(deps({ chunk: 10 }), "ava-uid", "rcpt");
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(60);
    } finally {
      spy.mockRestore();
    }
    const left = await db.collection(`${H}/restaurants/r1/claims`).where("authorUid", "==", "ava-uid").get();
    expect(left.size).toBe(0);
    const marked = await db.collection(`${H}/restaurants/r1/claims`).where("authorUid", "==", "former-member").get();
    expect(marked.size).toBe(601);
  });

  it("anonymises a collection document whose restaurant no longer exists (final review F2)", async () => {
    await db.doc(`${H}/collection/rX`).set({ shortlisted: false, visited: true, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: T0, version: 4 });
    await db.doc(`${H}/collection/rY`).set({ shortlisted: false, visited: true, updatedBy: "bogdan-uid", updatedByName: "Bogdan", updatedAt: T0, version: 4 });
    await runDeletion(deps(), "ava-uid", "rcpt");
    expect(await exists(`${H}/restaurants/rX`)).toBe(false);
    expect(await get(`${H}/collection/rX`)).toMatchObject({ updatedBy: "former-member", updatedByName: "Former member", version: 4, updatedAt: T0 });
    expect(await get(`${H}/collection/rY`)).toMatchObject({ updatedBy: "bogdan-uid", updatedByName: "Bogdan", version: 4 });
    await expectAvaGoneNonLast();
  });
});

describe("runDeletion — large households (final review F1)", () => {
  it("anonymises a 300-restaurant household within 30 s, touching only the departing member's records", async () => {
    const touched = [7, 61, 150, 222, 299];
    const w = db.bulkWriter();
    const base = { address: "1 Street", createdAt: T0, updatedAt: T0, version: 3, deleting: false };
    const claim = { kind: "gfMenu", value: "yes", detail: "Menu", source: { type: "ownVisit", label: "Visit" }, checkedAt: T0, createdAt: T0 };
    for (let i = 0; i < 300; i++) {
      const r = `${H}/restaurants/big${i}`;
      const mine = touched.includes(i);
      void w.set(db.doc(r), { name: `Big ${i}`, createdBy: mine ? "ava-uid" : "bogdan-uid", ...base });
      void w.set(db.doc(`${r}/claims/b`), { ...claim, authorUid: "bogdan-uid", authorName: "Bogdan" });
      void w.set(db.doc(`${H}/collection/big${i}`), { shortlisted: true, visited: false, updatedBy: mine ? "ava-uid" : "bogdan-uid", updatedByName: mine ? "Ava" : "Bogdan", updatedAt: T0, version: 2 });
      if (mine) {
        void w.set(db.doc(`${r}/claims/a`), { ...claim, authorUid: "ava-uid", authorName: "Ava" });
        void w.set(db.doc(`${r}/notes/a`), { createdAt: T0, updatedAt: T0, version: 1, text: "Ava's note", authorUid: "ava-uid", authorName: "Ava" });
      }
    }
    await w.close();

    const started = performance.now();
    await expect(runDeletion(deps(), "ava-uid", "rcpt")).resolves.toEqual({ lastMember: false });
    const elapsed = Math.round(performance.now() - started);
    console.info(`[F1] 300-restaurant deletion took ${elapsed} ms`);

    await expectAvaGoneNonLast();
    for (const i of touched) {
      const r = `${H}/restaurants/big${i}`;
      expect(await get(r)).toMatchObject({ createdBy: "former-member", version: 3, updatedAt: T0 });
      expect(await get(`${r}/claims/a`)).toMatchObject({ authorUid: "former-member", authorName: "Former member" });
      expect(await exists(`${r}/notes/a`)).toBe(false);
      expect(await get(`${H}/collection/big${i}`)).toMatchObject({ updatedBy: "former-member", updatedByName: "Former member", version: 2, updatedAt: T0 });
    }
    expect((await db.collectionGroup("claims").where("authorUid", "==", "ava-uid").get()).size).toBe(0);
    expect((await db.collectionGroup("notes").where("authorUid", "==", "ava-uid").get()).size).toBe(0);
    expect((await db.collection(`${H}/restaurants`).where("createdBy", "==", "ava-uid").get()).size).toBe(0);
    expect((await db.collection(`${H}/collection`).where("updatedBy", "==", "ava-uid").get()).size).toBe(0);
    expect((await db.collectionGroup("claims").where("authorUid", "==", "bogdan-uid").get()).size).toBe(301);
    expect((await get(`${H}/restaurants/big8`))).toMatchObject({ createdBy: "bogdan-uid" });
    expect(elapsed).toBeLessThan(30_000);
  }, 180_000);
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

describe("runDeletion — receipts always reconcile (implementation audit P2-2)", () => {
  const crashAfterAuth = async (p: HookPoint) => { if (p === "step6:afterAuth") throw new Error("injected crash after Auth deletion"); };

  it("member path: crash after Auth deletion, before complete → checkReceipt completes it", async () => {
    await expect(runDeletion(deps({ hook: crashAfterAuth }), "ava-uid", "rcpt")).rejects.toThrow("after Auth deletion");
    expect(await authExists("ava-uid")).toBe(false);
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("dataDeleted");
    expect(await checkReceipt(db, getAuth(), "rcpt", Date.now())).toBe("complete");
  });

  // Auth-only fixtures are real states (auditor re-review): a never-provisioned account, and a real
  // deletion interrupted after step 5. Never strip membership by hand while contributions remain.
  it("Auth-only path, never-provisioned account: dataDeleted before Auth deletion; a crash after it still completes", async () => {
    await createEmulatorUser("lone-uid", "lone@safebite.test", PW);
    await startReceipt(db, "rcpt-lone", "lone-uid", Date.now());
    await expect(runDeletion(deps({ hook: crashAfterAuth }), "lone-uid", "rcpt-lone")).rejects.toThrow("after Auth deletion");
    expect((await get("accountDeletionReceipts/rcpt-lone"))?.status).toBe("dataDeleted");
    expect(await checkReceipt(db, getAuth(), "rcpt-lone", Date.now())).toBe("complete");
  });

  it("Auth-only path after a real deletion interrupted after step 5: the retry and the original receipt both complete", async () => {
    await expect(runDeletion(deps({ hook: crashBefore("step6") }), "ava-uid", "rcpt")).rejects.toThrow();
    expect(await exists("accountDeletions/ava-uid")).toBe(false);
    expect(await exists("users/ava-uid")).toBe(false);
    await startReceipt(db, "rcpt-retry", "ava-uid", Date.now());
    await expect(runDeletion(deps({ hook: crashAfterAuth }), "ava-uid", "rcpt-retry")).rejects.toThrow("after Auth deletion");
    expect((await get("accountDeletionReceipts/rcpt-retry"))?.status).toBe("dataDeleted");
    expect(await checkReceipt(db, getAuth(), "rcpt-retry", Date.now())).toBe("complete");
    expect(await checkReceipt(db, getAuth(), "rcpt", Date.now())).toBe("complete");
    await expectAvaGoneNonLast();
  });

  it("an older request interrupted mid-deletion reconciles once a newer request finishes", async () => {
    await expect(runDeletion(deps({ hook: crashBefore("step3") }), "ava-uid", "rcpt")).rejects.toThrow();
    await startReceipt(db, "rcpt-new", "ava-uid", Date.now());
    await runDeletion(deps(), "ava-uid", "rcpt-new");
    expect((await get("accountDeletionReceipts/rcpt"))?.status).toBe("started");
    expect(await checkReceipt(db, getAuth(), "rcpt", Date.now())).toBe("complete");
    expect(await checkReceipt(db, getAuth(), "rcpt-new", Date.now())).toBe("complete");
  });
});
