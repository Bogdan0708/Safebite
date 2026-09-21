import { useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { addClaim, type WriteOutcome } from "./repository";
import { outcomeMessage } from "./RestaurantFormPage";
import { CLAIM_KINDS, CLAIM_KIND_LABELS, CLAIM_VALUES, CLAIM_VALUE_LABELS, SOURCE_TYPES, SOURCE_TYPE_LABELS, type ClaimInput, type ClaimKind, type ClaimValue, type SourceType } from "./types";
import { useMember } from "./useMember";
import { useToday } from "./useToday";
import { validateClaimInput, type ClaimField, type FieldErrors } from "./validation";

interface RawClaimForm {
  kind: ClaimKind;
  value: ClaimValue;
  detail: string;
  sourceType: SourceType;
  sourceLabel: string;
  sourceUrl: string;
  checkedAt: string;
  expiresAt: string;
}

/** Form strings → write input: trimmed, blank optionals omitted (the rules refuse empty optionals). */
export function toClaimInput(form: RawClaimForm): ClaimInput {
  const input: ClaimInput = {
    kind: form.kind,
    value: form.value,
    detail: form.detail.trim(),
    source: { type: form.sourceType, label: form.sourceLabel.trim() },
    checkedAt: form.checkedAt,
  };
  const url = form.sourceUrl.trim();
  if (url !== "") input.source.url = url;
  if (form.expiresAt.trim() !== "") input.expiresAt = form.expiresAt.trim();
  return input;
}

export function ClaimFormPage() {
  const { householdId, uid, displayName } = useMember();
  const { rid } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const [form, setForm] = useState<RawClaimForm>({ kind: "dedicatedKitchen", value: "yes", detail: "", sourceType: "restaurantStatement", sourceLabel: "", sourceUrl: "", checkedAt: today, expiresAt: "" });
  const [errors, setErrors] = useState<FieldErrors<ClaimField>>({});
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [busy, setBusy] = useState(false);

  const accreditation = form.kind === "accreditation";
  const urlRequired = form.sourceType === "accreditingBody";

  function set<K extends keyof RawClaimForm>(key: K, value: RawClaimForm[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Owner rule: accreditation must come from the accrediting body (spec §2.1, §3.5 URL policy).
      if (key === "kind" && value === "accreditation") next.sourceType = "accreditingBody";
      return next;
    });
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = toClaimInput(form);
    const problems = validateClaimInput(input, today);
    setErrors(problems);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    const result = await addClaim(householdId, rid!, { uid, displayName }, input);
    setBusy(false);
    if (result.kind === "ok") {
      void navigate(`/restaurants/${rid}`);
      return;
    }
    setOutcome(result.kind);
  }

  const err = (field: ClaimField) => errors[field] && <span className="field-error" data-testid={`claim-error-${field}`}>{errors[field]}</span>;

  return (
    <section>
      <h2>Add evidence</h2>
      <p>Record one fact you checked, where it came from and when. Unknown stays unknown; a note never counts as accreditation.</p>
      <form className="form" data-testid="claim-form" onSubmit={onSubmit} noValidate>
        <label>
          What is this about?
          <select data-testid="claim-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as ClaimKind)}>
            {CLAIM_KINDS.map((k) => <option key={k} value={k}>{CLAIM_KIND_LABELS[k]}</option>)}
          </select>
          {err("kind")}
        </label>
        <label>
          Answer
          <select data-testid="claim-value" value={form.value} onChange={(e) => set("value", e.target.value as ClaimValue)}>
            {CLAIM_VALUES.map((v) => <option key={v} value={v}>{CLAIM_VALUE_LABELS[v]}</option>)}
          </select>
          {err("value")}
        </label>
        <label>
          Details (optional)
          <textarea data-testid="claim-detail" rows={3} value={form.detail} onChange={(e) => set("detail", e.target.value)} />
          {err("detail")}
        </label>
        <label>
          Where did this come from?
          <select data-testid="claim-source-type" value={form.sourceType} disabled={accreditation} onChange={(e) => set("sourceType", e.target.value as SourceType)}>
            {SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}
          </select>
          {err("sourceType")}
        </label>
        <label>
          Source description
          <input data-testid="claim-source-label" value={form.sourceLabel} placeholder="e.g. Phone call with the manager" onChange={(e) => set("sourceLabel", e.target.value)} />
          {err("sourceLabel")}
        </label>
        <label>
          Link {urlRequired ? "(required for an accrediting body)" : "(optional)"}
          <input data-testid="claim-source-url" type="url" inputMode="url" value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} />
          {err("sourceUrl")}
        </label>
        <label>
          Date checked
          <input data-testid="claim-checked-at" type="date" max={today} value={form.checkedAt} onChange={(e) => set("checkedAt", e.target.value)} />
          {err("checkedAt")}
        </label>
        <label>
          Valid until (optional, e.g. an accreditation's expiry)
          <input data-testid="claim-expires-at" type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
          {err("expiresAt")}
        </label>
        <button type="submit" data-testid="claim-submit" disabled={busy}>{busy ? "Saving…" : "Save evidence"}</button>
        {outcome && outcome !== "ok" && (
          <div role="alert" data-testid="claim-save-outcome" data-kind={outcome}>
            <p>{outcomeMessage(outcome, "This restaurant")}</p>
            {outcome === "notFound" && <Link to="/restaurants">Back to Saved</Link>}
          </div>
        )}
      </form>
    </section>
  );
}
