// The Functions emulator spawns its runtime worker lazily on the first request; warm it up
// before any test's timeout budget starts so the Settings page's single `whoami` call only
// pays for a warm invocation. Mirrors functions/test/emulator-helpers.ts's warmUpFunctions().
const WHOAMI_URL = "http://127.0.0.1:5001/demo-safebite/europe-west2/whoami";
const MAX_ELAPSED_MS = 240_000;
const RETRY_DELAY_MS = 2_000;
const PER_REQUEST_MS = 90_000;

async function callWhoami(timeoutMs = PER_REQUEST_MS): Promise<void> {
  // Any HTTP response counts as "warm" -- a 401 (unauthenticated) is expected.
  const res = await fetch(WHOAMI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  await res.arrayBuffer();
}

// Clamps each attempt's own timeout to whatever remains of MAX_ELAPSED_MS, so a late attempt
// cannot itself overshoot the overall bound (checking elapsed time only after an attempt
// finishes would let a single PER_REQUEST_MS-long attempt push the total past MAX_ELAPSED_MS).
async function waitUntilReachable(): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  for (;;) {
    const remaining = MAX_ELAPSED_MS - (Date.now() - start);
    if (remaining <= 0) {
      throw new Error(`Functions emulator did not answer whoami within ${MAX_ELAPSED_MS} ms`, { cause: lastError });
    }
    try {
      await callWhoami(Math.min(PER_REQUEST_MS, remaining));
      return;
    } catch (err) {
      lastError = err;
      // Emulator worker not accepting connections yet (still spinning up / cold require in progress).
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export default async function globalSetup(): Promise<void> {
  await waitUntilReachable();
}
