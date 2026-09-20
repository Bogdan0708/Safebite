import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { requireMember } from "../src/membership";

function fakeRequest(uid?: string): CallableRequest<unknown> {
  return {
    data: {},
    rawRequest: {} as never,
    acceptsStreaming: false,
    auth: uid ? ({ uid, token: {} } as never) : undefined,
  } as CallableRequest<unknown>;
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Run via `npm run emu:test` so FIRESTORE_EMULATOR_HOST is set.");
  }
  if (getApps().length === 0) initializeApp({ projectId: "demo-safebite" });
});

beforeEach(async () => {
  const db = getFirestore();
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("households"));
  await db.doc("households/home").set({ name: "Home", memberIds: ["ava"], createdAt: new Date() });
  await db.doc("users/ava").set({ householdId: "home", displayName: "Ava" });
  await db.doc("users/orphan").set({ householdId: "home", displayName: "Orphan" }); // not in memberIds
  await db.doc("users/nohousehold").set({ displayName: "No Household" });
});

describe("requireMember", () => {
  it("returns the member for a listed household member", async () => {
    await expect(requireMember(fakeRequest("ava"))).resolves.toEqual({
      uid: "ava",
      householdId: "home",
      displayName: "Ava",
    });
  });

  it("throws unauthenticated when there is no auth", async () => {
    await expect(requireMember(fakeRequest())).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied when the user document is missing", async () => {
    await expect(requireMember(fakeRequest("ghost"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws permission-denied when the user has no householdId", async () => {
    await expect(requireMember(fakeRequest("nohousehold"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws permission-denied when the household does not list the user", async () => {
    await expect(requireMember(fakeRequest("orphan"))).rejects.toMatchObject({ code: "permission-denied" });
  });
});
