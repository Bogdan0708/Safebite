import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ serving: false }));
vi.mock("../offline/hooks", () => ({ useCopyServing: () => m.serving, useCopyMode: () => null }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import { ReadStateNotice } from "./ReadStateNotice";

describe("ReadStateNotice offline", () => {
  it("shows the memory-cache notice when no copy data is shown", () => {
    m.serving = false;
    render(<ReadStateNotice state={{ status: "offline", value: [] }} onRetry={() => {}} />);
    expect(screen.getByTestId("read-offline")).toBeInTheDocument();
  });
  it("is silent while copy data is shown; the shell's copy banner speaks instead", () => {
    m.serving = true;
    render(<ReadStateNotice state={{ status: "offline", value: [] }} onRetry={() => {}} />);
    expect(screen.queryByTestId("read-offline")).toBeNull();
  });
});
