// IFC to Fragments with That Open's IfcImporter (@thatopen/fragments), run in Node.
// Used by: That Open Engine, second timing (the pane reads .frag with the fragments manager).
//
// The importer's packages live in tools/thatopen/node_modules (node scripts/tools.mjs thatopen);
// this module does not import them, tools/thatopen/to-frag.mjs does, in its own process.
// Settings: IfcImporter's defaults, nothing added (README, "Rules for a fair comparison").
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tool = join(dirname(fileURLToPath(import.meta.url)), "../../tools/thatopen");

export const form = "frag";
export const extension = "frag";

/** @returns {Promise<{ tool: string, version: string, build: string }>} what to record next to the output */
export async function convert(manifest, input, output) {
  if (!existsSync(join(tool, "node_modules"))) throw new Error("tools/thatopen has no node_modules: run node scripts/tools.mjs thatopen");
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [join(tool, "to-frag.mjs"), input, output], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1 << 24,
    });
  } catch (error) {
    throw new Error(`to-frag failed on ${input}: ${error.stderr ?? error.message}`);
  }
  const version = stdout.match(/@thatopen\/fragments (\S+)/)?.[1] ?? "unknown";
  return { tool: "@thatopen/fragments IfcImporter", version, build: "" };
}
