import { expect, test, type Page } from "@playwright/test";

// Empirical stop 4 (spec §3.9): IndexedDB serialises overlapping readwrite transactions across
// documents, so a refresh's replacement queued behind another tab's clear sees the new epoch.
async function harness(page: Page) {
  await page.goto("/e2e/offline-harness.html");
}

test("stop 4: a replacement queued behind another tab's clear aborts as cleared", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await harness(a);
  await harness(b);
  const token = await a.evaluate(async () => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const store = await load("/src/offline/store.ts");
    await store.setOptIn("ava-uid", true);
    return store.readToken();
  });
  // Tab B holds a readwrite transaction over control for ~800 ms, then bumps the epoch.
  const holding = b.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open("safebite-offline");
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(["control", "meta", "restaurants", "claims", "collection", "notes"], "readwrite");
      const control = tx.objectStore("control");
      const until = performance.now() + 800;
      const spin = () => {
        const r = control.get("epoch");
        r.onsuccess = () => {
          (window as unknown as { __held?: boolean }).__held = true;
          if (performance.now() < until) { spin(); return; }
          const epoch = typeof r.result?.epoch === "number" ? r.result.epoch : 0;
          control.put({ epoch: epoch + 1 }, "epoch");
        };
      };
      spin();
      tx.oncomplete = () => { db.close(); resolve(performance.now()); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await b.waitForFunction(() => (window as unknown as { __held?: boolean }).__held === true); // B's transaction is active
  const outcome = await a.evaluate(async (t) => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const store = await load("/src/offline/store.ts");
    const data = { restaurants: [], claims: {}, collection: {}, notes: {} };
    return store.replaceCopy({ uid: "ava-uid", householdId: "home", displayName: "Ava" }, t, data, Date.now());
  }, token);
  await holding;
  expect(outcome).toBe("cleared");
  await expect(a.evaluate(async () => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    return (await load("/src/offline/store.ts")).readMeta();
  })).resolves.toBeNull();
});
