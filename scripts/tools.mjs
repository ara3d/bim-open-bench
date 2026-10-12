#!/usr/bin/env node
// Clones and builds the third-party tools the panes wrap.
//
//   node scripts/tools.mjs [name]            clone at the pin and build (all tools, or one)
//   node scripts/tools.mjs [name] --check    print each checkout's commit against its pin
//
// Each tools/<name>/tool.json holds { repo, commit, build }. The checkout goes
// to tools/<name>/checkout/ (git-ignored); `build` runs there in a shell.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const only = args.find((a) => !a.startsWith("--"));

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const commitOf = (dir) => { try { return git(dir, "rev-parse", "HEAD"); } catch { return undefined; } };

const toolsDir = join(root, "tools");
const names = readdirSync(toolsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(toolsDir, d.name, "tool.json")))
  .map((d) => d.name)
  .filter((n) => !only || n === only);
if (only && names.length === 0) { console.error(`no tools/${only}/tool.json`); process.exit(2); }

let bad = false;
for (const name of names) {
  const dir = join(toolsDir, name);
  const spec = JSON.parse(readFileSync(join(dir, "tool.json"), "utf8"));
  const checkout = join(dir, "checkout");
  if (!check) {
    if (!existsSync(checkout)) {
      console.log(`clone  ${name} <- ${spec.repo}`);
      execFileSync("git", ["clone", "--quiet", spec.repo, checkout], { stdio: "inherit" });
    }
    if (commitOf(checkout) !== spec.commit) {
      try { git(checkout, "checkout", "--quiet", spec.commit); }
      catch { git(checkout, "fetch", "--quiet", "origin", spec.commit); git(checkout, "checkout", "--quiet", spec.commit); }
    }
    console.log(`build  ${name}: ${spec.build}`);
    execSync(spec.build, { cwd: checkout, stdio: "inherit" });
  }
  const commit = commitOf(checkout);
  const state = !commit ? "missing" : commit === spec.commit ? "matches pin" : `pin is ${spec.commit.slice(0, 7)}`;
  if (state !== "matches pin") bad = true;
  console.log(`${name.padEnd(14)} ${commit ?? "-".repeat(40)}  ${state}`);
}
if (bad) process.exitCode = 1;
