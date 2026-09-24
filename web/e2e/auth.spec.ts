import { expect, test, type Page } from "@playwright/test";
import { passwordAccepted, setPasswordViaAdmin } from "./auth-rest";
import { clearRecords, seedNote, seedRestaurant } from "./emulator-rest";

const PASSWORD = "pilot-password-1";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
}

/** Fills the sign-in form already on screen. No navigation: a reload would hide a broken reset. */
async function fillSignIn(page: Page, email: string, password = PASSWORD) {
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(password);
  await page.getByTestId("signin-submit").click();
}

/** Click sign-out and wait until the app has actually returned to the signed-out state. */
async function signOutAndWait(page: Page) {
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
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

test("signing out in one tab resets every tab, and the next account never sees the previous household", async ({ page, request }) => {
  await clearRecords(request);
  await seedRestaurant(request, "r-tabs", { name: "Tab Test Bistro" });
  await seedNote(request, "r-tabs", "n1", { text: "Tab test note" });

  await signIn(page, "ava@safebite.test");
  await expect(page.getByTestId("nav-discover")).toBeVisible();
  const second = await page.context().newPage(); // same browser context: shared auth persistence
  await page.goto("/restaurants/r-tabs");
  await second.goto("/restaurants/r-tabs");
  for (const p of [page, second]) {
    await expect(p.getByTestId("restaurant-name")).toHaveText("Tab Test Bistro");
    await expect(p.getByTestId("notes-section")).toContainText("Tab test note");
    await p.evaluate(() => {
      (window as unknown as { __beforeSignOut?: boolean }).__beforeSignOut = true;
    });
  }
  // Every later document in the second tab records whether it ever renders the old household.
  await second.addInitScript(() => {
    const w = window as unknown as { __sawOldData?: boolean };
    w.__sawOldData = false;
    new MutationObserver(() => {
      const text = document.body?.innerText ?? "";
      if (text.includes("Tab Test Bistro") || text.includes("Tab test note")) w.__sawOldData = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("signout").click();

  for (const p of [page, second]) {
    await expect(p.getByTestId("signin-form")).toBeVisible();
    // A new document: the marker set before sign-out is gone, so the tab really reloaded.
    await expect.poll(() => p.evaluate(() => (window as unknown as { __beforeSignOut?: boolean }).__beforeSignOut ?? false)).toBe(false);
  }

  await fillSignIn(second, "stranger@safebite.test");
  await expect(second.getByTestId("not-invited")).toBeVisible();
  await expect(second.getByText("Tab Test Bistro")).toHaveCount(0);
  expect(await second.evaluate(() => (window as unknown as { __sawOldData?: boolean }).__sawOldData)).toBe(false);
  await second.close();
});

test("a member changes their password, stays signed in, and only the new password works afterwards", async ({ page, request }) => {
  try {
    await signIn(page, "bogdan@safebite.test");
    await expect(page.getByTestId("nav-discover")).toBeVisible();
    await page.getByTestId("nav-settings").click();

    await page.getByTestId("pw-current").fill("not-my-password");
    await page.getByTestId("pw-new").fill("changed-password-1");
    await page.getByTestId("pw-confirm").fill("changed-password-1");
    await page.getByTestId("pw-submit").click();
    await expect(page.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "wrongCurrent");

    // A marker on the window survives only if the document is never reloaded.
    await page.evaluate(() => { (window as unknown as { __beforePwChange?: boolean }).__beforePwChange = true; });
    await page.getByTestId("pw-current").fill(PASSWORD);
    await page.getByTestId("pw-submit").click();
    await expect(page.getByTestId("pw-success")).toHaveText("Password changed");
    await expect(page.getByTestId("nav-settings")).toBeVisible(); // same UID: no reset
    expect(await page.evaluate(() => (window as unknown as { __beforePwChange?: boolean }).__beforePwChange)).toBe(true);

    await signOutAndWait(page);
    await fillSignIn(page, "bogdan@safebite.test", PASSWORD);
    await expect(page.getByTestId("signin-error")).toBeVisible();
    await fillSignIn(page, "bogdan@safebite.test", "changed-password-1");
    await expect(page.getByTestId("nav-discover")).toBeVisible();
  } finally {
    await setPasswordViaAdmin(request, "bogdan-uid", PASSWORD);
  }
});

// The Firebase SDK looks the account up after `accounts:update` succeeds. A failure there rejects
// updatePassword although the password already changed, so the page must not promise that the old
// one still works (audit F3). The real emulator commits the update; only the lookup after it fails.
for (const fault of ["an internal error", "a lost connection"] as const) {
  test(`a password change that fails after the update request (${fault}) says the outcome is uncertain`, async ({ page, request }) => {
    const NEXT = "uncertain-password-1";
    try {
      await signIn(page, "bogdan@safebite.test");
      await expect(page.getByTestId("nav-discover")).toBeVisible();
      await page.getByTestId("nav-settings").click();

      let updateCommitted = false;
      let injected = false;
      await page.route(/127\.0\.0\.1:9099\/identitytoolkit\.googleapis\.com\/v1\/accounts:(update|lookup)\?/, async (route) => {
        const operation = new URL(route.request().url()).pathname.split(":").at(-1);
        if (operation === "update" && (route.request().postDataJSON() as { password?: string } | null)?.password === NEXT) {
          const response = await route.fetch();
          updateCommitted = response.ok();
          await route.fulfill({ response });
        } else if (operation === "lookup" && updateCommitted && !injected) {
          injected = true;
          if (fault === "a lost connection") await route.abort("failed");
          else await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: 500, message: "INTERNAL_ERROR" } }) });
        } else {
          await route.continue();
        }
      });

      await page.getByTestId("pw-current").fill(PASSWORD);
      await page.getByTestId("pw-new").fill(NEXT);
      await page.getByTestId("pw-confirm").fill(NEXT);
      await page.getByTestId("pw-submit").click();

      await expect(page.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "uncertain");
      await expect(page.getByTestId("pw-outcome")).toHaveText("We couldn't confirm whether your password changed. Sign out, then sign in with your new password; if that doesn't work, use your old one.");
      await expect(page.getByTestId("pw-success")).toHaveCount(0);
      await expect(page.getByTestId("pw-current")).toHaveValue("");
      expect(updateCommitted).toBe(true);
      expect(injected).toBe(true);
      expect(await passwordAccepted(request, "bogdan@safebite.test", NEXT)).toBe(true);
      expect(await passwordAccepted(request, "bogdan@safebite.test", PASSWORD)).toBe(false);
    } finally {
      await setPasswordViaAdmin(request, "bogdan-uid", PASSWORD);
    }
  });
}
