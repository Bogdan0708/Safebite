import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FIELD_MASK, REQUEST_TIMEOUT_MS, VENUE_TYPES, createGoogleProvider, mapPlacesResponse } from "../src/discovery/googleProvider";
import { parseDestinationInput } from "../src/discovery/validate";

const recorded = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures/places-searchText.json"), "utf8")) as unknown;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("mapPlacesResponse", () => {
  it("keeps operational places with an id and a name; skips closed and nameless ones; defaults the address and link", () => {
    const results = mapPlacesResponse(recorded);
    expect(results).toEqual([
      {
        placeId: "ChIJfixture0000000000000001",
        name: "Casa Sem Glúten",
        address: "12 Rua Exemplo, 1100-000 Lisboa, Portugal",
        googleMapsUri: "https://maps.google.com/?cid=1111111111111111111",
      },
      {
        placeId: "ChIJfixture0000000000000004",
        name: "Sem Morada",
        address: "",
        googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJfixture0000000000000004",
      },
      {
        placeId: "ChIJfixture0000000000000007",
        name: "Padaria Sem Glúten",
        address: "9 Rua Doce, Lisboa, Portugal",
        googleMapsUri: "https://maps.google.com/?cid=7777777777777777777",
      },
    ]);
  });

  it("drops localities and places without types", () => {
    // Same fixture: a locality (types: ["locality", "political"]) and a place with no `types` at
    // all are both present alongside the kept restaurants and the bakery — proving both are
    // excluded by the types check, independent of the closed/nameless drops above (audit F3).
    const results = mapPlacesResponse(recorded);
    expect(results.map((r) => r.placeId)).toEqual([
      "ChIJfixture0000000000000001",
      "ChIJfixture0000000000000004",
      "ChIJfixture0000000000000007",
    ]);
    expect(results.some((r) => r.name === "Lisboa")).toBe(false);
    expect(results.some((r) => r.name === "Sem Tipos")).toBe(false);
  });

  it("keeps the bakery fixture and drops localities", () => {
    // Controller ruling (Fix F): VENUE_TYPES includes restaurant, cafe, bakery, bar and
    // meal_takeaway, so a dedicated gluten-free bakery like entry #7 must survive the mapper while
    // a locality (types: ["locality", "political"]) is still dropped.
    const results = mapPlacesResponse(recorded);
    expect(VENUE_TYPES).toEqual(["restaurant", "cafe", "bakery", "bar", "meal_takeaway"]);
    expect(results.some((r) => r.placeId === "ChIJfixture0000000000000007" && r.name === "Padaria Sem Glúten")).toBe(true);
    expect(results.some((r) => r.name === "Lisboa")).toBe(false);
  });

  it.each(VENUE_TYPES)("keeps an operational %s without requiring a restaurant type", (venueType) => {
    expect(mapPlacesResponse({ places: [{
      id: `fixture-${venueType}`,
      displayName: { text: `Example ${venueType}` },
      businessStatus: "OPERATIONAL",
      types: [venueType, "food", "establishment"],
    }] })).toEqual([{
      placeId: `fixture-${venueType}`,
      name: `Example ${venueType}`,
      address: "",
      googleMapsUri: `https://www.google.com/maps/place/?q=place_id:fixture-${venueType}`,
    }]);
  });

  it("treats a response without places as empty", () => {
    expect(mapPlacesResponse({})).toEqual([]);
    expect(mapPlacesResponse(null)).toEqual([]);
  });
});

describe("createGoogleProvider — requests", () => {
  it("sends Text Search with the key, the exact field mask, the query and the result count", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, recorded));
    const provider = createGoogleProvider("test-key", fetchMock as unknown as typeof fetch);
    await provider.searchText("Lisbon", 10, "destination");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "test-key",
      "X-Goog-FieldMask": FIELD_MASK,
    });
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody).toEqual({
      textQuery: "food in Lisbon",
      maxResultCount: 10,
    });
    expect(parsedBody).not.toHaveProperty("strictTypeFiltering");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves a legacy named-venue query from request validation to the Google request", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, recorded));
    const provider = createGoogleProvider("test-key", fetchMock as unknown as typeof fetch);
    const { query, mode } = parseDestinationInput({ query: "  Riverside Café, Lisbon  " });
    await provider.searchText(query, 10, mode);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ textQuery: "Riverside Café, Lisbon", maxResultCount: 10 });
  });

  it("preserves the query when a provider caller omits mode", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, recorded));
    const provider = createGoogleProvider("test-key", fetchMock as unknown as typeof fetch);
    await provider.searchText("Riverside Café, Lisbon", 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ textQuery: "Riverside Café, Lisbon", maxResultCount: 10 });
  });

  it.each([
    ["destination", "Lisbon", "food in Lisbon"],
    ["destination", "New York, NY", "food in New York, NY"],
    ["venue", "Casa Sem Glúten Lisbon", "Casa Sem Glúten Lisbon"],
    ["venue", "cafes in Lisbon", "cafes in Lisbon"],
  ] as const)("sends one %s query for %s without restaurant-only filtering", async (mode, query, textQuery) => {
    const fetchMock = vi.fn(async () => jsonResponse(200, recorded));
    const provider = createGoogleProvider("test-key", fetchMock as unknown as typeof fetch);
    await provider.searchText(query, 10, mode);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ textQuery, maxResultCount: 10 });
  });

  it("never asks for coordinates, phone, website or rating, but does ask for types", () => {
    expect(FIELD_MASK).toBe("places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus,places.types");
    for (const forbidden of ["location", "PhoneNumber", "websiteUri", "rating", "OpeningHours", "priceLevel"]) {
      expect(FIELD_MASK).not.toContain(forbidden);
    }
    expect(FIELD_MASK).toContain("places.types");
  });

  it("sends Nearby Search with the venue types and a circle restriction", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { places: [] }));
    const provider = createGoogleProvider("test-key", fetchMock as unknown as typeof fetch);
    await expect(provider.searchNearby(51.5, -0.12, 1500, 10)).resolves.toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(JSON.parse(init.body as string)).toEqual({
      includedTypes: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway"],
      maxResultCount: 10,
      locationRestriction: { circle: { center: { latitude: 51.5, longitude: -0.12 }, radius: 1500 } },
    });
  });

  it("uses an 8 second timeout signal", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(8_000);
  });
});

describe("createGoogleProvider — failures", () => {
  it.each([
    [429, "quota"],
    [500, "unavailable"],
    [503, "unavailable"],
    [400, "badRequest"],
    [403, "badRequest"],
  ])("maps HTTP %s to %s", async (status, kind) => {
    const fetchMock = vi.fn(async () => jsonResponse(status, { error: { message: `status ${status}`, status: "X" } }));
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ name: "ProviderError", kind, status });
  });

  it("maps a network failure to unavailable", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("maps a timeout to unavailable", async () => {
    const fetchMock = vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); });
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("carries Google's error message on a bad request so the callable can log it", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { error: { message: "Invalid field mask", status: "INVALID_ARGUMENT" } }));
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({
      kind: "badRequest",
      message: expect.stringContaining("Invalid field mask"),
      googleStatus: "INVALID_ARGUMENT",
    });
  });

  it("drops a Google error status that is not in the fixed allow-list", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { error: { message: "weird", status: "SOMETHING_ELSE" } }));
    const provider = createGoogleProvider("k", fetchMock as unknown as typeof fetch);
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ kind: "badRequest", googleStatus: undefined });
  });
});
