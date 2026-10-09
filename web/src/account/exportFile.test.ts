import { afterEach, describe, expect, it, vi } from "vitest";
import { exportFileName, shareOrDownload } from "./exportFile";

const file = () => new File(["{}"], "safebite-export-2026-10-01.json", { type: "application/json" });
const setNav = (share?: unknown, canShare?: unknown) => {
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
};
const named = (name: string) => Object.assign(new Error(name), { name });

afterEach(() => setNav(undefined, undefined));

describe("exportFileName", () => {
  it("uses the local calendar date", () => {
    expect(exportFileName(new Date(2026, 9, 1, 23, 30))).toBe("safebite-export-2026-10-01.json");
  });
});

describe("shareOrDownload", () => {
  it("shares the file when files can be shared", async () => {
    const share = vi.fn(async () => {});
    setNav(share, () => true);
    const download = vi.fn();
    await expect(shareOrDownload(file(), download)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] });
    expect(download).not.toHaveBeenCalled();
  });
  it("a cancelled share sheet is silent: no download", async () => {
    setNav(vi.fn(async () => { throw named("AbortError"); }), () => true);
    const download = vi.fn();
    await expect(shareOrDownload(file(), download)).resolves.toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });
  it("NotAllowedError (activation lost) falls back to a download", async () => {
    setNav(vi.fn(async () => { throw named("NotAllowedError"); }), () => true);
    const download = vi.fn();
    await expect(shareOrDownload(file(), download)).resolves.toBe("downloaded");
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("without file sharing it downloads", async () => {
    setNav(undefined, undefined);
    const download = vi.fn();
    await expect(shareOrDownload(file(), download)).resolves.toBe("downloaded");
    setNav(vi.fn(), () => false);
    await expect(shareOrDownload(file(), download)).resolves.toBe("downloaded");
  });
});
