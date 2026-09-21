// The Functions emulator spawns its runtime worker lazily on the first request, and
// that worker's cold require() of functions/lib + firebase-admin can take well over a
// minute on a Windows-mounted path (WSL's /mnt/c). Warm it up here, before any test's
// 30s timeout budget starts, so the Settings-page `whoami` call in auth.spec.ts only
// ever pays for a warm invocation. Mirrors functions/test/emulator-helpers.ts's
// warmUpFunctions().
//
// One extra wrinkle found while running this suite: React 19 StrictMode (see
// web/src/main.tsx) double-invokes SettingsPage's effect on mount in dev, firing two
// near-simultaneous `whoami` calls. `whoami` allows maxInstances: 2 (functions/src/index.ts),
// and the emulator can route the second, concurrent call to a second instance that still
// has to cold-require the module -- even though a single warm-up call above already warmed
// instance #1. Observed: 13-14.5s for that second-instance cold start, enough to blow past
// even a generous single-digit-second assertion timeout. So we fire two concurrent
// warm-up calls (after the initial one confirms the emulator is reachable at all) to make
// the emulator spin up both instances before any test starts.
const WHOAMI_URL = "http://127.0.0.1:5001/demo-safebite/europe-west2/whoami";
const MAX_ELAPSED_MS = 240_000;
const RETRY_DELAY_MS = 2_000;
const PER_REQUEST_MS = 90_000;

function callWhoami(timeoutMs = PER_REQUEST_MS): Promise<Response> {
  // Any HTTP response counts as "warm" -- a 401 (unauthenticated) is expected.
  return fetch(WHOAMI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// Clamps each attempt's own timeout to whatever remains of MAX_ELAPSED_MS, so a late attempt
// cannot itself overshoot the overall bound (checking elapsed time only after an attempt
// finishes would let a single PER_REQUEST_MS-long attempt push the total past MAX_ELAPSED_MS).
async function waitUntilReachable(): Promise<void> {
  const start = Date.now();
  for (;;) {
    const remaining = MAX_ELAPSED_MS - (Date.now() - start);
    if (remaining <= 0) {
      throw new Error(`Functions emulator did not answer whoami within ${MAX_ELAPSED_MS} ms`);
    }
    try {
      await callWhoami(Math.min(PER_REQUEST_MS, remaining));
      return;
    } catch {
      // Emulator worker not accepting connections yet (still spinning up / cold require in progress).
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export default async function globalSetup(): Promise<void> {
  await waitUntilReachable();
  // Warm a second, concurrent instance so StrictMode's double-fetch never hits a cold one.
  try {
    await Promise.all([callWhoami(), callWhoami()]);
  } catch (err) {
    throw new Error(`Second warm-up request failed or exceeded ${PER_REQUEST_MS} ms: ${String(err)}`);
  }
}
