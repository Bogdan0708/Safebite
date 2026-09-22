import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FIELD_MASK, REQUEST_TIMEOUT_MS, createGoogleProvider, mapPlacesResponse } from "../src/discovery/googleProvider";

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
    ]);
  });

  it("drops localities and places without types", () => {
    // Same fixture: a locality (types: ["locality", "political"]) and a place with no `types` at
    // all are both present alongside the two kept restaurants — proving both are excluded by the
    // types check, independent of the closed/nameless drops above (audit F3).
    const results = mapPlacesResponse(recorded);
    expect(results.map((r) => r.placeId)).toEqual(["ChIJfixture0000000000000001", "ChIJfixture0000000000000004"]);
    expect(results.some((r) => r.name === "Lisboa")).toBe(false);
    expect(results.some((r) => r.name === "Sem Tipos")).toBe(false);
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
    await provider.searchText("Lisbon gluten free", 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "test-key",
      "X-Goog-FieldMask": FIELD_MASK,
    });
    expect(JSON.parse(init.body as string)).toEqual({
      textQuery: "Lisbon gluten free",
      maxResultCount: 10,
      includedType: "restaurant",
      strictTypeFiltering: true,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never asks for coordinates, phone, website or rating, but does ask for types", () => {
    expect(FIELD_MASK).toBe("places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus,places.types");
    for (const forbidden of ["location", "PhoneNumber", "websiteUri", "rating", "OpeningHours", "priceLevel"]) {
      expect(FIELD_MASK).not.toContain(forbidden);
    }
    expect(FIELD_MASK).toContain("places.types");
  });

  it("sends Nearby Search with a restaurant type and a circle restriction", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { places: [] }));
    const provider = createGoogleProvider("test-key", fetchMock as unknown as typeof fetch);
    await expect(provider.searchNearby(51.5, -0.12, 1500, 10)).resolves.toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(JSON.parse(init.body as string)).toEqual({
      includedTypes: ["restaurant"],
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
    await expect(provider.searchText("x", 10)).rejects.toMatchObject({ kind: "badRequest", message: expect.stringContaining("Invalid field mask") });
  });
});
