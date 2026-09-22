import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type { Member } from "../membership";
import { ProviderError, type ProviderSelection } from "./provider";
import { MAX_RESULTS, NEARBY_RADIUS_M, type DiscoveryResponse } from "./types";
import { usageDayKey } from "./usageDay";

export interface SearchDeps {
  db: Firestore;
  selection: ProviderSelection;
  now: () => Date;
}

export type SearchRequest = { kind: "destination"; query: string } | { kind: "nearby"; lat: number; lng: number };

/** Admin-only kill switch and cap: { enabled: boolean, dailySearchCap: number }. Missing = off. */
export const CONFIG_PATH = "config/discovery";

export function usagePath(householdId: string, now: Date): string {
  return `households/${householdId}/usage/${usageDayKey(now)}`;
}

/** Logs never carry the query text; coordinates are rounded to 2 dp (spec §2.6, §3.6). */
const round2 = (n: number) => Math.round(n * 100) / 100;

function readConfig(data: DocumentData | undefined): { enabled: boolean; cap: number } {
  const enabled = data?.enabled === true;
  const rawCap = data?.dailySearchCap;
  const cap = typeof rawCap === "number" && Number.isFinite(rawCap) && rawCap >= 0 ? Math.floor(rawCap) : 0;
  return { enabled, cap };
}

/**
 * Order matters and is what the tests pin down:
 *   1. a missing provider refuses before any read (nothing to bill, nothing to count);
 *   2. the kill switch is read on every call and fails closed;
 *   3. the usage transaction increments BEFORE the provider is called, so a failed upstream
 *      call still counts (a flapping provider cannot burn unlimited calls);
 *   4. provider failures map to the codes the client turns into states.
 */
export async function runSearch(deps: SearchDeps, member: Member, request: SearchRequest): Promise<DiscoveryResponse> {
  if (deps.selection.kind === "notConfigured") {
    throw new HttpsError("failed-precondition", "Search is not configured.");
  }
  const provider = deps.selection.provider;
  const now = deps.now();

  const config = readConfig((await deps.db.doc(CONFIG_PATH).get()).data());
  if (!config.enabled) throw new HttpsError("failed-precondition", "Search is switched off.");

  const usageRef = deps.db.doc(usagePath(member.householdId, now));
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const current = snap.get("searches");
    const searches = typeof current === "number" ? current : 0;
    if (searches >= config.cap) {
      throw new HttpsError("resource-exhausted", "Daily search limit reached.", { reason: "dailyCap" });
    }
    tx.set(usageRef, { searches: FieldValue.increment(1) }, { merge: true });
  });

  const started = Date.now();
  const logBase = {
    kind: request.kind,
    uid: member.uid,
    householdId: member.householdId,
    ...(request.kind === "nearby" ? { lat: round2(request.lat), lng: round2(request.lng) } : {}),
  };
  try {
    const results =
      request.kind === "destination"
        ? await provider.searchText(request.query, MAX_RESULTS)
        : await provider.searchNearby(request.lat, request.lng, NEARBY_RADIUS_M, MAX_RESULTS);
    logger.info("discovery.search", { ...logBase, resultCount: results.length, durationMs: Date.now() - started, outcome: "ok" });
    return { results, provider: "google" };
  } catch (err) {
    const durationMs = Date.now() - started;
    if (err instanceof ProviderError) {
      // Audit observation: the installed firebase-functions logger's entryFromArgs spreads the
      // structured payload first, then overwrites `message` with the positional string
      // ("discovery.search") — so a `message` field here never reaches the actual log and was only
      // ever exercised by the mock. Log fixed diagnostics only; provider text is never trusted
      // (spec §2.6, §3.6), so it is never logged at all, bounded or not.
      logger.warn("discovery.search", { ...logBase, durationMs, outcome: err.kind, status: err.status });
      switch (err.kind) {
        case "quota":
          throw new HttpsError("resource-exhausted", "The search provider's quota is exhausted.", { reason: "providerQuota" });
        case "unavailable":
          throw new HttpsError("unavailable", "The search provider is unavailable.");
        case "badRequest":
          throw new HttpsError("internal", "Search failed.");
      }
    }
    // Same reasoning as above: fixed diagnostics only, no caller- or error-controlled text.
    logger.error("discovery.search", { ...logBase, durationMs, outcome: "unexpected", errorName: err instanceof Error ? err.name : typeof err });
    throw new HttpsError("internal", "Search failed.");
  }
}
