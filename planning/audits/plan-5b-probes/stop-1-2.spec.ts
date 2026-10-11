// Plan 5b empirical stops 1 and 2. Run from a temporary copy in web/e2e/ (see Task 1); kept here as evidence.
// Deviation from the brief: the Firestore module is imported with the same ?v= URL that src/firebase.ts uses (a bare deps path is a second module instance and getDocFromServer then throws invalid-argument instantly); the error message is logged too.
import { expect, test, type Page, type Route } from "@playwright/test";

const EMULATOR = /127\.0\.0\.1:(9099|8080|5001)\//;
const KEY = "firebase:authUser:demo-api-key:[DEFAULT]";
type Mode = "airplane" | "stall";

async function signInOnHarness(page: Page): Promise<string> {
  await page.goto("/e2e/auth-harness.html");
  return page.evaluate(async () => {
    (window as any).__SAFEBITE_BUILD__ = false;
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    await (await load("/src/account/authPersistence.ts")).prepareAuthPersistence();
    const { auth } = await load("/src/firebase.ts");
    const { signInWithEmailAndPassword } = await load("/node_modules/.vite/deps/firebase_auth.js");
    const cred = await signInWithEmailAndPassword(auth, "ava@safebite.test", "pilot-password-1");
    return cred.user.uid as string;
  });
}

async function cutEmulators(page: Page, mode: Mode): Promise<Route[]> {
  const held: Route[] = [];
  await page.route(EMULATOR, (route) => {
    if (mode === "airplane") return route.abort("internetdisconnected");
    held.push(route); // never fulfilled: a stalled connection
  });
  if (mode === "airplane") {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      window.dispatchEvent(new Event("offline"));
    });
  }
  return held;
}

async function startAndMeasure(page: Page) {
  return page.evaluate(async () => {
    (window as any).__SAFEBITE_BUILD__ = false;
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const t0 = performance.now();
    await (await load("/src/account/authPersistence.ts")).prepareAuthPersistence();
    const { auth, db } = await load("/src/firebase.ts");
    const { onAuthStateChanged } = await load("/node_modules/.vite/deps/firebase_auth.js");
    const first = await new Promise<{ uid: string | null; ms: number }>((resolve) => {
      const stop = onAuthStateChanged(auth, (user: { uid: string } | null) => {
        stop();
        resolve({ uid: user?.uid ?? null, ms: Math.round(performance.now() - t0) });
      });
    });
    const { doc, getDocFromServer } = await load(((await (await fetch("/src/firebase.ts")).text()).match(/"(\/node_modules\/.vite\/deps\/firebase_firestore\.js[^"]*)"/) ?? [])[1] ?? "/node_modules/.vite/deps/firebase_firestore.js");
    const t1 = performance.now();
    let code = "ok";
    try {
      await Promise.race([
        getDocFromServer(doc(db, "users", first.uid ?? "none")),
        new Promise((_, reject) => setTimeout(() => reject({ code: "probe-timeout-60s" }), 60_000)),
      ]);
    } catch (err) {
      code = ((err as { code?: string }).code ?? String(err)) + " :: " + String((err as Error).message).slice(0,120);
    }
    return { first, readMs: Math.round(performance.now() - t1), code };
  });
}

test.setTimeout(240_000);

for (const mode of ["airplane", "stall"] as const) {
  test(`stop 1 (${mode}): time to first auth callback and to the server membership read's failure`, async ({ page, context }) => {
    const uid = await signInOnHarness(page);
    const next = await context.newPage();
    await page.close(); // only one document holds the SDK from here on
    await next.goto("/e2e/auth-harness.html");
    await cutEmulators(next, mode);
    const result = await startAndMeasure(next);
    console.log(`STOP1 ${mode} ${JSON.stringify(result)}`);
    expect(result.first.uid).toBe(uid); // the saved sign-in is restored without the network
  });
}

test("stop 2: an expired saved token restores offline and refreshes on reconnection", async ({ page, context }) => {
  const uid = await signInOnHarness(page);
  const next = await context.newPage();
  await page.close(); // the signing-in document must not rewrite the token we age below
  await next.goto("/e2e/auth-harness.html");
  // Age the stored token past its expiry, as if the device had been closed for over an hour.
  await next.evaluate((key) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("firebaseLocalStorageDb");
    open.onsuccess = () => {
      const tx = open.result.transaction("firebaseLocalStorage", "readwrite");
      const store = tx.objectStore("firebaseLocalStorage");
      const get = store.get(key);
      get.onsuccess = () => {
        const record = get.result;
        record.value.stsTokenManager.expirationTime = Date.now() - 60_000;
        store.put(record);
      };
      tx.oncomplete = () => { open.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), KEY);
  await cutEmulators(next, "airplane");
  const restored = await startAndMeasure(next);
  expect(restored.first.uid).toBe(uid);
  await next.waitForTimeout(10_000);
  const still = await next.evaluate(async () => (await import(/* @vite-ignore */ "/src/firebase.ts")).auth.currentUser?.uid ?? null);
  expect(still).toBe(uid); // not signed out by the failed refresh
  await next.unroute(EMULATOR);
  await next.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    window.dispatchEvent(new Event("online"));
  });
  const token = await next.evaluate(async () => {
    const { auth } = await import(/* @vite-ignore */ "/src/firebase.ts");
    return (await auth.currentUser.getIdToken()).length;
  });
  expect(token).toBeGreaterThan(100);
  console.log(`STOP2 ok uid-kept=${still === uid}`);
});
