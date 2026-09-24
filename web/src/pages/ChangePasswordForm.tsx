import { useState, type SubmitEvent } from "react";
import { CHANGE_PASSWORD_MESSAGES, changePassword, validateNewPassword, type ChangePasswordResult } from "../auth/changePassword";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Exclude<ChangePasswordResult, "ok"> | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    setOutcome(null);
    if (!current) {
      setError("Enter your current password.");
      return;
    }
    const problem = validateNewPassword(next, confirm);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const result = await changePassword(current, next);
    setBusy(false);
    if (result === "ok") {
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(true);
      return;
    }
    if (result === "wrongCurrent") setCurrent("");
    if (result === "policy") {
      setNext("");
      setConfirm("");
    }
    setOutcome(result);
  }

  return (
    <form className="form" data-testid="pw-form" onSubmit={onSubmit} noValidate>
      <h3>Change password</h3>
      <label>
        Current password
        <input type="password" autoComplete="current-password" data-testid="pw-current" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>
        New password
        <input type="password" autoComplete="new-password" data-testid="pw-new" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>
        Confirm new password
        <input type="password" autoComplete="new-password" data-testid="pw-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && <span className="field-error" data-testid="pw-error">{error}</span>}
      <button type="submit" data-testid="pw-submit" disabled={busy}>{busy ? "Changing…" : "Change password"}</button>
      {outcome && <p role="alert" data-testid="pw-outcome" data-kind={outcome}>{CHANGE_PASSWORD_MESSAGES[outcome]}</p>}
      {success && <p role="status" data-testid="pw-success">Password changed</p>}
    </form>
  );
}
