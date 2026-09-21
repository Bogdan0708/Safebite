/**
 * Restaurant records and evidence claims (spec §3.5). The constant lists here must match the
 * literals in firestore.rules — Task 7's emulator tests prove parity, rulesParity.test.ts trips
 * on drift. Never add a numerical score.
 */
export const CLAIM_KINDS = ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const CLAIM_KIND_LABELS: Record<ClaimKind, string> = {
  dedicatedKitchen: "Dedicated gluten-free kitchen",
  separateFryer: "Separate fryer",
  trainedStaff: "Trained staff",
  gfMenu: "Gluten-free menu",
  preparationPractice: "Preparation practices",
  accreditation: "Accreditation",
};

export const CLAIM_VALUES = ["yes", "no", "partial"] as const;
export type ClaimValue = (typeof CLAIM_VALUES)[number];
export const CLAIM_VALUE_LABELS: Record<ClaimValue, string> = { yes: "Yes", no: "No", partial: "Partly" };

export const SOURCE_TYPES = ["restaurantStatement", "accreditingBody", "ownVisit", "thirdParty"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  restaurantStatement: "The restaurant told us",
  accreditingBody: "Accrediting body",
  ownVisit: "Our own visit",
  thirdParty: "Third party",
};

/** A UTC calendar day, "YYYY-MM-DD". Stored as a Firestore timestamp at 00:00:00 UTC (dates.ts). */
export type CalendarDate = string;

/** Read model of households/{hid}/restaurants/{rid}. */
export interface Restaurant {
  id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  deleting: boolean;
}

/** What the restaurant form edits. Coordinates and place id are Plan 3's; the form never touches them. */
export interface RestaurantInput {
  name: string;
  address: string;
  phone?: string;
  website?: string;
}

export interface ClaimSource {
  type: SourceType;
  label: string;
  url?: string;
}

/** Read model of households/{hid}/restaurants/{rid}/claims/{cid}. Immutable once written. */
export interface Claim {
  id: string;
  kind: ClaimKind;
  value: ClaimValue;
  detail: string;
  source: ClaimSource;
  checkedAt: CalendarDate;
  expiresAt?: CalendarDate;
  authorUid: string;
  authorName: string;
  createdAt: Date;
}

export interface ClaimInput {
  kind: ClaimKind;
  value: ClaimValue;
  detail: string;
  source: ClaimSource;
  checkedAt: CalendarDate;
  expiresAt?: CalendarDate;
}

export interface Author {
  uid: string;
  displayName: string;
}
