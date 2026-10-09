import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { passwordAccepted, waitOutValidSince } from "./auth-rest";

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-safebite';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents';
const HEADERS = { Authorization: 'Bearer owner' };
const KEY = 'firebase:authUser:demo-api-key:[DEFAULT]';
const PW = 'pilot-password-1';
const DEPARTING = 'persistence-regression-departing';
const SURVIVOR = 'persistence-regression-survivor';
const HOME = 'persistence-regression-household';

async function clean(request: APIRequestContext) {
  for (const uid of [DEPARTING, SURVIVOR]) {
    await request.post(AUTH + '/accounts:delete', { headers: HEADERS, data: { localId: uid } });
    for (const c of ['users', 'accountDeletions']) await request.delete(`${FS}/${c}/${uid}`, { headers: HEADERS });
  }
  await request.delete(`${FS}/households/${HOME}`, { headers: HEADERS });
}
test.beforeEach(async ({ request }) => {
  await clean(request);
  let stamp = 0;
  for (const uid of [DEPARTING, SURVIVOR]) {
    const auth = await request.post(AUTH + '/accounts', {
      headers: HEADERS, data: { localId: uid, email: uid + '@safebite.test', password: PW, displayName: uid, emailVerified: true },
    });
    expect(auth.ok()).toBe(true);
    stamp = Math.max(stamp, Math.floor(Date.now() / 1000));
    const user = await request.patch(`${FS}/users/${uid}`, {
      headers: HEADERS, data: { fields: { householdId: { stringValue: HOME }, displayName: { stringValue: uid } } },
    });
    expect(user.ok()).toBe(true);
  }
  const home = await request.patch(`${FS}/households/${HOME}`, {
    headers: HEADERS, data: { fields: { name: { stringValue: 'Disposable persistence regression fixtures' }, memberIds: { arrayValue: { values: [DEPARTING, SURVIVOR].map(stringValue => ({ stringValue })) } } } },
  });
  expect(home.ok()).toBe(true);
  await waitOutValidSince(stamp);
});
test.afterEach(async ({ request }) => { await clean(request); });

async function harness(page: Page) {
  await page.goto('/e2e/auth-harness.html');
  await page.evaluate(async () => {
    (window as any).__SAFEBITE_BUILD__ = false;
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    await (await load('/src/account/authPersistence.ts')).prepareAuthPersistence();
    const { auth } = await load('/src/firebase.ts');
    await auth.authStateReady();
  });
}
async function localPersistence(page: Page) {
  await page.evaluate(async () => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { auth } = await load('/src/firebase.ts');
    const { setPersistence, browserLocalPersistence } = await load('/node_modules/.vite/deps/firebase_auth.js');
    await setPersistence(auth, browserLocalPersistence);
  });
}
async function sdkLogin(page: Page, uid: string) {
  await page.evaluate(async ({ uid, pw }) => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { auth } = await load('/src/firebase.ts');
    const { signInWithEmailAndPassword } = await load('/node_modules/.vite/deps/firebase_auth.js');
    await signInWithEmailAndPassword(auth, uid + '@safebite.test', pw);
  }, { uid, pw: PW });
}
async function currentUid(page: Page) {
  return page.evaluate(async () => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    return (await load('/src/firebase.ts')).auth.currentUser?.uid ?? null;
  });
}
async function storedUid(page: Page, local = false) {
  return page.evaluate(({ key, local }) => {
    if (local) return JSON.parse(localStorage.getItem(key) ?? 'null')?.uid ?? null;
    return new Promise(resolve => {
      const open = indexedDB.open('firebaseLocalStorageDb');
      open.onsuccess = () => {
        const db = open.result;
        const get = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').get(key);
        get.onsuccess = () => { db.close(); resolve(get.result?.value?.uid ?? null); };
        get.onerror = () => { db.close(); resolve('read-error'); };
      };
      open.onerror = () => resolve('open-error');
    });
  }, { key: KEY, local });
}
async function assertSurvivorServerState(request: APIRequestContext) {
  expect(await passwordAccepted(request, SURVIVOR + '@safebite.test', PW)).toBe(true);
  expect((await request.get(`${FS}/users/${SURVIVOR}`, { headers: HEADERS })).ok()).toBe(true);
  expect((await request.get(`${FS}/households/${HOME}`, { headers: HEADERS })).ok()).toBe(true);
}

