import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

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
    await setDoc(doc(db, "households/home"), { name: "Home", memberIds: ["ava"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "config/discovery"), { enabled: true, dailySearchCap: 50 });
    await setDoc(doc(db, "households/home/usage/20260922"), { searches: 3 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

// No match block exists for these paths, so default-deny applies; these tests pin that down
// (spec §3.6: clients get no rules access to config or usage; functions use the Admin SDK).
describe("config/discovery", () => {
  it("denies a member reading the kill switch", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext("ava").firestore(), "config/discovery")));
  });
  it("denies a member enabling search or raising the cap", async () => {
    await assertFails(setDoc(doc(env.authenticatedContext("ava").firestore(), "config/discovery"), { enabled: true, dailySearchCap: 1000 }));
  });
});

describe("households/{hid}/usage/{day}", () => {
  it("denies a member reading their household's usage", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext("ava").firestore(), "households/home/usage/20260922")));
  });
  it("denies a member resetting or deleting usage", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(setDoc(doc(db, "households/home/usage/20260922"), { searches: 0 }));
    await assertFails(deleteDoc(doc(db, "households/home/usage/20260922")));
  });
});
