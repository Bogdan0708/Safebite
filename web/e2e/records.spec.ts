import { expect, test, type Page } from "@playwright/test";
import { clearRecords, listClaimIds, listRestaurantIds, markDeletingViaRest, restaurantExists, seedClaim, seedRestaurant } from "./emulator-rest";

const PASSWORD = "pilot-password-1";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-saved").or(page.getByTestId("not-invited"))).toBeVisible();
}

async function signOutAndWait(page: Page) {
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible();
}

const KINDS = ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return isoDay(d);
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test.beforeEach(async ({ request }) => {
  await clearRecords(request);
});

test("1. a member adds a restaurant and sees it with six unknown kinds and the call-ahead prompts", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurants-empty")).toBeVisible();
  await page.getByTestId("add-restaurant").click();
  await page.getByTestId("field-name").fill("Da Marco");
  await page.getByTestId("field-address").fill("Via Roma 1, Rome");
  await page.getByTestId("field-website").fill("https://damarco.test");
  await page.getByTestId("save-restaurant").click();

  await expect(page.getByTestId("restaurant-name")).toHaveText("Da Marco");
  await expect(page.getByTestId("restaurant-website")).toHaveAttribute("href", "https://damarco.test");
  for (const kind of KINDS) await expect(page.getByTestId(`evidence-${kind}`)).toHaveAttribute("data-state", "unknown");
  await expect(page.getByTestId("call-ahead")).toContainText("Do you have a dedicated fryer for gluten-free items?");
  await expect(page.getByTestId("call-ahead")).toContainText("Italian");

  await page.getByTestId("nav-saved").click();
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("restaurant-row")).toContainText("Da Marco");
});

test("2. evidence: accreditation needs a link; current, needs-rechecking and conflicting states render", async ({ page, request }) => {
  await seedRestaurant(request, "r-ev", { name: "Evidence Place" });
  await signIn(page, "ava@safebite.test");

  await page.goto("/restaurants/r-ev/evidence/new");
  await page.getByTestId("claim-kind").selectOption("accreditation");
  await expect(page.getByTestId("claim-source-type")).toHaveValue("accreditingBody");
  await page.getByTestId("claim-source-label").fill("Coeliac UK");
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("claim-error-sourceUrl")).toContainText("needs a link");
  await page.getByTestId("claim-source-url").fill("https://coeliac.org.uk/venues/1");
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("evidence-accreditation")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("evidence-accreditation")).toContainText("Coeliac UK");

  await page.getByTestId("add-evidence").click();
  await page.getByTestId("claim-kind").selectOption("separateFryer");
  await page.getByTestId("claim-source-type").selectOption("restaurantStatement");
  await page.getByTestId("claim-source-label").fill("Manager, last year");
  await page.getByTestId("claim-checked-at").fill(monthsAgo(13));
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("evidence-separateFryer")).toHaveAttribute("data-state", "needsRechecking");
  await expect(page.getByTestId("evidence-separateFryer")).toContainText("Needs rechecking");

  for (const value of ["yes", "no"]) {
    await page.getByTestId("add-evidence").click();
    await page.getByTestId("claim-kind").selectOption("separateFryer");
    await page.getByTestId("claim-value").selectOption(value);
    await page.getByTestId("claim-source-type").selectOption(value === "yes" ? "restaurantStatement" : "ownVisit");
    await page.getByTestId("claim-source-label").fill(value === "yes" ? "Waiter" : "Saw a shared fryer");
    await page.getByTestId("claim-checked-at").fill(localToday());
    await page.getByTestId("claim-submit").click();
    await expect(page.getByTestId("restaurant-name")).toBeVisible();
  }
  await expect(page.getByTestId("evidence-separateFryer")).toHaveAttribute("data-state", "conflicting");
  await expect(page.getByTestId("evidence-separateFryer")).toContainText("Conflicting evidence");
  expect(await listClaimIds(request, "r-ev")).toHaveLength(4);
});

