import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-safebite";
const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/home"), {
      name: "Home",
      memberIds: ["ava", "bogdan"],
      createdAt: new Date(),
    });
    await setDoc(doc(db, "households/other"), {
      name: "Other",
      memberIds: ["stranger"],
      createdAt: new Date(),
    });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/bogdan"), { householdId: "home", displayName: "Bogdan" });
    await setDoc(doc(db, "users/stranger"), { householdId: "other", displayName: "Stranger" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("users/{uid}", () => {
  it("denies unauthenticated reads", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users/ava")));
  });

  it("allows a user to read their own document", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertSucceeds(getDoc(doc(db, "users/ava")));
  });

  it("denies reading another user's document, even a household member's", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(getDoc(doc(db, "users/bogdan")));
  });

  it("denies a user changing their own householdId", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(updateDoc(doc(db, "users/ava"), { householdId: "other" }));
  });

  it("denies creating a user document from the client", async () => {
    const db = env.authenticatedContext("newcomer").firestore();
    await assertFails(setDoc(doc(db, "users/newcomer"), { householdId: "home", displayName: "New" }));
  });
});

describe("households/{hid}", () => {
  it("allows a member to read their household", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertSucceeds(getDoc(doc(db, "households/home")));
  });

  it("denies a non-member reading the household", async () => {
    const db = env.authenticatedContext("stranger").firestore();
    await assertFails(getDoc(doc(db, "households/home")));
  });

  it("denies unauthenticated reads", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "households/home")));
  });

  it("denies a member adding someone to memberIds", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(updateDoc(doc(db, "households/home"), { memberIds: ["ava", "bogdan", "stranger"] }));
  });

  it("denies creating a household from the client", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(setDoc(doc(db, "households/mine"), { name: "Mine", memberIds: ["ava"], createdAt: new Date() }));
  });

  it("fails closed for a household document without memberIds", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "households/broken"), { name: "Broken", createdAt: new Date() });
    });
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(getDoc(doc(db, "households/broken")));
  });
});

describe("default-deny", () => {
  it("denies reads under another household's subcollection", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(getDoc(doc(db, "households/other/restaurants/x")));
  });

  it("denies reads of an unmatched top-level collection", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(getDoc(doc(db, "config/discovery")));
  });

  it("fails closed for a member reading a household that does not exist", async () => {
    const db = env.authenticatedContext("ava").firestore();
    await assertFails(getDoc(doc(db, "households/ghost")));
  });

  it("denies unauthenticated reads of an unmatched top-level collection", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "config/discovery")));
  });
});
