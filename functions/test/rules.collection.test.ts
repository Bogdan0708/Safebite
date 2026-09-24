import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-safebite";
const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");

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
    await setDoc(doc(db, "households/other"), { name: "Other", memberIds: ["stranger"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/bogdan"), { householdId: "home", displayName: "Bogdan" });
    await setDoc(doc(db, "users/stranger"), { householdId: "other", displayName: "Stranger" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const R = "households/home/restaurants";
const S = "households/home/collection";
const utcDate = (d: string) => Timestamp.fromDate(new Date(`${d}T00:00:00.000Z`));
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const daysAhead = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));
const NAMES: Record<string, string> = { ava: "Ava", bogdan: "Bogdan", stranger: "Stranger" };

async function seed(docPath: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), docPath), data);
  });
}

async function seedRestaurant(id: string, over: Record<string, unknown> = {}): Promise<void> {
  await seed(`${R}/${id}`, {
    name: "Seeded",
    address: "Somewhere 1",
    createdBy: "ava",
    createdAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
    updatedAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
    version: 1,
    deleting: false,
    ...over,
  });
}

/** A valid collection-state write as the client sends it (full document, server updatedAt). */
function stateWrite(uid = "ava", over: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    shortlisted: true,
    visited: false,
    updatedBy: uid,
    updatedByName: NAMES[uid],
    updatedAt: serverTimestamp(),
    version: 1,
    ...over,
  };
  for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
  return data;
}

async function seedState(rid: string, over: Record<string, unknown> = {}): Promise<void> {
  await seed(`${S}/${rid}`, { shortlisted: true, visited: false, updatedBy: "ava", updatedByName: "Ava", updatedAt: new Date(), version: 1, ...over });
}

describe("collection — reads", () => {
  it("members read and list; non-members and anonymous do not", async () => {
    await seedRestaurant("r1");
    await seedState("r1");
    await assertSucceeds(getDoc(doc(as("ava"), `${S}/r1`)));
    await assertSucceeds(getDocs(collection(as("bogdan"), S)));
    await assertFails(getDoc(doc(as("stranger"), `${S}/r1`)));
    await assertFails(getDocs(collection(as("stranger"), S)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${S}/r1`)));
  });
});

describe("collection — create", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
  });

  it.each([
    ["shortlisted only", {}],
    ["visited with a date", { shortlisted: false, visited: true, visitedOn: utcDate("2026-05-03") }],
    ["visited one day ahead of UTC", { visited: true, visitedOn: utcDate(daysAhead(1)) }],
    ["neither flag", { shortlisted: false }],
  ])("accepts %s", async (_label, over) => {
    await assertSucceeds(setDoc(doc(as("ava"), `${S}/r1`), stateWrite("ava", over)));
  });

  it.each([
    ["version is not 1", { version: 2 }],
    ["updatedBy is someone else", { updatedBy: "bogdan" }],
    ["updatedByName is not the caller's display name", { updatedByName: "Bogdan" }],
    ["client-supplied updatedAt", { updatedAt: new Date() }],
    ["visited without visitedOn", { visited: true }],
    ["visitedOn without visited", { visitedOn: utcDate("2026-05-03") }],
    ["visitedOn not at UTC midnight", { visited: true, visitedOn: Timestamp.fromDate(new Date("2026-05-03T10:00:00Z")) }],
    // three, not two: see rules.records.test.ts on request.time near midnight
    ["visitedOn three days ahead", { visited: true, visitedOn: utcDate(daysAhead(3)) }],
    ["shortlisted is a string", { shortlisted: "yes" }],
    ["an unknown key", { rating: 5 }],
    ["a legacy savedBy key", { savedBy: "ava" }],
    ["missing shortlisted", { shortlisted: undefined }],
  ])("rejects a create where %s", async (_label, over) => {
    await assertFails(setDoc(doc(as("ava"), `${S}/r1`), stateWrite("ava", over)));
  });

  it("rejects a create for a missing restaurant or one marked deleting", async () => {
    await assertFails(setDoc(doc(as("ava"), `${S}/ghost`), stateWrite("ava")));
    await seedRestaurant("r2", { deleting: true });
    await assertFails(setDoc(doc(as("ava"), `${S}/r2`), stateWrite("ava")));
  });

  it("rejects a create by a non-member or anonymous client", async () => {
    await assertFails(setDoc(doc(as("stranger"), `${S}/r1`), stateWrite("stranger")));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `${S}/r1`), stateWrite("ava")));
  });
});

describe("collection — update and delete", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await seedState("r1", { version: 3 });
  });

  it("either member writes the next version with their own identity", async () => {
    await assertSucceeds(setDoc(doc(as("bogdan"), `${S}/r1`), stateWrite("bogdan", { shortlisted: false, visited: true, visitedOn: utcDate("2026-05-03"), version: 4 })));
  });

  it.each([
    ["the version is stale", { version: 3 }],
    ["the version skips ahead", { version: 5 }],
    ["updatedByName is spoofed", { version: 4, updatedByName: "Ava" }],
  ])("rejects an update where %s", async (_label, over) => {
    await assertFails(setDoc(doc(as("bogdan"), `${S}/r1`), stateWrite("bogdan", over)));
  });

  it("rejects updates once the restaurant is marked deleting", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertFails(setDoc(doc(as("ava"), `${S}/r1`), stateWrite("ava", { version: 4 })));
  });

  it("delete is refused while the restaurant is live and allowed once it is marked deleting", async () => {
    await assertFails(deleteDoc(doc(as("ava"), `${S}/r1`)));
    await seedRestaurant("r1", { deleting: true });
    await assertFails(deleteDoc(doc(as("stranger"), `${S}/r1`)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), `${S}/r1`)));
  });
});

const N = `${R}/r1/notes`;

/** A valid note create as the client sends it. */
function noteCreate(uid = "ava", over: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    text: "Staff knew exactly what coeliac means.",
    authorUid: uid,
    authorName: NAMES[uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1,
    ...over,
  };
  for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
  return data;
}

async function seedNote(id: string, uid = "ava", over: Record<string, unknown> = {}): Promise<void> {
  await seed(`${N}/${id}`, { ...noteCreate(uid), createdAt: new Date("2026-09-01T10:00:00Z"), updatedAt: new Date("2026-09-01T10:00:00Z"), version: 2, ...over });
}

describe("notes — reads", () => {
  it("members read and list; non-members and anonymous do not", async () => {
    await seedRestaurant("r1");
    await seedNote("n1");
    await assertSucceeds(getDoc(doc(as("bogdan"), `${N}/n1`)));
    await assertSucceeds(getDocs(collection(as("ava"), N)));
    await assertFails(getDoc(doc(as("stranger"), `${N}/n1`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${N}/n1`)));
  });
});