test("3. a stale draft is told the restaurant changed elsewhere, its save conflicts, and Reload draft shows the other member's values", async ({ page, browser, request }) => {
  await seedRestaurant(request, "r-conflict", { name: "Before" });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-conflict/edit");
  await expect(page.getByTestId("field-name")).toHaveValue("Before");
  await page.getByTestId("field-phone").fill("+44 20 1234"); // Ava's draft is now dirty

  const bogdanContext = await browser.newContext();
  const bogdan = await bogdanContext.newPage();
  await signIn(bogdan, "bogdan@safebite.test");
  await bogdan.goto("/restaurants/r-conflict/edit");
  await expect(bogdan.getByTestId("field-name")).toHaveValue("Before");
  await bogdan.getByTestId("field-name").fill("Bogdan's name");
  await bogdan.getByTestId("save-restaurant").click();
  await expect(bogdan.getByTestId("restaurant-name")).toHaveText("Bogdan's name");
  await bogdanContext.close();

  await expect(page.getByTestId("changed-elsewhere")).toBeVisible();
  await expect(page.getByTestId("field-phone")).toHaveValue("+44 20 1234");
  await page.getByTestId("save-restaurant").click();
  await expect(page.getByTestId("save-outcome")).toHaveAttribute("data-kind", "conflict");
  await page.getByTestId("reload-draft").first().click();
  await expect(page.getByTestId("field-name")).toHaveValue("Bogdan's name");
  await expect(page.getByTestId("changed-elsewhere")).toHaveCount(0);
});

test("4. deleting a restaurant with evidence leaves nothing behind; a concurrent Add evidence sees not-found", async ({ page, browser, request }) => {
  await seedRestaurant(request, "r-del", { name: "Doomed" });
  await seedClaim(request, "r-del", "c1");
  await seedClaim(request, "r-del", "c2", { kind: "separateFryer" });

  const bogdanContext = await browser.newContext();
  const bogdan = await bogdanContext.newPage();
  await signIn(bogdan, "bogdan@safebite.test");
  await bogdan.goto("/restaurants/r-del/evidence/new");
  await bogdan.getByTestId("claim-source-label").fill("Too late");

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-del/edit");
  await expect(page.getByTestId("field-name")).toHaveValue("Doomed");
  await page.getByTestId("delete-restaurant").click();
  await page.getByTestId("delete-confirm").click();
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });

  await bogdan.getByTestId("claim-submit").click();
  await expect(bogdan.getByTestId("claim-save-outcome")).toHaveAttribute("data-kind", "notFound");
  await bogdan.goto("/restaurants/r-del");
  await expect(bogdan.getByTestId("read-gone")).toContainText("This restaurant was deleted.");
  await bogdanContext.close();

  expect(await listClaimIds(request, "r-del")).toEqual([]);
  expect(await restaurantExists(request, "r-del")).toBe(false);
  expect(await listRestaurantIds(request)).toEqual([]);
});

test("5. an interrupted deletion (marked, not swept) is finished from the list", async ({ page, request }) => {
  await seedRestaurant(request, "r-stuck", { name: "Stuck" });
  await seedClaim(request, "r-stuck", "c1");
  await markDeletingViaRest(request, "r-stuck");

  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-saved").click();
  // The list resumes the protocol on mount (Task 9). The intermediate "Deleting…" row and the
  // Finish deleting button are asserted by RestaurantsPage.test.tsx; here the end state matters.
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("restaurant-deleting")).toHaveCount(0);
  expect(await listClaimIds(request, "r-stuck")).toEqual([]);
  expect(await restaurantExists(request, "r-stuck")).toBe(false);
});

