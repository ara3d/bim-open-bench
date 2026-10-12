// Opens the xeokit pane in headless Chrome and prints its status line.
//
//   node tools/xeokit/check.mjs [--model duplex | --url /models/cache/duplex.xkt]
//        [--base http://localhost:8773] [--timeout 600] [--shot results/scratch/xeokit-duplex.png]
//
// Needs a running `node scripts/serve.mjs --port 8773` and Chrome (--chrome, the CHROME_EXE environment variable, or the default
// Windows install path). No packages: it speaks the DevTools protocol over Node's WebSocket
// (Node 22 or later). Exits 0 when the pane reaches `done` with no console errors, 1 otherwise.
// WebGL runs on SwiftShader (software), so frame times here are not a GPU's.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const base = flag("--base", "http://localhost:8773");
const model = flag("--model", flag("--url") ? undefined : "duplex");
const url = flag("--url");
const timeoutS = Number(flag("--timeout", "600"));
const label = model ?? url.split("/").pop();
const shot = resolve(flag("--shot", `results/scratch/xeokit-${label}.png`));
const chrome = flag("--chrome", process.env.CHROME_EXE) ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 9300 + Math.floor(Math.random() * 500);
const query = model ? `model=${encodeURIComponent(model)}` : `url=${encodeURIComponent(url)}`;
const pageUrl = `${base}/tools/xeokit/pane.html?${query}`;

const profile = mkdtempSync(join(tmpdir(), "xeokit-check-"));
const proc = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1280,800",
  "--no-first-run", "--disable-extensions", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return new WebSocket(page.webSocketDebuggerUrl);
    } catch { /* Chrome is still starting */ }
    await sleep(200);
  }
  throw new Error("Chrome did not open its DevTools port");
}

const errors = [];
let exitCode = 1;
try {
  const ws = await connect();
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let nextId = 0;
  const waiting = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ""}`.trim());
  });
  // A page whose main thread is busy (a long parse) answers late; give each call a limit so the loop below keeps its deadline.
  const send = (method, params = {}, limitMs = 10_000) => new Promise((resolveCall) => {
    const id = ++nextId;
    waiting.set(id, resolveCall);
    setTimeout(() => { if (waiting.delete(id)) resolveCall({}); }, limitMs);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  const nav = await send("Page.navigate", { url: pageUrl });
  if (nav.result?.errorText) throw new Error(`navigation to ${pageUrl} failed: ${nav.result.errorText}`);

  const deadline = Date.now() + timeoutS * 1000;
  let state;
  while (Date.now() < deadline) {
    await sleep(500);
    state = await evaluate(`document.getElementById("status")?.dataset.state`);
    if (state === "done" || state === "failed") break;
  }
  const line = await evaluate(`document.getElementById("status")?.textContent`);
  console.log(line ?? `no status line (page: ${await evaluate("location.href + \" \" + document.readyState")})`);
  const png = await send("Page.captureScreenshot", { format: "png" }, 60_000);
  if (png.result) {
    mkdirSync(dirname(shot), { recursive: true });
    writeFileSync(shot, Buffer.from(png.result.data, "base64"));
    console.log(`screenshot ${shot}`);
  } else console.log("no screenshot: the page did not answer");
  for (const e of errors) console.log(`console error: ${e}`);
  exitCode = state === "done" && errors.length === 0 ? 0 : 1;
  if (state !== "done" && state !== "failed") console.log(`timed out after ${timeoutS} s`);
  ws.close();
} catch (error) {
  console.log(`check failed: ${error.message}`);
} finally {
  proc.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files; the temp folder is disposable */ }
}
process.exit(exitCode);
