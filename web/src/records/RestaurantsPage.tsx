import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { finishDeleting, watchRestaurants, type DeleteStep } from "./repository";
import { ReadStateNotice } from "./ReadStateNotice";
import type { Restaurant } from "./types";
import { useMember } from "./useMember";
import { useWatch } from "./useWatch";

const STEP_TEXT: Record<DeleteStep, string> = { marking: "Marking…", sweeping: "Removing evidence…", removing: "Removing restaurant…" };

function outcomeText(kind: string): string {
  switch (kind) {
    case "offline": return "You are offline. Connect and tap Finish deleting.";
    case "permission": return "You no longer have access to this household.";
    case "notFound": return "Already removed.";
    default: return "Could not finish deleting. Tap to try again.";
  }
}

export function RestaurantsPage() {
  const { householdId } = useMember();
  const { state, retry } = useWatch<Restaurant[]>((cb) => watchRestaurants(householdId, cb), [householdId]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const resumed = useRef(new Set<string>());
  const offline = state.status === "offline";
  const rows = state.status === "ready" || state.status === "offline" ? state.value : [];

  async function finish(rid: string) {
    setProgress((p) => ({ ...p, [rid]: STEP_TEXT.sweeping }));
    const outcome = await finishDeleting(householdId, rid, (step) => setProgress((p) => ({ ...p, [rid]: STEP_TEXT[step] })));
    if (outcome.kind !== "ok") setProgress((p) => ({ ...p, [rid]: outcomeText(outcome.kind) }));
  }

  // Resume interrupted deletions once per mount (deletion protocol is resumable, spec §3.5).
  useEffect(() => {
    if (state.status !== "ready") return;
    for (const r of state.value) {
      if (r.deleting && !resumed.current.has(r.id)) {
        resumed.current.add(r.id);
        void finish(r.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <section>
      <h2>Saved</h2>
      <p>Our restaurant records.</p>
      <ReadStateNotice state={state} onRetry={retry} />
      <p>
        <Link
          to="/restaurants/new"
          data-testid="add-restaurant"
          aria-disabled={offline ? "true" : undefined}
          onClick={(e) => { if (offline) e.preventDefault(); }}
          className={offline ? "disabled-link" : undefined}
        >
          Add restaurant
        </Link>
      </p>
      {state.status === "ready" && rows.length === 0 && <p data-testid="restaurants-empty">No restaurants yet. Add the first one.</p>}
      {rows.length > 0 && (
        <ul className="list" data-testid="restaurant-list">
          {rows.map((r) =>
            r.deleting ? (
              <li key={r.id} className="card" data-testid="restaurant-deleting" data-rid={r.id}>
                <strong>{r.name}</strong> — Deleting…
                <div className="actions">
                  <span>{progress[r.id]}</span>
                  <button type="button" data-testid="finish-deleting" disabled={offline} onClick={() => void finish(r.id)}>Finish deleting</button>
                </div>
              </li>
            ) : (
              <li key={r.id} className="card" data-testid="restaurant-row" data-rid={r.id}>
                <Link to={`/restaurants/${r.id}`}>
                  <strong>{r.name}</strong>
                  <br />
                  <span>{r.address}</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
