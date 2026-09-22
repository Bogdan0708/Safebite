export const POSITION_TIMEOUT_MS = 10_000;

export type PositionOutcome =
  | { kind: "position"; lat: number; lng: number }
  | { kind: "error"; reason: "locationDenied" | "locationUnavailable" };

/**
 * One position request, on tap only (spec §3.6 ruling 3). Low accuracy is plenty for a 1.5 km
 * search radius and answers faster on a phone. Never called on mount.
 */
export function requestPosition(geo: Geolocation | undefined = typeof navigator === "undefined" ? undefined : navigator.geolocation): Promise<PositionOutcome> {
  if (!geo) return Promise.resolve({ kind: "error", reason: "locationUnavailable" });
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) => resolve({ kind: "position", lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => resolve({ kind: "error", reason: error.code === 1 ? "locationDenied" : "locationUnavailable" }),
      { enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}
