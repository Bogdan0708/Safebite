import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// PNG: 8-byte signature, then the IHDR chunk whose width/height are big-endian at bytes 16–23.
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const publicDir = path.resolve(__dirname, "../../public");

describe("PWA icon set", () => {
  it.each([
    ["pwa-192.png", 192],
    ["pwa-512.png", 512],
    ["pwa-maskable-512.png", 512],
    ["apple-touch-icon-180.png", 180],
  ])("%s is a %ipx square PNG", (file, size) => {
    expect(pngSize(path.join(publicDir, file))).toEqual({ width: size, height: size });
  });

  it("the favicon is the SafeBite mark, not the Vite logo", () => {
    const svg = readFileSync(path.join(publicDir, "favicon.svg"), "utf8");
    expect(svg).toContain("safebite-mark");
    expect(svg).not.toContain("#863bff");
  });
});
