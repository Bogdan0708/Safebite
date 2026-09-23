import { ProviderError, type PlacesProvider } from "./provider";
import type { DiscoveryResult } from "./types";

/**
 * Serves the emulator, CI and browser tests in place of Google (spec §3.6 ruling 4). Selected
 * only by select.ts when the secret value is "fixture" AND the process is the emulator. Every
 * venue below is invented and the links point at the reserved `example.invalid` domain, so a
 * fixture result can never be mistaken for a real place (spec §2.1: never sample venues).
 */
export const MAGIC = {
  empty: "__empty__",
  unavailable: "__unavailable__",
  quota: "__quota__",
  slow: "__slow__",
  delayed: "__delayed__",
} as const;

/** Longer than the client's 20 s timeout (web/src/discover/search.ts), so __slow__ times out there. */
export const SLOW_DELAY_MS = 25_000;
/** Long enough for a second search to overtake it, short enough for a browser test. */
export const DELAYED_MS = 3_000;

const fake = (n: number, name: string, street: string): DiscoveryResult => ({
  placeId: `fixture-${String(n).padStart(2, "0")}`,
  name,
  address: `${n} ${street}, Testville`,
  googleMapsUri: `https://example.invalid/maps/fixture-${String(n).padStart(2, "0")}`,
});

export const FIXTURE_RESULTS: readonly DiscoveryResult[] = [
  fake(1, "Fixture Trattoria", "Fixture Street"),
  fake(2, "Testville Bakehouse", "Sample Road"),
  fake(3, "Sample Sushi", "Mock Lane"),
  fake(4, "Placeholder Pizza", "Dummy Drive"),
  fake(5, "Mock Mezze", "Stub Square"),
  fake(6, "Dummy Dumplings", "Example Avenue"),
  fake(7, "Stub Steakhouse", "Fixture Street"),
  fake(8, "Example Eatery", "Sample Road"),
  fake(9, "Fixture Falafel", "Mock Lane"),
  fake(10, "Demo Dosa House", "Dummy Drive"),
  fake(11, "Sample Sandwich Bar", "Stub Square"),
  fake(12, "Trial Tapas", "Example Avenue"),
];

export const DELAYED_RESULT: DiscoveryResult = {
  placeId: "fixture-delayed",
  name: "Delayed Diner",
  address: "99 Latecomer Lane, Testville",
  googleMapsUri: "https://example.invalid/maps/fixture-delayed",
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFixtureProvider(sleep: (ms: number) => Promise<void> = defaultSleep): PlacesProvider {
  return {
    async searchText(query, limit) {
      switch (query.trim().toLowerCase()) {
        case MAGIC.empty:
          return [];
        case MAGIC.unavailable:
          throw new ProviderError("unavailable", "fixture: provider unavailable", 503);
        case MAGIC.quota:
          throw new ProviderError("quota", "fixture: quota exceeded", 429);
        case MAGIC.delayed:
          await sleep(DELAYED_MS);
          return [DELAYED_RESULT];
        case MAGIC.slow:
          await sleep(SLOW_DELAY_MS);
          return FIXTURE_RESULTS.slice(0, limit);
        default:
          return FIXTURE_RESULTS.slice(0, limit);
      }
    },
    async searchNearby(_lat, _lng, _radiusM, limit) {
      return FIXTURE_RESULTS.slice(0, limit);
    },
  };
}
