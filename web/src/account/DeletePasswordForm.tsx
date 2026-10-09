import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { resetDocument } from "../auth/resetDocument";
import { deleteMyAccount, finishDeleted, type DeleteOutcome } from "./deleteFlow";
import { DeletionRecoveryScreen } from "./DeletionRecoveryScreen";
import { readDeletionRequest } from "./storage";

const MESSAGES: Record<string, string> = {
  wrongCurrent: "That isn't your current password.",
  tooManyRequests: "Too many attempts. Wait a few minutes and try again.",
  offline: "You are offline. Connect and try again.",
  reauthFailed: "Couldn't check your password. Try again.",
  recentLogin: "For security, enter your password again.",
  permission: "This account can't be deleted here.",
  accountChanged: "The signed-in account changed. Nothing was deleted.",
  failed: "Couldn't delete your account. Try again.",
  empty: "Enter your password.",
};

function messageKey(outcome: Exclude<DeleteOutcome, { kind: "deleted" } | { kind: "lost" } | { kind: "deletedOtherAccount" }>): string {
  if (outcome.kind === "reauth") return outcome.result === "failed" ? "reauthFailed" : outcome.result;
  return outcome.kind;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

/** Password, submit, progress and outcome; shared by every screen that deletes the account (spec §3.8). */
export function DeletePasswordForm({ submitLabel, testid, expectedUid }: { submitLabel: string; testid: string; expectedUid: string }) {
  const online = useOnline();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ key: string } | null>(null);
  const [lostRequestId, setLostRequestId] = useState<string | null>(null);
  const recoveryRequest = useMemo(() => (lostRequestId === null ? null : { requestId: lostRequestId, uid: expectedUid }), [lostRequestId, expectedUid]);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [otherAccount, setOtherAccount] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length === 0) { setMessage({ key: "empty" }); return; }
    setMessage(null);
    setBusy(true);
    const outcome = await deleteMyAccount(password, expectedUid);
    if (outcome.kind === "cleanupPending") { setCleanupPending(true); return; }
    if (outcome.kind === "deleted") return; // finishDeleted is resetting the tab
    if (outcome.kind === "deletedOtherAccount") { setOtherAccount(true); return; }
    if (outcome.kind === "lost") {
      // The recovery screen takes over after the reload only if the id reached sessionStorage;
      // when storage is blocked, recover in this document instead (final review F5).
      if (readDeletionRequest()?.requestId === outcome.requestId) resetDocument();
      else setLostRequestId(outcome.requestId);
      return;
    }
    setBusy(false);
    setPassword("");
    setMessage({ key: messageKey(outcome) });
  }

  if (cleanupPending) {
    return <section role="status">
      <p>The account deletion is confirmed. We couldn't finish clearing its saved sign-in on this device.</p>
      <button type="button" onClick={() => void finishDeleted(expectedUid).then((result) => {
        if (result === "otherAccount") { setCleanupPending(false); setOtherAccount(true); }
      })}>Try again</button>
    </section>;
  }
  if (lostRequestId !== null) {
    return <DeletionRecoveryScreen request={recoveryRequest!} onDismiss={() => resetDocument()} />;
  }
  if (otherAccount) {
    return (
      <section data-testid="delete-other-account">
        <p>The account this request was for has been deleted. You're now signed in as a different account, which was not changed.</p>
        <button type="button" data-testid="delete-other-continue" onClick={() => resetDocument()}>Continue</button>
      </section>
    );
  }
  if (busy) {
    return <p className="screen" role="status" data-testid="delete-progress">Deleting your account… keep this page open.</p>;
  }
  return (
    <form onSubmit={onSubmit} data-testid={`${testid}-form`}>
      <label>
        Current password
        <input data-testid={`${testid}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {!online && <p data-testid="delete-offline">You are offline. Connect to delete your account.</p>}
      <button data-testid={`${testid}-submit`} type="submit" disabled={!online}>{submitLabel}</button>
      {message && <p role="alert" data-testid="delete-outcome" data-kind={message.key}>{MESSAGES[message.key]}</p>}
    </form>
  );
}
