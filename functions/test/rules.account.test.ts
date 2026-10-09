import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from "firebase/firestore";

const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-safebite",
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/home"), { name: "Home", memberIds: ["ava", "former-member"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/former-member"), { householdId: "home", displayName: "Former member" });
    await setDoc(doc(db, "accountDeletions/ava"), { householdId: "home", startedAt: Timestamp.now() });
    await setDoc(doc(db, "accountDeletionReceipts/abc"), { status: "started", uid: "ava" });
    await setDoc(doc(db, "households/home/restaurants/r1"), { name: "R", address: "A", createdBy: "ava", createdAt: Timestamp.now(), updatedAt: Timestamp.now(), version: 1, deleting: false });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("accountDeletions", () => {
  it("the owner can read their own record", async () => {
    await assertSucceeds(getDoc(doc(as("ava"), "accountDeletions/ava")));
  });
  it("nobody else can read it, signed in or not", async () => {
    await assertFails(getDoc(doc(as("bogdan"), "accountDeletions/ava")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "accountDeletions/ava")));
  });
  it("clients can never write it, not even the owner", async () => {
    await assertFails(setDoc(doc(as("ava"), "accountDeletions/ava"), { householdId: "home" }));
    await assertFails(deleteDoc(doc(as("ava"), "accountDeletions/ava")));
    await assertFails(setDoc(doc(as("bogdan"), "accountDeletions/bogdan"), { householdId: "home" }));
  });
});

describe("accountDeletionReceipts", () => {
  it("no client can read or write a receipt", async () => {
    await assertFails(getDoc(doc(as("ava"), "accountDeletionReceipts/abc")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "accountDeletionReceipts/abc")));
    await assertFails(setDoc(doc(as("ava"), "accountDeletionReceipts/new"), { status: "complete" }));
  });
});

describe("reserved marker UID", () => {
  it("is never treated as a member, even when listed in memberIds", async () => {
    await assertFails(getDoc(doc(as("former-member"), "households/home")));
    await assertFails(getDoc(doc(as("former-member"), "households/home/restaurants/r1")));
  });
  it("a real member listed alongside it still reads normally", async () => {
    await assertSucceeds(getDoc(doc(as("ava"), "households/home")));
    await assertSucceeds(getDoc(doc(as("ava"), "households/home/restaurants/r1")));
  });
});
