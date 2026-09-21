/**
 * Synthetic build fixtures. `vite build --mode <fixture>` loads `web/.env.<fixture>`, but Vite lets
 * an already-exported `VITE_*` variable outrank the mode file (audit F7, reproduced). The config
 * therefore compares what Vite resolved against the file itself and refuses the build on any
 * difference, so a test bundle can never quietly carry a real project's values.
 * Pure: no filesystem or environment access here; vite.config.ts supplies both sides.
 */
export const FIXTURE_MODES = ["preview", "preview-v2", "boot-guard"] as const;
export type FixtureMode = (typeof FIXTURE_MODES)[number];

export function isFixtureMode(mode: string): mode is FixtureMode {
  return (FIXTURE_MODES as readonly string[]).includes(mode);
}

/** Minimal `.env` parser: `KEY=VALUE` per line, `#` comments, blank lines, optional matching quotes. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** One message per fixture key whose resolved value is missing or different. Empty means hermetic. */
export function fixtureMismatches(fixture: Record<string, string>, resolved: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [key, expected] of Object.entries(fixture)) {
    const actual = resolved[key];
    if (actual !== expected) {
      const shown = actual === undefined ? "<unset>" : JSON.stringify(actual);
      problems.push(`${key} resolved to ${shown} but the fixture says ${JSON.stringify(expected)}`);
    }
  }
  return problems;
}
