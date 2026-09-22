import { ProviderError, type PlacesProvider } from "./provider";
import type { DiscoveryResult } from "./types";

/**
 * Google Places API (New) adapter (spec §3.6). Exactly five fields are requested; all are Pro
 * tier for Text and Nearby Search, so every call bills at that tier and nothing the client must
 * not store (coordinates) or does not need (phone, website, rating) is ever fetched.
 */
const BASE = "https://places.googleapis.com/v1";
export const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus,places.types";
export const REQUEST_TIMEOUT_MS = 8_000;

interface PlaceJson {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  googleMapsUri?: unknown;
  businessStatus?: unknown;
  types?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/**
 * Keeps operational places with an id, a name, and Google's own `types` including "restaurant"
 * (audit F3: a destination search is a general place lookup, so the mapper — not just the request
 * — must guarantee every result shown to the member is a restaurant; a result with no `types` at
 * all, or a locality like `types: ["locality", "political"]`, is dropped). Exported for the
 * mapping test.
 */
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
    if (!Array.isArray(raw.types) || !raw.types.includes("restaurant")) continue;
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
      // Audit F3: a bare textQuery is an unrestricted place lookup (any locality, address, etc.);
      // restrict it to restaurants at the request level too, on top of the mapper's own guarantee.
      return post("places:searchText", { textQuery: query, maxResultCount: limit, includedType: "restaurant", strictTypeFiltering: true });
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
