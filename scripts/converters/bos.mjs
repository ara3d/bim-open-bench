// IFC to BOS (a zip of Parquet tables, geometry included) with ifc-to-bos, the command line over
// the converter behind the toolkit's `ifc_to_bos` tool. It lives in ara3d/bim-open-data
// (tools/ifc-to-bos) and is built by `node scripts/tools.mjs ifc-to-bos` at the commit in
// tools/ifc-to-bos/tool.json. Used by: BIM Open Viewer, the Speckle fork.
//
// Settings: none; the tool takes an input and an output path.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { root } from "../lib/paths.mjs";

const exe = join(root, "tools", "ifc-to-bos", "checkout", "artifacts", "ifc-to-bos", "bin", "ifc-to-bos", "release", process.platform === "win32" ? "ifc-to-bos.exe" : "ifc-to-bos");

export const form = "bos";
export const extension = "bos";

/** @returns {Promise<{ tool: string, version: string, build: string }>} what to record next to the output */
export async function convert(manifest, input, output) {
  if (!existsSync(exe)) throw new Error(`${exe} is missing; run node scripts/tools.mjs ifc-to-bos`);
  let stdout;
  try {
    stdout = execFileSync(exe, [input, output], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26, encoding: "utf8" });
  } catch (error) {
    throw new Error(`ifc-to-bos failed on ${input}: ${error.stderr ?? ""}${error.stdout ?? ""}`.trim());
  }
  // First line: "ifc-to-bos <version>"; second: a JSON summary of the run.
  const banner = stdout.split(/\r?\n/)[0].trim();
  const version = banner.match(/^ifc-to-bos (\S+)/)?.[1];
  if (!version) throw new Error(`ifc-to-bos printed no version line: ${stdout.slice(0, 200)}`);
  return { tool: "ifc-to-bos", version, build: banner };
}
