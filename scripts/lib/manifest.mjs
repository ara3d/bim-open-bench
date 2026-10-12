// Reads models/manifest.json and applies the --only filter shared by both scripts.
import { readFileSync } from "node:fs";
import { manifestPath } from "./paths.mjs";

export const readManifest = () => JSON.parse(readFileSync(manifestPath, "utf8"));

/** The value after `--name`, or undefined. Exits with a message when the flag has no value. */
export function flagValue(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`${name} needs a value`);
    process.exit(2);
  }
  return value;
}

/** Models selected by `--only <id>`, or all. An unknown id is an error that lists the known ones. */
export function selectModels(manifest, argv) {
  const only = flagValue(argv, "--only");
  if (only === undefined) return manifest.models;
  const chosen = manifest.models.filter((m) => m.id === only);
  if (chosen.length === 0) {
    console.error(`unknown model "${only}"; known: ${manifest.models.map((m) => m.id).join(", ")}`);
    process.exit(2);
  }
  return chosen;
}
