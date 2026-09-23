import { ProviderError, type PlacesProvider } from "./provider";
import type { DiscoveryResult } from "./types";

/**
 * Google Places API (New) adapter (spec §3.6). The field mask reaches Pro
 * tier for Text and Nearby Search, so every call bills at that tier and nothing the client must
 * not store (coordinates) or does not need (phone, website, rating) is ever fetched.
 */
const BASE = "https://places.googleapis.com/v1";
export const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus,places.types";
export const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Google place types accepted as venues (controller ruling 2026-09-22, Fix F): `restaurant` alone
 * would exclude dedicated gluten-free bakeries and cafés, which are high value for coeliacs.
 */
export const VENUE_TYPES = ["restaurant", "cafe", "bakery", "bar", "meal_takeaway"] as const;

/** Google's Places API (New) error status enum (a fixed allow-list; never free text — spec §3.6). */
const GOOGLE_ERROR_STATUSES = [
  "INVALID_ARGUMENT",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "FAILED_PRECONDITION",
  "UNAVAILABLE",
  "INTERNAL",
  "UNKNOWN",
  "DEADLINE_EXCEEDED",
  "ABORTED",
] as const;

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
 * Keeps operational places with an id, a name, and Google's own `types` including at least one
 * venue type (audit F3, controller ruling Fix F: a destination search is a general place lookup,
 * so the mapper — not just the request — must guarantee every result shown to the member is a
 * restaurant, café, bakery, bar or takeaway; a result with no `types` at all, or a locality like
 * `types: ["locality", "political"]`, is dropped). Exported for the mapping test.
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
    if (!Array.isArray(raw.types) || !raw.types.some((t) => (VENUE_TYPES as readonly string[]).includes(t))) continue;
    results.push({
      placeId,
      name,
      address: str(raw.formattedAddress) ?? "",
      googleMapsUri: str(raw.googleMapsUri) ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    });
  }
  return results;
}

async function errorDetails(res: Response): Promise<{ message: string; googleStatus?: string }> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown; status?: unknown } };
    const message = body?.error?.message;
    const rawStatus = body?.error?.status;
    const googleStatus =
      typeof rawStatus === "string" && (GOOGLE_ERROR_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : undefined;
    return { message: typeof message === "string" ? message : `HTTP ${res.status}`, googleStatus };
  } catch {
    return { message: `HTTP ${res.status}` };
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
    if (res.status === 429) {
      const { message, googleStatus } = await errorDetails(res);
      throw new ProviderError("quota", message, res.status, googleStatus);
    }
    if (res.status >= 500) {
      const { message, googleStatus } = await errorDetails(res);
      throw new ProviderError("unavailable", message, res.status, googleStatus);
    }
    if (res.status >= 400) {
      const { message, googleStatus } = await errorDetails(res);
      throw new ProviderError("badRequest", message, res.status, googleStatus);
    }
    return mapPlacesResponse(await res.json());
  }

  return {
    searchText(query, limit, mode = "venue") {
      // Google does not apply includedType to geopolitical queries. Explicit category + location
      // avoids a bare town lookup; venue mode preserves the member's named-place query. Do not
      // constrain to restaurant: categorical type filtering would hide café-only/bakery-only
      // matches. The mapper enforces our five accepted venue types for either mode.
      // https://developers.google.com/maps/documentation/places/web-service/text-search#includedtype
      const textQuery = mode === "destination" ? `food in ${query}` : query;
      return post("places:searchText", { textQuery, maxResultCount: limit });
    },
    searchNearby(lat, lng, radiusM, limit) {
      return post("places:searchNearby", {
        includedTypes: [...VENUE_TYPES],
        maxResultCount: limit,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
      });
    },
  };
}
