/// <reference types="node" />
import { describe, expect, it, vi } from "vitest";

const { httpsCallableMock } = vi.hoisted(() => ({ httpsCallableMock: vi.fn() }));
vi.mock("../firebase", () => ({ functions: { app: "fake" } }));
vi.mock("firebase/functions", () => ({ httpsCallable: httpsCallableMock }));

import { abortable, anySignal, callable, isAbortError, isTimeoutError } from "./callable";

describe("callable", () => {
  it("unwraps the callable result's data", async () => {
    httpsCallableMock.mockReturnValue(async (data: unknown) => ({ data: { echo: data } }));
    const echo = callable<{ n: number }, { echo: { n: number } }>("echo");
    await expect(echo({ n: 1 })).resolves.toEqual({ echo: { n: 1 } });
    expect(httpsCallableMock).toHaveBeenCalledWith({ app: "fake" }, "echo");
  });
});

describe("abortable", () => {
  it("resolves with the promise's value when the signal never fires", async () => {
    const controller = new AbortController();
    await expect(abortable(Promise.resolve(42), controller.signal)).resolves.toBe(42);
  });

  it("rejects with an AbortError when the signal fires first", async () => {
    const controller = new AbortController();
    const never = new Promise<number>(() => {});
    const pending = abortable(never, controller.signal);
    controller.abort();
    await expect(pending).rejects.toSatisfy(isAbortError);
  });

  it("rejects immediately for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortable(Promise.resolve(1), controller.signal)).rejects.toSatisfy(isAbortError);
  });

  it("does not report the underlying failure after abort", async () => {
    const controller = new AbortController();
    let fail!: (err: Error) => void;
    const failing = new Promise<number>((_, reject) => (fail = reject));
    const pending = abortable(failing, controller.signal);
    controller.abort();
    fail(new Error("late network failure"));
    await expect(pending).rejects.toSatisfy(isAbortError);
  });

  it("drains a promise that rejects after an already-aborted signal", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const controller = new AbortController();
      controller.abort();
      let fail!: (err: Error) => void;
      const failing = new Promise<number>((_, reject) => (fail = reject));
      const pending = abortable(failing, controller.signal);
      fail(new Error("late network failure"));
      await expect(pending).rejects.toSatisfy(isAbortError);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("isAbortError", () => {
  it("recognises only AbortError", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe("abortable — reasons", () => {
  it("rejects with the signal's own reason when one was given", async () => {
    const controller = new AbortController();
    const reason = new Error("superseded by a newer search");
    const pending = abortable(new Promise<number>(() => {}), controller.signal);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  it("rejects with a TimeoutError when the signal came from AbortSignal.timeout", async () => {
    const pending = abortable(new Promise<number>(() => {}), AbortSignal.timeout(20));
    await expect(pending).rejects.toSatisfy(isTimeoutError);
    await expect(pending).rejects.not.toSatisfy(isAbortError);
  });
});

describe("anySignal", () => {
  it("aborts with the reason of whichever source fires first", async () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = anySignal(a.signal, b.signal);
    expect(combined.aborted).toBe(false);
    const reason = new Error("b first");
    b.abort(reason);
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe(reason);
    a.abort(new Error("too late"));
    expect(combined.reason).toBe(reason);
  });

  it("is already aborted when any source already is", () => {
    const a = new AbortController();
    a.abort(new Error("early"));
    const combined = anySignal(new AbortController().signal, a.signal);
    expect(combined.aborted).toBe(true);
    expect((combined.reason as Error).message).toBe("early");
  });

  it("carries a TimeoutError through from AbortSignal.timeout", async () => {
    const combined = anySignal(new AbortController().signal, AbortSignal.timeout(20));
    await new Promise((r) => setTimeout(r, 60));
    expect(combined.aborted).toBe(true);
    expect(isTimeoutError(combined.reason)).toBe(true);
  });
});

describe("isTimeoutError", () => {
  it("recognises only TimeoutError", () => {
    expect(isTimeoutError(new DOMException("x", "TimeoutError"))).toBe(true);
    expect(isTimeoutError(new DOMException("x", "AbortError"))).toBe(false);
    expect(isTimeoutError(new Error("x"))).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
  });
});
