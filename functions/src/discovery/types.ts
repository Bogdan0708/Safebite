/**
 * Discovery results (spec §3.6). Exactly the four fields the Discover page shows; nothing from
 * Google beyond these ever reaches the client, and nothing here is ever persisted by the client.
 */
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

export type TextSearchMode = "destination" | "venue";

/** Fixed server-side (spec §3.6 decisions): the client sends no radius or result count. */
export const MAX_RESULTS = 10;
export const NEARBY_RADIUS_M = 1500;
export const MAX_QUERY_LENGTH = 120;
