import { expect, test, type Page } from "@playwright/test";
import { clearRecords, listRestaurantIds } from "./emulator-rest";
import {
  copyMeta, copyRecords, copyRowCounts, cutServer, optInAndWait, renameRestaurant, reportOffline, restoreServer,
  seedHousehold, signIn, stallServer, waitPastMembershipCheck, watchServerWrites,
} from "./offline-rest";

// Spec §3.9 "Tests → Browser" 1, 2, 3, 8, 9, 10, 11 and 14. The Vite dev server stays reachable:
// "offline" aborts the emulator origins, "stalled" never answers them, and navigator.onLine is
// stubbed only where a scenario needs the fast path.

test.setTimeout(90_000);
test.beforeEach(async ({ request }) => {
  await clearRecords(request);
  await seedHousehold(request);
});

/** The ids of the rendered notes, top to bottom. */
const noteOrder = (page: Page) => page.locator("article.note").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));

test("O1. an opted-in copy opens with no connection: restaurants, evidence with history, both members' notes; writes disabled", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await waitPastMembershipCheck(page);
  await reportOffline(page);
  await cutServer(page);
  const writes = watchServerWrites(page);
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toContainText("Offline copy from", { timeout: 15_000 });
  await expect(page.getByTestId("copy-banner")).toContainText("Adding and editing need a connection.");
  await page.getByTestId("nav-saved").click();
  // The shortlist comes from the copy's collection state; All records from its restaurants, by name.
  await expect(page.getByTestId("restaurant-row")).toHaveText([/Riverside/]);
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("restaurant-row")).toHaveText([/Riverside/, /Zest/]);
  await page.getByTestId("restaurant-row").filter({ hasText: "Riverside" }).getByRole("link").click();
  await expect(page.getByTestId("restaurant-name")).toHaveText("Riverside");
  await expect(page.getByTestId("shortlist-state")).toHaveText("On shortlist");
  // Evidence: the newest answer is current, the older one sits in the history.
  await expect(page.getByTestId("evidence-gfMenu")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("evidence-gfMenu").locator(".evidence-summary + [data-testid='claim-c-new']")).toContainText("Yes");
  await expect(page.getByTestId("evidence-gfMenu").getByText("Older evidence (1)")).toBeVisible();
  await expect(page.getByTestId("claim-c-old")).toHaveAttribute("data-status", "needsRechecking");
  await expect(page.getByTestId("claim-c-old")).toContainText("No");
  // Both members' notes, newest first.
  await expect(page.getByTestId("note-n-bogdan")).toContainText("Staff were helpful.");
  await expect(page.getByTestId("note-n-bogdan")).toContainText("Bogdan");
  await expect(page.getByTestId("note-n-ava")).toContainText("Ask about the fryer.");
  expect(await noteOrder(page)).toEqual(["note-n-bogdan", "note-n-ava"]);
  // Writes disabled; the copy banner is the only notice.
  await expect(page.getByTestId("add-evidence")).toHaveAttribute("aria-disabled", "true");
  await page.getByTestId("add-evidence").click({ force: true }); // aria-disabled: Playwright would wait for it to be enabled
  await expect(page).toHaveURL(/\/restaurants\/r1$/);
  await expect(page.getByTestId("note-add-save")).toBeDisabled();
  await expect(page.getByTestId("note-edit-n-ava")).toBeDisabled();
  await expect(page.getByTestId("claim-delete-c-new")).toBeDisabled();
  await expect(page.getByTestId("shortlist-remove")).toBeDisabled();
  await expect(page.getByTestId("read-offline")).toHaveCount(0);
  await expect(page.getByTestId("copy-banner")).toHaveCount(1);
  expect(writes).toEqual([]);
});

test("O2. with the app already open, a record never opened before reads from the copy when the connection drops", async ({ page, context }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.getByTestId("nav-saved").click();
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("restaurant-row")).toHaveText([/Riverside/, /Zest/]);
  await expect(page.getByTestId("copy-banner")).toHaveCount(0); // online: server data, no banner
  await waitPastMembershipCheck(page);
  await context.setOffline(true);
  // Zest's evidence was never loaded in this document: it can only come from the copy.
  await page.getByTestId("restaurant-row").filter({ hasText: "Zest" }).getByRole("link").click();
  await expect(page.getByTestId("restaurant-name")).toHaveText("Zest", { timeout: 20_000 });
  await expect(page.getByTestId("evidence-separateFryer")).toHaveAttribute("data-state", "current", { timeout: 20_000 });
  await expect(page.getByTestId("claim-c-fryer")).toContainText("Yes");
  await expect(page.getByTestId("copy-banner")).toContainText("Offline copy from");
  await expect(page.getByTestId("add-evidence")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("note-add-save")).toBeDisabled();
  await page.close(); // before reconnecting, so the dev server's reconnect reload cannot reach another test
});

