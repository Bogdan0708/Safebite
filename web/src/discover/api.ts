import { callable, isTimeoutError } from "../api/callable";

/** Mirrors functions/src/discovery/types.ts. Never persisted or cached on the client (spec §3.6). */
export interface DiscoveryResult {
  placeId: string;
  name: string;
  address: string;
  googleMapsUri: string;
}

export interface DiscoveryResponse {
  results: DiscoveryResult[];
  provider: "google";
}

export const searchDestination = callable<{ query: string }, DiscoveryResponse>("searchDestination");
export const searchNearby = callable<{ lat: number; lng: number }, DiscoveryResponse>("searchNearby");

export type SearchErrorReason =
  | "off"
  | "dailyCap"
  | "providerQuota"
  | "unavailable"
  | "offline"
  | "timeout"
  | "locationDenied"
  | "locationUnavailable"
  | "invalid";

/** Callable codes → reasons (spec §3.6 error mapping). Both failed-precondition messages read as "off". */
export function classifySearchError(err: unknown, online: boolean = navigator.onLine): SearchErrorReason {
  if (isTimeoutError(err)) return "timeout";
  const code = (err as { code?: unknown } | null)?.code;
  const details = (err as { details?: { reason?: unknown } } | null)?.details;
  switch (code) {
    case "functions/failed-precondition":
      return "off";
    case "functions/resource-exhausted":
      return details?.reason === "dailyCap" ? "dailyCap" : "providerQuota";
    case "functions/invalid-argument":
      return "invalid";
    case "functions/unavailable":
      return "unavailable";
    default:
      return typeof code === "string" || online ? "unavailable" : "offline";
  }
}
