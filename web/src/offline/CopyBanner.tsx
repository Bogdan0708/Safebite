import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "../auth/AuthProvider";
import { copyIsOld } from "./eligibility";
import { formatCopyTime } from "./format";
import { useCopyServing } from "./hooks";
import { useRefreshStatus } from "./refresher";
import { lastServedMeta, subscribeCopySession } from "./session";

/** Shell banner whenever any page shows copy data (spec §3.9 "Copy banner"), and the household-move notice (ruling 8). */
export function CopyBanner() {
  const { state } = useAuth();
  const serving = useCopyServing();
  const refresh = useRefreshStatus();
  const meta = useSyncExternalStore(subscribeCopySession, lastServedMeta, lastServedMeta);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The household notice shows only while the new copy downloads: remember the refresher's last
  // write when the notice first appears and hide it once a newer write is reported.
  const householdChanged = state.status === "member" && state.householdChanged === true;
  const [writtenBefore, setWrittenBefore] = useState<{ at: number | null } | null>(null);
  if (householdChanged && writtenBefore === null) setWrittenBefore({ at: refresh.lastWrittenAt });
  if (!householdChanged && writtenBefore !== null) setWrittenBefore(null);
  const newCopyWritten = writtenBefore !== null && refresh.lastWrittenAt !== null && refresh.lastWrittenAt !== writtenBefore.at;

  const householdNotice = householdChanged && !newCopyWritten
    ? <p className="notice" role="status" data-testid="household-changed">Your household changed; the offline copy was replaced.</p>
    : null;
  const downloadedAt = meta?.downloadedAt ?? (state.status === "offlineMember" ? state.downloadedAt : null);
  if (!serving || downloadedAt === null) return householdNotice;
  const old = copyIsOld({ downloadedAt }, now);
  return (
    <>
      {householdNotice}
      <p className={old ? "copy-banner old" : "copy-banner"} role="status" data-testid="copy-banner" data-old={old ? "true" : "false"}>
        Offline copy from {formatCopyTime(downloadedAt)}. Adding and editing need a connection.
        {old && <> This offline copy is over a week old. Evidence may have changed since.</>}
      </p>
    </>
  );
}
