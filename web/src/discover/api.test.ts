import { describe, expect, it, vi } from "vitest";

const { httpsCallableMock } = vi.hoisted(() => ({
  httpsCallableMock: vi.fn((_functions: unknown, name: string) => async (data: unknown) => ({ data: { name, data } })),
}));
vi.mock("../firebase", () => ({ functions: { app: "fake" } }));
vi.mock("firebase/functions", () => ({ httpsCallable: httpsCallableMock }));

import { classifySearchError, searchDestination, searchNearby } from "./api";

const fnError = (code: string, details?: unknown) => Object.assign(new Error(code), { code, details });

describe("classifySearchError", () => {
  it("maps the callable codes to reasons", () => {
    expect(classifySearchError(fnError("functions/failed-precondition"), true)).toBe("off");
    expect(classifySearchError(fnError("functions/resource-exhausted", { reason: "dailyCap" }), true)).toBe("dailyCap");
    expect(classifySearchError(fnError("functions/resource-exhausted", { reason: "providerQuota" }), true)).toBe("providerQuota");
    expect(classifySearchError(fnError("functions/resource-exhausted"), true)).toBe("providerQuota");
    expect(classifySearchError(fnError("functions/unavailable"), true)).toBe("unavailable");
    expect(classifySearchError(fnError("functions/invalid-argument"), true)).toBe("invalid");
    expect(classifySearchError(fnError("functions/internal"), true)).toBe("unavailable");
    expect(classifySearchError(fnError("functions/permission-denied"), true)).toBe("unavailable");
  });

  it("reports a timeout abort as timeout", () => {
    expect(classifySearchError(new DOMException("x", "TimeoutError"), true)).toBe("timeout");
  });

  it("reports an unknown failure as offline when the browser is offline, otherwise unavailable", () => {
    expect(classifySearchError(new TypeError("Failed to fetch"), false)).toBe("offline");
    expect(classifySearchError(new TypeError("Failed to fetch"), true)).toBe("unavailable");
    expect(classifySearchError(undefined, true)).toBe("unavailable");
  });

  it("binds the two callables to their function names", async () => {
    await expect(searchDestination({ query: "x" })).resolves.toEqual({ name: "searchDestination", data: { query: "x" } });
    await expect(searchDestination({ query: "x", mode: "venue" })).resolves.toEqual({ name: "searchDestination", data: { query: "x", mode: "venue" } });
    await expect(searchNearby({ lat: 1, lng: 2 })).resolves.toEqual({ name: "searchNearby", data: { lat: 1, lng: 2 } });
  });
});
