import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Build = "v1" | "v2" | "invalid" | "invalid-keep-worker";
interface Recorded { build: Build; path: string }

// package.json has "type": "module", so this file has no CommonJS __dirname; derive the
// equivalent from import.meta.url instead (same idiom as e2e-upgrade/server.mjs).
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = (name: string) => path.resolve(here, "..", name);

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
  await expect.poll(() => cacheNames(page), { timeout: 15_000 }).toHaveLength(1);
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
  const invalid = readFileSync(path.join(distDir("dist-boot-guard"), "sw.js"), "utf8");
  const valid = readFileSync(path.join(distDir("dist-preview"), "sw.js"), "utf8");
  expect(invalid).toContain("self.registration.unregister()");
  expect(invalid).toContain("caches.delete(");
  expect(invalid).not.toContain("precache");
  expect(valid).toContain("precache");
  expect(valid).not.toContain("self.registration.unregister()");
});

/** Precache entries as emitted by generateSW: `{url:"...",revision:"..."}` objects inside sw.js. */
function precacheUrls(sw: string): string[] {
  return [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
}

test("the valid worker precaches every shell file exactly once (no duplicate icon or manifest entries)", () => {
  const urls = precacheUrls(readFileSync(path.join(distDir("dist-preview"), "sw.js"), "utf8"));
  const duplicates = urls.filter((u, i) => urls.indexOf(u) !== i);
  expect(duplicates, `duplicated precache URLs: ${duplicates.join(", ")}`).toEqual([]);
  for (const required of ["index.html", "manifest.webmanifest", "favicon.svg", "pwa-192.png", "pwa-512.png", "pwa-maskable-512.png", "apple-touch-icon-180.png"]) {
    expect(urls.filter((u) => u === required), required).toHaveLength(1);
  }
});

test("the invalid build has no web app manifest, so a misconfigured artefact is not installable", () => {
  const index = readFileSync(path.join(distDir("dist-boot-guard"), "index.html"), "utf8");
  expect(index).not.toContain('rel="manifest"');
  expect(existsSync(path.join(distDir("dist-boot-guard"), "manifest.webmanifest"))).toBe(false);
  // The valid build keeps it.
  expect(readFileSync(path.join(distDir("dist-preview"), "index.html"), "utf8")).toContain('rel="manifest"');
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

test("a misconfigured page reached under a still-controlling worker purges, sets the one-shot reload flag and ends uncontrolled", async ({ page, context }) => {
  await blockExternalNetwork(context);
  await serve(page, "v1");
  await installValidRelease(page);

  // "invalid-keep-worker": the worker script (and workbox-*.js) stays byte-identical to what's
  // already installed (served from v1), while everything else the page fetches comes from the
  // invalid build. This models "the invalid release is live but the installed worker hasn't
  // updated yet" — the browser's automatic update check has nothing to update to, so it cannot
  // race the page's own purge-and-reload; that purge is the only defence in this scenario.
  await serve(page, "invalid-keep-worker");
  // Remove the cached shell without triggering an update check: the still-controlling v1 worker's
  // navigation route now falls through to the network and serves the invalid build's index.html.
  // Workbox precaches index.html under a revisioned key (?__WB_REVISION__=...), so deleting the
  // bare "/index.html" string never matches it; match by pathname on the actual cached requests.
  await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        if (new URL(req.url).pathname === "/index.html") await cache.delete(req);
      }
    }
  });
  await page.goto("/");

  await expect(page.getByTestId("misconfigured")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => registrations(page), { timeout: 15_000 }).toBe(0);
  await expect.poll(() => cacheNames(page), { timeout: 15_000 }).toEqual([]);
  await expect.poll(() => controlled(page), { timeout: 15_000 }).toBe(false);
  // The one-shot flag proves the page's own controlled-reload branch ran (this test does not
  // count navigations; the unit test for alreadyReloadedForPurge covers the one-shot guard).
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("safebite-purge-reloaded")), { timeout: 15_000 })
    .toBe("1");

  // Confirm the composite mode actually held for the whole test: nothing was ever served from the
  // plain "invalid" build (which would mean the worker updated after all and this degenerated back
  // into the race). A /sw.js request is fine either way — it is byte-identical to the installed
  // worker's, so its presence proves nothing about whether an update occurred.
  const requests = await recorded(page);
  expect(
    requests.every((r) => r.build === "invalid-keep-worker"),
    `every request should carry build "invalid-keep-worker", got: ${JSON.stringify(requests)}`,
  ).toBe(true);
});

