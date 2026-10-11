import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getDoc: vi.fn(), email: "ava@safebite.test" as string | null }));
const w = vi.hoisted(() => ({ writable: true }));
vi.mock("../offline/writeAccess", () => ({ useWriteAccess: () => w.writable, canWrite: () => w.writable }));
vi.mock("../firebase", () => ({ db: {}, auth: {} }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, path: string) => ({ path }), getDoc: m.getDoc }));
vi.mock("../records/useMember", () => ({ useMember: () => ({ uid: "u", householdId: "home", displayName: "Ava" }) }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ state: { status: "member", email: m.email } }) }));
vi.mock("./DeletePasswordForm", () => ({
  DeletePasswordForm: ({ submitLabel, expectedUid, gated }: { submitLabel: string; expectedUid: string; gated?: boolean }) => (
    <button data-expected-uid={expectedUid} data-gated={gated ? "true" : "false"}>{submitLabel}</button>
  ),
}));

import { DeleteAccountPage } from "./DeleteAccountPage";

beforeEach(() => {
  w.writable = true;
});

const page = () => render(<MemoryRouter><DeleteAccountPage /></MemoryRouter>);

describe("DeleteAccountPage", () => {
  it("with another member: notes deleted, evidence kept as Former member, Export first link", async () => {
    m.getDoc.mockResolvedValue({ exists: () => true, get: () => ["u", "other"] });
    page();
    expect(await screen.findByTestId("delete-consequence")).toHaveTextContent("Restaurants and evidence you added stay with the household, shown as 'Former member'.");
    expect(screen.getByTestId("export-first")).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: "Delete my account" })).toHaveAttribute("data-expected-uid", "u");
  });

  it("names the account being deleted", () => {
    m.getDoc.mockResolvedValue({ exists: () => true, get: () => ["u"] });
    page();
    expect(screen.getByTestId("delete-account-email")).toHaveTextContent("Deleting the account ava@safebite.test");
  });

  it("falls back to the display name when the email is null (G4)", () => {
    m.getDoc.mockResolvedValue({ exists: () => true, get: () => ["u"] });
    m.email = null;
    try {
      page();
      expect(screen.getByTestId("delete-account-email")).toHaveTextContent("Deleting the account Ava");
    } finally { m.email = "ava@safebite.test"; }
  });

  it("as the only member: everything is deleted", async () => {
    m.getDoc.mockResolvedValue({ exists: () => true, get: () => ["u"] });
    page();
    expect(await screen.findByTestId("delete-consequence")).toHaveTextContent("Everything in the household is deleted.");
  });

  it("if the household cannot be read it shows the normal text", async () => {
    m.getDoc.mockRejectedValue(new Error("offline"));
    page();
    expect(await screen.findByTestId("delete-consequence")).toHaveTextContent("Your sign-in and your notes are deleted.");
  });

  it("uses the write gate, and says why while writes are not allowed (review R2-6)", () => {
    m.getDoc.mockResolvedValue({ exists: () => true, get: () => ["u"] });
    w.writable = false;
    page();
    expect(screen.getByTestId("write-blocked")).toHaveTextContent("Adding and editing need a connection.");
    expect(screen.getByRole("button", { name: "Delete my account" })).toHaveAttribute("data-gated", "true");
  });

  it("shows no write notice while writes are allowed", () => {
    m.getDoc.mockResolvedValue({ exists: () => true, get: () => ["u"] });
    page();
    expect(screen.queryByTestId("write-blocked")).toBeNull();
    expect(screen.getByRole("button", { name: "Delete my account" })).toHaveAttribute("data-gated", "true");
  });
});
