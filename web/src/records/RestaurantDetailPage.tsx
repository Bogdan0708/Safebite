import { useState } from "react";
import { Link, useParams } from "react-router";
import { placeUrl } from "../discover/links";
import { CALL_AHEAD_GROUPS } from "./callAhead";
import { watchCollectionEntry } from "./collection";
import { anyOffline, isData } from "./combine";
import { formatCalendarDate } from "./dates";
import { evidenceStatus, summariseEvidence, type KindEvidence } from "./evidence";
import { outcomeMessage } from "./messages";
import { NotesSection } from "./NotesSection";
import { watchNotes } from "./notes";
import { deleteClaim, watchClaims, watchRestaurant, type WriteOutcome } from "./repository";
import { ReadStateNotice } from "./ReadStateNotice";
import { StatusBlock } from "./StatusBlock";
import { CLAIM_KIND_LABELS, CLAIM_VALUE_LABELS, SOURCE_TYPE_LABELS, type CalendarDate, type Claim, type CollectionState, type Note, type Restaurant } from "./types";
import { useMember } from "./useMember";
import { useToday } from "./useToday";
import { useWatch } from "./useWatch";
import { Icon } from "../ui/Icon";

const STATE_TEXT: Record<KindEvidence["state"], string> = {
  unknown: "Unknown — no evidence recorded yet.",
  current: "Current",
  needsRechecking: "Needs rechecking",
  conflicting: "Conflicting evidence — check before you go",
};

