import { expect, test, type Page } from "@playwright/test";
import {
  clearRecords,
  collectionExists,
  getCollectionVisit,
  listClaimIds,
  listNoteIds,
  markDeletingViaRest,
  restaurantExists,
  seedClaim,
  seedCollection,
  seedNote,
  seedRestaurant,
  sweepClaimsViaRest,
  updateNoteViaRest,
  writeVisitedByBogdanViaRest,
} from "./emulator-rest";

const PASSWORD = "pilot-password-1";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-saved")).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await clearRecords(request);
});

test("C1. a shortlist change by one member appears live on the other member's Saved page", async ({ page, browser, request }) => {
  await seedRestaurant(request, "r-a", { name: "Da Marco" });
  await seedRestaurant(request, "r-b", { name: "Zest" });

  const bogdanContext = await browser.newContext();
  const bogdan = await bogdanContext.newPage();
  await signIn(bogdan, "bogdan@safebite.test");
  await bogdan.getByTestId("nav-saved").click();
  await expect(bogdan.getByTestId("shortlist-empty")).toBeVisible();

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-a");
  await page.getByTestId("shortlist-add").click();
  await expect(page.getByTestId("shortlist-state")).toHaveText("On shortlist");
  await expect(page.getByTestId("status-changed-by")).toHaveText("Last changed by Ava");

  await expect(bogdan.getByTestId("restaurant-row")).toHaveCount(1);
  await expect(bogdan.getByTestId("restaurant-row")).toContainText("Da Marco");
  await expect(bogdan.getByTestId("label-shortlisted")).toBeVisible();
  await bogdan.getByTestId("filter-all").click();
  await expect(bogdan.getByTestId("restaurant-row")).toHaveCount(2);
  await bogdanContext.close();
  expect(await collectionExists(request, "r-a")).toBe(true);
});

test("C2. mark visited, change the date, and clear it", async ({ page, request }) => {
  await seedRestaurant(request, "r-v", { name: "Visited Place" });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-v");
  await page.getByTestId("visited-mark").click();
  await page.getByTestId("visited-date").fill("2026-05-03");
  await page.getByTestId("visited-save").click();
  await expect(page.getByTestId("visited-state")).toHaveText("Visited 3 May 2026");

  await page.getByTestId("visited-change").click();
  await page.getByTestId("visited-date").fill("2026-05-10");
  await page.getByTestId("visited-save").click();
  await expect(page.getByTestId("visited-state")).toHaveText("Visited 10 May 2026");

  await page.getByTestId("nav-saved").click();
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("label-visited")).toHaveText("Visited 10 May 2026");

  await page.goto("/restaurants/r-v");
  await page.getByTestId("visited-clear").click();
  await expect(page.getByTestId("visited-mark")).toBeVisible();
});

test("C3. both members write notes; only the author can edit or delete", async ({ page, browser, request }) => {
  await seedRestaurant(request, "r-n", { name: "Notes Place" });
  await seedNote(request, "r-n", "n-ava", { authorUid: "ava-uid", text: "Ava: staff checked with the chef" });

  const bogdanContext = await browser.newContext();
  const bogdan = await bogdanContext.newPage();
  await signIn(bogdan, "bogdan@safebite.test");
  await bogdan.goto("/restaurants/r-n");
  await expect(bogdan.getByTestId("note-n-ava")).toContainText("Ava: staff checked with the chef");
  await expect(bogdan.getByTestId("note-edit-n-ava")).toHaveCount(0);
  await expect(bogdan.getByTestId("note-delete-n-ava")).toHaveCount(0);
  await bogdan.getByTestId("note-add-text").fill("Bogdan: fryer is shared, avoid chips");
  await bogdan.getByTestId("note-add-save").click();
  const bogdanEdit = bogdan.locator('[data-testid^="note-edit-"]');
  await expect(bogdanEdit).toHaveCount(1);
  await bogdanEdit.click();
  await bogdan.locator('[data-testid^="note-edit-text-"]').fill("Bogdan: fryer is shared, no chips");
  await bogdan.locator('[data-testid^="note-save-"]').click();

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-n");
  await expect(page.getByTestId("notes-section")).toContainText("Bogdan: fryer is shared, no chips");
  await expect(page.getByTestId("notes-section")).toContainText("edited");
  await expect(page.locator('[data-testid^="note-edit-"]')).toHaveCount(1); // only her own
  await page.getByTestId("note-delete-n-ava").click();
  await page.getByTestId("note-delete-confirm-n-ava").click();
  await expect(page.getByTestId("note-n-ava")).toHaveCount(0);
  await expect(bogdan.getByTestId("note-n-ava")).toHaveCount(0);
  await bogdanContext.close();
  expect(await listNoteIds(request, "r-n")).toHaveLength(1);
});

