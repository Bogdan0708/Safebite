import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { passwordAccepted } from "./auth-rest";
import { PASSWORD, householdExists, restoreSeedAccounts, seedDeletionRecord, seedReceipt, setMemberIds } from "./account-rest";
import { clearRecords, listNoteIds, listRestaurantIds, seedClaim, seedNote, seedRestaurant } from "./emulator-rest";

const DELETE_URL = "**/europe-west2/deleteAccount";

// Deletion calls can hit a cold Functions worker; the client allows 70 s.
test.setTimeout(120_000);

test.beforeAll(async ({ request }) => {
  // Warm the new callables' worker outside any scenario's budget (any response will do).
  for (const name of ["checkAccountDeletion", "exportHousehold", "deleteAccount"]) {
    await request.post(`http://127.0.0.1:5001/demo-safebite/europe-west2/${name}`, { data: { data: { requestId: "x" } }, timeout: 120_000 }).catch(() => {});
  }
});

test.beforeEach(async ({ request }) => {
  await restoreSeedAccounts(request);
  await clearRecords(request);
});
test.afterEach(async ({ request }) => {
  await restoreSeedAccounts(request);
  await clearRecords(request);
});

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
}

async function deleteFromSettings(page: Page) {
  await page.goto("/settings");
  await page.getByTestId("delete-account-link").click();
  await expect(page.getByTestId("delete-consequence")).toBeVisible();
  await page.getByTestId("delete-password").fill(PASSWORD);
  await page.getByTestId("delete-submit").click();
}

test("1: Ava deletes her account; Bogdan sees her evidence as Former member and her notes are gone", async ({ page, request }) => {
  await seedRestaurant(request, "r1", { name: "Casa Teste" });
  await seedClaim(request, "r1", "c1");
  await seedNote(request, "r1", "n1", { authorUid: "ava-uid" });
  await seedNote(request, "r1", "n2", { authorUid: "bogdan-uid" });
  await signIn(page, "ava@safebite.test");
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toHaveText("Your account has been deleted.", { timeout: 90_000 });
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(false);
  expect(await listNoteIds(request, "r1")).toEqual(["n2"]);
  await signIn(page, "bogdan@safebite.test");
  await page.goto("/restaurants/r1");
  await expect(page.getByTestId("claim-c1")).toContainText("by Former member");
});

test("2: the last member's deletion removes the household", async ({ page, request }) => {
  await seedRestaurant(request, "r1");
  await setMemberIds(request, ["ava-uid"]);
  await signIn(page, "ava@safebite.test");
  await page.goto("/settings/delete-account");
  await expect(page.getByTestId("delete-consequence")).toContainText("Everything in the household is deleted.");
  await page.getByTestId("delete-password").fill(PASSWORD);
  await page.getByTestId("delete-submit").click();
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
  expect(await householdExists(request)).toBe(false);
  expect(await listRestaurantIds(request)).toEqual([]);
});

test("3: a response lost after the server finished is resolved by the receipt as success", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await page.route(DELETE_URL, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch({ timeout: 90_000 }); // the server runs the whole deletion
    await route.abort("failed");            // the browser never sees the answer
  });
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(false);
});

test("4: a request that never reached the server is 'confirmation unavailable', and deleting again works", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await page.route(DELETE_URL, (route) => (route.request().method() === "POST" ? route.abort("failed") : route.continue()));
  await deleteFromSettings(page);
  // Nothing reached the server, so there is no receipt: the screen must not claim either outcome.
  await expect(page.getByTestId("recovery-unavailable")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("recovery-unavailable")).not.toContainText("didn't finish");
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(true);
  await page.unroute(DELETE_URL);
  await page.getByTestId("recovery-continue").click();
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
});

test("5: signing in during an interrupted deletion offers Finish deleting your account", async ({ page, request }) => {
  await setMemberIds(request, ["bogdan-uid"]);
  await seedDeletionRecord(request, "ava-uid");
  await page.goto("/");
  await page.getByTestId("signin-email").fill("ava@safebite.test");
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("deletion-pending")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("pending-password").fill(PASSWORD);
  await page.getByTestId("pending-submit").click();
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(false);
});

test("6: deleting in one tab resets a second tab without test navigation", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  const other = await context.newPage();
  await other.goto("/restaurants");
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
  await other.evaluate(() => { (window as unknown as { marker: number }).marker = 1; });
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
  await expect(other.getByTestId("signin-form")).toBeVisible({ timeout: 30_000 });
  expect(await other.evaluate(() => (window as unknown as { marker?: number }).marker)).toBeUndefined();
});

