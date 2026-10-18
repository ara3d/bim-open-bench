#!/usr/bin/env node
// The `view` suite: opens each viewer pane on each model in headless Chrome, records the
// states it reports (fetching, parsing, first-frame, done, failed) with their times, and
// writes one result file. It drives site/side-by-side.html with one pane at a time, so the
// demo page and the suite measure through the same code.
//
//   node scripts/view.mjs                              every pane, every model, every form
//   node scripts/view.mjs --tool thatopen --model duplex --form frag
//   node scripts/view.mjs --software                   WebGL and WebGPU on SwiftShader (CPU), not the GPU
//   node scripts/view.mjs --timeout 600                seconds per load before it counts as a timeout
//   node scripts/view.mjs --out results/view/<file>.json
//   node scripts/view.mjs --report                     rewrite results/view/README.md from the newest result file
//
// Each load gets a fresh Chrome with a throwaway profile. The result file holds the machine,
// the browser, the GPU as WebGL and WebGPU report it, and one record per load; a rerun into
// the same file replaces the records with the same tool, model, form and renderer. A screenshot
// of each load goes to results/view/scratch/ (git-ignored). No dependencies; Node 22 or later
// (global WebSocket) and Chrome at its usual path (or --chrome <path>).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { flagValue, readManifest } from "./lib/manifest.mjs";
import { cacheDir, root } from "./lib/paths.mjs";
import { startServer } from "./serve.mjs";

const argv = process.argv.slice(2);
const resultsDir = join(root, "results", "view");
const panes = JSON.parse(readFileSync(join(root, "site", "panes.json"), "utf8")).panes;

if (argv.includes("--report")) {
  writeReport();
  process.exit(0);
}

const manifest = readManifest();
const onlyTool = flagValue(argv, "--tool");
const onlyModel = flagValue(argv, "--model");
const onlyForm = flagValue(argv, "--form");
const software = argv.includes("--software");
const timeoutMs = Number(flagValue(argv, "--timeout") ?? 600) * 1000;
const date = new Date().toISOString().slice(0, 10);
const outPath = resolve(flagValue(argv, "--out") ?? join(resultsDir, `${date}.json`));
const chromePath = flagValue(argv, "--chrome") ?? process.env.CHROME ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
if (!chromePath) { console.error("Chrome not found; pass --chrome <path> or set CHROME"); process.exit(2); }

const unknown = (what, value, known) => { console.error(`unknown ${what} "${value}"; known: ${known.join(", ")}`); process.exit(2); };
if (onlyTool && !panes.some((p) => p.tool === onlyTool)) unknown("tool", onlyTool, panes.map((p) => p.tool));
if (onlyModel && !manifest.models.some((m) => m.id === onlyModel)) unknown("model", onlyModel, manifest.models.map((m) => m.id));

const loads = [];
for (const pane of panes.filter((p) => !onlyTool || p.tool === onlyTool))
  for (const form of pane.forms.filter((f) => !onlyForm || f === onlyForm))
    for (const model of manifest.models.filter((m) => !onlyModel || m.id === onlyModel))
      loads.push({ pane, form, model });
