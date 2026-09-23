import { HttpsError } from "firebase-functions/v2/https";
import { MAX_QUERY_LENGTH, type TextSearchMode } from "./types";

function asRecord(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Expected an object.");
  }
  return data as Record<string, unknown>;
}

/** Query: trimmed, 1–120 characters. Omitted mode preserves older clients' raw-query intent. */
export function parseDestinationInput(data: unknown): { query: string; mode: TextSearchMode } {
  const record = asRecord(data);
  const raw = record.query;
  if (typeof raw !== "string") throw new HttpsError("invalid-argument", "query must be a string.");
  const query = raw.trim();
  if (query.length === 0) throw new HttpsError("invalid-argument", "query must not be blank.");
  if (query.length > MAX_QUERY_LENGTH) throw new HttpsError("invalid-argument", `query must be at most ${MAX_QUERY_LENGTH} characters.`);
  const mode = record.mode === undefined ? "venue" : record.mode;
  if (mode !== "destination" && mode !== "venue") throw new HttpsError("invalid-argument", "mode must be destination or venue.");
  return { query, mode };
}

function finiteNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new HttpsError("invalid-argument", `${name} must be a number.`);
  if (value < min || value > max) throw new HttpsError("invalid-argument", `${name} must be between ${min} and ${max}.`);
  return value;
}

/** `{ lat, lng }`: finite numbers in range. */
export function parseNearbyInput(data: unknown): { lat: number; lng: number } {
  const record = asRecord(data);
  return { lat: finiteNumber(record.lat, "lat", -90, 90), lng: finiteNumber(record.lng, "lng", -180, 180) };
}
