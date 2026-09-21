import { expect, test } from "@playwright/test";

// Regression for the Plan 1b re-audit finding: a compile-only bundle (SAFEBITE_UNVALIDATED_BUILD=1)
// carrying demo Firebase values must refuse to start in a real browser. Since Plan 2a it refuses
// with a plain screen instead of a blank page, and must never register a service worker.
// The bundle is built by `npm run e2e:boot-guard` and served by `vite preview`.
test("a compile-only bundle with demo Firebase values shows the misconfiguration screen", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  const screen = page.getByTestId("misconfigured");
  await expect(screen).toBeVisible();
  await expect(screen).toContainText("demo-safebite");
  await expect(screen.locator("li")).toHaveCount(5);
  await expect(page.getByTestId("signin-form")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  const registrations = await page.evaluate(async () =>
    "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  );
  expect(registrations).toBe(0);
});
