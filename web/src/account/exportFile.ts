const pad = (n: number) => String(n).padStart(2, "0");

export function exportFileName(now: Date): string {
  return `safebite-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type ShareResult = "shared" | "cancelled" | "downloaded";

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Called from a fresh tap (spec §3.8, review P2-5): canShare is a capability check only, the tap
 * supplies the activation. A cancelled sheet is silent; a refused share falls back to a download.
 */
export async function shareOrDownload(file: File, download: (file: File) => void = downloadFile): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return "shared";
    } catch (err) {
      if ((err as { name?: unknown }).name === "AbortError") return "cancelled";
    }
  }
  download(file);
  return "downloaded";
}
