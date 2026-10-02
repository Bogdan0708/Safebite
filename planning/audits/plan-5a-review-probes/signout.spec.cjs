const { test, expect } = require('/home/godja/Dev/AvaGF/.claude/worktrees/pwa-05a-data-rights/web/node_modules/@playwright/test');
const { restoreSeedAccounts, householdExists } = require('/home/godja/Dev/AvaGF/.claude/worktrees/pwa-05a-data-rights/web/e2e/account-rest.ts');
const { passwordAccepted } = require('/home/godja/Dev/AvaGF/.claude/worktrees/pwa-05a-data-rights/web/e2e/auth-rest.ts');
test.beforeEach(async ({ request }) => { await restoreSeedAccounts(request); });
test.afterEach(async ({ request }) => { await restoreSeedAccounts(request); });

test('completion preserves another account whose storage update was already queued', async ({ page, context, request }) => {
  const events = [];
  page.on('console', msg => { if (msg.text().startsWith('AUDIT ')) events.push(msg.text()); });
  await page.goto('/');
  await page.getByTestId('signin-email').fill('ava@safebite.test');
  await page.getByTestId('signin-password').fill('pilot-password-1');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 30000 });
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByTestId('nav-settings')).toBeVisible({ timeout: 30000 });

  let serverDone;
  const completed = new Promise(resolve => { serverDone = resolve; });
  let sendResponse;
  const releaseResponse = new Promise(resolve => { sendResponse = resolve; });
  await page.route('**/europe-west2/deleteAccount', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch({ timeout: 90000 });
    expect(response.ok()).toBe(true);
    // Hold the SDK's existing operations queue to deterministically schedule a storage update
    // before completion's signOut. This injects latency, not a different signOut implementation.
    await page.evaluate(async () => {
      const { auth } = await import('/src/firebase.ts');
      window.auditQueued = [];
      auth.queue(() => new Promise(resolve => { window.auditRelease = resolve; }));
      const update = auth._updateCurrentUser.bind(auth);
      auth._updateCurrentUser = (user, skip) => {
        window.auditQueued.push(user?.uid ?? null);
        console.log('AUDIT queued ' + (user?.uid ?? 'null') + ' while current=' + auth.currentUser?.uid);
        return update(user, skip);
      };
    });
    serverDone();
    await releaseResponse;
    await route.fulfill({ response });
  });
  await page.goto('/settings/delete-account');
  await page.getByTestId('delete-password').fill('pilot-password-1');
  await page.getByTestId('delete-submit').click();
  await completed;
  // Actual second-tab SDK login, with the ordinary shared persistence and storage notification.
  await other.evaluate(async () => {
    const { auth } = await import('/src/firebase.ts');
    const { signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
    await signInWithEmailAndPassword(auth, 'bogdan@safebite.test', 'pilot-password-1');
  });
  await page.waitForFunction(() => window.auditQueued.includes('bogdan-uid'));
  sendResponse();
  await page.waitForFunction(() => window.auditQueued.includes(null));
  await page.evaluate(() => window.auditRelease());
  await page.waitForTimeout(3000);
  const result = await other.evaluate(async () => {
    const { auth } = await import('/src/firebase.ts');
    await auth.authStateReady();
    return { uid: auth.currentUser?.uid ?? null, text: document.body.innerText };
  });
  const notice = await page.getByTestId('signin-deleted-notice').count();
  const serverState = {
    avaPasswordAccepted: await passwordAccepted(request, 'ava@safebite.test', 'pilot-password-1'),
    bogdanPasswordAccepted: await passwordAccepted(request, 'bogdan@safebite.test', 'pilot-password-1'),
    householdExists: await householdExists(request),
  };
  console.log(JSON.stringify({ events, otherAccount: result, deletedNotice: notice, serverState }));
  expect(serverState).toEqual({ avaPasswordAccepted: false, bogdanPasswordAccepted: true, householdExists: true });
  expect(result.uid).toBe('bogdan-uid');
  expect(notice).toBe(0);
});

test('control: the same queued account switch survives when no completion sign-out follows', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('signin-email').fill('ava@safebite.test');
  await page.getByTestId('signin-password').fill('pilot-password-1');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('nav-settings')).toBeVisible({ timeout: 30000 });
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByTestId('nav-settings')).toBeVisible({ timeout: 30000 });
  await page.evaluate(async () => {
    const { auth } = await import('/src/firebase.ts');
    window.auditQueued = [];
    auth.queue(() => new Promise(resolve => { window.auditRelease = resolve; }));
    const update = auth._updateCurrentUser.bind(auth);
    auth._updateCurrentUser = (user, skip) => {
      window.auditQueued.push(user?.uid ?? null);
      return update(user, skip);
    };
  });
  await other.evaluate(async () => {
    const { auth } = await import('/src/firebase.ts');
    const { signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
    await signInWithEmailAndPassword(auth, 'bogdan@safebite.test', 'pilot-password-1');
  });
  await page.waitForFunction(() => window.auditQueued.includes('bogdan-uid'));
  await page.evaluate(() => window.auditRelease());
  await page.waitForTimeout(3000);
  const uid = await other.evaluate(async () => {
    const { auth } = await import('/src/firebase.ts');
    await auth.authStateReady();
    return auth.currentUser?.uid ?? null;
  });
  console.log(JSON.stringify({ controlOtherUid: uid }));
  expect(uid).toBe('bogdan-uid');
  await expect(page.getByTestId('signin-deleted-notice')).toHaveCount(0);
});