describe("notes — create", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
  });

  it("accepts a note from either member, including exactly 2,000 characters", async () => {
    await assertSucceeds(setDoc(doc(as("ava"), `${N}/a`), noteCreate("ava")));
    await assertSucceeds(setDoc(doc(as("bogdan"), `${N}/b`), noteCreate("bogdan", { text: "x".repeat(2000) })));
  });

  it.each([
    ["text of 2,001 characters", { text: "x".repeat(2001) }],
    ["whitespace-only text", { text: "   " }],
    ["text not a string", { text: 42 }],
    ["authorUid is someone else", { authorUid: "bogdan" }],
    ["authorName is not the caller's display name", { authorName: "Bogdan" }],
    ["client-supplied createdAt", { createdAt: new Date() }],
    ["client-supplied updatedAt", { updatedAt: new Date() }],
    ["version is not 1", { version: 2 }],
    ["an unknown key", { verified: true }],
    ["missing text", { text: undefined }],
  ])("rejects a create where %s", async (_label, over) => {
    await assertFails(setDoc(doc(as("ava"), `${N}/bad`), noteCreate("ava", over)));
  });

  it("rejects a create under a missing parent or a parent marked deleting", async () => {
    await assertFails(setDoc(doc(as("ava"), `${R}/ghost/notes/bad`), noteCreate("ava")));
    await seedRestaurant("r2", { deleting: true });
    await assertFails(setDoc(doc(as("ava"), `${R}/r2/notes/bad`), noteCreate("ava")));
  });

  it("rejects a create by a non-member or anonymous client", async () => {
    await assertFails(setDoc(doc(as("stranger"), `${N}/bad`), noteCreate("stranger")));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `${N}/bad`), noteCreate("ava")));
  });
});

describe("notes — update", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await seedNote("n1", "ava");
  });

  it("the author edits the text with the next version and a server updatedAt", async () => {
    await assertSucceeds(updateDoc(doc(as("ava"), `${N}/n1`), { text: "Edited", version: 3, updatedAt: serverTimestamp() }));
  });

  it.each([
    ["the other member edits", "bogdan", { text: "Edited", version: 3, updatedAt: serverTimestamp() }],
    ["the version is stale", "ava", { text: "Edited", version: 2, updatedAt: serverTimestamp() }],
    ["the version skips ahead", "ava", { text: "Edited", version: 4, updatedAt: serverTimestamp() }],
    ["updatedAt is client-supplied", "ava", { text: "Edited", version: 3, updatedAt: new Date() }],
    ["authorUid changes", "ava", { authorUid: "bogdan", version: 3, updatedAt: serverTimestamp() }],
    ["authorName changes", "ava", { authorName: "Bogdan", version: 3, updatedAt: serverTimestamp() }],
    ["createdAt changes", "ava", { createdAt: new Date(), version: 3, updatedAt: serverTimestamp() }],
    ["text becomes too long", "ava", { text: "x".repeat(2001), version: 3, updatedAt: serverTimestamp() }],
  ])("rejects an update where %s", async (_label, uid, patch) => {
    await assertFails(updateDoc(doc(as(uid), `${N}/n1`), patch));
  });

  it("rejects an author edit while the restaurant is marked deleting", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertFails(updateDoc(doc(as("ava"), `${N}/n1`), { text: "Edited", version: 3, updatedAt: serverTimestamp() }));
  });
});

describe("notes — delete", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await seedNote("n1", "ava");
  });

  it("the author deletes; the other member and non-members may not while the restaurant is live", async () => {
    await assertFails(deleteDoc(doc(as("bogdan"), `${N}/n1`)));
    await assertFails(deleteDoc(doc(as("stranger"), `${N}/n1`)));
    await assertSucceeds(deleteDoc(doc(as("ava"), `${N}/n1`)));
  });

  it("once the restaurant is marked deleting any member may delete (the sweep), never a non-member", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertFails(deleteDoc(doc(as("stranger"), `${N}/n1`)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), `${N}/n1`)));
  });

  it("the author may still delete while the restaurant is marked deleting", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertSucceeds(deleteDoc(doc(as("ava"), `${N}/n1`)));
  });
});
