import type { CollectionState, Restaurant } from "./types";

export interface RecordRow {
  restaurant: Restaurant;
  state: CollectionState | null;
}

export type RecordFilter = "shortlist" | "all";

export function joinRecords(restaurants: Restaurant[], states: Record<string, CollectionState>): RecordRow[] {
  return restaurants.map((restaurant) => ({ restaurant, state: states[restaurant.id] ?? null }));
}

/** Deleting rows stay under both filters so an interrupted deletion can always be finished. */
export function filterRows(rows: RecordRow[], filter: RecordFilter): RecordRow[] {
  if (filter === "all") return rows;
  return rows.filter((row) => row.restaurant.deleting || row.state?.shortlisted === true);
}
