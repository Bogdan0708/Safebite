import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getDoc: vi.fn(), email: "ava@safebite.test" as string | null }));
vi.mock("../firebase", () => ({ db: {}, auth: {} }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, path: string) => ({ path }), getDoc: m.getDoc }));
vi.mock("../records/useMember", () => ({ useMember: () => ({ uid: "u", householdId: "home", displayName: "Ava" }) }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ state: { status: "member", email: m.email } }) }));
vi.mock("./DeletePasswordForm", () => ({ DeletePasswordForm: ({ submitLabel, expectedUid }: { submitLabel: string; expectedUid: string }) => <button data-expected-uid={expectedUid}>{submitLabel}</button> }));

import { DeleteAccountPage } from "./DeleteAccountPage";

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
});
