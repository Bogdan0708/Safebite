// Copies functions/.secret.local.example to functions/.secret.local when the latter is missing,
// so every emulator run selects the fixture places provider. Never overwrites an existing file:
// a developer's real local key survives.
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "functions", ".secret.local");
const example = path.join(root, "functions", ".secret.local.example");

if (existsSync(target)) {
  console.log("[safebite] functions/.secret.local present; leaving it alone.");
} else {
  copyFileSync(example, target);
  console.log("[safebite] functions/.secret.local created from .secret.local.example (PLACES_API_KEY=fixture).");
}
