import { addMonths, compareCalendarDates } from "./dates";
import { CLAIM_KINDS, type CalendarDate, type Claim, type ClaimKind } from "./types";

/** Owner ruling 2026-09-21: a claim without expiresAt needs rechecking 12 months after checkedAt. */
export const DEFAULT_EVIDENCE_MONTHS = 12;

export type EvidenceStatus = "current" | "needsRechecking";

/**
 * With an explicit expiry the claim is current through the expiry day and needs rechecking from
 * the day after. Without one, it needs rechecking on and after the 12-month anniversary (a
 * missing 29 February anniversary falls on 28 February — see addMonths). Never stored.
 */
export function evidenceStatus(claim: Pick<Claim, "checkedAt" | "expiresAt">, today: CalendarDate): EvidenceStatus {
  if (claim.expiresAt !== undefined) {
    return compareCalendarDates(today, claim.expiresAt) > 0 ? "needsRechecking" : "current";
  }
  const anniversary = addMonths(claim.checkedAt, DEFAULT_EVIDENCE_MONTHS);
  return compareCalendarDates(today, anniversary) >= 0 ? "needsRechecking" : "current";
}

/** Newest checked first; same day → later created first; then id, so the order is deterministic. */
export function sortClaims(claims: readonly Claim[]): Claim[] {
  return [...claims].sort(
    (a, b) => compareCalendarDates(b.checkedAt, a.checkedAt) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
  );
}

export type KindEvidence =
  | { kind: ClaimKind; state: "unknown" }
  | { kind: ClaimKind; state: EvidenceStatus; latest: Claim; history: Claim[] }
  | { kind: ClaimKind; state: "conflicting"; tied: Claim[]; history: Claim[] };

/**
 * One entry per kind. If the newest checked day holds claims that disagree on `value`, the kind
 * is "conflicting" and every tied claim is shown with equal prominence — an incidental
 * tie-break must never pick the reassuring answer (audit F3).
 */
export function summariseEvidence(claims: readonly Claim[], today: CalendarDate): KindEvidence[] {
  return CLAIM_KINDS.map((kind): KindEvidence => {
    const ofKind = sortClaims(claims.filter((c) => c.kind === kind));
    if (ofKind.length === 0) return { kind, state: "unknown" };
    const newestDay = ofKind[0]!.checkedAt;
    const tied = ofKind.filter((c) => c.checkedAt === newestDay);
    const rest = ofKind.slice(tied.length);
    if (tied.length > 1 && new Set(tied.map((c) => c.value)).size > 1) {
      return { kind, state: "conflicting", tied, history: rest };
    }
    const [latest, ...history] = ofKind;
    return { kind, state: evidenceStatus(latest!, today), latest: latest!, history };
  });
}
