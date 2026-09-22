import { createFixtureProvider } from "./fixtureProvider";
import { createGoogleProvider } from "./googleProvider";
import type { PlacesProvider, ProviderSelection } from "./provider";

export const FIXTURE_SECRET_VALUE = "fixture";

const defaultMake = { google: (key: string) => createGoogleProvider(key), fixture: () => createFixtureProvider() };

/**
 * The four branches of spec §3.6:
 *   "fixture" + emulator      → fixture provider
 *   "fixture" elsewhere       → notConfigured (the fixture can never serve a deployment)
 *   empty / missing           → notConfigured
 *   anything else             → Google adapter with that key
 * Matching is exact: no trimming, no case folding — a value that is not exactly "fixture" is a key.
 */
export function selectProvider(
  secretValue: string | undefined,
  isEmulator: boolean,
  make: { google: (key: string) => PlacesProvider; fixture: () => PlacesProvider } = defaultMake,
): ProviderSelection {
  if (secretValue === undefined || secretValue.trim() === "") return { kind: "notConfigured" };
  if (secretValue === FIXTURE_SECRET_VALUE) {
    return isEmulator ? { kind: "provider", provider: make.fixture() } : { kind: "notConfigured" };
  }
  return { kind: "provider", provider: make.google(secretValue) };
}
