import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The source set whose contents a build depends on, for provenance stamping (audit F7): a dist
 * directory can exist yet be stale or built from another mode. The test scripts recompute this
 * hash and refuse to run against a dist whose stamp disagrees. package.json/lockfiles are
 * deliberately excluded (dependency upgrades are caught by CI's clean build, not by this stamp).
 */
export function sourceFilesFor(webRoot: string, mode: string): string[] {
  const files = [
    path.join(webRoot, "index.html"),
    path.join(webRoot, "vite.config.ts"),
    path.join(webRoot, `.env.${mode}`),
    ...walk(path.join(webRoot, "src")),
    ...walk(path.join(webRoot, "public")),
  ].filter((f) => exists(f));
  return files.sort((a, b) => path.relative(webRoot, a).localeCompare(path.relative(webRoot, b)));
}

export function computeSourceHash(webRoot: string, mode: string): string {
  const hash = createHash("sha256");
  for (const file of sourceFilesFor(webRoot, mode)) {
    hash.update(path.relative(webRoot, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export interface BuildStamp {
  mode: string;
  projectId: string;
  sourceHash: string;
  builtAt: string;
}

function walk(dir: string): string[] {
  if (!exists(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
