import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ call: vi.fn(), shareOrDownload: vi.fn(), downloadFile: vi.fn() }));
vi.mock("./api", () => ({ exportHouseholdCall: m.call }));
vi.mock("./exportFile", async (orig) => ({ ...(await orig<typeof import("./exportFile")>()), shareOrDownload: m.shareOrDownload, downloadFile: m.downloadFile }));

import { ExportSection } from "./ExportSection";

const fnErr = (code: string) => Object.assign(new Error(code), { code: `functions/${code}` });
const state = () => screen.getByTestId("export-status").getAttribute("data-state");

beforeEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: true }));
afterEach(() => vi.clearAllMocks());

describe("ExportSection", () => {
  it("warns that the file contains both members' notes", () => {
    render(<ExportSection />);
    expect(screen.getByTestId("export-warning")).toHaveTextContent("both members' notes");
  });

  it("two taps: Prepare never shares; Share or save is a separate tap with the built file", async () => {
    m.call.mockResolvedValue({ format: "safebite-export", restaurants: [] });
    m.shareOrDownload.mockResolvedValue("shared");
    render(<ExportSection />);
    await userEvent.click(screen.getByTestId("export-prepare"));
    await waitFor(() => expect(state()).toBe("ready"));
    expect(m.shareOrDownload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("export-share"));
    const [shared] = m.shareOrDownload.mock.calls[0] as [File];
    expect(shared.name).toMatch(/^safebite-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await shared.text())).toMatchObject({ format: "safebite-export" });
  });

  it("Download instead downloads without the share sheet", async () => {
    m.call.mockResolvedValue({});
    render(<ExportSection />);
    await userEvent.click(screen.getByTestId("export-prepare"));
    await userEvent.click(await screen.findByTestId("export-download"));
    expect(m.downloadFile).toHaveBeenCalledTimes(1);
    expect(m.shareOrDownload).not.toHaveBeenCalled();
  });

  it("offline: nothing is called", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<ExportSection />);
    await userEvent.click(screen.getByTestId("export-prepare"));
    expect(state()).toBe("offline");
    expect(m.call).not.toHaveBeenCalled();
  });

  it.each([[fnErr("resource-exhausted"), "tooLarge"], [fnErr("internal"), "failed"]])("a failure shows its state: %s", async (error, expected) => {
    m.call.mockRejectedValue(error);
    render(<ExportSection />);
    await userEvent.click(screen.getByTestId("export-prepare"));
    await waitFor(() => expect(state()).toBe(expected));
    expect(screen.queryByTestId("export-share")).toBeNull();
  });
});
