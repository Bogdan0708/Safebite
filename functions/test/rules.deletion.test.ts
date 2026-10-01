import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

/**
 * The deletion protocol against the real rules with mixed client versions (spec §3.7, audit F1).
 * `oldFinish` is the merged Plan 3 client's finishDeleting (blind claim sweep, blind restaurant
 * delete). `newFinish` mirrors web/src/records/repository.ts finishDeleting after Plan 4 (every
 * step reads before it deletes). Keep newFinish in step with the repository.
 */
const PROJECT_ID = "demo-safebite";
const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");
const R = "households/home/restaurants";
const S = "households/home/collection";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/home"), { name: "Home", memberIds: ["ava", "bogdan"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/bogdan"), { householdId: "home", displayName: "Bogdan" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
type Db = ReturnType<typeof as>;

/** A restaurant a member has marked deleting, still holding a claim, both members' notes and state. */
async function seedDoomed(rid: string): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const at = Timestamp.fromDate(new Date("2026-09-01T10:00:00Z"));
    await setDoc(doc(db, `${R}/${rid}`), { name: "Doomed", address: "1 Road", createdBy: "ava", createdAt: at, updatedAt: at, version: 2, deleting: true });
    await setDoc(doc(db, `${R}/${rid}/claims/c1`), { kind: "gfMenu", value: "yes", detail: "", source: { type: "ownVisit", label: "x" }, checkedAt: Timestamp.fromDate(new Date("2026-09-01T00:00:00Z")), authorUid: "ava", authorName: "Ava", createdAt: at });
    await setDoc(doc(db, `${R}/${rid}/notes/n-ava`), { text: "Ava's note", authorUid: "ava", authorName: "Ava", createdAt: at, updatedAt: at, version: 1 });
    await setDoc(doc(db, `${R}/${rid}/notes/n-bogdan`), { text: "Bogdan's note", authorUid: "bogdan", authorName: "Bogdan", createdAt: at, updatedAt: at, version: 1 });
    await setDoc(doc(db, `${S}/${rid}`), { shortlisted: true, visited: false, updatedBy: "ava", updatedByName: "Ava", updatedAt: at, version: 1 });
  });
}

interface Remaining { restaurant: boolean; claims: number; notes: number; state: boolean }

async function remaining(rid: string): Promise<Remaining> {
  let out: Remaining = { restaurant: false, claims: 0, notes: 0, state: false };
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    out = {
      restaurant: (await getDoc(doc(db, `${R}/${rid}`))).exists(),
      claims: (await getDocs(collection(db, `${R}/${rid}/claims`))).size,
      notes: (await getDocs(collection(db, `${R}/${rid}/notes`))).size,
      state: (await getDoc(doc(db, `${S}/${rid}`))).exists(),
    };
  });
  return out;
}

const GONE: Remaining = { restaurant: false, claims: 0, notes: 0, state: false };

async function oldFinish(db: Db, rid: string): Promise<void> {
  const claims = await getDocs(query(collection(db, `${R}/${rid}/claims`), limit(100)));
  await runTransaction(db, async (tx) => {
    for (const c of claims.docs) tx.delete(c.ref);
  });
  await runTransaction(db, async (tx) => {
    tx.delete(doc(db, `${R}/${rid}`));
  });
}

async function sweepSub(db: Db, rid: string, sub: "claims" | "notes"): Promise<void> {
  for (;;) {
    const page = await getDocs(query(collection(db, `${R}/${rid}/${sub}`), limit(100)));
    if (page.empty) return;
    await runTransaction(db, async (tx) => {
      const snaps = await Promise.all(page.docs.map((d) => tx.get(d.ref)));
      for (const s of snaps) if (s.exists()) tx.delete(s.ref);
    });
  }
}

const NEW_STEPS: Array<(db: Db, rid: string) => Promise<void>> = [
  (db, rid) => sweepSub(db, rid, "claims"),
  (db, rid) => sweepSub(db, rid, "notes"),
  (db, rid) =>
    runTransaction(db, async (tx) => {
      const s = await tx.get(doc(db, `${S}/${rid}`));
      if (s.exists()) tx.delete(s.ref);
    }),
  (db, rid) =>
    runTransaction(db, async (tx) => {
      const r = await tx.get(doc(db, `${R}/${rid}`));
      if (!r.exists()) return;
      // Mirrors web/src/records/repository.ts markCleanupDone: never mark a live restaurant.
      if (r.get("deleting") !== true) throw new Error("notFound");
      if (r.get("cleanupDone") === true) return;
      tx.update(r.ref, { cleanupDone: true, version: (r.get("version") as number) + 1, updatedAt: serverTimestamp() });
    }),
  (db, rid) =>
    runTransaction(db, async (tx) => {
      const r = await tx.get(doc(db, `${R}/${rid}`));
      if (r.exists()) tx.delete(r.ref);
    }),
];

async function newFinish(db: Db, rid: string, stepsToRun = NEW_STEPS.length): Promise<void> {
  for (const step of NEW_STEPS.slice(0, stepsToRun)) await step(db, rid);
}

describe("deletion protocol with mixed client versions", () => {
  it("a Plan 3-era finisher is refused at the final delete and leaves a resumable parent; a Plan 4 finisher completes it", async () => {
    await seedDoomed("r1");
    await assertFails(oldFinish(as("bogdan"), "r1"));
    expect(await remaining("r1")).toEqual({ restaurant: true, claims: 0, notes: 2, state: true });
    await newFinish(as("ava"), "r1");
    expect(await remaining("r1")).toEqual(GONE);
  });

  it("an old resumer racing a new deleter never leaves notes or state without their restaurant", async () => {
    await seedDoomed("r1");
    await Promise.allSettled([oldFinish(as("bogdan"), "r1"), newFinish(as("ava"), "r1")]);
    const after = await remaining("r1");
    if (!after.restaurant) expect(after).toEqual(GONE);
    await newFinish(as("ava"), "r1");
    expect(await remaining("r1")).toEqual(GONE);
  });

  it("two Plan 4 finishers at once both succeed", async () => {
    await seedDoomed("r1");
    await Promise.all([newFinish(as("ava"), "r1"), newFinish(as("bogdan"), "r1")]);
    expect(await remaining("r1")).toEqual(GONE);
  });

  it.each([1, 2, 3, 4])("a retry after %i completed step(s) finishes without a permission failure", async (done) => {
    await seedDoomed("r1");
    await newFinish(as("ava"), "r1", done);
    await newFinish(as("bogdan"), "r1");
    expect(await remaining("r1")).toEqual(GONE);
  });

  it("a finisher running after everything is already gone is a no-op, not a failure", async () => {
    await seedDoomed("r1");
    await newFinish(as("ava"), "r1");
    await newFinish(as("bogdan"), "r1");
    expect(await remaining("r1")).toEqual(GONE);
  });
});
