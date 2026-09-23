// @vitest-environment node
// jsdom's global URL shadows Node's, and Node's fs rejects a jsdom URL instance ("must be of
// scheme file") even though .href is a valid file:// path — this test needs no DOM, so run it
// under the node environment instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAIM_KINDS, CLAIM_VALUES, SOURCE_TYPES } from "./types";
import { LIMITS } from "./validation";

// Smoke check only: a literal missing from the rules is caught here; real parity (which literal
// is accepted where, and the rejected ones) is proven by functions/test/rules.records.test.ts.
const rules = readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");

describe("firestore.rules mentions every TypeScript literal", () => {
  it.each([...CLAIM_KINDS, ...CLAIM_VALUES, ...SOURCE_TYPES])("'%s'", (literal) => {
    expect(rules).toContain(`'${literal}'`);
  });

  it("carries the same field limits as validation.ts", () => {
    expect(rules).toContain(`nonBlankString(data.name, ${LIMITS.name})`);
    expect(rules).toContain(`nonBlankString(data.address, ${LIMITS.address})`);
    expect(rules).toContain(`optionalString(data, 'phone', ${LIMITS.phone})`);
    expect(rules).toContain(`optionalHttpUrl(data, 'website', ${LIMITS.website})`);
    expect(rules).toContain(`optionalString(data, 'googlePlaceId', ${LIMITS.googlePlaceId})`);
    expect(rules).toContain(`data.detail.size() <= ${LIMITS.detail}`);
    expect(rules).toContain(`nonBlankString(s.label, ${LIMITS.sourceLabel})`);
    expect(rules).toContain(`optionalHttpUrl(s, 'url', ${LIMITS.sourceUrl})`);
  });
});