test("7: export downloads a JSON file with the household's records", async ({ page, request }) => {
  await seedRestaurant(request, "r1", { name: "Casa Export" });
  await seedClaim(request, "r1", "c1");
  // Chromium on Linux has no file share; remove it explicitly so the fallback path is deterministic.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
  await signIn(page, "bogdan@safebite.test");
  await page.goto("/settings");
  await page.getByTestId("export-prepare").click();
  await expect(page.getByTestId("export-status")).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  const download = page.waitForEvent("download");
  await page.getByTestId("export-share").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^safebite-export-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(readFileSync(await file.path(), "utf8"));
  expect(json).toMatchObject({ format: "safebite-export", formatVersion: 1, exportedBy: "Bogdan" });
  expect(json.restaurants.map((r: { name: string }) => r.name)).toEqual(["Casa Export"]);
  expect(json.restaurants[0].evidence[0]).toMatchObject({ kind: "gfMenu", authorName: "Ava" });
});

test("8: an interrupted request for Ava never deletes Bogdan, who is signed in (implementation audit P1-1)", async ({ page, request }) => {
  // Ava's deletion stopped after step 2: she has left memberIds and her record exists.
  await setMemberIds(request, ["bogdan-uid"]);
  await seedDeletionRecord(request, "ava-uid");
  const requestId = "A".repeat(43);
  await seedReceipt(request, requestId, "ava-uid", "started");
  await signIn(page, "bogdan@safebite.test");
  await page.evaluate((id) => sessionStorage.setItem("safebite.deletionRequest", JSON.stringify({ requestId: id, uid: "ava-uid" })), requestId);
  await page.reload();
  await expect(page.getByTestId("recovery-other-account")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("finish-password")).toHaveCount(0);
  expect(await passwordAccepted(request, "bogdan@safebite.test", PASSWORD)).toBe(true);
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(true);
  expect(await householdExists(request)).toBe(true);
  await page.getByTestId("recovery-continue").click();
  await expect(page.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
});

/** The Firebase Auth persisted user's uid, read from the SDK's IndexedDB record; null when none. */
async function persistedUid(page: Page): Promise<string | null> {
  return page.evaluate(
    () => new Promise<string | null>((resolve) => {
      const open = indexedDB.open("firebaseLocalStorageDb");
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        const get = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").getAll();
        get.onsuccess = () => {
          const records = get.result as Array<{ fbase_key: string; value?: { uid?: string } }>;
          db.close();
          resolve(records.find((r) => r.fbase_key.startsWith("firebase:authUser:"))?.value?.uid ?? null);
        };
        get.onerror = () => { db.close(); resolve(null); };
      };
    }),
  );
}

// Scenarios 9 and 10 drive Firebase Auth's internal operations queue (auth.queue, _updateCurrentUser),
// pinned to @firebase/auth 1.13.6, to put Bogdan's sign-in ahead of completion deterministically.
// The app code under test is unmodified.
type QueueWindow = { queued?: (string | null)[]; release?: () => void };

/** Holds the page's Auth operations queue and records every uid passed to _updateCurrentUser (null = sign-out). */
async function holdQueue(page: Page) {
  await page.evaluate(async () => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path); // eslint-disable-line @typescript-eslint/no-explicit-any
    const { auth } = await load("/src/firebase.ts");
    const w = window as unknown as QueueWindow;
    w.queued = [];
    auth.queue(() => new Promise<void>((r) => (w.release = r)));
    const update = auth._updateCurrentUser.bind(auth);
    auth._updateCurrentUser = (u: { uid: string } | null, s?: boolean) => { w.queued!.push(u?.uid ?? null); return update(u, s); };
  });
}

/** Opens the held queue. Only a navigation that destroys the page's context is tolerated. */
async function releaseQueue(page: Page) {
  try {
    await page.evaluate(() => (window as unknown as QueueWindow).release?.());
  } catch (e) {
    if (!/Execution context was destroyed|navigation/i.test(String(e))) throw e;
  }
}

/** Real SDK sign-in of Bogdan in the other tab (shared persistence, ordinary storage notification). */
async function signInOnOther(other: Page, pw: string) {
  await other.evaluate(async (password) => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path); // eslint-disable-line @typescript-eslint/no-explicit-any
    const { auth } = await load("/src/firebase.ts");
    const { signInWithEmailAndPassword } = await load("/node_modules/.vite/deps/firebase_auth.js");
    await signInWithEmailAndPassword(auth, "bogdan@safebite.test", password);
  }, pw);
}

async function currentUid(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path); // eslint-disable-line @typescript-eslint/no-explicit-any
    return (await load("/src/firebase.ts")).auth.currentUser?.uid ?? null;
  });
}

