import { beforeAll, describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import { callFunction, createEmulatorUser, ensureAdminApp, signInForIdToken, warmUpFunctions } from "./emulator-helpers";

const PASSWORD = "pilot-password-1";

beforeAll(async () => {
  // The Functions emulator spawns its runtime worker lazily on the first request, and
  // that worker's cold require() of functions/lib + firebase-admin can take well over a
  // minute on a Windows-mounted path (WSL's /mnt/c). Warm it up here, outside any single
  // test's timeout budget, so the timed tests below only pay for a warm invocation.
  await warmUpFunctions("whoami");

  ensureAdminApp();
  const db = getFirestore();
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("households"));
  await db.doc("households/home").set({ name: "Home", memberIds: ["ava-uid"], createdAt: new Date() });
  await db.doc("users/ava-uid").set({ householdId: "home", displayName: "Ava" });
  await createEmulatorUser("ava-uid", "ava@safebite.test", PASSWORD);
  await createEmulatorUser("stranger-uid", "stranger@safebite.test", PASSWORD);
}, 300000);

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

  it("ignores a spoofed identity in request.data from a non-member", async () => {
    const strangerToken = await signInForIdToken("stranger@safebite.test", PASSWORD);
    const res = await callFunction("whoami", { uid: "ava-uid", householdId: "home" }, strangerToken);
    expect(res.status).toBe(403);
    expect(res.body.error?.status).toBe("PERMISSION_DENIED");
  });

  it("ignores a spoofed identity in request.data from the real member", async () => {
    const avaToken = await signInForIdToken("ava@safebite.test", PASSWORD);
    const res = await callFunction("whoami", { uid: "ava-uid", householdId: "home" }, avaToken);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava" });
  });
});
