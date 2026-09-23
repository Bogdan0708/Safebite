import { MemoryRouter, Route, Routes } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "./types";
import type { Snapshot } from "./repository";

const m = vi.hoisted(() => ({
  createRestaurant: vi.fn(),
  updateRestaurant: vi.fn(),
  deleteRestaurant: vi.fn(),
  watchRestaurant: vi.fn(),
  watchRestaurants: vi.fn(),
}));
vi.mock("./repository", () => m);
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));

import { RestaurantFormPage, readPrefill } from "./RestaurantFormPage";

let emit: (s: Snapshot<Restaurant>) => void = () => {};
let emitList: (s: Snapshot<Restaurant[]>) => void = () => {};
const stored: Restaurant = {
  id: "r1",
  name: "Da Marco",
  address: "Via Roma 1",
  phone: "+39 06",
  lat: 41.9,
  lng: 12.5,
  createdBy: "ava-uid",
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 3,
  deleting: false,
};

beforeEach(() => {
  m.watchRestaurant.mockImplementation((_h: string, _r: string, cb: (s: Snapshot<Restaurant>) => void) => {
    emit = cb;
    return () => {};
  });
  m.watchRestaurants.mockImplementation((_h: string, cb: (s: Snapshot<Restaurant[]>) => void) => {
    emitList = cb;
    cb({ status: "ready", value: [] });
    return () => {};
  });
});
afterEach(() => vi.clearAllMocks());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/restaurants" element={<p data-testid="list-page">list</p>} />
        <Route path="/restaurants/new" element={<RestaurantFormPage mode="create" />} />
        <Route path="/restaurants/:rid" element={<p data-testid="detail-page">detail</p>} />
        <Route path="/restaurants/:rid/edit" element={<RestaurantFormPage mode="edit" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RestaurantFormPage — create", () => {
  it("validates before writing and shows field errors", async () => {
    renderAt("/restaurants/new");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    expect(screen.getByTestId("error-name")).toHaveTextContent("Enter the restaurant's name.");
    expect(screen.getByTestId("error-address")).toHaveTextContent("Enter the address.");
    expect(m.createRestaurant).not.toHaveBeenCalled();
  });

  it("normalises the input, creates, and navigates to the new detail page", async () => {
    m.createRestaurant.mockResolvedValue({ kind: "ok", value: "new-id" });
    renderAt("/restaurants/new");
    await userEvent.type(screen.getByTestId("field-name"), "  Da Marco ");
    await userEvent.type(screen.getByTestId("field-address"), "Via Roma 1");
    await userEvent.type(screen.getByTestId("field-website"), " https://damarco.it ");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("detail-page")).toBeInTheDocument());
    expect(m.createRestaurant).toHaveBeenCalledWith("home", "ava-uid", { name: "Da Marco", address: "Via Roma 1", website: "https://damarco.it" });
  });

  it("shows the offline outcome and keeps the draft", async () => {
    m.createRestaurant.mockResolvedValue({ kind: "offline" });
    renderAt("/restaurants/new");
    await userEvent.type(screen.getByTestId("field-name"), "Da Marco");
    await userEvent.type(screen.getByTestId("field-address"), "Via Roma 1");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("save-outcome")).toHaveAttribute("data-kind", "offline"));
    expect(screen.getByTestId("field-name")).toHaveValue("Da Marco");
  });
});

