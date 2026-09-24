# Plan 4 diagnostic evidence

Target: `42e80c5`. See the adjacent implementation audit for findings and independently run gates.

- `drafts.test.tsx.txt` imports the real components with mocked repository promises. Its three assertions intentionally fail on the audited code: stale visit base, lost composer text, lost edit text. The `.txt` suffix excludes these audit probes from the normal suite. `component-output.txt` is the actual output.
- The two `.mjs` browser probes use the real app at `127.0.0.1:5173`, local demo-safebite Auth/Firestore emulators, and synthetic fixture accounts. They assert the observed defects, so they exit successfully when those defects reproduce. No hosted service is called. The visit probe deletes its records; the password probe restores the fixture password in `finally`. `browser-output.txt` records both.
- `browser-stress-output.txt` records the separate repository browser gate: 114/114 passed with retries disabled. The passing repository suite and failing diagnostic assertions are different tests.

## Repeat on this checkout

Run from the repository root with dependencies installed. Do not run beside another emulator/browser suite: these probes share the emulator ports and fixture accounts.

```bash
cp planning/audits/plan-4-review-probes/safebite-plan4-*-probe.mjs /tmp/
cp planning/audits/plan-4-review-probes/safebite-plan4-run-probes.sh.txt /tmp/safebite-plan4-run-probes.sh
npm --prefix functions run build
./node_modules/.bin/firebase emulators:exec --only auth,firestore --project demo-safebite 'node functions/lib/seed-emulator.js && bash /tmp/safebite-plan4-run-probes.sh'
```

The component probe/config files retain the reviewed checkout's absolute paths. To repeat, copy them to `/tmp/safebite-plan4-records-audit/` without `.txt`, link that directory's `node_modules` to this checkout's `web/node_modules`, then run `node web/node_modules/vitest/vitest.mjs run --config /tmp/safebite-plan4-records-audit/vitest.config.mts`. Update the paths when using another worktree. Turn these diagnostic cases into normal regression tests as part of the fixes.
