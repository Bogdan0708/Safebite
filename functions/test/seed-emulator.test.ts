import { describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { ensureAdminApp } from "./emulator-helpers";
import { SEED_ACCOUNTS, seedEmulator } from "../src/seed-emulator";

describe("seedEmulator", () => {
  it("creates the three accounts and one household, idempotently", async () => {
    ensureAdminApp();
    await seedEmulator();
    await seedEmulator(); // second run must not throw

    const auth = getAuth();
    for (const account of SEED_ACCOUNTS) {
      const user = await auth.getUser(account.uid);
      expect(user.email).toBe(account.email);
    }

    const db = getFirestore();
    const home = await db.doc("households/home").get();
    expect(home.get("memberIds")).toEqual(["ava-uid", "bogdan-uid"]);
    expect((await db.doc("users/ava-uid").get()).get("displayName")).toBe("Ava");
    expect((await db.doc("users/bogdan-uid").get()).get("householdId")).toBe("home");
    expect((await db.doc("users/stranger-uid").get()).exists).toBe(false);
    expect((await db.doc("config/discovery").get()).data()).toEqual({ enabled: true, dailySearchCap: 50 });
  });

  it("refuses to run when emulator hosts are not set", async () => {
    const saved = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    try {
      await expect(seedEmulator()).rejects.toThrow(/emulator/i);
    } finally {
      if (saved === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = saved;
    }
  });
});
