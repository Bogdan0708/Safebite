import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { requireMember } from "../membership";
import { runSearch, type SearchDeps } from "./search";
import { selectProvider } from "./select";
import type { DiscoveryResponse } from "./types";
import { parseDestinationInput, parseNearbyInput } from "./validate";

/**
 * The Places server key (spec §2.4: never in web/). Locally the emulator reads the gitignored
 * functions/.secret.local; the committed .secret.local.example sets it to "fixture", which
 * select.ts honours only inside the emulator. Staging binds a real Secret Manager value (owner
 * action O4); agents never set one.
 */
// Probed 2026-09-22 (planning/audits/plan-3-secret-absent-probe.mjs): with no .secret.local the emulator logs a Secret Manager error, value() is "", and searches answer 400 "Search is not configured."
export const PLACES_API_KEY = defineSecret("PLACES_API_KEY");

function deps(): SearchDeps {
  return {
    db: getFirestore(),
    selection: selectProvider(PLACES_API_KEY.value(), process.env.FUNCTIONS_EMULATOR === "true"),
    now: () => new Date(),
  };
}

export const searchDestination = onCall<unknown, Promise<DiscoveryResponse>>({ secrets: [PLACES_API_KEY] }, async (request) => {
  const member = await requireMember(request);
  const { query } = parseDestinationInput(request.data);
  return runSearch(deps(), member, { kind: "destination", query });
});

export const searchNearby = onCall<unknown, Promise<DiscoveryResponse>>({ secrets: [PLACES_API_KEY] }, async (request) => {
  const member = await requireMember(request);
  const { lat, lng } = parseNearbyInput(request.data);
  return runSearch(deps(), member, { kind: "nearby", lat, lng });
});
