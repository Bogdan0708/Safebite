import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { seedClaim, seedCollection, seedNote, seedRestaurant } from "./emulator-rest";

/** Offline-scenario helpers (spec §3.9 Tests). Emulator-only: 127.0.0.1, project demo-safebite. */
export const EMULATORS = /127\.0\.0\.1:(9099|8080|5001)\//;
const FS = "http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents";
const HEADERS = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const PASSWORD = "pilot-password-1";

export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/**
 * Two restaurants. Riverside: a current GF-menu answer with one older (needs rechecking) entry in
 * its history, notes by both members (Bogdan's is the newer), and the only shortlisted record.
 * Zest: a current fryer answer, never opened online by any scenario before it is read from the copy.
 */
export async function seedHousehold(request: APIRequestContext): Promise<void> {
  await seedRestaurant(request, "r1", { name: "Riverside" });
  await seedRestaurant(request, "r2", { name: "Zest" });
  await seedClaim(request, "r1", "c-new", { kind: "gfMenu", value: "yes", checkedAt: daysAgo(20) });
  await seedClaim(request, "r1", "c-old", { kind: "gfMenu", value: "no", checkedAt: daysAgo(400) });
  await seedClaim(request, "r2", "c-fryer", { kind: "separateFryer", value: "yes", checkedAt: daysAgo(10) });
  await seedNote(request, "r1", "n-ava", { text: "Ask about the fryer.", createdAt: "2026-09-01T10:00:00Z" });
  await seedNote(request, "r1", "n-bogdan", { authorUid: "bogdan-uid", text: "Staff were helpful.", createdAt: "2026-09-05T10:00:00Z" });
  await seedCollection(request, "r1", { shortlisted: true });
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-saved")).toBeVisible({ timeout: 15_000 });
}

export async function optInAndWait(page: Page): Promise<void> {
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("offline-switch").click();
  await expect(page.getByTestId("offline-status")).toContainText("Ready offline", { timeout: 30_000 });
}

/**
 * Waits until the page clock is 2 s past the copy's last membership check. The WSL2 wall clock
 * this suite runs on steps back ~1.5 s every ~30 s (measured). Spec §3.9 now tolerates a check up
 * to 5 minutes in the future (owner follow-up 2026-10-11), so this wait is belt and braces: it keeps
 * each scenario's copy plainly inside the window. Call it before taking the server away.
 */
export async function waitPastMembershipCheck(page: Page): Promise<void> {
  const meta = await copyMeta(page);
  if (!meta) throw new Error("no offline copy on this device");
  await page.waitForFunction((checkedAt) => Date.now() - checkedAt > 2_000, meta.membershipCheckedAt, { polling: 50 });
}

/** Emulators unreachable, failing fast (connection refused). */
export async function cutServer(page: Page): Promise<void> {
  await page.route(EMULATORS, (route) => route.abort("internetdisconnected"));
}

/** Emulators reachable but never answering: a stalled connection. */
export async function stallServer(page: Page): Promise<void> {
  await page.route(EMULATORS, () => { /* never fulfilled */ });
}

export async function restoreServer(page: Page): Promise<void> {
  await page.unroute(EMULATORS);
}

/** From the next load on, the browser reports offline (the fast path). */
export async function reportOffline(page: Page): Promise<void> {
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
}

/**
 * Every request the page attempts that would write to Firestore or call a function, whether or not
 * the route lets it through: the WebChannel write stream, transaction RPCs (reads and commit) and callable functions.
 */
export function watchServerWrites(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (/\/Write\/channel|:commit|:beginTransaction|:batchGet|127\.0\.0\.1:5001\//.test(url)) seen.push(url);
  });
  return seen;
}

export async function copyMeta(page: Page): Promise<{ uid: string; householdId: string; downloadedAt: number; membershipCheckedAt: number } | null> {
  return page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    return (await load("/src/offline/store.ts")).readMeta();
  });
}

/** The copy as the app reads it, reduced to what scenarios assert on; null when no usable copy for Ava. */
export async function copyRecords(page: Page): Promise<{ names: string[]; notes: Record<string, string[]>; claims: Record<string, string[]> } | null> {
  return page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const result = await (await load("/src/offline/store.ts")).readCopy({ uid: "ava-uid", householdId: "home" });
    if (result.kind !== "copy") return null;
    const data = result.data as { restaurants: Array<{ name: string }>; notes: Record<string, Array<{ id: string }>>; claims: Record<string, Array<{ id: string }>> };
    const ids = (m: Record<string, Array<{ id: string }>>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.map((x) => x.id).sort()]));
    return { names: data.restaurants.map((r) => r.name), notes: ids(data.notes), claims: ids(data.claims) };
  });
}

/** Row counts of the copy's record stores, read straight from IndexedDB (never creating the database). */
export async function copyRowCounts(page: Page): Promise<Record<string, number> | null> {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === "safebite-offline")) return null;
    return new Promise<Record<string, number>>((resolve, reject) => {
      const open = indexedDB.open("safebite-offline");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const names = ["meta", "restaurants", "claims", "collection", "notes"];
        const tx = db.transaction(names, "readonly");
        const counts: Record<string, number> = {};
        for (const name of names) {
          const req = tx.objectStore(name).count();
          req.onsuccess = () => { counts[name] = req.result; };
        }
        tx.oncomplete = () => { db.close(); resolve(counts); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

/** Another device renames a restaurant on the server. */
export async function renameRestaurant(request: APIRequestContext, rid: string, name: string): Promise<void> {
  const res = await request.patch(`${FS}/households/home/restaurants/${rid}?updateMask.fieldPaths=name`, {
    headers: HEADERS,
    data: { fields: { name: { stringValue: name } } },
  });
  if (!res.ok()) throw new Error(`rename ${rid}: ${res.status()} ${await res.text()}`);
}

export async function moveToHousehold(request: APIRequestContext, uid: string, hid: string): Promise<void> {
  const s = (v: string) => ({ stringValue: v });
  for (const [path, fields] of [
    [`households/${hid}`, { name: s("Elsewhere"), memberIds: { arrayValue: { values: [s(uid)] } }, createdAt: { timestampValue: "2026-10-01T00:00:00Z" } }],
    [`users/${uid}`, { householdId: s(hid), displayName: s("Ava") }],
  ] as const) {
    const res = await request.patch(`${FS}/${path}`, { headers: HEADERS, data: { fields } });
    if (!res.ok()) throw new Error(`patch ${path}: ${res.status()} ${await res.text()}`);
  }
}

export async function deleteHousehold(request: APIRequestContext, hid: string): Promise<void> {
  await request.delete(`${FS}/households/${hid}`, { headers: HEADERS });
}
