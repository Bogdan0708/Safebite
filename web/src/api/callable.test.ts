/// <reference types="node" />
import { describe, expect, it, vi } from "vitest";

const { httpsCallableMock } = vi.hoisted(() => ({ httpsCallableMock: vi.fn() }));
vi.mock("../firebase", () => ({ functions: { app: "fake" } }));
vi.mock("firebase/functions", () => ({ httpsCallable: httpsCallableMock }));

import { abortable, callable, isAbortError } from "./callable";

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
