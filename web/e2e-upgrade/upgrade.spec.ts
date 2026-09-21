import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Build = "v1" | "v2" | "invalid";
interface Recorded { build: Build; path: string }

// package.json has "type": "module", so this file has no CommonJS __dirname; derive the
// equivalent from import.meta.url instead (same idiom as e2e-upgrade/server.mjs).
const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = (name: string) => path.resolve(here, "..", name);

/** Refuse every page-initiated request off-box; the synthetic projects must never be contacted. */
async function blockExternalNetwork(context: BrowserContext) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
}

// Control calls go through Playwright's Node-side request context, never through the page.
async function serve(page: Page, build: Build) {
  const res = await page.request.post(`/_test/serve/${build}`);
  expect(await res.text()).toBe(build);
  await page.request.post("/_test/requests/reset");
}
async function recorded(page: Page): Promise<Recorded[]> {
  return (await page.request.get("/_test/requests")).json();
}
async function assetsOf(page: Page, build: Build): Promise<string[]> {
  await page.request.post(`/_test/serve/${build}`);
  return (await page.request.get("/_test/assets")).json();
}

// Page-state probes. A navigation can destroy the execution context mid-call; report `null` so
// expect.poll keeps polling instead of failing on the transient error.
async function registrations(page: Page): Promise<number | null> {
  return page.evaluate<number>(async () => (await navigator.serviceWorker.getRegistrations()).length).catch(() => null);
}
async function cacheNames(page: Page): Promise<string[] | null> {
  return page.evaluate<string[]>(() => caches.keys()).catch(() => null);
}
async function cachedPaths(page: Page): Promise<string[] | null> {
  return page
    .evaluate<string[]>(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) paths.push(new URL(req.url).pathname);
      }
      return paths.sort();
    })
    .catch(() => null);
}
async function controlled(page: Page): Promise<boolean | null> {
  return page.evaluate<boolean>(() => navigator.serviceWorker.controller !== null).catch(() => null);
}
async function entryScript(page: Page): Promise<string | null> {
  return page.evaluate<string | null>(() => document.querySelector('script[type="module"]')?.getAttribute("src") ?? null).catch(() => null);
}

async function installValidRelease(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => cacheNames(page)).toHaveLength(1);
}

/** Ask the installed registration to check for a new sw.js now, instead of waiting for the browser. */
async function triggerUpdateCheck(page: Page) {
  await page
    .evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    })
    .catch(() => {
      /* the update may navigate the page before evaluate returns; that is expected */
    });
}

test("the invalid build ships a self-destroying worker, the valid build a precaching one", () => {
  const invalid = readFileSync(path.join(DIST("dist-boot-guard"), "sw.js"), "utf8");
  const valid = readFileSync(path.join(DIST("dist-preview"), "sw.js"), "utf8");
  expect(invalid).toContain("self.registration.unregister()");
  expect(invalid).toContain("caches.delete(");
  expect(invalid).not.toContain("precache");
  expect(valid).toContain("precache");
  expect(valid).not.toContain("self.registration.unregister()");
});

test("an installed worker that picks up an invalid release cleans the device instead of caching it", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await serve(page, "v1");
  await installValidRelease(page);

  await serve(page, "invalid");
  await triggerUpdateCheck(page);

  await expect(page.getByTestId("misconfigured")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => registrations(page), { timeout: 15_000 }).toBe(0);
  await expect.poll(() => cacheNames(page), { timeout: 15_000 }).toEqual([]);
  await expect.poll(() => controlled(page), { timeout: 15_000 }).toBe(false);

  const invalidRequests = (await recorded(page)).filter((r) => r.build === "invalid");
  expect(invalidRequests.some((r) => r.path === "/sw.js"), "the update check fetched the new worker").toBe(true);
  expect(invalidRequests.filter((r) => /^\/assets\/App-/.test(r.path)), "the invalid app chunk was never fetched").toEqual([]);
});

test("a valid update replaces the installed worker and its cached release", async ({ page, context }) => {
  await blockExternalNetwork(context);
  const v1Assets = await assetsOf(page, "v1");
  const v2Assets = await assetsOf(page, "v2");
  const v1Index = v1Assets.find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  const v2Index = v2Assets.find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  expect(v2Index).not.toBe(v1Index);

  await serve(page, "v1");
  await installValidRelease(page);
  expect(await entryScript(page)).toBe(`/assets/${v1Index}`);

  await serve(page, "v2");
  await triggerUpdateCheck(page);

  // autoUpdate reloads the page once the new worker activates; the new entry chunk proves it.
  await expect.poll(() => entryScript(page), { timeout: 20_000 }).toBe(`/assets/${v2Index}`);
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect.poll(() => registrations(page)).toBe(1);
  await expect.poll(() => controlled(page)).toBe(true);
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).toContain(`/assets/${v2Index}`);
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).not.toContain(`/assets/${v1Index}`);
});
