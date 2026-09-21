import { expect, test } from "@playwright/test";

// Regression for the Plan 1b re-audit finding: a compile-only bundle (SAFEBITE_UNVALIDATED_BUILD=1)
// carrying demo Firebase values must refuse to start in a real browser. The bundle under test is
// built by `npm run e2e:boot-guard` and served by `vite preview` (see playwright.boot-guard.config.ts).
test("a compile-only bundle with demo Firebase values refuses to start", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => pageErrors.join("\n"), { message: "expected the bundle startup guard to throw" })
    .toMatch(/Firebase configuration is not deployable \(bundle startup\)/);
  expect(pageErrors.join("\n")).toContain("demo-safebite");
  await expect(page.getByTestId("signin-form")).toHaveCount(0);
  await expect(page.locator("#root")).toBeEmpty();
});
