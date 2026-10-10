import { REFRESH_INTERVAL_MS } from "./types";

/**
 * Full-refresh triggers while a member is opted in (spec §3.9 "Refresh" step 4): reconnection,
 * returning to the page with a copy older than 15 minutes, and every 15 minutes while visible.
 * The timer is never skipped: live listeners prove only the queries on screen (review R2-1).
 * `ageOf` returns the copy's age in ms, or null when there is no copy.
 */
export function startRefreshTriggers(run: () => void, ageOf: () => Promise<number | null>): () => void {
  const onOnline = () => run();
  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    void ageOf().then((age) => {
      if (age === null || age > REFRESH_INTERVAL_MS) run();
    });
  };
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, REFRESH_INTERVAL_MS);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
