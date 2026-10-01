import { describe, expect, it } from "vitest";
import { RECENT_AUTH_SECONDS, requireRecentAuth } from "../src/account/recentAuth";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const sec = (ms: number) => Math.floor(ms / 1000);
const refused = expect.objectContaining({ code: "failed-precondition", details: { reason: "recentLogin" } });

describe("requireRecentAuth", () => {
  it("accepts an authentication within the window", () => {
    expect(() => requireRecentAuth(sec(NOW) - 10, NOW)).not.toThrow();
    expect(() => requireRecentAuth(sec(NOW) - RECENT_AUTH_SECONDS, NOW)).not.toThrow();
  });
  it("refuses an authentication older than five minutes (a token minted earlier and refreshed)", () => {
    expect(() => requireRecentAuth(sec(NOW) - RECENT_AUTH_SECONDS - 1, NOW)).toThrow(refused);
  });
  it("tolerates small clock skew into the future but not a large one (Review Focus 3)", () => {
    expect(() => requireRecentAuth(sec(NOW) + 30, NOW)).not.toThrow();
    expect(() => requireRecentAuth(sec(NOW) + 600, NOW)).toThrow(refused);
  });
  it.each([undefined, null, "1790882382", Number.NaN, Number.POSITIVE_INFINITY])("refuses a missing or malformed auth_time %j", (value) => {
    expect(() => requireRecentAuth(value, NOW)).toThrow(refused);
  });
});
