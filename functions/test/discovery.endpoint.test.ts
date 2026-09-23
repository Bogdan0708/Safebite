import { describe, expect, it } from "vitest";
import { searchDestination, searchNearby } from "../src/discovery/callables";

/**
 * Imports the callables directly from ../src/discovery/callables — NOT from ../src/index — so this
 * test proves the region/maxInstances/secret are carried on the function's own definition rather than
 * depending on index.ts requiring this module after setGlobalOptions() runs (finding F1). No emulator
 * needed: __endpoint is a static property set at module load.
 */
type EndpointCarrier = { __endpoint: { region?: string[]; maxInstances?: number; secretEnvironmentVariables?: Array<{ key: string }> } };

describe.each([
  ["searchDestination", searchDestination],
  ["searchNearby", searchNearby],
] as const)("%s __endpoint", (_name, fn) => {
  const endpoint = (fn as unknown as EndpointCarrier).__endpoint;

  it("pins the region to europe-west2", () => {
    expect(endpoint.region).toEqual(["europe-west2"]);
  });

  it("pins maxInstances to 2 (the cost guardrail)", () => {
    expect(endpoint.maxInstances).toBe(2);
  });

  it("carries the PLACES_API_KEY secret", () => {
    expect(endpoint.secretEnvironmentVariables).toEqual([{ key: "PLACES_API_KEY" }]);
  });
});
