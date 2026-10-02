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
