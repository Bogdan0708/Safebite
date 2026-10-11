import { expect, test, type Page } from "@playwright/test";
import { restoreSeedAccounts, setMemberIds } from "./account-rest";
import { clearRecords, seedRestaurant } from "./emulator-rest";
import {
  copyMeta, copyRowCounts, cutServer, deleteHousehold, moveToHousehold, optInAndWait, reportOffline, restoreServer,
  seedHousehold, signIn, waitPastMembershipCheck,
} from "./offline-rest";

// Spec §3.9 "Tests → Browser" 4, 5, 6, 7, 12 and 13: isolation between accounts, revocation and
// cross-tab invalidation. Scenarios that change accounts, households or membership restore the
// seed afterwards so later spec files start from it.

test.setTimeout(120_000);
test.beforeEach(async ({ request }) => {
  await clearRecords(request);
  await seedHousehold(request);
});
test.afterEach(async ({ request }) => {
  await deleteHousehold(request, "home2");
  await restoreSeedAccounts(request);
});

const EMPTY = { meta: 0, restaurants: 0, claims: 0, collection: 0, notes: 0 };
const FULL = { meta: 1, restaurants: 2, claims: 3, collection: 1, notes: 2 };

/**
 * Installs the refresher's dev pause hook (between the server reads and the write) so that only
 * the first refresh to reach it waits, until `window.__releaseRefresh()` is called. Later refreshes
 * run straight through, so a re-run cannot leave the page waiting on a release nobody sends.
 */
function pauseFirstRefresh(): void {
  const w = window as unknown as { __SAFEBITE_REFRESH_PAUSE__?: () => Promise<void>; __releaseRefresh?: () => void };
  let paused = false;
  w.__SAFEBITE_REFRESH_PAUSE__ = () => {
    if (paused) return Promise.resolve();
    paused = true;
    return new Promise<void>((resolve) => { w.__releaseRefresh = resolve; });
  };
}

const refreshPaused = (page: Page) =>
  page.waitForFunction(() => typeof (window as unknown as { __releaseRefresh?: unknown }).__releaseRefresh === "function", undefined, { polling: 50, timeout: 30_000 });

const releaseRefresh = (page: Page) => page.evaluate(() => (window as unknown as { __releaseRefresh: () => void }).__releaseRefresh());

const optedIn = (page: Page, uid: string) =>
  page.evaluate(async (u) => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    return (await load("/src/offline/store.ts")).getOptIn(u) as Promise<boolean>;
  }, uid);

test("O4. after an account switch the next account sees no copy and nothing is stored", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  expect(await copyRowCounts(page)).toEqual(FULL); // control: Ava's copy is really there before the switch
  expect(await optedIn(page, "ava-uid")).toBe(true);
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await signIn(page, "bogdan@safebite.test");
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("offline-status")).toHaveText("Not stored on this device.");
  await expect(page.getByTestId("offline-switch")).not.toBeChecked();
  expect(await copyMeta(page)).toBeNull();
  expect(await copyRowCounts(page)).toEqual(EMPTY);
  expect(await optedIn(page, "ava-uid")).toBe(false);
  expect(await optedIn(page, "bogdan-uid")).toBe(false);
});

test("O5. a device clear in another tab wins over a refresh paused before its write", async ({ page, context }) => {
  // Spec test 5 names sign-out; sign-out runs the same clearDeviceData() but also resets tab A
  // (shared Auth state), which would discard the paused refresh instead of letting it try to write.
  // Clear device data runs the same cleanup and keeps tab A alive to observe its own refresh.
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  const before = await copyMeta(page);
  expect(before).not.toBeNull();
  await page.evaluate(pauseFirstRefresh);
  await page.getByTestId("offline-refresh").click();
  await refreshPaused(page); // the server reads are done; the write has not started
  await expect(page.getByTestId("offline-refresh")).toBeDisabled(); // running
  const other = await context.newPage();
  await other.goto("/settings");
  await expect(other.getByTestId("offline-section")).toBeVisible({ timeout: 15_000 });
  await other.getByTestId("device-clear").click();
  await expect(other.getByTestId("device-clear-result")).toHaveText("Data on this device was cleared.");
  expect(await copyMeta(page)).toBeNull();
  await releaseRefresh(page);
  // The refresh has finished (Refresh now is enabled again only when it is not running) and wrote nothing back.
  await expect(page.getByTestId("offline-refresh")).toBeEnabled({ timeout: 15_000 });
  expect(await copyMeta(page)).toBeNull();
  expect(await copyRowCounts(page)).toEqual(EMPTY);
  expect(await optedIn(page, "ava-uid")).toBe(false);
  await other.close();
});