if (loads.length === 0) { console.error("nothing to run"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One headless Chrome with a DevTools session on a fresh tab at `url`.
async function openChrome(url) {
  const profile = mkdtempSync(join(tmpdir(), "bench-view-"));
  const flags = [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1280,800",
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu",
  ];
  if (software) flags.push("--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-webgpu-adapter=swiftshader");
  const proc = spawn(chromePath, [...flags, "about:blank"], { stdio: "ignore" });
  // Chrome picks a free port and writes it to the profile, so no other Chrome can answer for it.
  let ws;
  for (let i = 0; i < 150 && !ws; i++) {
    try {
      const debugPort = readFileSync(join(profile, "DevToolsActivePort"), "utf8").trim().split(/\s+/)[0];
      const tab = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
      ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((ok, fail) => { ws.addEventListener("open", ok); ws.addEventListener("error", fail); });
    } catch { ws = undefined; await sleep(200); }
  }
  if (!ws) throw new Error("Chrome did not open its debugging port");

  let nextId = 1;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((ok) => { const id = nextId++; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Runtime.enable");
  await send("Page.enable");
  const close = async () => {
    ws.close();
    // Chrome starts child processes; on Windows only a tree kill stops them.
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else proc.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
  };
  return { send, evaluate, errors, close };
}

// What the page's own WebGL and WebGPU say about the device that draws the panes.
const GPU_PROBE = `(async () => {
  const out = {};
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    out.webgl = gl ? { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) } : null;
  } catch (e) { out.webgl = { error: String(e) }; }
  try {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    const i = adapter?.info;
    out.webgpu = adapter ? { vendor: i?.vendor, architecture: i?.architecture, device: i?.device, description: i?.description } : null;
  } catch (e) { out.webgpu = { error: String(e) }; }
  return out;
})()`;

const bytesOf = (model, form) => {
  if (form === "ifc") return { bytes: model.bytes, sha256: model.sha256 };
  const record = join(cacheDir, `${model.id}.${form}.json`);
  if (!existsSync(record)) return undefined;
  const r = JSON.parse(readFileSync(record, "utf8"));
  return { bytes: r.bytes, sha256: r.sha256, conversion: { tool: r.tool, version: r.version, seconds: r.seconds } };
};

async function runOne(base, { pane, form, model }) {
  const file = bytesOf(model, form);
  const label = `${pane.tool.padEnd(16)} ${model.id.padEnd(15)} .${form.padEnd(5)}`;
  if (!file) { console.log(`${label} skipped: models/cache/${model.id}.${form} has no conversion record (run node scripts/convert.mjs)`); return undefined; }
  const url = `${base}/site/side-by-side.html?model=${model.id}&tools=${pane.tool}&form=${pane.tool}:${form}&autoload=1`;
  const chrome = await openChrome(url);
  const at = new Date().toISOString();
  try {
    const started = Date.now();
    let result;
    while (Date.now() - started < timeoutMs) {
      result = await chrome.evaluate(`window.benchResults && JSON.parse(JSON.stringify(window.benchResults[0]))`);
      const last = result?.states?.at(-1);
      if (last && (last.state === "done" || last.state === "failed")) break;
      await sleep(250);
    }
    await sleep(1000); // let the last frame draw before the screenshot
    const gpu = await chrome.evaluate(GPU_PROBE);
    const browser = (await chrome.send("Browser.getVersion")).result;
    const shot = (await chrome.send("Page.captureScreenshot", { format: "png" })).result?.data;
    const shotDir = join(resultsDir, "scratch");
    mkdirSync(shotDir, { recursive: true });
    if (shot) writeFileSync(join(shotDir, `${pane.tool}-${model.id}.${form}.png`), Buffer.from(shot, "base64"));

    const states = result?.states ?? [];
    const last = states.at(-1);
    const outcome = last?.state === "done" ? "done" : last?.state === "failed" ? "failed" : "timeout";
    const ms = (state) => { const s = states.find((x) => x.state === state); return s ? Math.round(s.t) : undefined; };
    const record = {
      tool: pane.tool, version: result?.version ?? "", model: model.id, modelSha256: model.sha256, form,
      fileBytes: file.bytes, fileSha256: file.sha256, conversion: file.conversion,
      renderer: software ? "software" : "hardware", gpu, browser: browser?.product,
      outcome, message: last?.state === "failed" ? last.message : outcome === "timeout" ? `no done or failed within ${timeoutMs / 1000} s` : undefined,
      parsingMs: ms("parsing"), firstFrameMs: ms("first-frame"), doneMs: ms("done"),
      states, consoleErrors: chrome.errors.slice(0, 10), at,
    };
    const summary = outcome === "done" ? `first frame ${record.firstFrameMs} ms, done ${record.doneMs} ms` : `${outcome}: ${record.message ?? ""}`;
    console.log(`${label} ${summary}${chrome.errors.length ? `  (${chrome.errors.length} console errors)` : ""}`);
    return record;
  } finally {
    await chrome.close();
  }
}

function machineInfo() {
  const cpu = cpus();
  return { platform: `${platform()} ${release()}`, cpu: cpu[0]?.model.trim(), cores: cpu.length, memoryGb: Math.round(totalmem() / 2 ** 30), node: process.version };
}

const server = await startServer(Number(flagValue(argv, "--port") ?? 0));
const base = `http://localhost:${server.address().port}`;
const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { suite: "view", runs: [] };
const same = (a, b) => a.tool === b.tool && a.model === b.model && a.form === b.form && a.renderer === b.renderer;
let failures = 0;
try {
  console.log(`${loads.length} loads, ${software ? "software rendering (SwiftShader)" : "hardware rendering"}, timeout ${timeoutMs / 1000} s each, Chrome ${chromePath}`);
  for (const load of loads) {
    const record = await runOne(base, load);
    if (!record) continue;
    if (record.outcome !== "done") failures++;
    existing.runs = [...existing.runs.filter((r) => !same(r, record)), record];
    existing.machine = machineInfo();
    existing.browser = record.browser;
    existing.updated = record.at;
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(existing, null, 2) + "\n");
  }
} finally {
  server.close();
}
console.log(`wrote ${outPath}`);
writeReport();
process.exit(failures ? 1 : 0);

// results/view/README.md: the newest result file as tables, one per model.
function writeReport() {
  const files = existsSync(resultsDir) ? readdirSync(resultsDir).filter((f) => /^\d{4}-\d{2}-\d{2}.*\.json$/.test(f)).sort() : [];
  if (files.length === 0) { console.error("no result files in results/view/"); return; }
  const file = files.at(-1);
  const data = JSON.parse(readFileSync(join(resultsDir, file), "utf8"));
  const manifest = readManifest();
  const titleOf = (id) => manifest.models.find((m) => m.id === id)?.title ?? id;
  const s = (ms) => (ms == null ? "" : ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
  const mb = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`);
  const gpus = [...new Set(data.runs.map((r) => `${r.renderer}: WebGL "${r.gpu?.webgl?.renderer ?? "none"}", WebGPU ${r.gpu?.webgpu ? `"${r.gpu.webgpu.description || r.gpu.webgpu.architecture || r.gpu.webgpu.vendor}"` : "none"}`))];
  const lines = [
    "# View suite results",
    "",
    `Generated by \`node scripts/view.mjs --report\` from \`${file}\`; do not edit. Last load ${data.updated?.slice(0, 16).replace("T", " ")} UTC.`,
    "",
    `Machine: ${data.machine?.cpu}, ${data.machine?.cores} logical cores, ${data.machine?.memoryGb} GB, ${data.machine?.platform}. Browser: ${data.browser}, headless, 1280 by 800.`,
    ...gpus.map((g) => `Rendering, ${g}.`),
    "",
    "Times are milliseconds from the Load message to the state the pane reported, shown in seconds. \"Converted ahead\" is the time the form the pane reads took to make from the IFC (`node scripts/convert.mjs`); a pane that reads the IFC itself converts nothing ahead. Each pane's README under `tools/` says which states it observes and which it infers. A fresh Chrome serves every load, so the first load of a pane includes nothing from an earlier one.",
    "",
  ];
  for (const model of manifest.models) {
    const runs = data.runs.filter((r) => r.model === model.id).sort((a, b) => a.tool.localeCompare(b.tool) || a.form.localeCompare(b.form) || a.renderer.localeCompare(b.renderer));
    if (runs.length === 0) continue;
    lines.push(`## ${titleOf(model.id)} (${mb(model.bytes)} IFC)`, "");
    const renderers = new Set(runs.map((r) => r.renderer));
    const rendererColumn = renderers.size > 1;
    lines.push(`| Viewer | Version | Form | File | Converted ahead | ${rendererColumn ? "Rendering | " : ""}Parsing from | First frame | Done | Outcome |`);
    lines.push(`|---|---|---|---|---|${rendererColumn ? "---|" : ""}---|---|---|---|`);
    for (const r of runs) {
      const conv = r.conversion ? `${s(r.conversion.seconds * 1000)} by ${r.conversion.tool} ${r.conversion.version}` : "none";
      const outcome = r.outcome === "done" ? "done" : `${r.outcome}${r.message ? `: ${r.message}` : ""}`;
      lines.push(`| ${r.tool} | ${r.version} | .${r.form} | ${mb(r.fileBytes)} | ${conv} | ${rendererColumn ? `${r.renderer} | ` : ""}${s(r.parsingMs)} | ${s(r.firstFrameMs)} | ${s(r.doneMs)} | ${outcome} |`);
    }
    lines.push("");
  }
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, "README.md"), lines.join("\n"));
  writeFileSync(join(resultsDir, "index.html"), htmlOf(lines));
  console.log(`wrote ${join(resultsDir, "README.md")} and index.html`);
}

// The same report as a page, for GitHub Pages, which does not render Markdown: headings, paragraphs, tables, inline code.
function htmlOf(lines) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>");
  const body = [];
  let table = [];
  const flush = () => {
    if (table.length === 0) return;
    const rows = table.filter((r) => !/^\|[-| ]+\|$/.test(r)).map((r) => r.slice(1, -1).split("|").map((c) => c.trim()));
    body.push("<table>", `<tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`, ...rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`), "</table>");
    table = [];
  };
  for (const line of lines) {
    if (line.startsWith("|")) { table.push(line); continue; }
    flush();
    if (line.startsWith("# ")) body.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith("## ")) body.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.trim()) body.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>View suite results</title>
<style>
  :root { --text: #171a1f; --dim: #5a606c; --bg: #f4f5f7; --surface: #fff; --border: #e3e6ea; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --text: #e8e9ec; --dim: #9aa0ab; --bg: #141518; --surface: #1d1f24; --border: #2c2f36; } }
  :root[data-theme="dark"] { --text: #e8e9ec; --dim: #9aa0ab; --bg: #141518; --surface: #1d1f24; --border: #2c2f36; }
  body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; } h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 28px; }
  p { max-width: 80ch; } code { font: 12px "Fira Code", Consolas, monospace; }
  table { border-collapse: collapse; background: var(--surface); display: block; overflow-x: auto; }
  th, td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; white-space: nowrap; font-size: 13px; }
  th { color: var(--dim); font-weight: 600; }
</style></head><body><main>
<p><a href="../../site/index.html">BIM Open Bench</a></p>
${body.join("\n")}
</main></body></html>
`;
}
