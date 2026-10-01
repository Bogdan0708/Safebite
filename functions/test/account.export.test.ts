import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { readExport } from "../src/account/exportData";
import { ensureAdminApp } from "./emulator-helpers";

let db: Firestore;
const H = "households/exp";
const NOW = new Date("2026-10-01T16:20:00Z");
const day = (d: string) => Timestamp.fromDate(new Date(`${d}T00:00:00Z`));
const at = (iso: string) => Timestamp.fromDate(new Date(iso));
const FORBIDDEN_KEYS = ["uid", "authorUid", "updatedBy", "createdBy", "email", "version", "deleting", "cleanupDone", "householdId", "memberIds"];

function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); allKeys(v, into); }
  return into;
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run emu:test`.");
  ensureAdminApp();
  db = getFirestore();
});

beforeEach(async () => {
  const w = db.bulkWriter(); try { await db.recursiveDelete(db.doc(H), w); } finally { await w.close(); }
  await db.doc(H).set({ name: "Export Home", memberIds: ["x-ava", "x-bogdan"], createdAt: NOW });
  await db.doc("users/x-ava").set({ householdId: "exp", displayName: "Ava" });
  await db.doc("users/x-bogdan").set({ householdId: "exp", displayName: "Bogdan" });
  await db.doc("users/x-stranger").set({ householdId: "elsewhere", displayName: "Stranger" });
  const base = { address: "1 Rua", createdAt: at("2026-09-01T10:00:00Z"), updatedAt: at("2026-09-02T10:00:00Z"), version: 2, deleting: false };
  await db.doc(`${H}/restaurants/r1`).set({ name: "Casa", phone: "+351 1", googlePlaceId: "gp1", createdBy: "former-member", ...base });
  await db.doc(`${H}/restaurants/r2`).set({ name: "Gone", createdBy: "x-ava", ...base, deleting: true });
  await db.doc(`${H}/restaurants/r1/claims/c1`).set({ kind: "separateFryer", value: "yes", detail: "Asked", source: { type: "restaurantStatement", label: "Phone", url: "https://casa.example" }, checkedAt: day("2026-04-01"), authorUid: "former-member", authorName: "Former member", createdAt: at("2026-04-01T09:00:00Z") });
  await db.doc(`${H}/restaurants/r1/claims/c2`).set({ kind: "gfMenu", value: "partial", detail: "Some", source: { type: "ownVisit", label: "Visit" }, checkedAt: day("2026-05-01"), expiresAt: day("2027-05-01"), authorUid: "x-bogdan", authorName: "Bogdan", createdAt: at("2026-05-01T09:00:00Z") });
  await db.doc(`${H}/restaurants/r1/notes/n1`).set({ text: "Lovely", authorUid: "x-ava", authorName: "Ava", createdAt: at("2026-05-03T19:00:00Z"), updatedAt: at("2026-05-03T19:00:00Z"), version: 1 });
  await db.doc(`${H}/collection/r1`).set({ shortlisted: true, visited: true, visitedOn: day("2026-05-03"), updatedBy: "x-bogdan", updatedByName: "Bogdan", updatedAt: at("2026-05-04T08:00:00Z"), version: 3 });
  await db.doc(`${H}/usage/20261001`).set({ searches: 2 });
});

describe("readExport", () => {
  it("produces the spec's shape, with names, calendar days and instants", async () => {
    const out = await readExport(db, "x-ava", NOW);
    expect(out).toEqual({
      format: "safebite-export", formatVersion: 1, exportedAt: "2026-10-01T16:20:00.000Z", exportedBy: "Ava",
      household: { name: "Export Home" },
      restaurants: [{
        name: "Casa", address: "1 Rua", phone: "+351 1", googlePlaceId: "gp1",
        createdByName: "Former member", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-02T10:00:00.000Z",
        shortlisted: true, visited: true, visitedOn: "2026-05-03", listUpdatedByName: "Bogdan", listUpdatedAt: "2026-05-04T08:00:00.000Z",
        evidence: [
          { kind: "separateFryer", value: "yes", detail: "Asked", source: { type: "restaurantStatement", label: "Phone", url: "https://casa.example" }, checkedAt: "2026-04-01", expiresAt: null, authorName: "Former member", createdAt: "2026-04-01T09:00:00.000Z" },
          { kind: "gfMenu", value: "partial", detail: "Some", source: { type: "ownVisit", label: "Visit" }, checkedAt: "2026-05-01", expiresAt: "2027-05-01", authorName: "Bogdan", createdAt: "2026-05-01T09:00:00.000Z" },
        ],
        notes: [{ text: "Lovely", authorName: "Ava", createdAt: "2026-05-03T19:00:00.000Z", updatedAt: "2026-05-03T19:00:00.000Z" }],
      }],
    });
  });

  it("contains no identity or internal field anywhere", async () => {
    const keys = allKeys(await readExport(db, "x-ava", NOW));
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
  });

  it("a restaurant without a collection document exports shortlisted and visited as false", async () => {
    await db.doc(`${H}/collection/r1`).delete();
    const [r] = (await readExport(db, "x-ava", NOW)).restaurants;
    expect(r).toMatchObject({ shortlisted: false, visited: false });
    expect(r).not.toHaveProperty("listUpdatedByName");
    expect(r).not.toHaveProperty("visitedOn");
  });

  it("a creator who is no longer a member is shown as Former member", async () => {
    await db.doc(`${H}/restaurants/r1`).update({ createdBy: "x-departed" });
    expect((await readExport(db, "x-ava", NOW)).restaurants[0].createdByName).toBe("Former member");
  });

  it("refuses a non-member and a member removed from memberIds, checked inside the transaction", async () => {
    await expect(readExport(db, "x-stranger", NOW)).rejects.toMatchObject({ code: "permission-denied" });
    await db.doc(H).update({ memberIds: ["x-bogdan"] });
    await expect(readExport(db, "x-ava", NOW)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("refuses an export over the size limit rather than truncating it", async () => {
    await expect(readExport(db, "x-ava", NOW, 200)).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