test("a valid update waits for the user: banner shown, typed input kept, reload only on tap", async ({ page, context }) => {
  await blockExternalNetwork(context);
  const v1Assets = await assetsOf(page, "v1");
  const v2Assets = await assetsOf(page, "v2");
  const v1Index = v1Assets.find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  const v2Index = v2Assets.find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  expect(v2Index).not.toBe(v1Index);

  await serve(page, "v1");
  await installValidRelease(page);
  expect(await entryScript(page)).toBe(`/assets/${v1Index}`);
  await page.getByTestId("signin-email").fill("draft@example.test");

  await serve(page, "v2");
  await triggerUpdateCheck(page);

  // Prompt mode: the new worker waits; the banner appears; nothing reloads on its own.
  const banner = page.getByTestId("update-banner");
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toHaveAttribute("data-state", "available");
  await page.waitForTimeout(2_000); // an autoUpdate-style reload would have happened by now
  expect(await entryScript(page)).toBe(`/assets/${v1Index}`);
  await expect(page.getByTestId("signin-email")).toHaveValue("draft@example.test");

  await page.getByTestId("update-reload").click();
  await expect.poll(() => entryScript(page), { timeout: 20_000 }).toBe(`/assets/${v2Index}`);
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await expect(page.getByTestId("update-banner")).toHaveCount(0);
  await expect.poll(() => registrations(page)).toBe(1);
  await expect.poll(() => controlled(page)).toBe(true);
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).toContain(`/assets/${v2Index}`);
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).not.toContain(`/assets/${v1Index}`);
});

test("Reload in one tab never reloads another tab: it keeps its draft and gets its own banner", async ({ page, context }) => {
  await blockExternalNetwork(context);
  const v1Index = (await assetsOf(page, "v1")).find((f) => f.startsWith("index-") && f.endsWith(".js"))!;
  const v2Index = (await assetsOf(page, "v2")).find((f) => f.startsWith("index-") && f.endsWith(".js"))!;

  await serve(page, "v1");
  await installValidRelease(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByTestId("signin-form")).toBeVisible();
  await other.getByTestId("signin-email").fill("unsaved restaurant edit");

  await serve(page, "v2");
  await triggerUpdateCheck(page);
  await expect(page.getByTestId("update-banner")).toHaveAttribute("data-state", "available", { timeout: 20_000 });
  await expect(other.getByTestId("update-banner")).toHaveAttribute("data-state", "available", { timeout: 20_000 });

  await page.getByTestId("update-reload").click();
  await expect.poll(() => entryScript(page), { timeout: 20_000 }).toBe(`/assets/${v2Index}`);

  // The other tab: same worker now controls it, but it did not ask — it stays on v1 with its draft.
  await expect(other.getByTestId("update-banner")).toHaveAttribute("data-state", "activated", { timeout: 20_000 });
  expect(await entryScript(other)).toBe(`/assets/${v1Index}`);
  await expect(other.getByTestId("signin-email")).toHaveValue("unsaved restaurant edit");
  await expect.poll(() => controlled(other)).toBe(true);

  await other.getByTestId("update-reload").click();
  await expect.poll(() => entryScript(other), { timeout: 20_000 }).toBe(`/assets/${v2Index}`);
  await other.close();
});