test("O3. on a stalled connection the copy opens early instead of waiting for sign-in", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await waitPastMembershipCheck(page);
  await stallServer(page);
  const started = performance.now(); // monotonic: the wall clock here steps back now and then
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toBeVisible({ timeout: 12_000 });
  const elapsed = Math.round(performance.now() - started);
  test.info().annotations.push({ type: "early-open-ms", description: String(elapsed) });
  // EARLY_OPEN_MS is 3 s; Auth itself answers only after ~30 s on a stalled connection.
  expect(elapsed).toBeGreaterThanOrEqual(3_000);
  expect(elapsed).toBeLessThan(8_000);
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurant-row")).toHaveText([/Riverside/]); // shortlist
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("restaurant-row")).toHaveText([/Riverside/, /Zest/]);
  await page.getByTestId("restaurant-row").filter({ hasText: "Riverside" }).getByRole("link").click();
  await expect(page.getByTestId("note-n-bogdan")).toContainText("Staff were helpful.");
  await expect(page.getByTestId("note-add-save")).toBeDisabled();
});

test("O8. a copy whose last membership check is over 30 days old needs a connection", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  const checkedAt = (await copyMeta(page))!.membershipCheckedAt;
  await cutServer(page);
  // Control: 29 days on, the same copy still opens (with the week-old banner).
  await page.clock.install({ time: new Date(checkedAt + 29 * 86_400_000) });
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toHaveAttribute("data-old", "true", { timeout: 30_000 });
  await expect(page.getByTestId("copy-banner")).toContainText("This offline copy is over a week old.");
  // 31 days on, the copy needs a connection to confirm access; it is kept, not wiped.
  await page.clock.setSystemTime(new Date(checkedAt + 31 * 86_400_000));
  await page.reload();
  await expect(page.getByTestId("membership-error")).toContainText("This offline copy needs a connection to confirm your access.", { timeout: 30_000 });
  await expect(page.getByTestId("copy-banner")).toHaveCount(0);
  await expect(page.getByTestId("nav-saved")).toHaveCount(0);
  expect((await copyMeta(page))?.membershipCheckedAt).toBe(checkedAt);
});

test("O9. switching off asks, then removes the copy from this device", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  expect(await copyRowCounts(page)).toEqual({ meta: 1, restaurants: 2, claims: 3, collection: 1, notes: 2 });
  // Keep: nothing changes.
  await page.getByTestId("offline-switch").click();
  await expect(page.getByTestId("offline-remove-question")).toHaveText("Remove the offline copy from this device?");
  await page.getByTestId("offline-remove-cancel").click();
  await expect(page.getByTestId("offline-remove-question")).toHaveCount(0);
  await expect(page.getByTestId("offline-switch")).toBeChecked();
  expect(await copyMeta(page)).not.toBeNull();
  // Remove: the copy and its records are gone.
  await page.getByTestId("offline-switch").click();
  await page.getByTestId("offline-remove-confirm").click();
  await expect(page.getByTestId("offline-status")).toHaveText("Not stored on this device.");
  await expect(page.getByTestId("offline-switch")).not.toBeChecked();
  await expect.poll(() => copyMeta(page)).toBeNull();
  expect(await copyRowCounts(page)).toEqual({ meta: 0, restaurants: 0, claims: 0, collection: 0, notes: 0 });
  // And it stays off after a reload (no new download).
  await page.reload();
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("offline-status")).toHaveText("Not stored on this device.");
  expect(await copyMeta(page)).toBeNull();
});

test("O10. an interrupted refresh keeps the previous copy and its time", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  const before = await copyMeta(page);
  expect(before).not.toBeNull();
  await renameRestaurant(request, "r1", "Riverside Renamed"); // a change the failed refresh must not half-apply
  await cutServer(page);
  await page.getByTestId("offline-refresh").click();
  await expect(page.getByTestId("offline-status")).toContainText("Last update failed · copy from", { timeout: 45_000 });
  await expect(page.getByTestId("offline-reason")).toBeVisible();
  expect((await copyMeta(page))!.downloadedAt).toBe(before!.downloadedAt);
  expect((await copyRecords(page))!.names).toEqual(["Riverside", "Zest"]);
  // With the server back, the same refresh succeeds: the failure alone kept the old copy.
  await restoreServer(page);
  await page.getByTestId("offline-retry").click();
  await expect(page.getByTestId("offline-status")).toContainText("Ready offline", { timeout: 30_000 });
  expect((await copyMeta(page))!.downloadedAt).toBeGreaterThan(before!.downloadedAt);
  expect((await copyRecords(page))!.names).toEqual(["Riverside Renamed", "Zest"]);
});

