#!/usr/bin/env node
// Opens the IFClite pane in Chrome over the DevTools protocol, waits for `done`
// or `failed`, prints the status line, and saves a screenshot. No dependencies;
// needs Node 22 (global WebSocket) and a running `node scripts/serve.mjs --port 8774`.
//
//   node tools/ifclite/check.mjs [model] [--port 8774] [--headed] [--flag=<chrome flag>]...
//        [--out <png>] [--timeout <seconds>] [--chrome <path>]
//
// Chrome starts headless (--headless=new) with a throwaway profile; --headed shows a
// window, which is closed at the end. The screenshot goes to the system temp folder
// unless --out says otherwise. Exit code 0 only if the pane reached `done` with no
// console errors.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const model = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.match(/^--(port|out|timeout|chrome)$/)) ?? "duplex";
const port = opt("port", "8774");
const headed = argv.includes("--headed");
const flags = argv.filter((a) => a.startsWith("--flag=")).map((a) => a.slice(7));
const timeoutMs = Number(opt("timeout", "300")) * 1000;
const out = opt("out", join(tmpdir(), `ifclite-${model}.png`));
const chromePath = opt("chrome", "C:/Program Files/Google/Chrome/Application/chrome.exe");
const debugPort = 9300 + Math.floor(Math.random() * 500);

if (typeof WebSocket === "undefined") { console.error("needs Node 22 or later (global WebSocket)"); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), "ifclite-chrome-"));
const chrome = spawn(chromePath, [
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1280,900",
  ...(headed ? [] : ["--headless=new"]), ...flags, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, failures = [];
try {
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      target = tabs.find((t) => t.type === "page");
    } catch { await sleep(200); }
  }
  if (!target) throw new Error("Chrome did not start");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("devtools socket failed")); });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") failures.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") failures.push("console.error: " + m.params.args.map((a) => a.value ?? a.description).join(" "));
    else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") failures.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
  };
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const url = `http://localhost:${port}/tools/ifclite/pane.html?model=${encodeURIComponent(model)}`;
  console.log(`opening ${url}${flags.length ? "  flags: " + flags.join(" ") : ""}${headed ? "  (headed)" : ""}`);
  await send("Page.navigate", { url });

  const start = Date.now();
  let state = "";
  while (Date.now() - start < timeoutMs) {
    await sleep(500);
    state = await evaluate("document.getElementById('status')?.dataset.state ?? ''");
    if (state === "done" || state === "failed") break;
  }
  await sleep(500);
  console.log(await evaluate("document.getElementById('status')?.textContent"));
  console.log(`wall ${((Date.now() - start) / 1000).toFixed(1)} s, final state: ${state || "(none, timed out)"}`);
  console.log(`WebGPU in page: ${await evaluate("typeof navigator.gpu !== 'undefined'")}, crossOriginIsolated: ${await evaluate("crossOriginIsolated")}`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log(`screenshot ${out}`);
  failures = [...new Set(failures)];
  for (const f of failures) console.log(`ERROR ${f.split("\n")[0]}`);
  process.exitCode = state === "done" && failures.length === 0 ? 0 : 1;
} catch (e) {
  console.error(e.message); process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
