import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertFreshDist } from "./distStamp";
import { computeSourceHash, type BuildStamp } from "./sourceHash";

let root: string;
function scaffold() {
  root = mkdtempSync(path.join(tmpdir(), "safebite-diststamp-"));
  mkdirSync(path.join(root, "src"), { recursive: true });
  mkdirSync(path.join(root, "public"));
  writeFileSync(path.join(root, "index.html"), "<html></html>");
  writeFileSync(path.join(root, "vite.config.ts"), "export default {}");
  writeFileSync(path.join(root, ".env.preview"), "VITE_X=1");
  writeFileSync(path.join(root, "src", "main.tsx"), "console.log(1)");
  writeFileSync(path.join(root, "public", "favicon.svg"), "<svg/>");
}
function writeStamp(outDir: string, overrides: Partial<BuildStamp> = {}) {
  mkdirSync(path.join(root, outDir), { recursive: true });
  const stamp: BuildStamp = {
    mode: "preview",
    projectId: "demo",
    sourceHash: computeSourceHash(root, "preview"),
    builtAt: new Date().toISOString(),
    ...overrides,
  };
  writeFileSync(path.join(root, outDir, "safebite-build.json"), JSON.stringify(stamp, null, 2) + "\n");
}
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("assertFreshDist", () => {
  it("refuses a missing stamp, naming the build script", () => {
    scaffold();
    expect(() => assertFreshDist(root, "dist-preview", "preview")).toThrow(/safebite-build\.json is missing/);
    expect(() => assertFreshDist(root, "dist-preview", "preview")).toThrow(/build:preview/);
  });

  it("refuses a stamp built for another mode", () => {
    scaffold();
    writeStamp("dist-preview", { mode: "boot-guard" });
    expect(() => assertFreshDist(root, "dist-preview", "preview")).toThrow(/built for mode "boot-guard"/);
    expect(() => assertFreshDist(root, "dist-preview", "preview")).toThrow(/build:preview/);
  });

  it("refuses a stamp whose source hash is stale", () => {
    scaffold();
    writeStamp("dist-preview");
    writeFileSync(path.join(root, "src", "main.tsx"), "console.log(2)");
    expect(() => assertFreshDist(root, "dist-preview", "preview")).toThrow(/is stale/);
    expect(() => assertFreshDist(root, "dist-preview", "preview")).toThrow(/build:preview/);
  });

  it("returns the stamp when it is fresh", () => {
    scaffold();
    writeStamp("dist-preview");
    const stamp = assertFreshDist(root, "dist-preview", "preview");
    expect(stamp.mode).toBe("preview");
    expect(stamp.sourceHash).toBe(computeSourceHash(root, "preview"));
  });
});
