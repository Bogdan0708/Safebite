import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { checkReceipt, markReceipt, parseRequestId, receiptIdFor, startReceipt } from "../src/account/receipts";
import { createEmulatorUser, ensureAdminApp } from "./emulator-helpers";

const ID = "A".repeat(43);
const NOW = Date.parse("2026-10-01T12:00:00Z");
let db: Firestore;
const receipt = async (rid: string) => (await db.doc(`accountDeletionReceipts/${rid}`).get()).data();

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run emu:test`.");
  ensureAdminApp();
  db = getFirestore();
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("accountDeletionReceipts"));
});

describe("parseRequestId", () => {
  it("accepts exactly 43 base64url characters", () => {
    expect(parseRequestId({ requestId: "aZ09_-".padEnd(43, "x") })).toHaveLength(43);
  });
  it.each([undefined, null, [], {}, { requestId: 5 }, { requestId: "x".repeat(42) }, { requestId: "x".repeat(44) }, { requestId: "x".repeat(42) + "=" }, { requestId: "x".repeat(42) + "/" }])(
    "refuses %j", (data) => {
      expect(() => parseRequestId(data)).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    });
});

describe("receiptIdFor", () => {
  it("is a deterministic 64-character hex digest that does not contain the request id", () => {
    const rid = receiptIdFor(ID);
    expect(rid).toMatch(/^[0-9a-f]{64}$/);
    expect(receiptIdFor(ID)).toBe(rid);
    expect(rid).not.toContain(ID);
  });
});

describe("startReceipt", () => {
  it("creates a started receipt with the uid and a 7-day expiry", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    const r = await receipt("r1");
    expect(r).toMatchObject({ status: "started", uid: "ava-uid" });
    expect(r?.expireAt.toMillis()).toBe(NOW + 7 * 24 * 3600 * 1000);
  });
  it("a retry with the same request id and uid changes nothing (Review Focus 1)", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    await startReceipt(db, "r1", "ava-uid", NOW + 1000);
    expect(await receipt("r1")).toMatchObject({ status: "dataDeleted", uid: "ava-uid" });
  });
  it("refuses a request id already used by another uid, or already complete (Review Focus 1)", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    await expect(startReceipt(db, "r1", "bogdan-uid", NOW)).rejects.toMatchObject({ code: "invalid-argument" });
    await markReceipt(db, "r1", "complete", NOW);
    await expect(startReceipt(db, "r1", "ava-uid", NOW)).rejects.toMatchObject({ code: "invalid-argument" });
    expect((await receipt("r1"))?.status).toBe("complete");
  });
});

describe("markReceipt", () => {
  it("only moves forward, and removes the uid on complete", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    await markReceipt(db, "r1", "complete", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    const r = await receipt("r1");
    expect(r?.status).toBe("complete");
    expect(r).not.toHaveProperty("uid");
  });
  it("ignores a missing receipt rather than creating one", async () => {
    await markReceipt(db, "missing", "dataDeleted", NOW);
    expect(await receipt("missing")).toBeUndefined();
  });
});

describe("checkReceipt", () => {
  it("reports none for an unknown receipt", async () => {
    expect(await checkReceipt(db, getAuth(), "nope", NOW)).toBe("none");
  });
  it("reports started as is", async () => {
    await startReceipt(db, "r1", "ava-uid", NOW);
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("started");
  });
  it("dataDeleted with the Auth user still present stays dataDeleted", async () => {
    await createEmulatorUser("receipt-uid", "receipt@safebite.test", "pilot-password-1");
    await startReceipt(db, "r1", "receipt-uid", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("dataDeleted");
    expect((await receipt("r1"))?.uid).toBe("receipt-uid");
  });
  it("dataDeleted with the Auth user gone is completed and the uid removed", async () => {
    await createEmulatorUser("receipt-uid", "receipt@safebite.test", "pilot-password-1");
    await getAuth().deleteUser("receipt-uid");
    await startReceipt(db, "r1", "receipt-uid", NOW);
    await markReceipt(db, "r1", "dataDeleted", NOW);
    expect(await checkReceipt(db, getAuth(), "r1", NOW)).toBe("complete");
    const r = await receipt("r1");
    expect(r?.status).toBe("complete");
    expect(r).not.toHaveProperty("uid");
  });
});
