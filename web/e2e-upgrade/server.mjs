// Static server for the upgrade suite: one origin, three builds, switched at runtime so an
// installed service worker sees a "new release" at the same URL. Adapted from
// planning/audits/plan-2a-update-probe.mjs. Control endpoints live under /_test/ and are called
// with Playwright's request context (Node-side), so a controlling worker never sees them.
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILDS = {
  v1: path.resolve(here, "../dist-preview"),
  v2: path.resolve(here, "../dist-preview-v2"),
  invalid: path.resolve(here, "../dist-boot-guard"),
};
const MIME = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};
const PORT = Number(process.env.SAFEBITE_UPGRADE_PORT ?? 4175);

let serving = "v1";
let requests = [];

async function control(req, res, url) {
  const [, , action, arg] = url.pathname.split("/");
  if (action === "health") return text(res, 200, "ok");
  if (action === "serve" && req.method === "POST" && arg in BUILDS) {
    serving = arg;
    return text(res, 200, serving);
  }
  if (action === "requests" && arg === "reset" && req.method === "POST") {
    requests = [];
    return text(res, 200, "reset");
  }
  if (action === "requests") return json(res, requests);
  if (action === "assets") return json(res, await readdir(path.join(BUILDS[serving], "assets")));
  return text(res, 404, "unknown control endpoint");
}

function text(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
  res.end(body);
}
function json(res, value) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith("/_test/")) return control(req, res, url);
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  requests.push({ build: serving, path: pathname });
  let body;
  try {
    body = await readFile(path.join(BUILDS[serving], pathname));
  } catch {
    if (path.extname(pathname)) return text(res, 404, "not found");
    pathname = "/index.html";
    body = await readFile(path.join(BUILDS[serving], pathname));
  }
  // no-store everywhere: the suite switches releases underneath the browser and must never be
  // served a stale copy by the HTTP cache. (Hosting uses no-cache for sw/index and immutable for
  // hashed assets; the worker lifecycle under test does not depend on HTTP caching.)
  res.writeHead(200, { "Content-Type": MIME[path.extname(pathname)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`upgrade server on http://127.0.0.1:${PORT} serving ${serving}`);
});
