// Opens pane.html?model=<id> in headless Chrome (WebGL through SwiftShader), waits for `done` or
// `failed`, prints the status line, and saves a screenshot to checkout/screenshot-<id>.png.
//
//   node scripts/serve.mjs --port 8771            (in another terminal; the pane must be built)
//   node tools/bim-open-viewer/check.mjs [model ...] [--port 8771] [--timeout 600] [--url-suffix=...]
//
// Models default to duplex. A model id resolves to /models/cache/<id>.bos (see tools/README.md); a
// value ending .glb or .bos is passed as ?url=/models/cache/<value>. Exit code 1 if any model
// fails, logs a console error, or times out. Needs Chrome (set CHROME to its path if it is not in
// the usual place) and Node 22 (global WebSocket).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const port = Number(flag("--port", 8771));
const timeoutS = Number(flag("--timeout", 600));
const models = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (models.length === 0) models.push("duplex");

const chromePath = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find((p) => p && existsSync(p));
if (!chromePath) { console.error("Chrome not found; set CHROME"); process.exit(2); }
if (typeof WebSocket === "undefined") { console.error("needs Node 22 (global WebSocket)"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const debugPort = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "bench-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
  "--window-size=1280,800", "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });

async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
      return ws;
    } catch { await sleep(200); }
  }
  throw new Error("could not reach Chrome's DevTools port");
}

function session(ws, onEvent) {
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const { resolve, reject } = waiting.get(m.id); waiting.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    else if (m.method) onEvent(m);
  };
  return (method, params = {}) => new Promise((resolve, reject) => { waiting.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}

let failed = false;
try {
  const ws = await connect();
  const errors = [];
  const send = session(ws, (m) => {
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !String(m.params.entry.url).endsWith("favicon.ico")) errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ""}`);
  });
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
  mkdirSync(join(here, "checkout"), { recursive: true });

  for (const model of models) {
    errors.length = 0;
    const query = /\.(glb|bos)$/.test(model) ? `url=/models/cache/${model}` : `model=${model}`;
    const started = Date.now();
    await send("Page.navigate", { url: `http://localhost:${port}/tools/bim-open-viewer/pane.html?${query}` });
    let state = "";
    while ((Date.now() - started) / 1000 < timeoutS) {
      await sleep(250);
      state = (await evaluate(`document.getElementById("status")?.dataset.state ?? ""`)) ?? "";
      if (state === "done" || state === "failed") break;
    }
    const line = await evaluate(`document.getElementById("status")?.textContent ?? "(no status line)"`);
    await sleep(500); // let the canvas present before the picture is taken
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = join(here, "checkout", `screenshot-${model.replace(/[^\w.-]/g, "_")}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    const ok = state === "done" && errors.length === 0;
    if (!ok) failed = true;
    console.log(`${ok ? "ok    " : "FAILED"} ${model}: ${line}`);
    for (const e of errors) console.log(`  console error: ${e}`);
    if (state !== "done" && state !== "failed") console.log(`  timed out after ${timeoutS} s in state "${state}"`);
    console.log(`  screenshot ${file}`);
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold the profile */ }
}
process.exit(failed ? 1 : 0);