describe("RestaurantFormPage — edit", () => {
  it("seeds the draft once from the first snapshot and keeps dirty fields when a newer snapshot arrives", async () => {
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    expect(screen.getByTestId("field-name")).toHaveValue("Da Marco");
    await userEvent.clear(screen.getByTestId("field-name"));
    await userEvent.type(screen.getByTestId("field-name"), "My rename");
    act(() => emit({ status: "ready", value: { ...stored, name: "Bogdan's rename", version: 4 } }));
    expect(screen.getByTestId("field-name")).toHaveValue("My rename");
    expect(screen.getByTestId("changed-elsewhere")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("reload-draft"));
    expect(screen.getByTestId("field-name")).toHaveValue("Bogdan's rename");
    expect(screen.queryByTestId("changed-elsewhere")).toBeNull();
  });

  it("re-seeds silently when the draft is clean and a newer snapshot arrives", () => {
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    act(() => emit({ status: "ready", value: { ...stored, name: "Renamed remotely", version: 4 } }));
    expect(screen.getByTestId("field-name")).toHaveValue("Renamed remotely");
    expect(screen.queryByTestId("changed-elsewhere")).toBeNull();
  });

  it("saves with the base version it was seeded from, and reports a conflict with Reload draft", async () => {
    m.updateRestaurant.mockResolvedValue({ kind: "conflict" });
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    await userEvent.clear(screen.getByTestId("field-phone"));
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("save-outcome")).toHaveAttribute("data-kind", "conflict"));
    expect(m.updateRestaurant).toHaveBeenCalledWith("home", "r1", 3, { name: "Da Marco", address: "Via Roma 1" });
    expect(screen.getByTestId("reload-draft")).toBeInTheDocument();
  });

  it("shows a single Reload draft when a conflict coincides with changed-elsewhere, and reloads to the newer values", async () => {
    m.updateRestaurant.mockResolvedValue({ kind: "conflict" });
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    await userEvent.clear(screen.getByTestId("field-name"));
    await userEvent.type(screen.getByTestId("field-name"), "My rename");
    act(() => emit({ status: "ready", value: { ...stored, name: "Bogdan's rename", version: 4 } }));
    expect(screen.getByTestId("changed-elsewhere")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("save-outcome")).toHaveAttribute("data-kind", "conflict"));
    expect(screen.getAllByTestId("reload-draft")).toHaveLength(1);
    await userEvent.click(screen.getByTestId("reload-draft"));
    expect(screen.getByTestId("field-name")).toHaveValue("Bogdan's rename");
    expect(screen.queryByTestId("changed-elsewhere")).toBeNull();
    expect(screen.queryByTestId("save-outcome")).toBeNull();
  });

  it("shows gone when the restaurant disappears, with a link back to the list", () => {
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "gone" }));
    expect(screen.getByTestId("read-gone")).toHaveTextContent("This restaurant was deleted.");
    expect(screen.queryByTestId("restaurant-form")).toBeNull();
  });

  it("deletes only after the in-page confirm, shows progress, then navigates to the list", async () => {
    m.deleteRestaurant.mockImplementation(async (_h: string, _r: string, _v: number, onProgress: (s: string) => void) => {
      onProgress("marking");
      onProgress("sweeping");
      onProgress("removing");
      return { kind: "ok", value: undefined };
    });
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    await userEvent.click(screen.getByTestId("delete-restaurant"));
    expect(m.deleteRestaurant).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(screen.getByTestId("list-page")).toBeInTheDocument());
    expect(m.deleteRestaurant).toHaveBeenCalledWith("home", "r1", 3, expect.any(Function));
  });

  it("disables an open delete confirmation when the restaurant becomes cache-backed", async () => {
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    await userEvent.click(screen.getByTestId("delete-restaurant"));
    expect(screen.getByTestId("delete-confirm")).toBeEnabled();
    act(() => emit({ status: "offline", value: stored }));
    expect(screen.getByTestId("delete-confirm")).toBeDisabled();
    await userEvent.click(screen.getByTestId("delete-confirm"));
    expect(m.deleteRestaurant).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("delete-cancel"));
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("delete-restaurant")).toBeDisabled();
  });
});