test("6. saving while offline is refused, nothing is queued, and nothing appears after reconnecting", async ({ page, context, request }) => {
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/new");
  await page.getByTestId("field-name").fill("Ghost");
  await page.getByTestId("field-address").fill("Nowhere 1");
  await context.setOffline(true);
  await page.getByTestId("save-restaurant").click();
  await expect(page.getByTestId("save-outcome")).toHaveAttribute("data-kind", "offline");
  await expect(page.getByTestId("field-name")).toHaveValue("Ghost");
  await context.setOffline(false);
  await page.goto("/restaurants");
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });
  expect(await listRestaurantIds(request)).toEqual([]);
});

test("7. after an account switch no record of the previous member is rendered and no page error fires", async ({ page, request }) => {
  await seedRestaurant(request, "r-ava", { name: "Ava's place" });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-saved").click();
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("restaurant-row")).toContainText("Ava's place");
  await signOutAndWait(page);

  await signIn(page, "stranger@safebite.test");
  await expect(page.getByTestId("not-invited")).toBeVisible();
  await expect(page.getByTestId("restaurant-row")).toHaveCount(0);
  await expect(page.getByTestId("nav-saved")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("8. live replacement evidence needs its own delete confirmation", async ({ page, request }) => {
  await seedRestaurant(request, "r-confirm");
  await seedClaim(request, "r-confirm", "old", { checkedAt: "2026-09-01" });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-confirm");
  await page.getByTestId("claim-delete-old").click();
  await expect(page.getByTestId("claim-delete-confirm-old")).toBeVisible();

  await seedClaim(request, "r-confirm", "new", { checkedAt: "2026-09-02" });
  await expect(page.getByTestId("claim-new")).toBeVisible();
  await expect(page.getByTestId("claim-delete-confirm-new")).toHaveCount(0);
  expect((await listClaimIds(request, "r-confirm")).sort()).toEqual(["new", "old"]);

  // Only an explicit confirmation opened on the replacement can remove it.
  await page.getByTestId("claim-delete-new").click();
  await page.getByTestId("claim-delete-confirm-new").click();
  await expect(page.getByTestId("claim-new")).toHaveCount(0);
  await expect(page.getByTestId("claim-delete-old")).toBeVisible();
  await expect(page.getByTestId("claim-delete-confirm-old")).toHaveCount(0);
  expect(await listClaimIds(request, "r-confirm")).toEqual(["old"]);
});

test("9. malformed website and evidence URLs show field errors and can be corrected", async ({ page, request }) => {
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/new");
  await page.getByTestId("field-name").fill("URL validation");
  await page.getByTestId("field-address").fill("1 Test Street");
  await page.getByTestId("field-website").fill("https:example.com");
  await page.getByTestId("save-restaurant").click();
  await expect(page.getByTestId("error-website")).toContainText("http:// or https://");
  await expect(page.getByTestId("save-outcome")).toHaveCount(0);
  expect(await listRestaurantIds(request)).toEqual([]);

  await page.getByTestId("field-website").fill("HTTPS://example.com");
  await page.getByTestId("save-restaurant").click();
  await expect(page.getByTestId("restaurant-website")).toHaveAttribute("href", "https://example.com");
  const [rid] = await listRestaurantIds(request);
  await page.getByTestId("add-evidence").click();
  await page.getByTestId("claim-kind").selectOption("accreditation");
  await page.getByTestId("claim-source-label").fill("Accrediting body");
  await page.getByTestId("claim-source-url").fill("https:/example.com/listing");
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("claim-error-sourceUrl")).toContainText("http:// or https://");
  await expect(page.getByTestId("claim-save-outcome")).toHaveCount(0);
  expect(await listClaimIds(request, rid!)).toEqual([]);

  await page.getByTestId("claim-source-url").fill("HTTPS://example.com/listing");
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("evidence-accreditation")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("evidence-accreditation").getByRole("link", { name: "Accrediting body" })).toHaveAttribute("href", "https://example.com/listing");
  expect(await listClaimIds(request, rid!)).toHaveLength(1);
});
