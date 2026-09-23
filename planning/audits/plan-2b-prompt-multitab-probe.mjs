import http from 'node:http';
import {mkdtemp, readFile, writeFile, symlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require = createRequire(path.join(process.cwd(), 'web/package.json'));
const {build} = await import(require.resolve('vite'));
const {VitePWA} = await import(require.resolve('vite-plugin-pwa'));
const {chromium} = require('@playwright/test');
const root = await mkdtemp(path.join(tmpdir(), 'safebite-prompt-multitab-'));
await symlink(path.join(process.cwd(), 'web/node_modules'),path.join(root,'node_modules'),'dir');
await writeFile(path.join(root, 'index.html'), '<html><head></head><body><input id="draft"><button id="reload" hidden>Reload</button><script type="module" src="/main.js"></script></body></html>');
for (const version of ['v1', 'v2']) {
  await writeFile(path.join(root, 'main.js'), `import {registerSW} from 'virtual:pwa-register'; window.auditVersion='${version}'; const apply=registerSW({immediate:true,onNeedRefresh(){document.querySelector('#reload').hidden=false}}); document.querySelector('#reload').onclick=()=>apply();`);
  await build({configFile:false,root,logLevel:'error',build:{outDir:path.join(root,version)},plugins:[VitePWA({registerType:'prompt',injectRegister:null,manifest:false,workbox:{globPatterns:['**/*.{js,html}']}})]});
}
let version='v1';
const server=http.createServer(async(req,res)=>{
  const p=new URL(req.url,'http://127.0.0.1').pathname;
  try {const data=await readFile(path.join(root,version,p==='/'?'index.html':p));res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store'});res.end(data)}
  catch {res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try {
  const context=await browser.newContext();
  const a=await context.newPage();
  await a.goto(origin);
  await a.evaluate(()=>navigator.serviceWorker.ready);
  await a.reload();
  await a.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const b=await context.newPage();
  await b.goto(origin);
  await b.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await b.locator('#draft').fill('unsaved restaurant edit');
  version='v2';
  await a.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update()});
  await a.locator('#reload').waitFor({state:'visible'});
  await b.locator('#reload').waitFor({state:'visible'});
  const before={version:await b.evaluate(()=>window.auditVersion),draft:await b.locator('#draft').inputValue()};
  await a.locator('#reload').click();
  await b.waitForFunction(()=>window.auditVersion==='v2');
  const after={version:await b.evaluate(()=>window.auditVersion),draft:await b.locator('#draft').inputValue()};
  console.log(JSON.stringify({root,tabBClickedReload:false,before,after},null,2));
} finally {await browser.close();await new Promise(r=>server.close(r))}