test("C4. deleting a restaurant removes its evidence, both members' notes and its shortlist state", async ({ page, request }) => {
  await seedRestaurant(request, "r-del", { name: "Doomed" });
  await seedClaim(request, "r-del", "c1");
  await seedNote(request, "r-del", "n1", { authorUid: "ava-uid" });
  await seedNote(request, "r-del", "n2", { authorUid: "bogdan-uid" });
  await seedCollection(request, "r-del", { shortlisted: true, visitedOn: "2026-05-03" });

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-del/edit");
  await expect(page.getByTestId("field-name")).toHaveValue("Doomed");
  await page.getByTestId("delete-restaurant").click();
  await expect(page.getByTestId("delete-question")).toHaveText("Deletes the restaurant, its evidence, and both members' notes.");
  await page.getByTestId("delete-confirm").click();
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });

  expect(await restaurantExists(request, "r-del")).toBe(false);
  expect(await listClaimIds(request, "r-del")).toEqual([]);
  expect(await listNoteIds(request, "r-del")).toEqual([]);
  expect(await collectionExists(request, "r-del")).toBe(false);
});

test("C5. a deletion an older client left half-done is finished from the Saved page", async ({ page, request }) => {
  await seedRestaurant(request, "r-old", { name: "Half Gone" });
  await seedClaim(request, "r-old", "c1");
  await seedNote(request, "r-old", "n1", { authorUid: "bogdan-uid" });
  await seedCollection(request, "r-old");
  await markDeletingViaRest(request, "r-old");
  await sweepClaimsViaRest(request, "r-old"); // the old client got this far; the gate refused its final delete

  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });
  expect(await restaurantExists(request, "r-old")).toBe(false);
  expect(await listNoteIds(request, "r-old")).toEqual([]);
  expect(await collectionExists(request, "r-old")).toBe(false);
});

test("C6. a note edited on another device surfaces as a conflict, and Keep mine wins with the new version", async ({ page, request }) => {
  await seedRestaurant(request, "r-c", { name: "Conflict Cafe" });
  await seedNote(request, "r-c", "n-ava", { authorUid: "ava-uid", text: "First thoughts" });

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-c");
  await page.getByTestId("note-edit-n-ava").click();
  await page.getByTestId("note-edit-text-n-ava").fill("My draft from the laptop");
  await updateNoteViaRest(request, "r-c", "n-ava", "Written on the phone", 2);
  await expect(page.getByTestId("note-n-ava")).toHaveAttribute("data-version", "2");
  await page.getByTestId("note-save-n-ava").click();
  await expect(page.getByTestId("note-conflict-current-n-ava")).toHaveText("Written on the phone");
  await expect(page.getByTestId("note-edit-text-n-ava")).toHaveValue("My draft from the laptop");
  await page.getByTestId("note-keep-mine-n-ava").click();
  await expect(page.getByTestId("note-n-ava")).toContainText("My draft from the laptop");
  await expect(page.getByTestId("note-n-ava")).toHaveAttribute("data-version", "3");
});

test("C7. while offline the page says so once and every write control is disabled", async ({ page, context, request }) => {
  await seedRestaurant(request, "r-off", { name: "Offline Place" });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-off");
  await expect(page.getByTestId("shortlist-add")).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByTestId("read-offline")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId("shortlist-add")).toBeDisabled();
  await expect(page.getByTestId("note-add-save")).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId("shortlist-add")).toBeEnabled({ timeout: 15_000 });
  expect(await collectionExists(request, "r-off")).toBe(false);
});

test("C8. a visit-date draft left open while the other member saves a date ends in a conflict, not an overwrite", async ({ page, request }) => {
  await seedRestaurant(request, "r-d", { name: "Draft Diner" });
  await seedCollection(request, "r-d", { shortlisted: false, visitedOn: "2026-05-03", version: 1 });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-d");
  await expect(page.getByTestId("visited-state")).toHaveText("Visited 3 May 2026");
  await page.getByTestId("visited-change").click();
  await page.getByTestId("visited-date").fill("2026-05-04");

  await writeVisitedByBogdanViaRest(request, "r-d", "2026-05-10", 2);
  await expect(page.getByTestId("status-changed-by")).toHaveText("Last changed by Bogdan");
  await expect(page.getByTestId("visited-date")).toHaveValue("2026-05-04");
  await page.getByTestId("visited-save").click();

  await expect(page.getByTestId("status-outcome")).toHaveAttribute("data-kind", "conflict");
  await expect(page.getByTestId("visited-state")).toHaveText("Visited 10 May 2026");
  expect(await getCollectionVisit(request, "r-d")).toEqual({ visitedOn: "2026-05-10T00:00:00Z", version: 2, updatedByName: "Bogdan" });
});

test("C8b. a Mark visited draft opened before any state existed conflicts once the other member creates it", async ({ page, request }) => {
  await seedRestaurant(request, "r-d0", { name: "Draft Zero" });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-d0");
  await page.getByTestId("visited-mark").click();
  await page.getByTestId("visited-date").fill("2026-05-04");

  await writeVisitedByBogdanViaRest(request, "r-d0", "2026-05-10", 1);
  await expect(page.getByTestId("status-changed-by")).toHaveText("Last changed by Bogdan");
  await page.getByTestId("visited-save").click();

  await expect(page.getByTestId("status-outcome")).toHaveAttribute("data-kind", "conflict");
  await expect(page.getByTestId("visited-state")).toHaveText("Visited 10 May 2026");
  expect(await getCollectionVisit(request, "r-d0")).toEqual({ visitedOn: "2026-05-10T00:00:00Z", version: 1, updatedByName: "Bogdan" });
});
