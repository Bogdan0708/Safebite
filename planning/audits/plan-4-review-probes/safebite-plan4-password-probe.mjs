// Run only while the shared local emulator suite is idle.
// Requires Vite on :5173 and demo-safebite Auth/Firestore/Functions emulators.
// Restores Bogdan's synthetic fixture password after each scenario. Never logs tokens.
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve("web/package.json"));
const { chromium, expect } = require("@playwright/test");

const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const EMAIL = "bogdan@safebite.test";
const OLD = "pilot-password-1";
const NEXT = "audit-probe-new-password-1";

async function restorePassword() {
  const response = await fetch(`${AUTH}/projects/demo-safebite/accounts:update`, {
    method: "POST",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ localId: "bogdan-uid", password: OLD }),
  });
  if (!response.ok) throw new Error(`Fixture restoration failed: HTTP ${response.status}`);
}

async function accepts(password) {
  const response = await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-api-key`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password, returnSecureToken: true }),
  });
  // Consume but never log the response containing auth tokens.
  await response.arrayBuffer();
  return response.ok;
}

const browser = await chromium.launch({ headless: true });
try {
  for (const fault of ["internal-error", "network-loss"]) {
    await restorePassword();
    const context = await browser.newContext();
    const page = await context.newPage();
    let updateCommitted = false;
    let injected = false;
    try {
      await page.goto("http://127.0.0.1:5173/");
      await page.getByTestId("signin-email").fill(EMAIL);
      await page.getByTestId("signin-password").fill(OLD);
      await page.getByTestId("signin-submit").click();
      await expect(page.getByTestId("nav-settings")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("nav-settings").click();

      await page.route(/127\.0\.0\.1:9099\/identitytoolkit\.googleapis\.com\/v1\/accounts:(update|lookup)\?/, async (route) => {
        const operation = new URL(route.request().url()).pathname.split(":").at(-1);
        if (operation === "update" && route.request().postDataJSON()?.password === NEXT) {
          const response = await route.fetch();
          if (!response.ok()) throw new Error(`Password update unexpectedly failed: HTTP ${response.status()}`);
          updateCommitted = true;
          await route.fulfill({ response });
        } else if (operation === "lookup" && updateCommitted && !injected) {
          injected = true;
          if (fault === "network-loss") await route.abort("failed");
          else await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: 500, message: "INTERNAL_ERROR" } }) });
        } else await route.continue();
      });

      await page.getByTestId("pw-current").fill(OLD);
      await page.getByTestId("pw-new").fill(NEXT);
      await page.getByTestId("pw-confirm").fill(NEXT);
      await page.getByTestId("pw-submit").click();
      await expect(page.getByTestId("pw-outcome")).toHaveAttribute("data-kind", fault === "internal-error" ? "failed" : "offline", { timeout: 15000 });
      const outcomeText = await page.getByTestId("pw-outcome").innerText();
      const oldAccepted = await accepts(OLD);
      const newAccepted = await accepts(NEXT);
      console.log(JSON.stringify({ fault, updateCommitted, injected, outcomeText, oldAccepted, newAccepted }));
      expect(injected).toBe(true);
      expect(oldAccepted).toBe(false);
      expect(newAccepted).toBe(true);
    } finally {
      await context.close();
      await restorePassword();
    }
  }
} finally {
  await browser.close();
}
