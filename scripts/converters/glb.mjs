// IFC to GLB with IfcOpenShell's IfcConvert, the pinned release in models/manifest.json.
// Used by: Static glTF Viewer, and BIM Open Viewer's second timing.
//
// Settings: IfcConvert's defaults, nothing added (README, "Rules for a fair comparison").
// If a flag is ever needed, write it in `args` below with the reason beside it.
import { execFileSync } from "node:child_process";
import { ensureTool } from "../lib/tool.mjs";

const decode = (buffer) => (buffer ?? Buffer.alloc(0)).toString(buffer?.includes(0) ? "utf16le" : "utf8");

export const form = "glb";
export const extension = "glb";

/** @returns {Promise<{ tool: string, version: string, build: string }>} what to record next to the output */
export async function convert(manifest, input, output) {
  const ifcconvert = await ensureTool(manifest, "ifcconvert");
  const args = [input, output];
  // IfcConvert writes UTF-16 progress bars, thousands of characters per model. Keep the banner
  // (its first line names the build) and drop the rest; stderr is shown only if it fails.
  let stdout;
  try {
    stdout = execFileSync(ifcconvert.path, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
  } catch (error) {
    throw new Error(`IfcConvert failed on ${input}: ${decode(error.stderr)}${decode(error.stdout).slice(-500)}`);
  }
  const banner = decode(stdout).match(/IfcOpenShell IfcConvert [0-9A-Za-z.-]+/)?.[0] ?? "";
  return { tool: "IfcConvert", version: ifcconvert.version, build: banner };
}