function ClaimCard({ claim, today, disabled, onDelete }: { claim: Claim; today: CalendarDate; disabled: boolean; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const status = evidenceStatus(claim, today);
  return (
    <div className="card" data-testid={`claim-${claim.id}`} data-status={status}>
      <p>
        <strong>{CLAIM_VALUE_LABELS[claim.value]}</strong>
        {claim.detail && <> — {claim.detail}</>}
      </p>
      <p>
        Source: {SOURCE_TYPE_LABELS[claim.source.type]} — {claim.source.url ? <a href={claim.source.url} target="_blank" rel="noreferrer">{claim.source.label}</a> : claim.source.label}
      </p>
      <p>
        Checked {formatCalendarDate(claim.checkedAt)}
        {claim.expiresAt && <> · valid until {formatCalendarDate(claim.expiresAt)}</>} · by {claim.authorName}
        {status === "needsRechecking" && <> · <em>needs rechecking</em></>}
      </p>
      <div className="actions">
        {!confirming && <button type="button" data-testid={`claim-delete-${claim.id}`} disabled={disabled} onClick={() => setConfirming(true)}>Delete</button>}
        {confirming && (
          <>
            <span>Delete this evidence?</span>
            <button type="button" data-testid={`claim-delete-confirm-${claim.id}`} disabled={disabled} onClick={() => onDelete(claim.id)}>Yes, delete</button>
            <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

export function RestaurantDetailPage() {
  const { householdId, uid, displayName } = useMember();
  const { rid } = useParams();
  const today = useToday();
  const restaurantWatch = useWatch<Restaurant>((cb) => watchRestaurant(householdId, rid!, cb), [householdId, rid]);
  const claimsWatch = useWatch<Claim[]>((cb) => watchClaims(householdId, rid!, cb), [householdId, rid]);
  const stateWatch = useWatch<CollectionState | null>((cb) => watchCollectionEntry(householdId, rid!, cb), [householdId, rid]);
  const notesWatch = useWatch<Note[]>((cb) => watchNotes(householdId, rid!, cb), [householdId, rid]);
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);

  const rs = restaurantWatch.state;
  const cs = claimsWatch.state;
  if (rs.status !== "ready" && rs.status !== "offline") {
    return (
      <section>
        <ReadStateNotice state={rs} onRetry={restaurantWatch.retry} gone={<p>This restaurant was deleted. <Link to="/restaurants">Back to Saved</Link></p>} />
      </section>
    );
  }
  const restaurant = rs.value;
  const ss = stateWatch.state;
  // One notice for every cache-backed listener on the page (spec §3.7); writes need the server.
  const offline = anyOffline(rs, cs, ss, notesWatch.state);
  const claimsReady = isData(cs);
  const claims = claimsReady ? cs.value : [];
  const summary = summariseEvidence(claims, today);

  async function onDeleteClaim(cid: string) {
    const result = await deleteClaim(householdId, rid!, cid);
    setOutcome(result.kind === "ok" ? null : result.kind);
  }

  return (
    <section className="page detail-page">
      <div className="detail-topbar">
        <Link className="back-link" to="/restaurants"><Icon name="chevron" className="flip" />Saved</Link>
        <Link className="text-link" data-testid="edit-restaurant" to={`/restaurants/${restaurant.id}/edit`}><Icon name="edit" />Edit</Link>
      </div>
      {offline && <ReadStateNotice state={{ status: "offline", value: null }} onRetry={restaurantWatch.retry} />}
      <div className="detail-heading">
        <h2 className="detail-title" data-testid="restaurant-name">{restaurant.name}</h2>
        <p className="address"><Icon name="pin" /><span data-testid="restaurant-address">{restaurant.address}</span></p>
      </div>
      <p className="actions detail-actions">
        {restaurant.phone && <a className="primary" data-testid="restaurant-phone" href={`tel:${restaurant.phone.replace(/\s+/g, "")}`}><Icon name="phone" />Call {restaurant.phone}</a>}
        {restaurant.website && <a className="secondary" data-testid="restaurant-website" href={restaurant.website} target="_blank" rel="noreferrer"><Icon name="globe" />Website</a>}
        {restaurant.googlePlaceId && (
          <a className="secondary" data-testid="restaurant-maps" href={placeUrl(restaurant.name, restaurant.googlePlaceId)} target="_blank" rel="noopener noreferrer"><Icon name="location" />Open in Google Maps</a>
        )}
      </p>
      <StatusBlock householdId={householdId} rid={restaurant.id} author={{ uid, displayName }} state={ss} disabled={offline} onRetry={stateWatch.retry} />

      <section className="evidence-panel" aria-labelledby="evidence-title">
        <div className="section-heading">
          <h3 id="evidence-title">Evidence</h3>
          <Link
            to={`/restaurants/${restaurant.id}/evidence/new`}
            data-testid="add-evidence"
            aria-disabled={offline ? "true" : undefined}
            className={offline ? "text-link disabled-link" : "text-link"}
            onClick={(e) => { if (offline) e.preventDefault(); }}
          >
            <Icon name="plus" />Add evidence
          </Link>
        </div>
        <p className="evidence-intro">Each fact keeps its own source and checked date. None of it establishes that a place is safe for coeliacs.</p>
        {outcome && <p role="alert" data-testid="claim-outcome" data-kind={outcome}>{outcomeMessage(outcome, "This evidence", "delete")}</p>}
        {!claimsReady && <ReadStateNotice state={cs} onRetry={claimsWatch.retry} />}
        {claimsReady && (
          <div className="evidence">
            {summary.map((entry) => (
              <div key={entry.kind} className="evidence-kind" data-testid={`evidence-${entry.kind}`} data-state={entry.state}>
                <div className="evidence-summary">
                  <h4>{CLAIM_KIND_LABELS[entry.kind]}</h4>
                  <p className="evidence-answer">{STATE_TEXT[entry.state]}</p>
                </div>
                {entry.state === "conflicting" && entry.tied.map((c) => <ClaimCard key={c.id} claim={c} today={today} disabled={offline} onDelete={(id) => void onDeleteClaim(id)} />)}
                {(entry.state === "current" || entry.state === "needsRechecking") && (
                  <ClaimCard key={entry.latest.id} claim={entry.latest} today={today} disabled={offline} onDelete={(id) => void onDeleteClaim(id)} />
                )}
                {entry.state !== "unknown" && entry.history.length > 0 && (
                  <details>
                    <summary>Older evidence ({entry.history.length})</summary>
                    {entry.history.map((c) => <ClaimCard key={c.id} claim={c} today={today} disabled={offline} onDelete={(id) => void onDeleteClaim(id)} />)}
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <NotesSection householdId={householdId} rid={restaurant.id} author={{ uid, displayName }} state={notesWatch.state} disabled={offline} onRetry={notesWatch.retry} />

      <section className="call-card" data-testid="call-ahead">
        <Icon name="phone" />
        <h3>Call ahead and ask</h3>
        <p>Evidence goes out of date. Before you go, ring and ask:</p>
        {CALL_AHEAD_GROUPS.map((group) => (
          <div key={group.label}>
            <strong>{group.label}</strong>
            <ul>
              {group.questions.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </div>
        ))}
      </section>
    </section>
  );
}
