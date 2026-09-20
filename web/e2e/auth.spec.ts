import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "pilot-password-1";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
}

/** Click sign-out and wait until the app has actually returned to the signed-out state. */
async function signOutAndWait(page: Page) {
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("signout")).toHaveCount(0);
}

test("signed-out visitor sees the sign-in form and nothing else", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
});

test("wrong password shows an error and stays signed out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill("ava@safebite.test");
  await page.getByTestId("signin-password").fill("not-the-password");
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("signin-error")).toContainText("incorrect");
  await expect(page.getByTestId("signin-form")).toBeVisible();
});

test("a member signs in, sees the shell, and the server confirms membership", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await expect(page.getByTestId("nav-discover")).toBeVisible();
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("whoami")).toContainText("Ava");
  await expect(page.getByTestId("whoami")).toContainText("home");
  await signOutAndWait(page);
});

test("a signed-in non-member is refused and can sign out", async ({ page }) => {
  await signIn(page, "stranger@safebite.test");
  await expect(page.getByTestId("not-invited")).toBeVisible();
  await expect(page.getByTestId("not-invited")).toContainText("stranger@safebite.test");
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
  await signOutAndWait(page);
});

test("switching accounts on the same device never shows the previous member's shell", async ({ page }) => {
  await signIn(page, "ava@safebite.test");
  await expect(page.getByTestId("nav-discover")).toBeVisible();
  await page.getByTestId("nav-settings").click();
  await signOutAndWait(page);
  // Reload after sign-out: a persisted session would resurrect the member shell here.
  await page.reload();
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await signIn(page, "stranger@safebite.test");
  await expect(page.getByTestId("not-invited")).toBeVisible();
  await expect(page.getByTestId("nav-discover")).toHaveCount(0);
});
