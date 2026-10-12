#!/usr/bin/env node
// Opens the Speckle pane in headless Chrome (WebGL through SwiftShader) and
// waits for `done` or `failed`. Dependency-free: it speaks the DevTools protocol
// over Node's global WebSocket (Node 22).
//
//   node scripts/serve.mjs --port 8775        (in another shell)
//   node tools/speckle/check.mjs [model ...] [--port 8775] [--timeout 300]
//
// Prints the pane's status line and phases, the console errors, and writes
// results/scratch/speckle-<model>.png (git-ignored). Exit code 1 on failure,
// on a console error, or on a screenshot with no model pixels.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : args[i + 1]; };
const port = Number(opt("port", 8775));
const timeoutS = Number(opt("timeout", 300));
const models = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (models.length === 0) models.push("duplex");

const CHROME = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"]
  .find((p) => p && existsSync(p));
if (!CHROME) { console.error("Chrome not found; set CHROME"); process.exit(2); }

const debugPort = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "speckle-check-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
  "--window-size=1200,800", "--no-first-run", "about:blank",
], { stdio: "ignore" });

async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = tabs.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 1;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/favicon/.test(m.params.entry.url ?? "")) consoleErrors.push(`${m.params.entry.text} ${m.params.entry.url ?? ""}`);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");

mkdirSync(join(root, "results", "scratch"), { recursive: true });
let failed = false;
for (const model of models) {
  consoleErrors.length = 0;
  const url = `http://localhost:${port}/tools/speckle/pane.html?model=${model}`;
  await send("Page.navigate", { url });
  const started = Date.now();
  let state;
  while (Date.now() - started < timeoutS * 1000) {
    await new Promise((r) => setTimeout(r, 500));
    state = await evaluate(`document.getElementById("status")?.dataset.state ?? ""`);
    if (state === "done" || state === "failed") break;
  }
  const line = await evaluate(`document.getElementById("status")?.textContent ?? ""`);
  const phases = await evaluate(`document.body.dataset.phases ?? ""`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const png = join(root, "results", "scratch", `speckle-${model}.png`);
  writeFileSync(png, Buffer.from(shot.data, "base64"));
  // The model is visible when the canvas holds more than one distinct colour.
  const varied = await evaluate(`(() => { const c = document.querySelector("#viewer canvas"); if (!c) return false;
    const t = document.createElement("canvas"); t.width = 64; t.height = 64; const g = t.getContext("2d");
    g.drawImage(c, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(d[i] + "," + d[i+1] + "," + d[i+2]); return seen.size > 8; })()`);
  console.log(line);
  if (phases) console.log(`phases ${phases}`);
  console.log(`${model}: state ${state}, canvas varied ${varied}, console errors ${consoleErrors.length}, screenshot ${png}`);
  for (const e of consoleErrors) console.log(`  error: ${e}`);
  if (state !== "done" || consoleErrors.length > 0 || !varied) failed = true;
}
ws.close();
chrome.kill();
process.exit(failed ? 1 : 0);
