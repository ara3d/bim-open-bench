// IFC to XKT with xeokit's convert2xkt (@xeokit/xeokit-convert), run by tools/xeokit/to-xkt.mjs.
// Used by: xeokit, second timing (XKTLoaderPlugin).
//
// Settings: convert2xkt's defaults, nothing added (README, "Rules for a fair comparison").
// This module does not import the converter package: tools/xeokit holds it, installed by
// `node scripts/tools.mjs xeokit`, and runs in its own process.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../tools/xeokit");

export const form = "xkt";
export const extension = "xkt";

/** @returns {Promise<{ tool: string, version: string, build: string }>} what to record next to the output */
export async function convert(manifest, input, output) {
  if (!existsSync(join(toolDir, "node_modules/@xeokit/xeokit-convert"))) {
    throw new Error("xeokit's packages are not installed; run: node scripts/tools.mjs xeokit");
  }
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [join(toolDir, "to-xkt.mjs"), input, output], {
      // web-ifc reads its wasm from the working directory (see to-xkt.mjs).
      cwd: join(toolDir, "node_modules/web-ifc"),
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    throw new Error(`to-xkt failed on ${input}: ${error.stderr ?? error.message}`);
  }
  const version = stdout.trim().split(/\s+/).pop();
  return { tool: "@xeokit/xeokit-convert convert2xkt", version, build: "" };
}
