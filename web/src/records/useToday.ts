import { useEffect, useState } from "react";
import { localToday, msUntilNextLocalMidnight } from "./dates";
import type { CalendarDate } from "./types";

/** The device's local calendar day; refreshed when the tab becomes visible and at local midnight. */
export function useToday(): CalendarDate {
  const [today, setToday] = useState<CalendarDate>(() => localToday());
  useEffect(() => {
    const refresh = () => setToday(localToday());
    let timer = window.setTimeout(function tick() {
      refresh();
      timer = window.setTimeout(tick, msUntilNextLocalMidnight(new Date()));
    }, msUntilNextLocalMidnight(new Date()));
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
