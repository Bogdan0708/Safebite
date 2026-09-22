import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { watchRestaurants } from "../records/repository";
import type { Restaurant } from "../records/types";
import { useMember } from "../records/useMember";
import { useWatch } from "../records/useWatch";
import type { DiscoveryResult, SearchErrorReason } from "./api";
import { requestPosition } from "./geolocation";
import { directionsUrl } from "./links";
import { useDiscoverySearch, type SearchState } from "./search";

export const REASON_TEXT: Record<SearchErrorReason, string> = {
  off: "Search is switched off at the moment.",
  dailyCap: "Today's search limit for our household has been reached. Try again tomorrow.",
  providerQuota: "The search provider is over its quota. Try again later.",
  unavailable: "Search is not available right now. Try again in a moment.",
  offline: "You are offline. Connect and try again.",
  timeout: "The search took too long. Check your connection and try again.",
  locationDenied: "Location access was refused. Allow location for SafeBite in your browser settings, or search by destination.",
  locationUnavailable: "Your location could not be determined. Try again, or search by destination.",
  invalid: "Enter a destination to search for.",
};

/** Router state for /restaurants/new (read by RestaurantFormPage). Only the place id crosses to
 * the form (audit S1/F2): Google's name and address are shown here and never stored or carried. */
export interface RestaurantPrefill {
  googlePlaceId: string;
}

function StateLine({ state }: { state: SearchState }) {
  switch (state.status) {
    case "idle":
      return <p className="hint" data-testid="discover-state" data-status="idle">Search by destination, or use Near me. Nothing is searched until you ask.</p>;
    case "searching":
      return <p data-testid="discover-state" data-status="searching" role="status">Searching {state.label === "near you" ? "near you" : `for “${state.label}”`}…</p>;
    case "empty":
      return <p data-testid="discover-state" data-status="empty" role="status">No restaurants found {state.label === "near you" ? "near you" : `for “${state.label}”`}.</p>;
    case "error":
      return <p className="notice" data-testid="discover-state" data-status="error" data-reason={state.reason} role="alert">{REASON_TEXT[state.reason]}</p>;
    case "results":
      return null;
  }
}

function ResultRow({ result, existingId, onAdd }: { result: DiscoveryResult; existingId: string | undefined; onAdd: (r: DiscoveryResult) => void }) {
  return (
    <li className="card" data-testid="discover-result" data-place-id={result.placeId}>
      <a data-testid="result-name" href={result.googleMapsUri} target="_blank" rel="noopener noreferrer"><strong>{result.name}</strong></a>
      {result.address && <p data-testid="result-address">{result.address}</p>}
      <div className="actions">
        <a data-testid="result-directions" href={directionsUrl(result.name, result.placeId)} target="_blank" rel="noopener noreferrer">Directions</a>
        {existingId ? (
          <Link data-testid="result-in-records" to={`/restaurants/${existingId}`}>In our records</Link>
        ) : (
          <button type="button" data-testid="result-add" onClick={() => onAdd(result)}>Add to our records</button>
        )}
      </div>
    </li>
  );
}

export function DiscoverPage() {
  const { householdId } = useMember();
  const navigate = useNavigate();
  const { state, submitDestination, submitNearby, fail } = useDiscoverySearch();
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const records = useWatch<Restaurant[]>((cb) => watchRestaurants(householdId, cb), [householdId]);

  // Audit F1: a pending Near me request otherwise outlives the search intent that started it (a
  // later destination search, a second Near me, or the page unmounting). Track the intent that is
  // currently "wanted" and discard any position/failure that resolves after a newer one started.
  const intent = useRef(0);
  useEffect(() => () => { intent.current += 1; }, []);

  // Place id → record id for "In our records"; a record being deleted no longer counts.
  const existing = new Map<string, string>();
  if (records.state.status === "ready" || records.state.status === "offline") {
    for (const r of records.state.value) if (r.googlePlaceId && !r.deleting) existing.set(r.googlePlaceId, r.id);
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    intent.current += 1;
    setLocating(false);
    const trimmed = query.trim();
    if (trimmed === "") {
      fail("invalid", "");
      return;
    }
    submitDestination(trimmed);
  }

  async function onNearMe() {
    const mine = ++intent.current;
    setLocating(true);
    const outcome = await requestPosition();
    if (mine !== intent.current) return; // superseded by a newer search or unmount: discard, never call the controller
    setLocating(false);
    if (outcome.kind === "position") submitNearby(outcome.lat, outcome.lng);
    else fail(outcome.reason, "near you");
  }

  function onAdd(result: DiscoveryResult) {
    const prefill: RestaurantPrefill = { googlePlaceId: result.placeId };
    void navigate("/restaurants/new", { state: { prefill } });
  }

  return (
    <section>
      <h2>Discover</h2>
      <form className="form" data-testid="discover-form" onSubmit={onSubmit} noValidate>
        <label>
          Destination
          <input data-testid="discover-query" value={query} maxLength={120} placeholder="Town, area or restaurant name" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="actions">
          <button type="submit" data-testid="discover-submit">Search</button>
          <button type="button" data-testid="discover-nearby" disabled={locating} onClick={() => void onNearMe()}>Near me</button>
          {locating && <span data-testid="discover-locating">Finding your location…</span>}
        </div>
      </form>
      <StateLine state={state} />
      {state.status === "results" && (
        <>
          <ul className="list" data-testid="discover-results">
            {state.results.map((r) => <ResultRow key={r.placeId} result={r} existingId={existing.get(r.placeId)} onAdd={onAdd} />)}
          </ul>
          <p className="attribution" data-testid="google-attribution">
            <img src="/google/GoogleMaps_Logo_Gray.svg" alt="Google Maps" height={19} />
          </p>
          <p className="hint" data-testid="ranking-note">
            Results are shown in the order Google Maps returns them; SafeBite only leaves out places Google reports as closed. Being listed here says nothing about gluten-free safety — check the evidence and call ahead.
          </p>
        </>
      )}
    </section>
  );
}
