import { compareCalendarDates, isCalendarDate } from "./dates";
import { CLAIM_KINDS, CLAIM_VALUES, SOURCE_TYPES, type CalendarDate, type ClaimInput, type RestaurantInput } from "./types";

/** Identical to the limits in firestore.rules (validRestaurant / validClaim / validSource). */
export const LIMITS = { name: 120, address: 300, phone: 40, website: 300, detail: 1000, sourceLabel: 200, sourceUrl: 500, googlePlaceId: 200 } as const;

export type FieldErrors<F extends string> = Partial<Record<F, string>>;
export type RestaurantField = "name" | "address" | "phone" | "website";
export type ClaimField = "kind" | "value" | "detail" | "sourceType" | "sourceLabel" | "sourceUrl" | "checkedAt" | "expiresAt";

const URL_MESSAGE = "Enter a full web address starting with http:// or https://.";

/** Stricter than the rules' `https?://.+` (a bare "http://" fails here); the rules are the floor. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface RawRestaurantForm {
  name: string;
  address: string;
  phone: string;
  website: string;
}

/** Form strings → write input: trimmed, blank optionals dropped (the rules refuse empty optionals). */
export function normaliseRestaurantInput(raw: RawRestaurantForm): RestaurantInput {
  const input: RestaurantInput = { name: raw.name.trim(), address: raw.address.trim() };
  const phone = raw.phone.trim();
  if (phone !== "") input.phone = phone;
  const website = raw.website.trim();
  if (website !== "") input.website = website;
  return input;
}

function tooLong(limit: number): string {
  return `Keep this to ${limit} characters.`;
}

export function validateRestaurantInput(input: RestaurantInput): FieldErrors<RestaurantField> {
  const errors: FieldErrors<RestaurantField> = {};
  if (input.name.trim() === "") errors.name = "Enter the restaurant's name.";
  else if (input.name.length > LIMITS.name) errors.name = tooLong(LIMITS.name);
  if (input.address.trim() === "") errors.address = "Enter the address.";
  else if (input.address.length > LIMITS.address) errors.address = tooLong(LIMITS.address);
  if (input.phone !== undefined && input.phone.length > LIMITS.phone) errors.phone = tooLong(LIMITS.phone);
  if (input.website !== undefined) {
    if (!isHttpUrl(input.website)) errors.website = URL_MESSAGE;
    else if (input.website.length > LIMITS.website) errors.website = tooLong(LIMITS.website);
  }
  return errors;
}

export function validateClaimInput(input: ClaimInput, today: CalendarDate): FieldErrors<ClaimField> {
  const errors: FieldErrors<ClaimField> = {};
  if (!(CLAIM_KINDS as readonly string[]).includes(input.kind)) errors.kind = "Choose what this evidence is about.";
  if (!(CLAIM_VALUES as readonly string[]).includes(input.value)) errors.value = "Choose yes, no or partly.";
  if (input.detail.length > LIMITS.detail) errors.detail = tooLong(LIMITS.detail);

  const { source } = input;
  if (!(SOURCE_TYPES as readonly string[]).includes(source.type)) errors.sourceType = "Choose where this information came from.";
  else if (input.kind === "accreditation" && source.type !== "accreditingBody") errors.sourceType = "Accreditation must come from the accrediting body.";
  if (source.label.trim() === "") errors.sourceLabel = "Say where this information came from.";
  else if (source.label.length > LIMITS.sourceLabel) errors.sourceLabel = tooLong(LIMITS.sourceLabel);
  if (source.type === "accreditingBody" && (source.url === undefined || source.url.trim() === "")) {
    errors.sourceUrl = "An accrediting body needs a link to its listing.";
  } else if (source.url !== undefined) {
    if (!isHttpUrl(source.url)) errors.sourceUrl = URL_MESSAGE;
    else if (source.url.length > LIMITS.sourceUrl) errors.sourceUrl = tooLong(LIMITS.sourceUrl);
  }

  if (!isCalendarDate(input.checkedAt)) errors.checkedAt = "Enter the date you checked.";
  else if (compareCalendarDates(input.checkedAt, today) > 0) errors.checkedAt = "The checked date cannot be in the future.";
  if (input.expiresAt !== undefined) {
    if (!isCalendarDate(input.expiresAt) || !isCalendarDate(input.checkedAt) || compareCalendarDates(input.expiresAt, input.checkedAt) <= 0) {
      errors.expiresAt = "The expiry date must be after the checked date.";
    }
  }
  return errors;
}
