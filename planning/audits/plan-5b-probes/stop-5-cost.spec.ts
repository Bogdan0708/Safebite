// Plan 5b empirical stop 5: billed reads of one full refresh. Run from a temporary copy in web/e2e/.
// Deviation from the brief (controller ruling, Task 1 finding): the Auth module is imported with the
// same ?v= URL that the served /src/firebase.ts uses, never the bare /node_modules/.vite/deps path.
import { expect, test } from "@playwright/test";
import { clearRecords, seedClaim, seedNote, seedRestaurant } from "./emulator-rest";

test.setTimeout(600_000);

test("stop 5: reads of one full refresh for 100 restaurants, ~5 claims and ~2 notes each", async ({ page, request }) => {
  await clearRecords(request);
  for (let i = 0; i < 100; i += 1) {
    const rid = `cost-${String(i).padStart(3, "0")}`;
    await seedRestaurant(request, rid, { name: `Cost ${i}` });
    for (let c = 0; c < 5; c += 1) await seedClaim(request, rid, `${rid}-c${c}`);
    if (i % 2 === 0) for (let n = 0; n < 4; n += 1) await seedNote(request, rid, `${rid}-n${n}`); // half have notes: empty queries count
  }
  await page.goto("/e2e/offline-harness.html");
  const stats = await page.evaluate(async () => {
    (window as any).__SAFEBITE_BUILD__ = false;
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const depUrl = async (name: string): Promise<string> => {
      const source = await (await fetch("/src/firebase.ts")).text();
      const found = source.match(new RegExp(`"(/node_modules/\\.vite/deps/${name}\\.js[^"]*)"`));
      if (!found) throw new Error(`no served URL for ${name}`);
      return found[1]!;
    };
    await (await load("/src/account/authPersistence.ts")).prepareAuthPersistence();
    const { auth } = await load("/src/firebase.ts");
    const { signInWithEmailAndPassword } = await load(await depUrl("firebase_auth"));
    await signInWithEmailAndPassword(auth, "ava@safebite.test", "pilot-password-1");
    const { readHouseholdFromServer } = await load("/src/offline/serverReads.ts");
    return (await readHouseholdFromServer("home")).stats;
  });
  const billed = stats.documents + stats.emptyQueries + stats.queries; // documents + empty-query minimums + one rules get() per query
  console.log(`STOP5 ${JSON.stringify(stats)} estimatedBilledReads=${billed} perHourAt4=${billed * 4}`);
  expect(stats.queries).toBe(1 + 2 * 100 + 1);
  await clearRecords(request);
});