// This delay affects only database OPEN. Once a transaction starts it must settle normally.
async function delayOpen(page: Page, delay: number) {
  await page.evaluate(delayMs => {
    const realOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => {
      if (args[0] !== 'firebaseLocalStorageDb') return realOpen(...args);
      const delayed = {} as IDBOpenDBRequest;
      setTimeout(() => {
        const real = realOpen(...args);
        real.onsuccess = () => {
          Object.defineProperty(delayed, 'result', { value: real.result });
          delayed.onsuccess?.call(delayed, new Event('success') as any);
        };
      }, delayMs);
      return delayed;
    }) as IDBFactory['open'];
  }, delay);
}

test.setTimeout(120000);
for (const delay of [10000, 1000]) {
  test(`F1: ${delay}ms completion open delay never restarts Auth with a deleted user`, async ({ page, context, request }) => {
    await page.goto('/');
    await page.getByTestId('signin-email').fill(DEPARTING + '@safebite.test');
    await page.getByTestId('signin-password').fill(PW);
    await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 20000 });
    const other = await context.newPage();
    await harness(other); // real SDK, without an app listener doing cleanup on the test's behalf
    expect(await currentUid(other)).toBe(DEPARTING);
    expect(await storedUid(other)).toBe(DEPARTING);
    let deleted = false;
    const staleLookups: string[] = [];
    context.on('request', req => {
      if (!deleted || !/accounts:lookup/.test(req.url())) return;
      const token = req.postDataJSON()?.idToken;
      if (token && JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub === DEPARTING) staleLookups.push(req.url());
    });
    await page.route('**/europe-west2/deleteAccount', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch({ timeout: 90000 });
      expect(response.ok()).toBe(true);
      expect((await response.json()).result.deleted).toBe(true);
      await delayOpen(page, delay);
      deleted = true;
      await route.fulfill({ response });
    });
    await page.goto('/settings/delete-account');
    await page.getByTestId('delete-password').fill(PW);
    await page.getByTestId('delete-submit').click();
    await expect(page.getByTestId('signin-deleted-notice')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => currentUid(other)).toBe(null);
    await sdkLogin(other, SURVIVOR);
    await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 15000 });
    expect(staleLookups).toEqual([]);
    expect(await storedUid(other)).toBe(SURVIVOR);
    expect(await currentUid(other)).toBe(SURVIVOR);
    await assertSurvivorServerState(request);
    expect(await passwordAccepted(request, DEPARTING + '@safebite.test', PW)).toBe(false);
  });
}

test('F1: unavailable cleanup on every startup uses memory and preserves a concurrent replacement', async ({ page, context, request }) => {
  await harness(page);
  await sdkLogin(page, DEPARTING);
  expect(await storedUid(page)).toBe(DEPARTING);
  const other = await context.newPage();
  await harness(other);
  // Model a confirmed deletion whose initiating document was destroyed before cleanup.
  const removed = await request.post(AUTH + '/accounts:delete', { headers: HEADERS, data: { localId: DEPARTING } });
  expect(removed.ok()).toBe(true);
  await page.evaluate(async uid => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    (await load('/src/account/authCleanupGuard.ts')).guardAuthSession(uid);
  }, DEPARTING);
  await page.addInitScript(() => {
    const realOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => {
      if (args[0] !== 'firebaseLocalStorageDb') return realOpen(...args);
      const delayed = {} as IDBOpenDBRequest;
      setTimeout(() => {
        const real = realOpen(...args);
        real.onsuccess = () => {
          const db = real.result;
          const transaction = db.transaction.bind(db);
          db.transaction = ((...params: Parameters<IDBDatabase['transaction']>) => {
            const tx = transaction(...params);
            tx.addEventListener('complete', () => { (window as any).lateCleanupCommitted = true; });
            return tx;
          }) as IDBDatabase['transaction'];
          Object.defineProperty(delayed, 'result', { value: real.result });
          delayed.onsuccess?.call(delayed, new Event('success') as any);
        };
      }, 10000);
      return delayed;
    }) as IDBFactory['open'];
  });
  const lookups: string[] = [];
  page.on('request', req => { if (/accounts:lookup/.test(req.url())) lookups.push(req.url()); });
  await page.goto('/');
  await expect(page.getByTestId('signin-memory-only')).toBeVisible({ timeout: 15000 });
  expect(await currentUid(page)).toBe(null);
  await sdkLogin(other, SURVIVOR);
  // Wait for the delayed open to actually commit, then inspect the other tab's real SDK session.
  await page.waitForFunction(() => (window as any).lateCleanupCommitted === true, undefined, { timeout: 20000 });
  expect(lookups).toEqual([]);
  expect(await storedUid(other)).toBe(SURVIVOR);
  expect(await currentUid(other)).toBe(SURVIVOR);
  await page.reload();
  await expect(page.getByTestId('signin-memory-only')).toBeVisible({ timeout: 15000 });
  expect(lookups).toEqual([]);
  expect(await currentUid(other)).toBe(SURVIVOR);
  await assertSurvivorServerState(request);
});