const queuedHas = (page: Page, uid: string | null) =>
  page.waitForFunction((u) => ((window as unknown as QueueWindow).queued ?? []).includes(u), uid, { timeout: 30_000 });

test("9: completion never signs out a sign-in that was already queued (final review P2)", async ({ page, context, request }) => {
  await signIn(page, "ava@safebite.test");
  const other = await context.newPage();
  await other.goto("/restaurants");
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });

  let serverDone!: () => void;
  const completed = new Promise<void>((r) => (serverDone = r));
  let sendResponse!: () => void;
  const released = new Promise<void>((r) => (sendResponse = r));
  await page.route(DELETE_URL, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch({ timeout: 90_000 });
    await holdQueue(page);
    serverDone();
    await released;
    await route.fulfill({ response });
  });
  await page.goto("/settings/delete-account");
  await page.getByTestId("delete-password").fill(PASSWORD);
  await page.getByTestId("delete-submit").click();
  await completed;
  await signInOnOther(other, PASSWORD);
  await queuedHas(page, "bogdan-uid");

  // Two signals, decided by events: on the bug, completion queues a null sign-out behind Bogdan's update
  // (and its tab cannot go on until the queue opens); on the fix nothing null is queued and the tab reloads.
  const reloaded = page.waitForEvent("load", { timeout: 30_000 });
  const nullQueued = queuedHas(page, null);
  reloaded.catch(() => {});
  nullQueued.catch(() => {});
  sendResponse();
  const first = await Promise.race([reloaded.then(() => "reload" as const), nullQueued.then(() => "null" as const)]);
  if (first === "null") {
    await releaseQueue(page);
    await reloaded; // the bug path now drains Bogdan's update, the null update, and then reloads
  }
  // Settled: a fresh document (the held-queue instrumentation is gone), not the still-rendered old shell.
  await expect(async () => {
    expect(await page.evaluate(() => (window as unknown as QueueWindow).queued === undefined)).toBe(true);
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("nav-settings")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("signin-deleted-notice")).toHaveCount(0);
  // Bogdan is signed in on the other tab and stays so: a late storage-event sign-out must fail the test.
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => currentUid(other), { timeout: 30_000 }).toBe("bogdan-uid");
  for (const end = Date.now() + 3_000; Date.now() < end; ) {
    expect(await currentUid(other)).toBe("bogdan-uid");
    await other.waitForTimeout(300);
  }
  await expect(other.getByTestId("nav-settings")).toBeVisible();
  expect(await passwordAccepted(request, "ava@safebite.test", PASSWORD)).toBe(false);
  expect(await passwordAccepted(request, "bogdan@safebite.test", PASSWORD)).toBe(true);
  expect(await householdExists(request)).toBe(true);
});

test("10: control — the same queued account switch with no deletion keeps Bogdan and shows no notice", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  const other = await context.newPage();
  await other.goto("/restaurants");
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
  await holdQueue(page);
  await signInOnOther(other, PASSWORD);
  await queuedHas(page, "bogdan-uid");
  await releaseQueue(page);
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 30_000 });
  expect(await currentUid(other)).toBe("bogdan-uid");
  await expect(page.getByTestId("signin-deleted-notice")).toHaveCount(0);
});

test("11: completion removes only Ava's persisted user, so no reload looks her up and Bogdan's sign-in survives (final review P2)", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  const other = await context.newPage();
  await other.goto("/restaurants");
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
  // Once the server has deleted Ava, any account lookup by either tab is the SDK checking her deleted
  // user at start-up (and failing, which makes it remove the shared persisted-user key).
  const lookups: string[] = [];
  let deleted = false;
  context.on("response", (res) => { if (/deleteAccount/.test(res.url())) deleted = true; });
  context.on("request", (req) => { if (deleted && /accounts:lookup/.test(req.url())) lookups.push(req.url()); });
  await deleteFromSettings(page);
  await expect(page.getByTestId("signin-deleted-notice")).toBeVisible({ timeout: 90_000 });
  expect(await persistedUid(page)).not.toBe("ava-uid");
  await page.reload();
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await expect(other.getByTestId("signin-form")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  expect(lookups).toEqual([]);
  // Bogdan signs in in tab B and stays signed in in both tabs.
  await other.getByTestId("signin-email").fill("bogdan@safebite.test");
  await other.getByTestId("signin-password").fill(PASSWORD);
  await other.getByTestId("signin-submit").click();
  await expect(other.getByTestId("nav-settings")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("nav-settings")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("nav-settings")).toBeVisible();
  await expect(other.getByTestId("nav-settings")).toBeVisible();
  expect(await persistedUid(other)).toBe("bogdan-uid");
});
