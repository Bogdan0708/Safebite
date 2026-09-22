import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import { callFunction, createEmulatorUser, ensureAdminApp, signInForIdToken, warmUpFunctions } from "./emulator-helpers";
import { FIXTURE_RESULTS, MAGIC } from "../src/discovery/fixtureProvider";
import { CONFIG_PATH } from "../src/discovery/search";

const PASSWORD = "pilot-password-1";
let avaToken: string;
let strangerToken: string;

beforeAll(async () => {
  await warmUpFunctions("searchDestination");
  ensureAdminApp();
  const db = getFirestore();
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("households"));
  await db.doc("households/home").set({ name: "Home", memberIds: ["ava-uid"], createdAt: new Date() });
  await db.doc("users/ava-uid").set({ householdId: "home", displayName: "Ava" });
  await createEmulatorUser("ava-uid", "ava@safebite.test", PASSWORD);
  await createEmulatorUser("stranger-uid", "stranger@safebite.test", PASSWORD);
  avaToken = await signInForIdToken("ava@safebite.test", PASSWORD);
  strangerToken = await signInForIdToken("stranger@safebite.test", PASSWORD);
}, 300000);

beforeEach(async () => {
  const db = getFirestore();
  await db.recursiveDelete(db.collection("config"));
  await db.recursiveDelete(db.collection("households/home/usage"));
  await db.doc(CONFIG_PATH).set({ enabled: true, dailySearchCap: 5 });
});

describe("searchDestination (fixture provider via functions/.secret.local)", () => {
  it("returns fixture results to a member — proves FUNCTIONS_EMULATOR selection and the secret file", async () => {
    const res = await callFunction("searchDestination", { query: "Lisbon" }, avaToken);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ results: FIXTURE_RESULTS.slice(0, 10), provider: "google" });
  });

  it("rejects an unauthenticated call", async () => {
    const res = await callFunction("searchDestination", { query: "Lisbon" });
    expect(res.status).toBe(401);
    expect(res.body.error?.status).toBe("UNAUTHENTICATED");
  });

  it("rejects a signed-in non-member before validating input", async () => {
    const res = await callFunction("searchDestination", { query: "" }, strangerToken);
    expect(res.status).toBe(403);
    expect(res.body.error?.status).toBe("PERMISSION_DENIED");
  });

  it("ignores a spoofed identity in request.data", async () => {
    const res = await callFunction("searchDestination", { query: "Lisbon", uid: "ava-uid", householdId: "home" }, strangerToken);
    expect(res.status).toBe(403);
  });

  it("rejects invalid input", async () => {
    const res = await callFunction("searchDestination", { query: "   " }, avaToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.status).toBe("INVALID_ARGUMENT");
  });

  it("refuses when the config document is missing", async () => {
    await getFirestore().doc(CONFIG_PATH).delete();
    const res = await callFunction("searchDestination", { query: "Lisbon" }, avaToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.status).toBe("FAILED_PRECONDITION");
    expect(res.body.error?.message).toBe("Search is switched off.");
  });

  it("refuses when disabled", async () => {
    await getFirestore().doc(CONFIG_PATH).set({ enabled: false, dailySearchCap: 5 });
    const res = await callFunction("searchDestination", { query: "Lisbon" }, avaToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toBe("Search is switched off.");
  });

  it("refuses at exactly the cap with reason dailyCap", async () => {
    await getFirestore().doc(CONFIG_PATH).set({ enabled: true, dailySearchCap: 1 });
    expect((await callFunction("searchDestination", { query: "one" }, avaToken)).status).toBe(200);
    const res = await callFunction("searchDestination", { query: "two" }, avaToken);
    expect(res.status).toBe(429);
    expect(res.body.error?.status).toBe("RESOURCE_EXHAUSTED");
    expect((res.body.error as { details?: unknown }).details).toEqual({ reason: "dailyCap" });
  });

  it("counts a failed provider call", async () => {
    const res = await callFunction("searchDestination", { query: MAGIC.unavailable }, avaToken);
    expect(res.status).toBe(503);
    expect(res.body.error?.status).toBe("UNAVAILABLE");
    const usage = await getFirestore().collection("households/home/usage").get();
    expect(usage.docs.map((d) => d.get("searches"))).toEqual([1]);
  });

  it("maps the quota magic query to RESOURCE_EXHAUSTED providerQuota", async () => {
    const res = await callFunction("searchDestination", { query: MAGIC.quota }, avaToken);
    expect(res.status).toBe(429);
    expect((res.body.error as { details?: unknown }).details).toEqual({ reason: "providerQuota" });
  });

  it("maps the empty magic query to no results", async () => {
    const res = await callFunction("searchDestination", { query: MAGIC.empty }, avaToken);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ results: [], provider: "google" });
  });
});

describe("searchNearby", () => {
  it("returns fixture results for valid coordinates", async () => {
    const res = await callFunction("searchNearby", { lat: 51.5, lng: -0.12 }, avaToken);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ results: FIXTURE_RESULTS.slice(0, 10), provider: "google" });
  });

  it("rejects out-of-range coordinates", async () => {
    const res = await callFunction("searchNearby", { lat: 91, lng: 0 }, avaToken);
    expect(res.status).toBe(400);
    expect(res.body.error?.status).toBe("INVALID_ARGUMENT");
  });

  it("shares the household's daily cap with destination searches", async () => {
    await getFirestore().doc(CONFIG_PATH).set({ enabled: true, dailySearchCap: 1 });
    expect((await callFunction("searchNearby", { lat: 51.5, lng: -0.12 }, avaToken)).status).toBe(200);
    expect((await callFunction("searchDestination", { query: "x" }, avaToken)).status).toBe(429);
  });
});
