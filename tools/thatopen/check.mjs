#!/usr/bin/env node
// Opens the That Open pane in headless Chrome and prints its status line.
//
//   node tools/thatopen/check.mjs [model-or-path] [--port 8772] [--timeout 600] [--verbose]
//
// `model-or-url` is a model id ("duplex") or a root-relative path ("models/cache/duplex.frag"; written without
// a leading slash because Git Bash on Windows rewrites arguments that start with one).
// The server must already run: node scripts/serve.mjs --port 8772. WebGL comes from SwiftShader
// (software), so times here are not the times of a machine with a GPU. The screenshot goes to
// results/thatopen/scratch/ (git-ignored). Exit code 0 when the pane reached `done`, 1 otherwise.
// Needs Node 22 (global WebSocket) and Chrome at its usual Windows or Linux path.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; };
const valued = new Set(["--port", "--timeout"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
const target = positional[0] ?? "duplex";
const port = option("port", "8772");
const verbose = argv.includes("--verbose");
const timeoutMs = Number(option("timeout", "600")) * 1000;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const chromePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
].find(existsSync);
if (!chromePath) { console.error("Chrome not found"); process.exit(2); }

const query = target.includes(".") ? `url=${encodeURIComponent("/" + target.replace(/^\/+/, ""))}` : `model=${encodeURIComponent(target)}`;
const pageUrl = `http://localhost:${port}/tools/thatopen/pane.html?${query}`;
const profile = mkdtempSync(join(tmpdir(), "thatopen-check-"));
const chrome = spawn(chromePath, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--window-size=1280,800", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist", "--no-first-run", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Chrome picks a free debugging port and writes it to <profile>/DevToolsActivePort, so a
// leftover Chrome from an earlier run can never answer in place of this one.
async function connect(url) {
  for (let i = 0; i < 150; i++) {
    try {
      const debugPort = readFileSync(join(profile, "DevToolsActivePort"), "utf8").trim().split(/\s+/)[0];
      const tab = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
      return new WebSocket(tab.webSocketDebuggerUrl);
    } catch { await sleep(200); }
  }
  throw new Error("Chrome did not open its debugging port");
}

let exitCode = 1;
try {
  const ws = await connect(pageUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let nextId = 1;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) return pending.get(m.id)(m);
    if (verbose && m.method === "Runtime.consoleAPICalled") console.log(`[${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description).join(" "));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolveCall) => {
    const id = nextId++;
    pending.set(id, resolveCall);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

  await send("Runtime.enable");
  await send("Page.enable");

  const started = Date.now();
  let state;
  while (Date.now() - started < timeoutMs) {
    state = await evaluate(`document.getElementById("status")?.dataset.state`);
    if (state === "done" || state === "failed") break;
    await sleep(500);
  }
  await sleep(1000); // let the last frames draw
  console.log(await evaluate(`document.getElementById("status")?.textContent`));
  const shotDir = join(root, "results/thatopen/scratch");
  mkdirSync(shotDir, { recursive: true });
  const shot = (await send("Page.captureScreenshot", { format: "png" })).result?.data;
  const name = target.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  if (shot) { writeFileSync(join(shotDir, `${name}.png`), Buffer.from(shot, "base64")); console.log(`screenshot results/thatopen/scratch/${name}.png`); }
  console.log(errors.length ? `console errors (${errors.length}):\n${errors.slice(0, 10).join("\n")}` : "console errors: none");
  exitCode = state === "done" ? 0 : 1;
  ws.close();
} finally {
  // Chrome starts child processes; on Windows only a tree kill stops them (and frees the debugging port).
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"]);
  else chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
}
process.exit(exitCode);