test("O11. offline, Discover says search needs a connection and Enter does not search", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await waitPastMembershipCheck(page);
  await reportOffline(page);
  await cutServer(page);
  const writes = watchServerWrites(page);
  await page.reload();
  await expect(page.getByTestId("copy-banner")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("nav-discover").click();
  await expect(page.getByTestId("discover-offline")).toHaveText("Search needs a connection.");
  await expect(page.getByTestId("discover-submit")).toHaveCount(0);
  await expect(page.getByTestId("discover-nearby")).toHaveCount(0);
  await page.getByTestId("discover-query").fill("Lisbon");
  await page.getByTestId("discover-query").press("Enter");
  await expect(page.getByTestId("discover-results")).toHaveCount(0);
  expect(writes).toEqual([]); // no function call was attempted
});

/**
 * Submits the form programmatically (as Enter or a stale click would, whatever the button's state)
 * and reports what the submit handler rendered while it ran. Both form handlers set `busy` (the
 * button reads "Saving…") synchronously before they call the write, and show a field error or a
 * save outcome when validation or the write fails; the observer runs from before the submit until
 * two frames after it, by which time React has rendered every update the handler queued.
 */
async function submitAndWatch(page: Page, formTestId: string): Promise<string[]> {
  return page.getByTestId(formTestId).evaluate(async (form: HTMLFormElement) => {
    const seen = new Set<string>();
    const scan = () => {
      if (form.querySelector('button[type="submit"]')?.textContent?.includes("Saving")) seen.add("saving");
      if (document.querySelector(".field-error")) seen.add("field-error");
      if (document.querySelector('[data-testid="save-outcome"], [data-testid="claim-save-outcome"]')) seen.add("outcome");
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    scan();
    observer.disconnect();
    return [...seen];
  });
}

test("O14a. write routes opened directly while offline show the notice with their controls disabled", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await waitPastMembershipCheck(page);
  await reportOffline(page);
  await cutServer(page);
  const writes = watchServerWrites(page);
  await page.goto("/restaurants/r1/evidence/new");
  await expect(page.getByTestId("write-blocked")).toHaveText("Adding and editing need a connection.", { timeout: 15_000 });
  await expect(page.getByTestId("claim-submit")).toBeDisabled();
  // A valid claim (kind, value, source type and checked date default to valid values), so only the gate can stop it.
  await page.getByTestId("claim-detail").fill("Separate prep area confirmed.");
  await page.getByTestId("claim-source-label").fill("Phone call with the manager");
  expect(await submitAndWatch(page, "claim-form")).toEqual([]);
  await expect(page.getByTestId("claim-submit")).toHaveText("Save evidence");
  await expect(page).toHaveURL(/\/restaurants\/r1\/evidence\/new$/);
  await page.goto("/restaurants/new");
  await expect(page.getByTestId("write-blocked")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("save-restaurant")).toBeDisabled();
  await page.getByTestId("field-name").fill("Offline Attempt");
  await page.getByTestId("field-address").fill("1 Nowhere Lane");
  expect(await submitAndWatch(page, "restaurant-form")).toEqual([]);
  await expect(page.getByTestId("save-restaurant")).toHaveText("Save");
  await expect(page).toHaveURL(/\/restaurants\/new$/);
  expect(writes).toEqual([]); // checked last: no write was even attempted
  // Sanity only: cutServer aborts every emulator request, so nothing could have been created here.
  expect((await listRestaurantIds(request)).sort()).toEqual(["r1", "r2"]);
});

test("O14b. a form open when the connection drops disables its submit and sends nothing", async ({ page, context, request }) => {
  await signIn(page, "ava@safebite.test");
  await optInAndWait(page);
  await page.goto("/restaurants/new");
  await expect(page.getByTestId("save-restaurant")).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId("write-blocked")).toHaveCount(0);
  await page.getByTestId("field-name").fill("Dropped Connection");
  await page.getByTestId("field-address").fill("2 Signal Street");
  const writes = watchServerWrites(page);
  await context.setOffline(true);
  await expect(page.getByTestId("save-restaurant")).toBeDisabled();
  await expect(page.getByTestId("write-blocked")).toHaveText("Adding and editing need a connection.");
  expect(await submitAndWatch(page, "restaurant-form")).toEqual([]); // Enter or a stale click
  await expect(page).toHaveURL(/\/restaurants\/new$/);
  await expect(page.getByTestId("field-name")).toHaveValue("Dropped Connection"); // the draft stays
  // Writes are server transactions, never queued: reconnecting sends nothing either.
  await context.setOffline(false);
  await expect(page.getByTestId("save-restaurant")).toBeEnabled();
  expect(writes).toEqual([]);
  expect((await listRestaurantIds(request)).sort()).toEqual(["r1", "r2"]);
  // Control: the same draft, submitted the same way once online, reaches the write and the probe sees it.
  expect(await submitAndWatch(page, "restaurant-form")).toContain("saving");
  await expect(page.getByTestId("restaurant-name")).toHaveText("Dropped Connection", { timeout: 15_000 });
  expect(writes.length).toBeGreaterThan(0);
  expect(await listRestaurantIds(request)).toHaveLength(3);
  await page.close(); // before the dev server's reconnect reload can reach another test
});
