import { expect, test, type Page } from "@playwright/test";
import { clearRecords, clearUsage, deleteDiscoveryConfig, getRestaurant, listRestaurantIds, seedRestaurant, setDiscoveryConfig, setUsage } from "./emulator-rest";

const PASSWORD = "pilot-password-1";
// Mirrors functions/src/discovery/fixtureProvider.ts MAGIC (web/e2e cannot import from functions/).
const MAGIC = { empty: "__empty__", unavailable: "__unavailable__", quota: "__quota__", slow: "__slow__", delayed: "__delayed__" };
const utcDay = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-discover")).toBeVisible();
}

async function openDiscover(page: Page) {
  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-discover").click();
  await expect(page.getByTestId("discover-state")).toHaveAttribute("data-status", "idle");
}

async function search(page: Page, query: string) {
  await page.getByTestId("discover-query").fill(query);
  await page.getByTestId("discover-submit").click();
}

const stateOf = (page: Page) => page.getByTestId("discover-state");

// Audit F1 (scenarios 12-13): defer the geolocation callback so a Near me request can be made to
// resolve after a newer search, or after the page has been left, without waiting on a real device.
async function delayLocation(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          Reflect.set(window, "__resolveDelayedLocation", () => success({ coords: { latitude: 51.5, longitude: -0.12 } } as GeolocationPosition));
        },
      },
    });
  });
}

test.beforeEach(async ({ request }) => {
  await clearRecords(request);
  await clearUsage(request);
  await setDiscoveryConfig(request, { enabled: true, dailySearchCap: 50 });
});

test("1. a destination search lists fixture results with Google Maps attribution, links and add buttons", async ({ page }) => {
  await openDiscover(page);
  await search(page, "Lisbon");
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  await expect(page.getByTestId("discover-result").first()).toContainText("Fixture Trattoria");
  await expect(page.getByTestId("discover-result").first()).toHaveAttribute("data-place-id", "fixture-01");
  await expect(page.getByTestId("result-name").first()).toHaveAttribute("href", "https://example.invalid/maps/fixture-01");
  await expect(page.getByTestId("result-directions").first()).toHaveAttribute("href", /destination_place_id=fixture-01$/);
  await expect(page.getByTestId("result-add")).toHaveCount(10);
  const logo = page.getByTestId("google-attribution").locator("img");
  await expect(logo).toHaveAttribute("alt", "Google Maps");
  await expect(logo).toBeVisible();
  expect((await page.request.get("/google/GoogleMaps_Logo_Gray.svg")).ok()).toBe(true);
  await expect(page.getByTestId("ranking-note")).toContainText("order Google Maps returns them");
  await expect(page.getByTestId("discover-query")).toHaveValue("Lisbon");
});

test("destination and named-venue intent reach the callable only on submit", async ({ page }) => {
  const calls: unknown[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/searchDestination")) {
      calls.push(request.postDataJSON());
    }
  });
  await openDiscover(page);
  await expect(page.getByTestId("discover-mode")).toHaveValue("destination");
  expect(calls).toEqual([]);
  await search(page, "Lisbon");
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  expect(calls).toEqual([{ data: { query: "Lisbon", mode: "destination" } }]);

  await page.getByTestId("discover-mode").selectOption("venue");
  await page.getByTestId("discover-query").fill("Fixture Café");
  expect(calls).toHaveLength(1);
  const response = page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith("/searchDestination"));
  await page.getByTestId("discover-submit").click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  expect(calls).toEqual([
    { data: { query: "Lisbon", mode: "destination" } },
    { data: { query: "Fixture Café", mode: "venue" } },
  ]);
});

test("2. no results shows the empty state and no attribution", async ({ page }) => {
  await openDiscover(page);
  await search(page, MAGIC.empty);
  await expect(stateOf(page)).toHaveAttribute("data-status", "empty");
  await expect(stateOf(page)).toContainText("__empty__");
  await expect(page.getByTestId("google-attribution")).toHaveCount(0);
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
});

test("3. the kill switch: disabled and missing config both read as switched off", async ({ page, request }) => {
  await setDiscoveryConfig(request, { enabled: false, dailySearchCap: 50 });
  await openDiscover(page);
  await search(page, "Lisbon");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "off");
  await expect(stateOf(page)).toContainText("switched off");
  await deleteDiscoveryConfig(request);
  await search(page, "Porto");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "off");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
});

test("4. the household's daily cap is enforced and usage is not consumed past it", async ({ page, request }) => {
  await setDiscoveryConfig(request, { enabled: true, dailySearchCap: 2 });
  await setUsage(request, utcDay(), 1);
  await openDiscover(page);
  await search(page, "one");
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  await search(page, "two");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "dailyCap");
  await expect(stateOf(page)).toContainText("limit");
});

test("5. provider failures: unavailable and quota exceeded, never sample venues", async ({ page }) => {
  await openDiscover(page);
  await search(page, MAGIC.unavailable);
  await expect(stateOf(page)).toHaveAttribute("data-reason", "unavailable");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
  await search(page, MAGIC.quota);
  await expect(stateOf(page)).toHaveAttribute("data-reason", "providerQuota");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
});

test("6. a search that never answers times out on the client", async ({ page }) => {
  test.setTimeout(90_000);
  await openDiscover(page);
  await search(page, MAGIC.slow);
  await expect(stateOf(page)).toHaveAttribute("data-status", "searching");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "timeout", { timeout: 30_000 });
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
});

