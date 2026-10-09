import { describe, expect, it } from "vitest";
import { checkAccountDeletion, deleteAccount, exportHousehold } from "../src/account/callables";

/** Static __endpoint options carried on each account callable's own definition (spec §3.6). */
type EndpointCarrier = { __endpoint: { region?: string[]; maxInstances?: number; timeoutSeconds?: number; concurrency?: number } };
const endpointOf = (fn: unknown) => (fn as EndpointCarrier).__endpoint;

describe.each([
  ["deleteAccount", deleteAccount],
  ["checkAccountDeletion", checkAccountDeletion],
  ["exportHousehold", exportHousehold],
] as const)("%s __endpoint", (_name, fn) => {
  it("pins region, maxInstances and timeout", () => {
    expect(endpointOf(fn)).toMatchObject({ region: ["europe-west2"], maxInstances: 2, timeoutSeconds: 60 });
  });
});

describe("checkAccountDeletion, unauthenticated by design (final review F6)", () => {
  it("serves one request per instance, so at most two run at once", () => {
    expect(endpointOf(checkAccountDeletion).concurrency).toBe(1);
  });
});
