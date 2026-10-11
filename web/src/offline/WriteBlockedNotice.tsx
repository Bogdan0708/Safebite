/** Shown on write routes while writes are not allowed (spec §3.9 "Write access"). */
export function WriteBlockedNotice() {
  return <p className="notice" role="status" data-testid="write-blocked">Adding and editing need a connection.</p>;
}
