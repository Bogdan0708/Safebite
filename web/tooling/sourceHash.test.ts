import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeSourceHash, sourceFilesFor } from "./sourceHash";

let root: string;
function scaffold() {
  root = mkdtempSync(path.join(tmpdir(), "safebite-hash-"));
  mkdirSync(path.join(root, "src", "records"), { recursive: true });
  mkdirSync(path.join(root, "public"));
  writeFileSync(path.join(root, "index.html"), "<html></html>");
  writeFileSync(path.join(root, "vite.config.ts"), "export default {}");
  writeFileSync(path.join(root, ".env.preview"), "VITE_X=1");
  writeFileSync(path.join(root, "src", "main.tsx"), "console.log(1)");
  writeFileSync(path.join(root, "src", "records", "types.ts"), "export const a = 1");
  writeFileSync(path.join(root, "public", "favicon.svg"), "<svg/>");
  writeFileSync(path.join(root, "package.json"), "{}"); // not part of the set
}
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("sourceFilesFor", () => {
  it("lists index.html, vite.config.ts, the mode file and everything under src/ and public/, sorted", () => {
    scaffold();
    expect(sourceFilesFor(root, "preview").map((f) => path.relative(root, f))).toEqual([
      ".env.preview",
      "index.html",
      "public/favicon.svg",
      "src/main.tsx",
      "src/records/types.ts",
      "vite.config.ts",
    ]);
  });
});

describe("computeSourceHash", () => {
  it("is stable for identical trees and changes when any listed file changes", () => {
    scaffold();
    const a = computeSourceHash(root, "preview");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(computeSourceHash(root, "preview")).toBe(a);
    writeFileSync(path.join(root, "src", "records", "types.ts"), "export const a = 2");
    expect(computeSourceHash(root, "preview")).not.toBe(a);
  });

  it("depends on the mode file, and ignores files outside the set", () => {
    scaffold();
    const a = computeSourceHash(root, "preview");
    writeFileSync(path.join(root, "package.json"), '{"changed":true}');
    expect(computeSourceHash(root, "preview")).toBe(a);
    writeFileSync(path.join(root, ".env.preview"), "VITE_X=2");
    expect(computeSourceHash(root, "preview")).not.toBe(a);
  });

  it("differs between modes whose fixture files differ", () => {
    scaffold();
    writeFileSync(path.join(root, ".env.preview-v2"), "VITE_X=3");
    expect(computeSourceHash(root, "preview")).not.toBe(computeSourceHash(root, "preview-v2"));
  });
});
