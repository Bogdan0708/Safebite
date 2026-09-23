import { expect, test, type BrowserContext } from "@playwright/test";

interface Manifest {
  name: string;
  display: string;
  start_url: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
}

/**
 * Refuse every page-initiated request off-box; the synthetic project must never be contacted.
 * (Requests a service worker makes on its own are not intercepted here; the precache is
 * entirely same-origin.)
 */
async function blockExternalNetwork(context: BrowserContext) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
}

test("the manifest describes a standalone app with the full icon set", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const response = await page.request.get(href!);
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;
  expect(manifest.name).toBe("SafeBite");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.theme_color).toBe("#1f7a4d");
  expect(manifest.icons.map((i) => [i.sizes, i.purpose ?? "any"])).toEqual([
    ["192x192", "any"],
    ["512x512", "any"],
    ["512x512", "maskable"],
  ]);
  for (const icon of manifest.icons) {
    const png = await page.request.get(`/${icon.src}`);
    expect(png.ok(), icon.src).toBe(true);
    expect(png.headers()["content-type"]).toContain("image/png");
  }
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1f7a4d");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon-180.png");
});

test("the service worker installs and the shell reloads while offline", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();

  // Wait for the worker to activate and take control of this page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await context.setOffline(false);
});

test("the misconfiguration screen is not shown for a validated bundle", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("misconfigured")).toHaveCount(0);
});

test("a failed app-chunk load shows a load-failed screen, not a blank page", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await context.route(/\/assets\/App-[^/]+\.js$/, (route) => route.abort());
  await page.goto("/");

  const screen = page.getByTestId("load-failed");
  await expect(screen).toBeVisible();
  await expect(screen).toContainText("reload");
  await expect(page.locator("#root")).not.toBeEmpty();
});
