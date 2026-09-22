import { useState, type SubmitEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { RestaurantPrefill } from "../discover/DiscoverPage";
import { placeIdUrl } from "../discover/links";
import { outcomeMessage } from "./messages";
import { createRestaurant, deleteRestaurant, updateRestaurant, watchRestaurant, watchRestaurants, type DeleteStep, type WriteOutcome } from "./repository";
import { ReadStateNotice } from "./ReadStateNotice";
import type { Restaurant, RestaurantInput } from "./types";
import { useMember } from "./useMember";
import { useWatch } from "./useWatch";
import { LIMITS, normaliseRestaurantInput, validateRestaurantInput, type FieldErrors, type RawRestaurantForm, type RestaurantField } from "./validation";

const EMPTY: RawRestaurantForm = { name: "", address: "", phone: "", website: "" };
const STEP_TEXT: Record<DeleteStep, string> = { marking: "Marking…", sweeping: "Removing evidence…", removing: "Removing restaurant…" };

function toForm(r: Restaurant): RawRestaurantForm {
  return { name: r.name, address: r.address, phone: r.phone ?? "", website: r.website ?? "" };
}
function same(a: RawRestaurantForm, b: RawRestaurantForm): boolean {
  return a.name === b.name && a.address === b.address && a.phone === b.phone && a.website === b.website;
}

interface Draft {
  form: RawRestaurantForm;
  seededFrom: RawRestaurantForm;
  baseVersion: number;
}

/** Router state from Discover's "Add to our records". Only the place id crosses (audit S1/F2); a
 * legacy entry's extra `name`/`address` keys (from before this change) are ignored, not rejected.
 * Anything malformed is ignored (no prefill). */
export function readPrefill(state: unknown): RestaurantPrefill | null {
  const prefill = (state as { prefill?: unknown } | null)?.prefill;
  if (typeof prefill !== "object" || prefill === null) return null;
  const { googlePlaceId } = prefill as Record<string, unknown>;
  if (typeof googlePlaceId !== "string") return null;
  const trimmed = googlePlaceId.trim();
  if (trimmed === "" || trimmed.length > LIMITS.googlePlaceId) return null;
  return { googlePlaceId: trimmed };
}

export function RestaurantFormPage({ mode }: { mode: "create" | "edit" }) {
  const { householdId, uid } = useMember();
  const { rid } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = mode === "create" ? readPrefill(location.state) : null;
  const placeId = prefill?.googlePlaceId;
  // Only a prefilled create watches the list: it is how "already in our records" is detected.
  const records = useWatch<Restaurant[]>((cb) => (placeId ? watchRestaurants(householdId, cb) : () => {}), [householdId, placeId]);
  let existingId: string | undefined;
  if (placeId && (records.state.status === "ready" || records.state.status === "offline")) {
    existingId = records.state.value.find((r) => r.googlePlaceId === placeId && !r.deleting)?.id;
  }
  const { state, retry } = useWatch<Restaurant>((cb) => (mode === "edit" && rid ? watchRestaurant(householdId, rid, cb) : () => {}), [householdId, rid, mode]);
  const remote = state.status === "ready" || state.status === "offline" ? state.value : null;

  // The draft is seeded once from the first snapshot; later snapshots only update `remote`
  // (audit F2). A clean draft follows remote silently; a dirty one keeps its fields. A prefill
  // carries only the Google place id (audit S1/F2), so a create draft always starts empty — the
  // member types the name and address themselves.
  const [draft, setDraft] = useState<Draft | null>(mode === "create" ? { form: EMPTY, seededFrom: EMPTY, baseVersion: 0 } : null);
  const [errors, setErrors] = useState<FieldErrors<RestaurantField>>({});
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<string | null>(null);

  if (mode === "edit" && remote) {
    if (draft === null) {
      setDraft({ form: toForm(remote), seededFrom: toForm(remote), baseVersion: remote.version });
    } else if (remote.version !== draft.baseVersion && same(draft.form, draft.seededFrom)) {
      setDraft({ form: toForm(remote), seededFrom: toForm(remote), baseVersion: remote.version });
    }
  }

  const dirty = draft !== null && !same(draft.form, draft.seededFrom);
  const changedElsewhere = mode === "edit" && remote !== null && draft !== null && remote.version !== draft.baseVersion && dirty;
  const offline = state.status === "offline";

  function reloadDraft() {
    if (!remote) return;
    setDraft({ form: toForm(remote), seededFrom: toForm(remote), baseVersion: remote.version });
    setOutcome(null);
    setErrors({});
  }

  function setField(field: RestaurantField, value: string) {
    setDraft((d) => (d ? { ...d, form: { ...d.form, [field]: value } } : d));
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const input: RestaurantInput = { ...normaliseRestaurantInput(draft.form), ...(placeId ? { googlePlaceId: placeId } : {}) };
    const problems = validateRestaurantInput(input);
    setErrors(problems);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    if (mode === "create" && existingId) {
      // A member added this place meanwhile (or before): open it rather than create a twin.
      void navigate(`/restaurants/${existingId}`);
      return;
    }
    setBusy(true);
    const result = mode === "create" ? await createRestaurant(householdId, uid, input) : await updateRestaurant(householdId, rid!, draft.baseVersion, input);
    setBusy(false);
    if (result.kind === "ok") {
      void navigate(mode === "create" ? `/restaurants/${result.value}` : `/restaurants/${rid}`);
      return;
    }
    setOutcome(result.kind);
  }

  async function onDelete() {
    if (!draft || !rid) return;
    setBusy(true);
    const result = await deleteRestaurant(householdId, rid, draft.baseVersion, (step) => setDeleteProgress(STEP_TEXT[step]));
    setBusy(false);
    if (result.kind === "ok") {
      void navigate("/restaurants");
      return;
    }
    setDeleteProgress(null);
    setConfirming(false);
    setOutcome(result.kind);
  }

  if (mode === "edit" && state.status !== "ready" && state.status !== "offline") {
    return (
      <section>
        <h2>Edit restaurant</h2>
        <ReadStateNotice state={state} onRetry={retry} gone={<p>This restaurant was deleted. <Link to="/restaurants">Back to Saved</Link></p>} />
      </section>
    );
  }
  if (!draft) return null;

  return (
    <section>
      <h2>{mode === "create" ? "Add restaurant" : "Edit restaurant"}</h2>
      {prefill && (
        <p className="notice" data-testid="prefill-notice">
          Linked to a Google Maps place: <a href={placeIdUrl(prefill.googlePlaceId)} target="_blank" rel="noopener noreferrer">open it</a>. Enter the name and address as you know them; nothing from Google is stored except the link.
        </p>
      )}
      {existingId && (
        <p className="notice" role="status" data-testid="prefill-duplicate">
          This place is already in our records. <Link to={`/restaurants/${existingId}`}>Open it</Link>
        </p>
      )}
      {mode === "edit" && <ReadStateNotice state={state} onRetry={retry} />}
      {changedElsewhere && (
        <div className="notice" role="status" data-testid="changed-elsewhere">
          <p>This restaurant was changed on another device while you were editing.</p>
          <button type="button" data-testid="reload-draft" onClick={reloadDraft}>Reload draft</button>
        </div>
      )}
      <form className="form" data-testid="restaurant-form" onSubmit={onSubmit} noValidate>
        <label>
          Name
          <input data-testid="field-name" value={draft.form.name} maxLength={200} onChange={(e) => setField("name", e.target.value)} />
          {errors.name && <span className="field-error" data-testid="error-name">{errors.name}</span>}
        </label>
        <label>
          Address
          <input data-testid="field-address" value={draft.form.address} maxLength={400} onChange={(e) => setField("address", e.target.value)} />
          {errors.address && <span className="field-error" data-testid="error-address">{errors.address}</span>}
        </label>
        <label>
          Phone (optional)
          <input data-testid="field-phone" type="tel" value={draft.form.phone} maxLength={60} onChange={(e) => setField("phone", e.target.value)} />
          {errors.phone && <span className="field-error" data-testid="error-phone">{errors.phone}</span>}
        </label>
        <label>
          Website (optional)
          <input data-testid="field-website" type="url" inputMode="url" value={draft.form.website} maxLength={400} onChange={(e) => setField("website", e.target.value)} />
          {errors.website && <span className="field-error" data-testid="error-website">{errors.website}</span>}
        </label>
        <button type="submit" data-testid="save-restaurant" disabled={busy || offline}>
          {busy ? "Saving…" : "Save"}
        </button>
        {outcome && outcome !== "ok" && (
          <div role="alert" data-testid="save-outcome" data-kind={outcome}>
            <p>{outcomeMessage(outcome, "This restaurant")}</p>
            {outcome === "conflict" && !changedElsewhere && <button type="button" data-testid="reload-draft" onClick={reloadDraft}>Reload draft</button>}
            {outcome === "notFound" && <Link to="/restaurants">Back to Saved</Link>}
          </div>
        )}
      </form>
      {mode === "edit" && (
        <div className="actions">
          {!confirming && (
            <button type="button" data-testid="delete-restaurant" disabled={busy || offline} onClick={() => setConfirming(true)}>Delete restaurant</button>
          )}
          {confirming && deleteProgress === null && (
            <>
              <span>Delete this restaurant and all of its evidence?</span>
              <button type="button" data-testid="delete-confirm" disabled={busy} onClick={() => void onDelete()}>Yes, delete</button>
              <button type="button" data-testid="delete-cancel" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            </>
          )}
          {deleteProgress !== null && <span data-testid="delete-progress">{deleteProgress}</span>}
        </div>
      )}
    </section>
  );
}
