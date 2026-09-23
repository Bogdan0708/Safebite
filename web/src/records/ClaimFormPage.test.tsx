import { MemoryRouter, Route, Routes } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ addClaim: vi.fn() }));
vi.mock("./repository", () => m);
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));
vi.mock("./useToday", () => ({ useToday: () => "2026-09-21" }));

import { ClaimFormPage, toClaimInput } from "./ClaimFormPage";

afterEach(() => vi.clearAllMocks());

describe("toClaimInput", () => {
  it("lowercases an upper-case http(s) scheme in the source URL so the rules' case-sensitive check accepts it", () => {
    const input = toClaimInput({
      kind: "accreditation",
      value: "yes",
      detail: "",
      sourceType: "accreditingBody",
      sourceLabel: "Coeliac UK",
      sourceUrl: " HTTPS://Coeliac.org.uk/venues/1 ",
      checkedAt: "2026-09-01",
      expiresAt: "",
    });
    expect(input.source.url).toBe("https://Coeliac.org.uk/venues/1");
  });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/restaurants/r1/evidence/new"]}>
      <Routes>
        <Route path="/restaurants/:rid" element={<p data-testid="detail-page">detail</p>} />
        <Route path="/restaurants/:rid/evidence/new" element={<ClaimFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClaimFormPage", () => {
  it("defaults the checked date to today and caps it there", () => {
    renderPage();
    const checked = screen.getByTestId("claim-checked-at");
    expect(checked).toHaveValue("2026-09-21");
    expect(checked).toHaveAttribute("max", "2026-09-21");
  });

  it("requires a URL for an accrediting body and forces that source type for accreditation", async () => {
    renderPage();
    await userEvent.selectOptions(screen.getByTestId("claim-kind"), "accreditation");
    expect(screen.getByTestId("claim-source-type")).toHaveValue("accreditingBody");
    expect(screen.getByTestId("claim-source-type")).toBeDisabled();
    await userEvent.type(screen.getByTestId("claim-source-label"), "Coeliac UK");
    await userEvent.click(screen.getByTestId("claim-submit"));
    expect(screen.getByTestId("claim-error-sourceUrl")).toHaveTextContent("An accrediting body needs a link to its listing.");
    expect(m.addClaim).not.toHaveBeenCalled();
  });

  it("submits a normalised claim (blank expiry omitted) and navigates back to the detail page", async () => {
    m.addClaim.mockResolvedValue({ kind: "ok", value: "c9" });
    renderPage();
    await userEvent.selectOptions(screen.getByTestId("claim-kind"), "separateFryer");
    await userEvent.selectOptions(screen.getByTestId("claim-value"), "no");
    await userEvent.type(screen.getByTestId("claim-detail"), " Shared fryer with battered fish. ");
    await userEvent.selectOptions(screen.getByTestId("claim-source-type"), "ownVisit");
    await userEvent.type(screen.getByTestId("claim-source-label"), " Visit on a Friday ");
    // jsdom date inputs reject character-by-character typing; set the value directly.
    fireEvent.change(screen.getByTestId("claim-checked-at"), { target: { value: "2026-09-19" } });
    await userEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(screen.getByTestId("detail-page")).toBeInTheDocument());
    expect(m.addClaim).toHaveBeenCalledWith("home", "r1", { uid: "ava-uid", displayName: "Ava" }, {
      kind: "separateFryer",
      value: "no",
      detail: "Shared fryer with battered fish.",
      source: { type: "ownVisit", label: "Visit on a Friday" },
      checkedAt: "2026-09-19",
    });
  });

  it("shows the not-found outcome when the restaurant was deleted meanwhile", async () => {
    m.addClaim.mockResolvedValue({ kind: "notFound" });
    renderPage();
    await userEvent.type(screen.getByTestId("claim-source-label"), "Manager");
    await userEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(screen.getByTestId("claim-save-outcome")).toHaveAttribute("data-kind", "notFound"));
    expect(screen.getByTestId("claim-save-outcome")).toHaveTextContent("This restaurant was deleted.");
  });
});
