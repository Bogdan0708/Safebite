import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export interface SeedAccount {
  uid: string;
  email: string;
  displayName: string;
  householdId: string | null;
}

export const SEED_PASSWORD = "pilot-password-1";

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { uid: "ava-uid", email: "ava@safebite.test", displayName: "Ava", householdId: "home" },
  { uid: "bogdan-uid", email: "bogdan@safebite.test", displayName: "Bogdan", householdId: "home" },
  { uid: "stranger-uid", email: "stranger@safebite.test", displayName: "Stranger", householdId: null },
];

function assertEmulator(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "seed-emulator refuses to run: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must both be set. This script never targets a real project.",
    );
  }
}

/** Seed emulator-only accounts and household membership. Safe to run repeatedly. */
export async function seedEmulator(): Promise<void> {
  assertEmulator();
  if (getApps().length === 0) initializeApp({ projectId: "demo-safebite" });
  const auth = getAuth();
  const db = getFirestore();

  for (const account of SEED_ACCOUNTS) {
    try {
      await auth.getUser(account.uid);
      await auth.updateUser(account.uid, { email: account.email, password: SEED_PASSWORD, displayName: account.displayName });
    } catch {
      await auth.createUser({
        uid: account.uid,
        email: account.email,
        password: SEED_PASSWORD,
        displayName: account.displayName,
        emailVerified: true,
      });
    }
  }

  const members = SEED_ACCOUNTS.filter((a) => a.householdId === "home");
  await db.doc("households/home").set({
    name: "Home",
    memberIds: members.map((a) => a.uid),
    createdAt: new Date(),
  });
  for (const account of members) {
    await db.doc(`users/${account.uid}`).set({ householdId: "home", displayName: account.displayName });
  }
  await db.doc("users/stranger-uid").delete();
}

if (require.main === module) {
  seedEmulator()
    .then(() => {
      console.log("Emulator seeded: ava@safebite.test, bogdan@safebite.test (members), stranger@safebite.test (not a member).");
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
