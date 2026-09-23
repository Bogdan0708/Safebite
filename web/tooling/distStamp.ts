import { readFileSync } from "node:fs";
import path from "node:path";
import { computeSourceHash, type BuildStamp } from "./sourceHash.ts";

/**
 * Refuses to test a dist that is missing, was built for another mode, or was built from
 * different sources than the working tree (audit F7). Called at module top level by the
 * Playwright configs, before any server starts. The message names the script to run.
 */
export function assertFreshDist(webRoot: string, outDir: string, mode: string): BuildStamp {
  const hint = `Run \`npm --prefix web run build:${mode}\` (or \`build:e2e\` for all three) and retry.`;
  const stampPath = path.join(webRoot, outDir, "safebite-build.json");
  let stamp: BuildStamp;
  try {
    stamp = JSON.parse(readFileSync(stampPath, "utf8")) as BuildStamp;
  } catch {
    throw new Error(`[safebite] ${outDir}/safebite-build.json is missing: no fresh ${mode} build to test. ${hint}`);
  }
  if (stamp.mode !== mode) {
    throw new Error(`[safebite] ${outDir} was built for mode "${stamp.mode}", expected "${mode}". ${hint}`);
  }
  const current = computeSourceHash(webRoot, mode);
  if (stamp.sourceHash !== current) {
    throw new Error(`[safebite] ${outDir} is stale: built from sources ${stamp.sourceHash.slice(0, 12)}…, working tree is ${current.slice(0, 12)}…. ${hint}`);
  }
  return stamp;
}
