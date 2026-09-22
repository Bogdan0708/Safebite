/** The UTC calendar day a search counts against: households/{hid}/usage/{yyyymmdd} (spec §3.6). */
export function usageDayKey(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
