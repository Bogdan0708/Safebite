import { Timestamp } from "firebase/firestore";
import type { CalendarDate } from "./types";

/**
 * Calendar-date contract (spec §3.5, audit F3): checkedAt/expiresAt are timestamps at 00:00:00 UTC
 * and are read, compared and displayed as UTC calendar days only. Nothing here uses local time
 * except `localToday`, which is exactly the one place the device's own calendar matters.
 */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parts(date: CalendarDate): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y!, m!, d!];
}

function fromParts(y: number, m: number, d: number): CalendarDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isCalendarDate(value: string): value is CalendarDate {
  if (!CALENDAR_DATE.test(value)) return false;
  const [y, m, d] = parts(value);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function toCalendarDate(ts: Timestamp): CalendarDate {
  const date = ts.toDate();
  return fromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function fromCalendarDate(date: CalendarDate): Timestamp {
  const [y, m, d] = parts(date);
  return Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d)));
}

/** The device's local calendar day — what the user means by "today". */
export function localToday(now: Date = new Date()): CalendarDate {
  return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Same day-of-month `months` later; a month without that day yields its last day (29 Feb → 28 Feb). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return fromParts(ny, nm, Math.min(d, lastDay));
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

export function formatCalendarDate(date: CalendarDate): string {
  const [y, m, d] = parts(date);
  return FORMAT.format(new Date(Date.UTC(y, m - 1, d)));
}

export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
