import { describe, expect, it, vi } from "vitest";
import { POSITION_TIMEOUT_MS, requestPosition } from "./geolocation";

function geo(impl: (ok: PositionCallback, err: PositionErrorCallback, options?: PositionOptions) => void): Geolocation {
  return { getCurrentPosition: vi.fn(impl), watchPosition: vi.fn(), clearWatch: vi.fn() } as unknown as Geolocation;
}

describe("requestPosition", () => {
  it("resolves the coordinates and asks once, low accuracy, with a 10 s timeout", async () => {
    const g = geo((ok, _err) => ok({ coords: { latitude: 51.5, longitude: -0.12 } } as GeolocationPosition));
    await expect(requestPosition(g)).resolves.toEqual({ kind: "position", lat: 51.5, lng: -0.12 });
    expect(g.getCurrentPosition).toHaveBeenCalledTimes(1);
    const options = (g.getCurrentPosition as ReturnType<typeof vi.fn>).mock.calls[0]![2] as PositionOptions;
    expect(options).toEqual({ enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 });
  });

  it("maps PERMISSION_DENIED to locationDenied", async () => {
    const g = geo((_ok, err) => err({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    await expect(requestPosition(g)).resolves.toEqual({ kind: "error", reason: "locationDenied" });
  });

  it.each([2, 3])("maps error code %s to locationUnavailable", async (code) => {
    const g = geo((_ok, err) => err({ code, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    await expect(requestPosition(g)).resolves.toEqual({ kind: "error", reason: "locationUnavailable" });
  });

  it("reports locationUnavailable when the browser has no geolocation", async () => {
    await expect(requestPosition(undefined)).resolves.toEqual({ kind: "error", reason: "locationUnavailable" });
  });
});