test("O6. membership revoked while offline: reconnecting wipes the copy and shows today's screen", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await waitPastMembershipCheck(page);
  await cutServer(page); // navigator.onLine stays true: the reset after the wipe must reach the server
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("nav-saved")).toBeVisible();
  await setMemberIds(request, ["bogdan-uid"]);
  await restoreServer(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("not-invited")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("copy-banner")).toHaveCount(0);
  expect(await copyMeta(page)).toBeNull();
  expect(await copyRowCounts(page)).toEqual(EMPTY);
  expect(await optedIn(page, "ava-uid")).toBe(false);
});

test("O7. a household move replaces the copy and says so", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  expect((await copyMeta(page))?.householdId).toBe("home");
  await moveToHousehold(request, "ava-uid", "home2");
  // Hold the new copy's download before its write, so the "while it downloads" state can be read.
  await page.addInitScript(pauseFirstRefresh);
  await page.reload();
  await expect(page.getByTestId("household-changed")).toHaveText("Your household changed; the offline copy was replaced.", { timeout: 20_000 });
  await refreshPaused(page);
  expect(await copyMeta(page)).toBeNull(); // the old household's copy is gone before the new one is written
  expect(await copyRowCounts(page)).toEqual(EMPTY);
  await releaseRefresh(page);
  await expect.poll(async () => (await copyMeta(page))?.householdId ?? null, { timeout: 30_000 }).toBe("home2");
  expect(await copyRowCounts(page)).toEqual({ ...EMPTY, meta: 1 }); // home2 has no records
  await expect(page.getByTestId("household-changed")).toHaveCount(0); // shown only while the new copy downloads
});

test("O12. membership revoked while the app is open online: the listener denial wipes the copy", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurant-row")).toHaveText([/Riverside/]);
  await expect(page.getByTestId("copy-banner")).toHaveCount(0); // a live member, not reading the copy
  expect(await copyRowCounts(page)).toEqual(FULL);
  await setMemberIds(request, ["bogdan-uid"]);
  // The emulator does not re-evaluate an open listener's rules when only the household document
  // changes (measured: no denial within 30 s). A change to a record the listener watches makes it
  // re-evaluate, as another member's write would; the rules then deny Ava and the listener reports it.
  await seedRestaurant(request, "r3", { name: "Another member's add" });
  await expect(page.getByTestId("not-invited")).toBeVisible({ timeout: 30_000 });
  expect(await copyMeta(page)).toBeNull();
  expect(await copyRowCounts(page)).toEqual(EMPTY);
  expect(await optedIn(page, "ava-uid")).toBe(false);
});

test("O13. turning the copy off in one tab removes copy data already shown in another", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await waitPastMembershipCheck(page);
  const reader = await context.newPage();
  await reportOffline(reader);
  await cutServer(reader);
  await reader.goto("/restaurants");
  await expect(reader.getByTestId("copy-banner")).toBeVisible({ timeout: 20_000 });
  await expect(reader.getByTestId("restaurant-row")).toHaveText([/Riverside/]); // copy data on screen
  await page.getByTestId("offline-switch").click();
  await page.getByTestId("offline-remove-confirm").click();
  await expect(page.getByTestId("offline-status")).toHaveText("Not stored on this device.");
  // The reader resets itself and start-up decides afresh: no copy and no server, so today's error screen.
  await expect(reader.getByTestId("membership-error")).toContainText("Couldn't check your membership. Check your connection and try again.", { timeout: 20_000 });
  await expect(reader.getByTestId("copy-banner")).toHaveCount(0);
  await expect(reader.getByTestId("restaurant-row")).toHaveCount(0);
  await expect(reader.getByTestId("nav-saved")).toHaveCount(0);
  expect(await copyMeta(reader)).toBeNull();
  await reader.close();
});
