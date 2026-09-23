import { describe, expect, it } from "vitest";
import type { ClaimInput } from "./types";
import { LIMITS, isHttpUrl, normaliseRestaurantInput, validateClaimInput, validateRestaurantInput } from "./validation";

// URL() repairs these spellings, but forms must require an explicit web address.
const MALFORMED_HTTP_URLS = [
  "https:example.test",
  "https:/example.test",
  "https:\\example.test",
  "https:/\\example.test",
  "https:\\\\example.test",
  "https:///example.test",
  "https://\\example.test",
];

describe("isHttpUrl", () => {
  it("accepts http(s) URLs and rejects everything else", () => {
    expect(isHttpUrl("https://coeliac.org.uk/venues/1")).toBe(true);
    expect(isHttpUrl("http://example.test")).toBe(true);
    expect(isHttpUrl("HTTPS://example.test/path?venue=1#details")).toBe(true);
    expect(isHttpUrl("ftp://example.test")).toBe(false);
    expect(isHttpUrl("example.test")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("normaliseRestaurantInput", () => {
  it("trims and drops blank optionals", () => {
    expect(normaliseRestaurantInput({ name: "  Da Marco ", address: " Via Roma 1 ", phone: "  ", website: "" })).toEqual({ name: "Da Marco", address: "Via Roma 1" });
    expect(normaliseRestaurantInput({ name: "A", address: "B", phone: " +39 1 ", website: " https://x.test " })).toEqual({ name: "A", address: "B", phone: "+39 1", website: "https://x.test" });
  });
  it("lowercases an upper-case http(s) scheme so the rules' case-sensitive check accepts it", () => {
    expect(normaliseRestaurantInput({ name: "A", address: "B", phone: "", website: " HTTPS://Damarco.IT " })).toEqual({ name: "A", address: "B", website: "https://Damarco.IT" });
  });
});

describe("validateRestaurantInput", () => {
  it("passes a minimal valid input", () => {
    expect(validateRestaurantInput({ name: "Da Marco", address: "Via Roma 1, Rome" })).toEqual({});
  });
  it("requires non-blank name and address", () => {
    expect(validateRestaurantInput({ name: "   ", address: "" })).toEqual({ name: "Enter the restaurant's name.", address: "Enter the address." });
  });
  it("enforces the length limits", () => {
    const errors = validateRestaurantInput({ name: "x".repeat(LIMITS.name + 1), address: "y".repeat(LIMITS.address + 1), phone: "1".repeat(LIMITS.phone + 1) });
    expect(errors.name).toContain(String(LIMITS.name));
    expect(errors.address).toContain(String(LIMITS.address));
    expect(errors.phone).toContain(String(LIMITS.phone));
  });
  it("requires a full http(s) website when given", () => {
    expect(validateRestaurantInput({ name: "A", address: "B", website: "damarco.it" }).website).toBe("Enter a full web address starting with http:// or https://.");
    expect(validateRestaurantInput({ name: "A", address: "B", website: "https://damarco.it" })).toEqual({});
  });
  it.each(MALFORMED_HTTP_URLS)("rejects repaired website spelling %s before writing", (website) => {
    const input = normaliseRestaurantInput({ name: "A", address: "B", phone: "", website });
    expect(validateRestaurantInput(input).website).toBe("Enter a full web address starting with http:// or https://.");
  });
});

describe("validateClaimInput", () => {
  const today = "2026-09-21";
  const base: ClaimInput = {
    kind: "separateFryer",
    value: "yes",
    detail: "Dedicated fryer for chips, confirmed by the manager.",
    source: { type: "restaurantStatement", label: "Phone call with the manager" },
    checkedAt: "2026-09-20",
  };

  it("passes a valid statement claim", () => expect(validateClaimInput(base, today)).toEqual({}));
  it("accepts today as the checked date and refuses tomorrow", () => {
    expect(validateClaimInput({ ...base, checkedAt: today }, today)).toEqual({});
    expect(validateClaimInput({ ...base, checkedAt: "2026-09-22" }, today).checkedAt).toBe("The checked date cannot be in the future.");
  });
  it("refuses a malformed checked date", () => {
    expect(validateClaimInput({ ...base, checkedAt: "21/09/2026" }, today).checkedAt).toBe("Enter the date you checked.");
  });
  it("requires the expiry date to follow the checked date", () => {
    expect(validateClaimInput({ ...base, expiresAt: "2026-09-20" }, today).expiresAt).toBe("The expiry date must be after the checked date.");
    expect(validateClaimInput({ ...base, expiresAt: "2027-09-20" }, today)).toEqual({});
  });
  it("URL policy: an accrediting body needs a link; the link must be http(s); the limit applies", () => {
    expect(validateClaimInput({ ...base, source: { type: "accreditingBody", label: "Coeliac UK" } }, today).sourceUrl).toBe("An accrediting body needs a link to its listing.");
    expect(validateClaimInput({ ...base, source: { type: "accreditingBody", label: "Coeliac UK", url: "coeliac.org.uk" } }, today).sourceUrl).toBe("Enter a full web address starting with http:// or https://.");
    expect(validateClaimInput({ ...base, source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/" + "a".repeat(LIMITS.sourceUrl) } }, today).sourceUrl).toContain(String(LIMITS.sourceUrl));
    expect(validateClaimInput({ ...base, source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/venues/1" } }, today)).toEqual({});
  });
  it("URL policy: accreditation must come from an accrediting body", () => {
    expect(validateClaimInput({ ...base, kind: "accreditation", source: { type: "thirdParty", label: "Blog", url: "https://blog.test" } }, today).sourceType).toBe("Accreditation must come from the accrediting body.");
    expect(validateClaimInput({ ...base, kind: "accreditation", source: { type: "accreditingBody", label: "AIC", url: "https://celiachia.it/x" } }, today)).toEqual({});
  });
  it.each(MALFORMED_HTTP_URLS)("rejects repaired claim-source spelling %s before writing", (url) => {
    expect(validateClaimInput({ ...base, source: { ...base.source, url } }, today).sourceUrl).toBe("Enter a full web address starting with http:// or https://.");
  });
  it("requires a non-blank source label and caps detail", () => {
    expect(validateClaimInput({ ...base, source: { type: "ownVisit", label: "  " } }, today).sourceLabel).toBe("Say where this information came from.");
    expect(validateClaimInput({ ...base, detail: "d".repeat(LIMITS.detail + 1) }, today).detail).toContain(String(LIMITS.detail));
    expect(validateClaimInput({ ...base, detail: "" }, today)).toEqual({});
  });
  it("rejects unknown kind, value and source type (defensive: the UI uses selects)", () => {
    const errors = validateClaimInput({ ...base, kind: "score" as never, value: "maybe" as never, source: { type: "rumour" as never, label: "x" } }, today);
    expect(errors.kind).toBeDefined();
    expect(errors.value).toBeDefined();
    expect(errors.sourceType).toBeDefined();
  });
});
