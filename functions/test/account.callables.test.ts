import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { callFunction, createEmulatorUser, ensureAdminApp, recursiveDeleteFresh, signInForIdToken, warmUpFunctions } from "./emulator-helpers";

const PW = "pilot-password-1";
const newRequestId = () => randomBytes(32).toString("base64url");

beforeAll(async () => {
  await warmUpFunctions("checkAccountDeletion");
  ensureAdminApp();
}, 300000);

beforeEach(async () => {
  const db = getFirestore();
  await recursiveDeleteFresh(db, db.doc("households/delhome"));
  await db.doc("households/delhome").set({ name: "Del", memberIds: ["del-a-uid", "del-b-uid"], createdAt: new Date() });
  await db.doc("users/del-a-uid").set({ householdId: "delhome", displayName: "Del A" });
  await db.doc("users/del-b-uid").set({ householdId: "delhome", displayName: "Del B" });
  await createEmulatorUser("del-a-uid", "del-a@safebite.test", PW);
  await createEmulatorUser("del-b-uid", "del-b@safebite.test", PW);
});

describe("deleteAccount", () => {
  it("refuses an unauthenticated call", async () => {
    const res = await callFunction("deleteAccount", { requestId: newRequestId() });
    expect(res.status).toBe(401);
  });

  it("refuses a malformed request id", async () => {
    const token = await signInForIdToken("del-a@safebite.test", PW);
    const res = await callFunction("deleteAccount", { requestId: "short" }, token);
    expect(res.body.error?.status).toBe("INVALID_ARGUMENT");
    expect(await getAuth().getUser("del-a-uid")).toBeTruthy();
  });

  it("deletes a member after a fresh sign-in, and the receipt then reports complete without a sign-in", async () => {
    const token = await signInForIdToken("del-a@safebite.test", PW);
    const requestId = newRequestId();
    const res = await callFunction("deleteAccount", { requestId, expectedUid: "del-a-uid" }, token);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ deleted: true, lastMember: false });
    const check = await callFunction("checkAccountDeletion", { requestId });
    expect(check.body.result).toEqual({ status: "complete" });
    await expect(signInForIdToken("del-a@safebite.test", PW)).rejects.toThrow();
    expect((await getFirestore().doc("households/delhome").get()).get("memberIds")).toEqual(["del-b-uid"]);
  });

  it("refuses an expectedUid that is not the signed-in account, before any receipt or data change", async () => {
    const token = await signInForIdToken("del-a@safebite.test", PW);
    const requestId = newRequestId();
    const res = await callFunction("deleteAccount", { requestId, expectedUid: "del-b-uid" }, token);
    expect(res.body.error?.status).toBe("PERMISSION_DENIED");
    expect(JSON.stringify(res.body)).toContain("accountChanged");
    expect((await callFunction("checkAccountDeletion", { requestId })).body.result).toEqual({ status: "none" });
    expect(await getAuth().getUser("del-a-uid")).toBeTruthy();
    expect(await getAuth().getUser("del-b-uid")).toBeTruthy();
    expect((await getFirestore().doc("households/delhome").get()).get("memberIds")).toEqual(["del-a-uid", "del-b-uid"]);
  });
});

describe("checkAccountDeletion", () => {
  it("reports none for an unknown request id and never returns a uid", async () => {
    const res = await callFunction("checkAccountDeletion", { requestId: newRequestId() });
    expect(res.body.result).toEqual({ status: "none" });
    expect(JSON.stringify(res.body)).not.toContain("uid");
  });

  it("refuses a malformed request id", async () => {
    const res = await callFunction("checkAccountDeletion", { requestId: 42 });
    expect(res.body.error?.status).toBe("INVALID_ARGUMENT");
  });
});