test("7. a newer search supersedes a slower one; the late answer never replaces it", async ({ page }) => {
  await openDiscover(page);
  await search(page, MAGIC.delayed);
  await expect(stateOf(page)).toHaveAttribute("data-status", "searching");
  await search(page, "pizza");
  // The Functions emulator's AUTO mode cold-spawns a second worker while __delayed__ holds the
  // warm one (and scenario 6's __slow__ may still hold another), so this second search's results
  // can take longer than the default 5 s expect timeout.
  await expect(page.getByTestId("discover-result")).toHaveCount(10, { timeout: 30_000 });
  await page.waitForTimeout(4_500); // longer than the fixture's 3 s delay
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
  await expect(page.getByText("Delayed Diner")).toHaveCount(0);
});

test.describe("Near me with location granted", () => {
  test.use({ geolocation: { latitude: 51.5074, longitude: -0.1278 }, permissions: ["geolocation"] });

  test("8. Near me searches around the granted position", async ({ page }) => {
    await openDiscover(page);
    await page.getByTestId("discover-nearby").click();
    await expect(page.getByTestId("discover-result")).toHaveCount(10);
    await expect(stateOf(page)).toHaveCount(0);
  });
});

test("9. Near me without permission shows the denied state and calls nothing", async ({ page, request }) => {
  await setDiscoveryConfig(request, { enabled: true, dailySearchCap: 1 });
  await openDiscover(page);
  await page.getByTestId("discover-nearby").click();
  // Playwright grants no permissions by default; Chromium answers getCurrentPosition with PERMISSION_DENIED (code 1).
  await expect(stateOf(page)).toHaveAttribute("data-reason", "locationDenied");
  // The cap of 1 is untouched: a destination search still succeeds.
  await search(page, "Lisbon");
  await expect(page.getByTestId("discover-result")).toHaveCount(10);
});

test("10. Add to our records carries only the place id; the member types name and address; the saved record links to Google Maps and the result shows In our records", async ({ page, request }) => {
  await openDiscover(page);
  await search(page, "Lisbon");
  await page.getByTestId("result-add").first().click();
  await expect(page.getByTestId("field-name")).toHaveValue("");
  await expect(page.getByTestId("field-address")).toHaveValue("");
  await expect(page.getByTestId("prefill-notice")).toContainText("Linked to a Google Maps place");
  await page.getByTestId("field-name").fill("Trattoria as we know it");
  await page.getByTestId("field-address").fill("Rua Nossa 1");
  await page.getByTestId("save-restaurant").click();
  await expect(page.getByTestId("restaurant-name")).toHaveText("Trattoria as we know it");
  await expect(page.getByTestId("restaurant-maps")).toHaveAttribute("href", /query_place_id=fixture-01$/);

  const [rid] = await listRestaurantIds(request);
  const stored = await getRestaurant(request, rid!);
  expect(stored).toMatchObject({ name: "Trattoria as we know it", address: "Rua Nossa 1", googlePlaceId: "fixture-01" });
  expect(stored).not.toHaveProperty("lat");
  expect(stored).not.toHaveProperty("lng");

  await page.getByTestId("nav-discover").click();
  await search(page, "Lisbon");
  const first = page.getByTestId("discover-result").first();
  await expect(first.getByTestId("result-in-records")).toHaveAttribute("href", `/restaurants/${rid}`);
  await expect(first.getByTestId("result-add")).toHaveCount(0);
  await expect(page.getByTestId("result-add")).toHaveCount(9);
});

test("11. searching while offline is refused without a request; a seeded record's Maps link needs no network", async ({ page, context, request }) => {
  await seedRestaurant(request, "r-linked", { name: "Linked Place", googlePlaceId: "fixture-07" });
  await openDiscover(page);
  await context.setOffline(true);
  await search(page, "Lisbon");
  await expect(stateOf(page)).toHaveAttribute("data-reason", "offline");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
  await context.setOffline(false);
  await page.goto("/restaurants/r-linked");
  await expect(page.getByTestId("restaurant-maps")).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=Linked%20Place&query_place_id=fixture-07");
});

test("12. a late location after a newer destination search never supersedes it (audit F1)", async ({ page }) => {
  await openDiscover(page);
  await delayLocation(page);
  const nearbyRequests: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/searchNearby")) nearbyRequests.push(r.url()); });
  await page.getByTestId("discover-nearby").click();
  await search(page, MAGIC.empty);
  await expect(stateOf(page)).toHaveAttribute("data-status", "empty");
  await page.evaluate(() => Reflect.get(window, "__resolveDelayedLocation")());
  await expect(stateOf(page)).toHaveAttribute("data-status", "empty");
  await expect(page.getByTestId("discover-result")).toHaveCount(0);
  expect(nearbyRequests).toHaveLength(0);
});

test("13. leaving Discover before the position resolves never starts a paid search (audit F1)", async ({ page }) => {
  await openDiscover(page);
  await delayLocation(page);
  const nearbyRequests: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/searchNearby")) nearbyRequests.push(r.url()); });
  await page.getByTestId("discover-nearby").click();
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("signout")).toBeVisible();
  await page.evaluate(() => Reflect.get(window, "__resolveDelayedLocation")());
  await page.waitForTimeout(2_000);
  expect(nearbyRequests).toHaveLength(0);
});

test("14. nothing Google-derived reaches browser history when a result is added but not saved (audit F2)", async ({ page, request }) => {
  await openDiscover(page);
  await search(page, "Lisbon");
  await page.getByTestId("result-add").first().click();
  await expect(page.getByTestId("field-name")).toHaveValue("");
  await page.reload();
  await expect(page.getByTestId("field-name")).toHaveValue("");
  const historyState = await page.evaluate(() => window.history.state);
  expect(historyState.usr.prefill).toEqual({ googlePlaceId: "fixture-01" });
  expect(await listRestaurantIds(request)).toHaveLength(0);
});
