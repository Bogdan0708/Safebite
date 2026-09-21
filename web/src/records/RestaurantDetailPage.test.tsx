import { MemoryRouter, Route, Routes } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Claim, Restaurant } from "./types";
import type { Snapshot } from "./repository";

const m = vi.hoisted(() => ({ watchRestaurant: vi.fn(), watchClaims: vi.fn(), deleteClaim: vi.fn() }));
vi.mock("./repository", () => m);
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));
vi.mock("./useToday", () => ({ useToday: () => "2026-09-21" }));

import { RestaurantDetailPage } from "./RestaurantDetailPage";

let emitRestaurant: (s: Snapshot<Restaurant>) => void = () => {};
let emitClaims: (s: Snapshot<Claim[]>) => void = () => {};
const restaurant: Restaurant = { id: "r1", name: "Da Marco", address: "Via Roma 1", phone: "+39 06 1", website: "https://damarco.it", createdBy: "ava-uid", createdAt: new Date(), updatedAt: new Date(), version: 2, deleting: false };
const claim = (over: Partial<Claim> & Pick<Claim, "id">): Claim => ({
  kind: "separateFryer", value: "yes", detail: "", source: { type: "restaurantStatement", label: "Manager" }, checkedAt: "2026-09-01",
  authorUid: "ava-uid", authorName: "Ava", createdAt: new Date("2026-09-01T10:00:00Z"), ...over,
});

beforeEach(() => {
  m.watchRestaurant.mockImplementation((_h: string, _r: string, cb: (s: Snapshot<Restaurant>) => void) => { emitRestaurant = cb; return () => {}; });
  m.watchClaims.mockImplementation((_h: string, _r: string, cb: (s: Snapshot<Claim[]>) => void) => { emitClaims = cb; return () => {}; });
  m.deleteClaim.mockResolvedValue({ kind: "ok", value: undefined });
});
afterEach(() => vi.clearAllMocks());

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/restaurants/r1"]}>
      <Routes>
        <Route path="/restaurants/:rid" element={<RestaurantDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RestaurantDetailPage", () => {
  it("shows facts, six unknown kinds and the call-ahead block when there are no claims", () => {
    renderPage();
    act(() => { emitRestaurant({ status: "ready", value: restaurant }); emitClaims({ status: "ready", value: [] }); });
    expect(screen.getByTestId("restaurant-name")).toHaveTextContent("Da Marco");
    expect(screen.getByTestId("restaurant-phone")).toHaveAttribute("href", "tel:+39061");
    expect(screen.getByTestId("restaurant-website")).toHaveAttribute("href", "https://damarco.it");
    for (const kind of ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"]) {
      expect(screen.getByTestId(`evidence-${kind}`)).toHaveAttribute("data-state", "unknown");
    }
    const callAhead = screen.getByTestId("call-ahead");
    expect(callAhead).toHaveTextContent("Anywhere");
    expect(callAhead).toHaveTextContent("Italian");
    expect(callAhead).toHaveTextContent("Do you have a dedicated fryer for gluten-free items?");
    expect(screen.getByTestId("edit-restaurant")).toHaveAttribute("href", "/restaurants/r1/edit");
    expect(screen.getByTestId("add-evidence")).toHaveAttribute("href", "/restaurants/r1/evidence/new");
  });

  it("renders current, needs-rechecking and conflicting states with dates, sources and authors", () => {
    renderPage();
    act(() => {
      emitRestaurant({ status: "ready", value: restaurant });
      emitClaims({
        status: "ready",
        value: [
          claim({ id: "acc", kind: "accreditation", source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/v/1" }, checkedAt: "2026-06-01" }),
          claim({ id: "stale", kind: "gfMenu", checkedAt: "2025-01-15", authorName: "Bogdan" }),
          claim({ id: "y", kind: "separateFryer", value: "yes", checkedAt: "2026-09-10" }),
          claim({ id: "n", kind: "separateFryer", value: "no", checkedAt: "2026-09-10", source: { type: "ownVisit", label: "Saw a shared fryer" } }),
        ],
      });
    });
    const acc = screen.getByTestId("evidence-accreditation");
    expect(acc).toHaveAttribute("data-state", "current");
    expect(acc).toHaveTextContent("Coeliac UK");
    expect(acc.querySelector("a[href='https://coeliac.org.uk/v/1']")).not.toBeNull();
    expect(acc).toHaveTextContent("1 June 2026");
    const menu = screen.getByTestId("evidence-gfMenu");
    expect(menu).toHaveAttribute("data-state", "needsRechecking");
    expect(menu).toHaveTextContent("Needs rechecking");
    expect(menu).toHaveTextContent("Bogdan");
    const fryer = screen.getByTestId("evidence-separateFryer");
    expect(fryer).toHaveAttribute("data-state", "conflicting");
    expect(fryer).toHaveTextContent("Conflicting evidence — check before you go");
    expect(screen.getByTestId("claim-y")).toBeInTheDocument();
    expect(screen.getByTestId("claim-n")).toBeInTheDocument();
  });

  it("deletes a claim only after its in-page confirm", async () => {
    renderPage();
    act(() => { emitRestaurant({ status: "ready", value: restaurant }); emitClaims({ status: "ready", value: [claim({ id: "c1" })] }); });
    await userEvent.click(screen.getByTestId("claim-delete-c1"));
    expect(m.deleteClaim).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("claim-delete-confirm-c1"));
    await waitFor(() => expect(m.deleteClaim).toHaveBeenCalledWith("home", "r1", "c1"));
  });

  it("keeps evidence unknown-vs-unloaded distinct: loading and error show notices, not six unknowns", () => {
    renderPage();
    act(() => { emitRestaurant({ status: "ready", value: restaurant }); });
    expect(screen.getByTestId("read-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("evidence-dedicatedKitchen")).toBeNull();

    act(() => { emitClaims({ status: "error", message: "boom" }); });
    expect(screen.getByTestId("read-error")).toBeInTheDocument();
    expect(screen.queryByTestId("evidence-dedicatedKitchen")).toBeNull();

    act(() => { emitClaims({ status: "ready", value: [] }); });
    for (const kind of ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"]) {
      expect(screen.getByTestId(`evidence-${kind}`)).toHaveAttribute("data-state", "unknown");
    }
  });

  it("shows gone when the restaurant is deleted and disables Add evidence when offline", () => {
    const { unmount } = renderPage();
    act(() => emitRestaurant({ status: "gone" }));
    expect(screen.getByTestId("read-gone")).toHaveTextContent("This restaurant was deleted.");
    unmount();
    renderPage();
    act(() => { emitRestaurant({ status: "offline", value: restaurant }); emitClaims({ status: "offline", value: [] }); });
    expect(screen.getByTestId("add-evidence")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("read-offline")).toBeInTheDocument();
  });
});
