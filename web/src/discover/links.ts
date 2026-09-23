/**
 * Google Maps URLs built from stored fields only (name + place id), so the record page and the
 * results list need nothing cached from Google (spec §3.6 "Links"). Maps URL scheme reference:
 * https://developers.google.com/maps/documentation/urls/get-started
 */
export function directionsUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}&destination_place_id=${encodeURIComponent(placeId)}`;
}

export function placeUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
}

/** A place page by id alone — for the form's link before the member has typed a name (Maps URL scheme: query is required with query_place_id, so use the place_id form instead). */
export function placeIdUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}
