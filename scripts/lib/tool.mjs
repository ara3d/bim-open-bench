// Downloads a pinned native tool from the manifest's `tools` table, verifies it, and unpacks it
// under models/cache/tools/<name>/<version>/. Returns the path of its executable.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { downloadVerified } from "./download.mjs";
import { toolsDir } from "./paths.mjs";

/**
 * Unzip with the system's bsdtar on Windows (System32\tar.exe, shipped since Windows 10: no
 * PowerShell quoting, no module load) and on macOS; Linux has no zip-capable tar, so `unzip`.
 * The Windows path is spelled out because Git Bash puts GNU tar first, which cannot read zip.
 */
function unzip(archive, destination) {
  if (process.platform === "win32") {
    const tar = join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe");
    execFileSync(tar, ["-xf", archive, "-C", destination], { stdio: "inherit" });
  } else if (process.platform === "darwin") {
    execFileSync("tar", ["-xf", archive, "-C", destination], { stdio: "inherit" });
  } else {
    execFileSync("unzip", ["-q", archive, "-d", destination], { stdio: "inherit" });
  }
}

/** The manifest's entry for this machine, or an error naming the platforms that are pinned. */
export function toolForThisMachine(manifest, name) {
  const tool = manifest.tools[name];
  const key = `${process.platform}-${process.arch}`;
  const build = tool.platforms[key];
  if (!build) throw new Error(`${name} ${tool.version} is not pinned for ${key}; pinned: ${Object.keys(tool.platforms).join(", ")}`);
  return { name, version: tool.version, ...build };
}

export async function ensureTool(manifest, name) {
  const tool = toolForThisMachine(manifest, name);
  const dir = join(toolsDir, name, tool.version);
  const executable = join(dir, tool.executable);
  if (existsSync(executable)) return { ...tool, path: executable };

  const archive = join(toolsDir, name, `${tool.version}.zip`);
  await downloadVerified(`${name} ${tool.version}`, tool.url, archive, tool);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  unzip(archive, dir);
  if (!existsSync(executable)) throw new Error(`${name}: ${tool.executable} not found in ${archive}`);
  if (process.platform !== "win32") chmodSync(executable, 0o755);
  return { ...tool, path: executable };
}
