import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../records/repository";
import type { Restaurant } from "../records/types";
import type { DiscoveryResponse } from "./api";

const m = vi.hoisted(() => ({
  searchDestination: vi.fn(),
  searchNearby: vi.fn(),
  watchRestaurants: vi.fn(),
  requestPosition: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, searchDestination: m.searchDestination, searchNearby: m.searchNearby };
});
vi.mock("../firebase", () => ({ functions: { app: "fake" }, db: { fake: true } }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock("../records/repository", () => ({ watchRestaurants: m.watchRestaurants }));
vi.mock("./geolocation", () => ({ requestPosition: m.requestPosition }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));

import { DiscoverPage, REASON_TEXT } from "./DiscoverPage";

const result = (n: number) => ({ placeId: `p${n}`, name: `Place ${n}`, address: `${n} Street`, googleMapsUri: `https://maps.google.com/?cid=${n}` });
const ok = (results = [result(1), result(2)]): DiscoveryResponse => ({ results, provider: "google" });
const fnError = (code: string, details?: unknown) => Object.assign(new Error(code), { code, details });

let emitRestaurants: (s: Snapshot<Restaurant[]>) => void = () => {};
const stored: Restaurant = { id: "r1", name: "Place 1", address: "1 Street", googlePlaceId: "p1", createdBy: "ava-uid", createdAt: new Date(), updatedAt: new Date(), version: 1, deleting: false };

function NewRestaurantProbe() {
  const location = useLocation();
  return <pre data-testid="new-restaurant-state">{JSON.stringify(location.state)}</pre>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/discover"]}>
      <Routes>
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/restaurants/new" element={<NewRestaurantProbe />} />
        <Route path="/restaurants/:rid" element={<p data-testid="detail-page">detail</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  m.watchRestaurants.mockImplementation((_h: string, cb: (s: Snapshot<Restaurant[]>) => void) => {
    emitRestaurants = cb;
    cb({ status: "ready", value: [] });
    return () => {};
  });
});
afterEach(() => vi.clearAllMocks());

async function search(query: string) {
  await userEvent.clear(screen.getByTestId("discover-query"));
  await userEvent.type(screen.getByTestId("discover-query"), query);
  await userEvent.click(screen.getByTestId("discover-submit"));
}

describe("DiscoverPage", () => {
  it("starts idle, requests nothing, and refuses a blank query without calling", async () => {
    renderPage();
    expect(m.searchDestination).not.toHaveBeenCalled();
    expect(m.requestPosition).not.toHaveBeenCalled();
    expect(screen.queryByTestId("discover-results")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("discover-submit"));
    expect(screen.getByTestId("discover-state")).toHaveAttribute("data-reason", "invalid");
    expect(m.searchDestination).not.toHaveBeenCalled();
  });

  it("shows results with links, add buttons, the Google Maps attribution and the ranking note", async () => {
    m.searchDestination.mockResolvedValue(ok());
    renderPage();
    await search("Lisbon");
    expect(m.searchDestination).toHaveBeenCalledWith({ query: "Lisbon" });
    await waitFor(() => expect(screen.getAllByTestId("discover-result")).toHaveLength(2));
    const first = screen.getAllByTestId("discover-result")[0]!;
    expect(first).toHaveAttribute("data-place-id", "p1");
    expect(screen.getAllByTestId("result-name")[0]).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(screen.getAllByTestId("result-name")[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByTestId("result-directions")[0]).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=Place%201&destination_place_id=p1");
    expect(screen.getAllByTestId("result-add")).toHaveLength(2);
    const logo = screen.getByTestId("google-attribution").querySelector("img")!;
    expect(logo).toHaveAttribute("src", "/google/GoogleMaps_Logo_Gray.svg");
    expect(logo).toHaveAttribute("alt", "Google Maps");
    expect(screen.getByTestId("ranking-note")).toHaveTextContent("order Google Maps returns them");
    expect(screen.getByTestId("discover-query")).toHaveValue("Lisbon");
  });

  it("shows the empty state and no attribution when nothing is found", async () => {
    m.searchDestination.mockResolvedValue(ok([]));
    renderPage();
    await search("Nowhere");
    await waitFor(() => expect(screen.getByTestId("discover-state")).toHaveAttribute("data-status", "empty"));
    expect(screen.getByTestId("discover-state")).toHaveTextContent("Nowhere");
    expect(screen.queryByTestId("google-attribution")).not.toBeInTheDocument();
  });

  it.each([
    ["functions/failed-precondition", undefined, "off"],
    ["functions/resource-exhausted", { reason: "dailyCap" }, "dailyCap"],
    ["functions/resource-exhausted", { reason: "providerQuota" }, "providerQuota"],
    ["functions/unavailable", undefined, "unavailable"],
  ])("renders the %s (%j) error as %s with its message", async (code, details, reason) => {
    m.searchDestination.mockRejectedValue(fnError(code, details));
    renderPage();
    await search("x");
    await waitFor(() => expect(screen.getByTestId("discover-state")).toHaveAttribute("data-reason", reason));
    expect(screen.getByTestId("discover-state")).toHaveTextContent(REASON_TEXT[reason as keyof typeof REASON_TEXT]);
    expect(screen.queryByTestId("discover-results")).not.toBeInTheDocument();
  });

  it("Near me asks for the position on tap only and searches nearby", async () => {
    m.requestPosition.mockResolvedValue({ kind: "position", lat: 51.5, lng: -0.12 });
    m.searchNearby.mockResolvedValue(ok());
    renderPage();
    await userEvent.click(screen.getByTestId("discover-nearby"));
    await waitFor(() => expect(m.searchNearby).toHaveBeenCalledWith({ lat: 51.5, lng: -0.12 }));
    await waitFor(() => expect(screen.getAllByTestId("discover-result")).toHaveLength(2));
    expect(m.requestPosition).toHaveBeenCalledTimes(1);
  });

  it("Near me denied shows locationDenied and never calls the server", async () => {
    m.requestPosition.mockResolvedValue({ kind: "error", reason: "locationDenied" });
    renderPage();
    await userEvent.click(screen.getByTestId("discover-nearby"));
    await waitFor(() => expect(screen.getByTestId("discover-state")).toHaveAttribute("data-reason", "locationDenied"));
    expect(m.searchNearby).not.toHaveBeenCalled();
  });

  it("marks a result that is already in our records with a link instead of an add button", async () => {
    m.searchDestination.mockResolvedValue(ok());
    renderPage();
    act(() => emitRestaurants({ status: "ready", value: [stored] }));
    await search("Lisbon");
    await waitFor(() => expect(screen.getAllByTestId("discover-result")).toHaveLength(2));
    expect(screen.getByTestId("result-in-records")).toHaveAttribute("href", "/restaurants/r1");
    expect(screen.getAllByTestId("result-add")).toHaveLength(1);
  });

  it("ignores a deleting record when matching", async () => {
    m.searchDestination.mockResolvedValue(ok());
    renderPage();
    act(() => emitRestaurants({ status: "ready", value: [{ ...stored, deleting: true }] }));
    await search("Lisbon");
    await waitFor(() => expect(screen.getAllByTestId("result-add")).toHaveLength(2));
  });

  it("Add to our records navigates to the create form with a prefill in router state", async () => {
    m.searchDestination.mockResolvedValue(ok());
    renderPage();
    await search("Lisbon");
    await waitFor(() => expect(screen.getAllByTestId("result-add")).toHaveLength(2));
    await userEvent.click(screen.getAllByTestId("result-add")[1]!);
    await waitFor(() => expect(screen.getByTestId("new-restaurant-state")).toBeInTheDocument());
    expect(JSON.parse(screen.getByTestId("new-restaurant-state").textContent!)).toEqual({
      prefill: { name: "Place 2", address: "2 Street", googlePlaceId: "p2" },
    });
  });
});
