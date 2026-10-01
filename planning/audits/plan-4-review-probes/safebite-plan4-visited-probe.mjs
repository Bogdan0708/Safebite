// Audit reproduction: run against local demo-safebite emulators and Vite :5173 only.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve('web/package.json'));
const { chromium, expect } = require('@playwright/test');
const base = 'http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents';
const rid = `audit-visited-${Date.now()}`;
const paths = [`households/home/restaurants/${rid}`, `households/home/collection/${rid}`];
const headers = {Authorization:'Bearer owner','Content-Type':'application/json'};
const s = stringValue => ({stringValue});
const t = timestampValue => ({timestampValue});
const i = n => ({integerValue:String(n)});
const b = booleanValue => ({booleanValue});
async function seed(path, fields) {
  const response = await fetch(`${base}/${path}`, {method:'PATCH',headers,body:JSON.stringify({fields})});
  if (!response.ok) throw new Error(`Local seed failed: ${response.status}`);
}
async function signIn(page, who) {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByTestId('signin-email').fill(`${who}@safebite.test`);
  await page.getByTestId('signin-password').fill('pilot-password-1');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('nav-saved')).toBeVisible({timeout:15000});
  await page.goto(`http://127.0.0.1:5173/restaurants/${rid}`);
  await expect(page.getByTestId('visited-state')).toHaveText('Visited 3 May 2026');
}
await seed(paths[0], {name:s('Audit visited race'),address:s('1 Test Street'),createdBy:s('ava-uid'),createdAt:t('2026-09-01T00:00:00Z'),updatedAt:t('2026-09-01T00:00:00Z'),version:i(1),deleting:b(false)});
await seed(paths[1], {shortlisted:b(false),visited:b(true),visitedOn:t('2026-05-03T00:00:00Z'),updatedBy:s('ava-uid'),updatedByName:s('Ava'),updatedAt:t('2026-09-01T00:00:00Z'),version:i(1)});
const browser = await chromium.launch();
try {
  const ac = await browser.newContext();
  const bc = await browser.newContext();
  const a = await ac.newPage();
  const other = await bc.newPage();
  await signIn(a,'ava');
  await signIn(other,'bogdan');
  await a.getByTestId('visited-change').click();
  await a.getByTestId('visited-date').fill('2026-05-04');
  await other.getByTestId('visited-change').click();
  await other.getByTestId('visited-date').fill('2026-05-10');
  await other.getByTestId('visited-save').click();
  await expect(other.getByTestId('visited-state')).toHaveText('Visited 10 May 2026');
  await expect(a.getByTestId('status-changed-by')).toHaveText('Last changed by Bogdan');
  await expect(a.getByTestId('visited-date')).toHaveValue('2026-05-04');
  await a.getByTestId('visited-save').click();
  await expect(other.getByTestId('visited-state')).toHaveText('Visited 4 May 2026');
  expect(await a.getByTestId('status-outcome').count()).toBe(0);
  const doc = await (await fetch(`${base}/${paths[1]}`,{headers})).json();
  console.log(JSON.stringify({probe:'stale-visited-draft',initialVersion:1,otherMemberSaved:'2026-05-10',staleDraftSaved:doc.fields.visitedOn.timestampValue,finalVersion:doc.fields.version.integerValue,conflictDisplayed:false}));
} finally {
  await browser.close();
  for (const path of paths.toReversed()) await fetch(`${base}/${path}`, {method:'DELETE',headers});
}
