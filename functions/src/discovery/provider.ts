import type { DiscoveryResult, TextSearchMode } from "./types";

/** What the callables need from a places backend (spec §3.6). */
export interface PlacesProvider {
  searchText(query: string, limit: number, mode?: TextSearchMode): Promise<DiscoveryResult[]>;
  searchNearby(lat: number, lng: number, radiusM: number, limit: number): Promise<DiscoveryResult[]>;
}

/**
 * quota       → the provider refused for quota reasons (HTTP 429 / RESOURCE_EXHAUSTED)
 * unavailable → timeout, network failure, HTTP 5xx
 * badRequest  → HTTP 4xx other than 429: our own request shape is wrong (logged as internal)
 */
export type ProviderFailureKind = "quota" | "unavailable" | "badRequest";

export class ProviderError extends Error {
  readonly kind: ProviderFailureKind;
  readonly status?: number;
  readonly googleStatus?: string;
  constructor(kind: ProviderFailureKind, message: string, status?: number, googleStatus?: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
    this.googleStatus = googleStatus;
  }
}

export type ProviderSelection = { kind: "provider"; provider: PlacesProvider } | { kind: "notConfigured" };
