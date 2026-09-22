import { ProviderError, type PlacesProvider } from "./provider";
import type { DiscoveryResult } from "./types";

/**
 * Google Places API (New) adapter (spec §3.6). Exactly five fields are requested; all are Pro
 * tier for Text and Nearby Search, so every call bills at that tier and nothing the client must
 * not store (coordinates) or does not need (phone, website, rating) is ever fetched.
 */
const BASE = "https://places.googleapis.com/v1";
export const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus";
export const REQUEST_TIMEOUT_MS = 8_000;

interface PlaceJson {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  googleMapsUri?: unknown;
  businessStatus?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Keeps operational places with an id and a name. Exported for the mapping test. */
export function mapPlacesResponse(body: unknown): DiscoveryResult[] {
  const places = (body as { places?: unknown } | null)?.places;
  if (!Array.isArray(places)) return [];
  const results: DiscoveryResult[] = [];
  for (const raw of places as PlaceJson[]) {
    const placeId = str(raw?.id);
    const name = str(raw?.displayName?.text);
    if (!placeId || !name) continue;
    const status = str(raw.businessStatus);
    if (status !== undefined && status !== "OPERATIONAL") continue;
    results.push({
      placeId,
      name,
      address: str(raw.formattedAddress) ?? "",
      googleMapsUri: str(raw.googleMapsUri) ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    });
  }
  return results;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    const message = body?.error?.message;
    return typeof message === "string" ? message : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function createGoogleProvider(apiKey: string, fetchImpl: typeof fetch = fetch): PlacesProvider {
  async function post(pathname: string, body: unknown): Promise<DiscoveryResult[]> {
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}/${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Timeouts (TimeoutError), aborted or failed connections: all "try again later".
      throw new ProviderError("unavailable", err instanceof Error ? err.message : "fetch failed");
    }
    if (res.status === 429) throw new ProviderError("quota", await errorMessage(res), res.status);
    if (res.status >= 500) throw new ProviderError("unavailable", await errorMessage(res), res.status);
    if (res.status >= 400) throw new ProviderError("badRequest", await errorMessage(res), res.status);
    return mapPlacesResponse(await res.json());
  }

  return {
    searchText(query, limit) {
      return post("places:searchText", { textQuery: query, maxResultCount: limit });
    },
    searchNearby(lat, lng, radiusM, limit) {
      return post("places:searchNearby", {
        includedTypes: ["restaurant"],
        maxResultCount: limit,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
      });
    },
  };
}
