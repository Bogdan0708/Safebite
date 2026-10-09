import { useState } from "react";
import { exportHouseholdCall } from "./api";
import { downloadFile, exportFileName, shareOrDownload } from "./exportFile";

type State = "idle" | "preparing" | "ready" | "offline" | "failed" | "tooLarge";

const TEXT: Record<Exclude<State, "idle" | "ready">, string> = {
  preparing: "Preparing your export…",
  offline: "You are offline. Connect and try again.",
  failed: "Couldn't prepare the export. Try again.",
  tooLarge: "The export is too large to download in one file.",
};

/** Settings → Export household data. The file lives in component state only and is dropped on unmount. */
export function ExportSection() {
  const [state, setState] = useState<State>("idle");
  const [file, setFile] = useState<File | null>(null);

  async function prepare() {
    if (navigator.onLine === false) { setState("offline"); return; }
    setState("preparing");
    setFile(null);
    try {
      const data = await exportHouseholdCall({});
      setFile(new File([JSON.stringify(data, null, 2)], exportFileName(new Date()), { type: "application/json" }));
      setState("ready");
    } catch (err) {
      setState((err as { code?: string }).code === "functions/resource-exhausted" ? "tooLarge" : "failed");
    }
  }

  return (
    <section data-testid="export-section">
      <h3>Export household data</h3>
      <p data-testid="export-warning">The file contains both members' notes and leaves the app once you share or save it.</p>
      <button type="button" data-testid="export-prepare" disabled={state === "preparing"} onClick={() => void prepare()}>Prepare export</button>
      <p data-testid="export-status" data-state={state} role="status">
        {state === "ready" ? "Your export is ready." : state === "idle" ? "" : TEXT[state]}
      </p>
      {state === "ready" && file && (
        <>
          <button type="button" data-testid="export-share" onClick={() => void shareOrDownload(file)}>Share or save export</button>
          <button type="button" data-testid="export-download" onClick={() => downloadFile(file)}>Download instead</button>
        </>
      )}
    </section>
  );
}
