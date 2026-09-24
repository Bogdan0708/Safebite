import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { watchCollection } from "./collection";
import { combineStates, isData } from "./combine";
import { formatCalendarDate } from "./dates";
import { filterRows, joinRecords, type RecordFilter } from "./join";
import { deleteProgressText, finishOutcomeText } from "./messages";
import { finishDeleting, watchRestaurants } from "./repository";
import { ReadStateNotice } from "./ReadStateNotice";
import type { CollectionState, Restaurant } from "./types";
import { useMember } from "./useMember";
import { useWatch } from "./useWatch";

export function RestaurantsPage() {
  const { householdId } = useMember();
  const restaurants = useWatch<Restaurant[]>((cb) => watchRestaurants(householdId, cb), [householdId]);
  const states = useWatch<Record<string, CollectionState>>((cb) => watchCollection(householdId, cb), [householdId]);
  const [filter, setFilter] = useState<RecordFilter>("shortlist");
  const [progress, setProgress] = useState<Record<string, string>>({});
  const resumed = useRef(new Set<string>());
  const combined = combineStates(restaurants.state, states.state);
  const offline = combined.status === "offline";
  const all = isData(combined) ? joinRecords(combined.value[0], combined.value[1]) : [];
  const rows = filterRows(all, filter);

  function retry() {
    restaurants.retry();
    states.retry();
  }

  async function finish(rid: string) {
    setProgress((p) => ({ ...p, [rid]: deleteProgressText("sweeping") }));
    const outcome = await finishDeleting(householdId, rid, (step) => setProgress((p) => ({ ...p, [rid]: deleteProgressText(step) })));
    if (outcome.kind !== "ok") setProgress((p) => ({ ...p, [rid]: finishOutcomeText(outcome.kind) }));
  }

  // Resume interrupted deletions once per mount from the authoritative restaurant list alone,
  // whatever the collection listener is doing (deletion protocol is resumable, spec §3.5/§3.7).
  const rs = restaurants.state;
  useEffect(() => {
    if (rs.status !== "ready") return;
    for (const r of rs.value) {
      if (r.deleting && !resumed.current.has(r.id)) {
        resumed.current.add(r.id);
        void finish(r.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rs]);

  return (
    <section>
      <h2>Saved</h2>
      <p>Our restaurant records.</p>
      <ReadStateNotice state={combined} onRetry={retry} />
      <p className="actions">
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
      <p className="filter" role="group" aria-label="Show">
        <button type="button" data-testid="filter-shortlist" aria-pressed={filter === "shortlist"} onClick={() => setFilter("shortlist")}>Shortlist</button>
        <button type="button" data-testid="filter-all" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All records</button>
      </p>
      {combined.status === "ready" && all.length === 0 && <p data-testid="restaurants-empty">No restaurants yet. Add the first one.</p>}
      {combined.status === "ready" && all.length > 0 && rows.length === 0 && (
        <p data-testid="shortlist-empty">Nothing on the shortlist. Open a record and tap Add to shortlist.</p>
      )}
      {rows.length > 0 && (
        <ul className="list" data-testid="restaurant-list">
          {rows.map(({ restaurant: r, state }) =>
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
                  {state && (state.shortlisted || state.visitedOn) && (
                    <span className="labels">
                      {state.shortlisted && <span className="label" data-testid="label-shortlisted">Shortlisted</span>}
                      {state.visited && state.visitedOn && <span className="label" data-testid="label-visited">Visited {formatCalendarDate(state.visitedOn)}</span>}
                    </span>
                  )}
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
