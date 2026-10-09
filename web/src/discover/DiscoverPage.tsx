import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { watchRestaurants } from "../records/repository";
import type { Restaurant } from "../records/types";
import { useMember } from "../records/useMember";
import { useWatch } from "../records/useWatch";
import type { DiscoveryResult, SearchErrorReason, SearchMode } from "./api";
import { requestPosition } from "./geolocation";
import { directionsUrl } from "./links";
import { useDiscoverySearch, type SearchState } from "./search";
import { Icon } from "../ui/Icon";
import { TownArt } from "../ui/TownArt";

export const REASON_TEXT: Record<SearchErrorReason, string> = {
  off: "Search is switched off at the moment.",
  dailyCap: "Today's search limit for our household has been reached. Try again tomorrow.",
  providerQuota: "The search provider is over its quota. Try again later.",
  unavailable: "Search is not available right now. Try again in a moment.",
  offline: "You are offline. Connect and try again.",
  timeout: "The search took too long. Check your connection and try again.",
  locationDenied: "Location access was refused. Allow location for SafeBite in your browser settings, or search by destination.",
  locationUnavailable: "Your location could not be determined. Try again, or search by destination.",
  invalid: "Enter a town, area or venue name to search for.",
};

/** Router state for /restaurants/new (read by RestaurantFormPage). Only the place id crosses to
 * the form (audit S1/F2): Google's name and address are shown here and never stored or carried. */
export interface RestaurantPrefill {
  googlePlaceId: string;
}

function StateLine({ state }: { state: SearchState }) {
  switch (state.status) {
    case "idle":
      return <p className="hint" data-testid="discover-state" data-status="idle">Search a town, area or venue name, or use Near me. Nothing is searched until you ask.</p>;
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
    <li className="card place-card" data-testid="discover-result" data-place-id={result.placeId}>
      <a className="place-title" data-testid="result-name" href={result.googleMapsUri} target="_blank" rel="noopener noreferrer"><strong>{result.name}</strong></a>
      {result.address && <p className="place-sub" data-testid="result-address"><Icon name="pin" />{result.address}</p>}
      <div className="actions card-bottom">
        <a className="text-link" data-testid="result-directions" href={directionsUrl(result.name, result.placeId)} target="_blank" rel="noopener noreferrer"><Icon name="location" />Directions</a>
        {existingId ? (
          <Link className="text-link" data-testid="result-in-records" to={`/restaurants/${existingId}`}><Icon name="check" />In our records</Link>
        ) : (
          <button type="button" className="secondary small" data-testid="result-add" onClick={() => onAdd(result)}><Icon name="plus" />Add to our records</button>
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
  const [mode, setMode] = useState<SearchMode>("destination");
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
    submitDestination(trimmed, mode);
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
    <section className="page discover-page">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><Icon name="compass" />Private gluten-free research</p>
          <p className="hero-title">A little more<br />peace of mind.</p>
          <p className="subtitle">Find somewhere lovely. Know what to ask. Make it a memory.</p>
        </div>
        <TownArt />
      </div>
      <section className="search-panel" aria-labelledby="discover-title">
        <h2 id="discover-title">Discover</h2>
        <form className="form" data-testid="discover-form" onSubmit={onSubmit} noValidate>
          <div className="segmented" role="group" aria-label="Search for" data-testid="discover-mode" data-value={mode}>
            <button type="button" data-testid="discover-mode-destination" aria-pressed={mode === "destination"} onClick={() => setMode("destination")}>Town or area</button>
            <button type="button" data-testid="discover-mode-venue" aria-pressed={mode === "venue"} onClick={() => setMode("venue")}>Restaurant or venue</button>
          </div>
          <label className="search-box">
            <Icon name="search" />
            <span className="sr-only">{mode === "destination" ? "Town or area" : "Restaurant or venue name"}</span>
            <input data-testid="discover-query" value={query} maxLength={120} placeholder={mode === "destination" ? "e.g. Lisbon or Soho" : "e.g. Riverside Café, Lisbon"} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="actions search-actions">
            <button type="submit" className="primary" data-testid="discover-submit">Search<Icon name="arrow" /></button>
            <button type="button" className="secondary" data-testid="discover-nearby" disabled={locating} onClick={() => void onNearMe()}><Icon name="location" />Near me</button>
          </div>
          {locating && <span className="hint" data-testid="discover-locating">Finding your location…</span>}
        </form>
        <p className="fine-print">A listing doesn&rsquo;t tell us whether a place is suitable for coeliacs. Check the evidence and call ahead.</p>
      </section>
      <StateLine state={state} />
      {state.status === "results" && (
        <div className="search-results">
          <ul className="list results-grid" data-testid="discover-results">
            {state.results.map((r) => <ResultRow key={r.placeId} result={r} existingId={existing.get(r.placeId)} onAdd={onAdd} />)}
          </ul>
          <p className="attribution" data-testid="google-attribution">
            <img src="/google/GoogleMaps_Logo_Gray.svg" alt="Google Maps" height={19} />
          </p>
          <p className="hint" data-testid="ranking-note">
            Results are shown in the order Google Maps returns them; SafeBite leaves out closed places and places outside its restaurant, café, bakery, bar and takeaway categories. Being listed here says nothing about gluten-free safety — check the evidence and call ahead.
          </p>
        </div>
      )}
    </section>
  );
}