test('F2: unavailable IndexedDB never reads, migrates or removes a legacy tab replacement login', async ({ page, context, request }) => {
  await context.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined }));
  const legacy = await context.newPage();
  await harness(legacy);
  await localPersistence(legacy); // emulate a still-open older release using the real SDK
  await sdkLogin(legacy, DEPARTING);
  expect(await storedUid(legacy, true)).toBe(DEPARTING);
  await page.addInitScript(key => {
    (window as any).authKeyAccesses = [];
    for (const name of ['getItem', 'removeItem'] as const) {
      const original: (this: Storage, key: string) => string | null | void = Storage.prototype[name];
      Storage.prototype[name] = function(this: Storage, k: string) {
        if (this === localStorage && k === key) (window as any).authKeyAccesses.push(name);
        return original.call(this, k);
      } as any;
    }
  }, KEY);
  await page.goto('/');
  await expect(page.getByTestId('signin-form')).toBeVisible();
  await expect(page.getByTestId('signin-memory-only')).toBeVisible();
  // Replace the legacy login while new-code cleanup runs. No read of this key means there is
  // no read/remove gap to pause in, regardless of the interleaving of the two operations.
  await Promise.all([
    sdkLogin(legacy, SURVIVOR),
    page.evaluate(async uid => {
      const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
      await (await load('/src/account/persistedSession.ts')).removePersistedUserIfUid(uid);
    }, DEPARTING),
  ]);
  expect(await page.evaluate(() => (window as any).authKeyAccesses)).toEqual([]);
  expect(await storedUid(legacy, true)).toBe(SURVIVOR);
  expect(await currentUid(legacy)).toBe(SURVIVOR);
  await sdkLogin(page, DEPARTING); // new memory-only sign-in also leaves the shared login alone
  expect(await storedUid(legacy, true)).toBe(SURVIVOR);
  await page.reload();
  await expect(page.getByTestId('signin-form')).toBeVisible();
  expect(await currentUid(page)).toBe(null);
  expect(await currentUid(legacy)).toBe(SURVIVOR);
  expect(await page.evaluate(() => (window as any).authKeyAccesses)).toEqual([]);
  await assertSurvivorServerState(request);
});

test('a large confirmed-deletion history uses one open and retires its markers without touching a replacement', async ({ page, request }) => {
  await harness(page);
  await sdkLogin(page, SURVIVOR);
  // A fresh document without Firebase: count only bootstrap's cleanup opens, not SDK startup.
  await page.goto('/e2e/auth-harness.html');
  const state = await page.evaluate(async () => {
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const guards = await load('/src/account/authCleanupGuard.ts');
    const bootstrap = await load('/src/account/authPersistence.ts');
    for (let i = 0; i < 100; i++) {
      guards.guardAuthSession(`historical-deleted-${i}`, 'request');
      guards.guardAuthSession(`historical-deleted-${i}`);
    }
    guards.guardAuthSession('uncertain-deletion', 'pending');
    const original = indexedDB.open.bind(indexedDB);
    let opens = 0;
    indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => {
      if (args[0] === 'firebaseLocalStorageDb') opens++;
      return original(...args);
    }) as IDBFactory['open'];
    try {
      await bootstrap.prepareAuthPersistence();
      return { opens, remaining: guards.guardedAuthUids(), persistent: bootstrap.persistentAuthAllowed() };
    } finally { indexedDB.open = original; }
  });
  expect(state).toEqual({ opens: 1, remaining: ['uncertain-deletion'], persistent: true });
  expect(await storedUid(page)).toBe(SURVIVOR);
  await page.goto('/');
  await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 15000 });
  expect(await currentUid(page)).toBe(SURVIVOR);
  await assertSurvivorServerState(request);
});