function renderCreateWithState(state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/restaurants/new", state }]}>
      <Routes>
        <Route path="/restaurants/new" element={<RestaurantFormPage mode="create" />} />
        <Route path="/restaurants/:rid" element={<p data-testid="detail-page">detail</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RestaurantFormPage — create from a Discover result", () => {
  const prefill = { googlePlaceId: "fixture-01" };

  it("starts with an empty draft, shows the Linked notice, and writes the typed name/address plus the place id", async () => {
    m.createRestaurant.mockResolvedValue({ kind: "ok", value: "new-id" });
    renderCreateWithState({ prefill });
    expect(screen.getByTestId("field-name")).toHaveValue("");
    expect(screen.getByTestId("field-address")).toHaveValue("");
    expect(screen.getByTestId("prefill-notice")).toHaveTextContent("Linked to a Google Maps place");
    expect(screen.getByTestId("prefill-notice").querySelector("a")).toHaveAttribute(
      "href",
      "https://www.google.com/maps/place/?q=place_id:fixture-01",
    );
    await userEvent.type(screen.getByTestId("field-name"), "Trattoria as we know it");
    await userEvent.type(screen.getByTestId("field-address"), "Rua Nossa 1");
    await userEvent.type(screen.getByTestId("field-phone"), "+351 21 000");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("detail-page")).toBeInTheDocument());
    expect(m.createRestaurant).toHaveBeenCalledWith("home", "ava-uid", {
      name: "Trattoria as we know it",
      address: "Rua Nossa 1",
      phone: "+351 21 000",
      googlePlaceId: "fixture-01",
    });
  });

  it("redirects to the existing record instead of creating a duplicate", async () => {
    renderCreateWithState({ prefill });
    act(() => emitList({ status: "ready", value: [{ ...stored, id: "r-existing", googlePlaceId: "fixture-01" }] }));
    expect(screen.getByTestId("prefill-duplicate").querySelector("a")).toHaveAttribute("href", "/restaurants/r-existing");
    await userEvent.type(screen.getByTestId("field-name"), "Trattoria as we know it");
    await userEvent.type(screen.getByTestId("field-address"), "Rua Nossa 1");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(screen.getByTestId("detail-page")).toBeInTheDocument());
    expect(m.createRestaurant).not.toHaveBeenCalled();
  });

  it("does not treat a record being deleted as a duplicate", async () => {
    m.createRestaurant.mockResolvedValue({ kind: "ok", value: "new-id" });
    renderCreateWithState({ prefill });
    act(() => emitList({ status: "ready", value: [{ ...stored, id: "r-old", googlePlaceId: "fixture-01", deleting: true }] }));
    expect(screen.queryByTestId("prefill-duplicate")).not.toBeInTheDocument();
    await userEvent.type(screen.getByTestId("field-name"), "Trattoria as we know it");
    await userEvent.type(screen.getByTestId("field-address"), "Rua Nossa 1");
    await userEvent.click(screen.getByTestId("save-restaurant"));
    await waitFor(() => expect(m.createRestaurant).toHaveBeenCalled());
  });

  it("ignores a malformed prefill", () => {
    renderCreateWithState({ prefill: { name: 1, address: "x", googlePlaceId: "" } });
    expect(screen.getByTestId("field-name")).toHaveValue("");
    expect(screen.queryByTestId("prefill-notice")).not.toBeInTheDocument();
    expect(m.watchRestaurants).not.toHaveBeenCalled();
  });

  it("does not subscribe to the records list for a plain create", () => {
    renderAt("/restaurants/new");
    expect(m.watchRestaurants).not.toHaveBeenCalled();
  });
});

describe("readPrefill", () => {
  it("accepts a well-formed prefill and trims it", () => {
    expect(readPrefill({ prefill: { googlePlaceId: " p " } })).toEqual({ googlePlaceId: "p" });
  });
  it("ignores a legacy prefill's extra name/address keys (a stale history entry from before this change)", () => {
    expect(readPrefill({ prefill: { name: "A", address: "B", googlePlaceId: "p" } })).toEqual({ googlePlaceId: "p" });
  });
  it.each([
    null,
    undefined,
    {},
    { prefill: null },
    { prefill: {} },
    { prefill: { googlePlaceId: "" } },
    { prefill: { googlePlaceId: "x".repeat(201) } },
    { prefill: { googlePlaceId: 1 } },
  ])("returns null for %j", (state) => expect(readPrefill(state)).toBeNull());
});
