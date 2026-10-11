const COPY_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** "10 Oct, 14:32" — the copy's download time in the device's time zone. Firebase-free. */
export function formatCopyTime(ms: number): string {
  const parts = Object.fromEntries(COPY_TIME.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}
