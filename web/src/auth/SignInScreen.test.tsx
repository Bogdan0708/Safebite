import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ flag: null as { kind: "ok" | "clearFailed"; uid: string | null } | null, deleted: [] as string[] }));
vi.mock("../account/deletedNotice", () => ({ deletedNoticeOnce: () => m.flag }));
vi.mock("../account/deletedSessions", () => ({ isDeletedUid: (uid: string) => m.deleted.includes(uid) }));
vi.mock("./AuthProvider", () => ({ useAuth: () => ({ signIn: vi.fn() }) }));

import { SignInScreen } from "./SignInScreen";

const OK = "Your account has been deleted.";
const FAILED = "Your account has been deleted. Some data on this device couldn't be cleared.";

beforeEach(() => { m.flag = null; m.deleted = []; });

describe("SignInScreen deleted notice", () => {
  it("deletedSession with a matching flag shows the flag's kind", () => {
    m.flag = { kind: "clearFailed", uid: "ava" };
    render(<SignInScreen deletedUid="ava" />);
    expect(screen.getByTestId("signin-deleted-notice")).toHaveTextContent(FAILED);
  });
  it("deletedSession with a flag for another account, or none, shows the plain notice", () => {
    m.flag = { kind: "clearFailed", uid: "bogdan" };
    render(<SignInScreen deletedUid="ava" />);
    expect(screen.getByTestId("signin-deleted-notice")).toHaveTextContent(OK);
    expect(screen.getByTestId("signin-deleted-notice")).not.toHaveTextContent("couldn't be cleared");
  });
  it("signed out with a null-uid flag shows it", () => {
    m.flag = { kind: "ok", uid: null };
    render(<SignInScreen />);
    expect(screen.getByTestId("signin-deleted-notice")).toHaveTextContent(OK);
  });
  it("signed out with a flag for a recorded uid shows it", () => {
    m.flag = { kind: "ok", uid: "ava" };
    m.deleted = ["ava"];
    render(<SignInScreen />);
    expect(screen.getByTestId("signin-deleted-notice")).toBeInTheDocument();
  });
  it("signed out with a flag for an unrecorded uid shows no notice", () => {
    m.flag = { kind: "ok", uid: "ava" };
    render(<SignInScreen />);
    expect(screen.queryByTestId("signin-deleted-notice")).toBeNull();
  });
});
