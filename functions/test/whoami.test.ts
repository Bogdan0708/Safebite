import { beforeAll, describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import { callFunction, createEmulatorUser, ensureAdminApp, signInForIdToken } from "./emulator-helpers";

const PASSWORD = "pilot-password-1";

beforeAll(async () => {
  ensureAdminApp();
  const db = getFirestore();
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("households"));
  await db.doc("households/home").set({ name: "Home", memberIds: ["ava-uid"], createdAt: new Date() });
  await db.doc("users/ava-uid").set({ householdId: "home", displayName: "Ava" });
  await createEmulatorUser("ava-uid", "ava@safebite.test", PASSWORD);
  await createEmulatorUser("stranger-uid", "stranger@safebite.test", PASSWORD);
});

describe("whoami callable", () => {
  it("returns membership for a member", async () => {
    const token = await signInForIdToken("ava@safebite.test", PASSWORD);
    const res = await callFunction("whoami", {}, token);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava" });
  });

  it("rejects an unauthenticated call", async () => {
    const res = await callFunction("whoami", {});
    expect(res.status).toBe(401);
    expect(res.body.error?.status).toBe("UNAUTHENTICATED");
  });

  it("rejects a signed-in non-member", async () => {
    const token = await signInForIdToken("stranger@safebite.test", PASSWORD);
    const res = await callFunction("whoami", {}, token);
    expect(res.status).toBe(403);
    expect(res.body.error?.status).toBe("PERMISSION_DENIED");
  });
});
