import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'web/package.json'));
const { chromium } = require('@playwright/test');
const good = path.join(process.cwd(), 'web/dist-preview');
const bad = path.join(process.cwd(), 'web/dist-boot-guard');
let serving = good;
const requests = [];
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    requests.push({ build: serving === good ? 'good' : 'bad', path: pathname });
    let body;
    try { body = await readFile(path.join(serving, pathname)); }
    catch {
      if (path.extname(pathname)) { res.writeHead(404); res.end(); return; }
      pathname = '/index.html';
      body = await readFile(path.join(serving, pathname));
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(pathname)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) { res.writeHead(500); res.end(String(err)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(origin);
  await page.getByTestId('signin-form').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const first = await page.evaluate(async () => ({ registrations: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }));
  console.log('GOOD_INSTALL', JSON.stringify(first));
  // Simulate a subsequent release at the same origin, preserving the installed client.
  serving = bad;
  const updated = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return await new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('worker update timed out')), 15000);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            clearTimeout(timer); resolve(worker.state);
          }
        });
      }, { once: true });
      await registration.update();
    });
  });
  // autoUpdate may already navigate here; wait for the new document rather than assuming
  // the original execution context survives activation.
  await page.getByTestId('misconfigured').waitFor();
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0);
  const afterReload = await page.evaluate(async () => {
    const all = {};
    for (const name of await caches.keys()) all[name] = (await (await caches.open(name)).keys()).map(req => new URL(req.url).pathname);
    return { controlled: !!navigator.serviceWorker.controller, registrations: (await navigator.serviceWorker.getRegistrations()).length, cachedPaths: all };
  });
  const result = { first, updated, afterReload, errors, requests };
  await writeFile('/tmp/safebite-plan2a-update-audit.json', JSON.stringify(result, null, 2));
  console.log('MISCONFIGURED_SCREEN', JSON.stringify(afterReload));
  console.log('BAD_APP_CHUNK_FETCHES', JSON.stringify(requests.filter(r => r.build === 'bad' && r.path.includes('/App-'))));
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
