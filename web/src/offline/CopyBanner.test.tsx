import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STALE_BANNER_MS } from "./types";

const m = vi.hoisted(() => ({
  serving: false,
  meta: null as null | { downloadedAt: number },
  state: { status: "member" } as Record<string, unknown>,
  status: { running: false, lastFailure: null as null | string, lastWrittenAt: null as null | number, cantStore: false },
}));
vi.mock("./hooks", () => ({
  useCopyServing: () => { return m.serving; },
  useCopyMode: () => { return null; },
}));
vi.mock("./session", () => ({ lastServedMeta: () => { return m.meta; }, subscribeCopySession: () => { return () => {}; } }));
vi.mock("./refresher", () => ({ useRefreshStatus: () => { return m.status; } }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => { return { state: m.state }; } }));

import { CopyBanner } from "./CopyBanner";

beforeEach(() => {
  m.serving = false;
  m.meta = null;
  m.state = { status: "member" };
  m.status = { running: false, lastFailure: null, lastWrittenAt: null, cantStore: false };
});

describe("CopyBanner", () => {
  it("shows nothing while live data is shown", () => {
    render(<CopyBanner />);
    expect(screen.queryByTestId("copy-banner")).toBeNull();
  });
  it("names the copy's time while copy data is shown", () => {
    m.serving = true;
    m.meta = { downloadedAt: new Date(2026, 9, 10, 14, 32).getTime() };
    render(<CopyBanner />);
    expect(screen.getByTestId("copy-banner")).toHaveTextContent("Offline copy from 10 Oct, 14:32. Adding and editing need a connection.");
    expect(screen.getByTestId("copy-banner")).toHaveAttribute("data-old", "false");
  });
  it("uses the offlineMember download time before any page has served the copy", () => {
    m.serving = true;
    m.state = { status: "offlineMember", uid: "ava-uid", email: null, householdId: "home", displayName: "Ava", downloadedAt: new Date(2026, 9, 9, 18, 5).getTime(), provisional: true };
    render(<CopyBanner />);
    expect(screen.getByTestId("copy-banner")).toHaveTextContent("Offline copy from 9 Oct, 18:05.");
  });
  it("turns amber after 7 days", () => {
    m.serving = true;
    m.meta = { downloadedAt: Date.now() - STALE_BANNER_MS - 60_000 };
    render(<CopyBanner />);
    expect(screen.getByTestId("copy-banner")).toHaveAttribute("data-old", "true");
    expect(screen.getByTestId("copy-banner")).toHaveTextContent("This offline copy is over a week old. Evidence may have changed since.");
  });
  it("a download time in the future shows the plain banner (Review Focus 5)", () => {
    m.serving = true;
    m.meta = { downloadedAt: Date.now() + 86_400_000 };
    render(<CopyBanner />);
    expect(screen.getByTestId("copy-banner")).toHaveAttribute("data-old", "false");
    expect(screen.getByTestId("copy-banner")).not.toHaveTextContent("over a week old");
  });
  it("tells a member whose household changed that the copy was replaced", () => {
    m.state = { status: "member", householdChanged: true };
    render(<CopyBanner />);
    expect(screen.getByTestId("household-changed")).toHaveTextContent("Your household changed; the offline copy was replaced.");
  });
  it("hides the household notice once the new copy has been written (ruling m17)", () => {
    m.state = { status: "member", householdChanged: true };
    m.status = { ...m.status, running: true };
    const { rerender } = render(<CopyBanner />);
    expect(screen.getByTestId("household-changed")).toBeInTheDocument();
    m.status = { ...m.status, running: false, lastWrittenAt: Date.now() };
    rerender(<CopyBanner />);
    expect(screen.queryByTestId("household-changed")).toBeNull();
  });
  it("an earlier write in this document does not hide the notice; the next one does", () => {
    m.state = { status: "member", householdChanged: true };
    m.status = { ...m.status, lastWrittenAt: 1000 };
    const { rerender } = render(<CopyBanner />);
    expect(screen.getByTestId("household-changed")).toBeInTheDocument();
    m.status = { ...m.status, lastFailure: "offline" };
    rerender(<CopyBanner />);
    expect(screen.getByTestId("household-changed")).toBeInTheDocument();
    m.status = { ...m.status, lastFailure: null, lastWrittenAt: 2000 };
    rerender(<CopyBanner />);
    expect(screen.queryByTestId("household-changed")).toBeNull();
  });
});
