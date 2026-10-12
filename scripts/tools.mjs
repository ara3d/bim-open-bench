#!/usr/bin/env node
// Clones and builds the third-party tools the panes wrap.
//
//   node scripts/tools.mjs [name]            clone at the pin and build (all tools, or one)
//   node scripts/tools.mjs [name] --check    print each checkout's commit against its pin
//
// Each tools/<name>/tool.json holds { repo, commit, build, pane }. `repo` may be a
// git URL or a local path; the checkout goes to tools/<name>/checkout/ (git-ignored)
// and `build` runs there in a shell. A pane that needs its own bundle (an npm-based
// viewer) sets `pane`, a command run in tools/<name>/ itself after the checkout
// build, writing tools/<name>/dist/ (git-ignored). `repo`, `commit` and `build` are
// optional for a tool that is only npm packages plus a `pane` command.
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
  if (!check && spec.repo) {
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
  if (!check && spec.pane) {
    console.log(`pane   ${name}: ${spec.pane}`);
    execSync(spec.pane, { cwd: dir, stdio: "inherit" });
  }
  if (!spec.repo) { console.log(`${name.padEnd(14)} (npm packages only)`); continue; }
  const commit = commitOf(checkout);
  const state = !commit ? "missing" : commit === spec.commit ? "matches pin" : `pin is ${spec.commit.slice(0, 7)}`;
  if (state !== "matches pin") bad = true;
  console.log(`${name.padEnd(14)} ${commit ?? "-".repeat(40)}  ${state}`);
}
if (bad) process.exitCode = 1;
