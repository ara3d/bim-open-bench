// The side-by-side page: one model, one pane per viewer, each an iframe speaking the
// contract in tools/README.md. This page owns the layout, the model picker, the
// Load button, and one status line per pane. It reads nothing but
// ../models/manifest.json and the conversion records <id>.<ext>.json beside each file.
//
// Where the files come from: ../models/cache/ when the page is served from a checkout
// (scripts/serve.mjs); otherwise, on GitHub Pages, the release assets named by the
// manifest's `release.baseUrl`, which hold the same files under the same names.
//
// Query parameters:
//   ?model=<id>              preselect a model
//   &autoload=1              press Load once every pane is ready
//   &tools=thatopen,xeokit   show only these panes (default: all six)
//   &form=thatopen:frag      the form a pane loads, when it reads more than one
//
// scripts/view.mjs drives this page in headless Chrome and reads window.benchResults,
// so the demo and the automated suite measure through the same code.

const { panes: PANES } = await fetch("./panes.json").then((r) => r.json());

const main = document.getElementById("main");
const select = document.getElementById("model");
const loadButton = document.getElementById("load");
const copyButton = document.getElementById("copy");
const query = new URLSearchParams(location.search);

const ms = (t) => `${Math.round(t)} ms`;
const seconds = (s) => (s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`);
const kb = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`);

const wantedTools = query.get("tools")?.split(",").filter(Boolean);
const wantedForms = Object.fromEntries((query.get("form") ?? "").split(",").filter(Boolean).map((f) => f.split(":")));

function makePane(spec) {
  const el = document.createElement("section");
  el.className = "pane";
  el.dataset.tool = spec.tool;
  const formControl = spec.forms.length > 1
    ? `<select class="form-pick" title="The file form this viewer loads">${spec.forms.map((f) => `<option value="${f}">.${f}</option>`).join("")}</select>`
    : `<span class="form-pick">.${spec.forms[0]}</span>`;
  el.innerHTML = `
    <div class="line">
      <span class="name">${spec.title}</span>
      <span class="version">loading</span>
      ${formControl}
      <span class="form"></span>
      <span class="state">idle</span>
      <span class="num t"></span>
      <span class="num bytes"></span>
      <span class="message"></span>
    </div>
    <iframe title="${spec.title}" src="../tools/${spec.tool}/pane.html"></iframe>`;
  const pane = {
    ...spec, el, ready: false, version: "", states: [], model: "", form: spec.forms[0],
    iframe: el.querySelector("iframe"),
    fields: Object.fromEntries(["version", "form", "state", "t", "bytes", "message"].map((k) => [k, el.querySelector(`.${k}`)])),
  };
  const pick = el.querySelector("select.form-pick");
  if (pick) {
    if (spec.forms.includes(wantedForms[spec.tool])) pick.value = wantedForms[spec.tool];
    pane.form = pick.value;
    pick.addEventListener("change", () => { pane.form = pick.value; });
  }
  // A pane whose bundle was not built (tools/<name>/dist/ is git-ignored) loads its page and never says ready.
  pane.iframe.addEventListener("load", () => setTimeout(() => { if (!pane.ready) pane.fields.version.textContent = "no pane bundle on this host"; }, 4000));
  return pane;
}

const panes = PANES.filter((p) => !wantedTools || wantedTools.includes(p.tool)).map(makePane);
for (const p of panes) main.append(p.el);
main.dataset.count = panes.length;

// What the runner reads: one record per pane with every state message received.
window.benchResults = panes.map((p) => ({ tool: p.tool, version: "", model: "", form: p.form, states: p.states }));
const recordOf = (pane) => window.benchResults.find((r) => r.tool === pane.tool);

// The form each pane reads, with the ahead-of-time conversion time from its record.
async function describeForm(pane, modelId) {
  if (pane.form === "ifc") return "the IFC itself";
  try {
    const r = await fetch(`${fileUrl(modelId, pane.form)}.json`);
    if (!r.ok) return "(no conversion record)";
    const rec = await r.json();
    recordOf(pane).conversion = { tool: rec.tool, version: rec.version, seconds: rec.seconds, bytes: rec.bytes, sha256: rec.sha256 };
    return `by ${rec.tool}, converted ahead in ${seconds(rec.seconds)} (${kb(rec.bytes)})`;
  } catch {
    return "";
  }
}

window.addEventListener("message", (e) => {
  const pane = panes.find((p) => p.iframe.contentWindow === e.source);
  const m = e.data;
  if (!pane || !m || typeof m.type !== "string") return;
  if (m.type === "ready") {
    pane.ready = true;
    pane.version = m.version ?? "";
    recordOf(pane).version = pane.version;
    pane.fields.version.textContent = pane.version;
    pane.fields.state.textContent = "ready";
    maybeEnable();
  } else if (m.type === "state") {
    pane.states.push({ state: m.state, t: m.t, bytes: m.bytes, message: m.message, phases: m.phases });
    pane.el.dataset.state = m.state;
    pane.fields.state.textContent = m.state;
    pane.fields.t.textContent = ms(m.t);
    pane.fields.bytes.textContent = m.bytes == null ? "" : kb(m.bytes);
    pane.fields.message.textContent = m.message ?? "";
    if (m.phases) pane.fields.state.title = JSON.stringify(m.phases);
    copyButton.disabled = false;
  }
});

function maybeEnable() {
  loadButton.disabled = !(select.value && panes.some((p) => p.ready));
  if (query.get("autoload") && !loadButton.disabled && panes.every((p) => p.ready) && !maybeEnable.fired) {
    maybeEnable.fired = true;
    load();
  }
}

async function load() {
  const id = select.value;
  if (!id) return;
  const keep = ["autoload", "tools", "form"].filter((k) => query.has(k)).map((k) => `&${k}=${encodeURIComponent(query.get(k))}`).join("");
  history.replaceState(null, "", `?model=${encodeURIComponent(id)}${keep}`);
  for (const pane of panes) {
    pane.el.dataset.state = "";
    pane.states.length = 0;
    pane.model = id;
    Object.assign(recordOf(pane), { model: id, form: pane.form, conversion: undefined });
    pane.fields.state.textContent = pane.ready ? "sent" : "not ready";
    pane.fields.t.textContent = pane.fields.bytes.textContent = pane.fields.message.textContent = "";
    describeForm(pane, id).then((text) => { pane.fields.form.textContent = text; });
  }
  // One instant for every pane: the message is posted in one synchronous loop.
  for (const pane of panes) {
    if (pane.ready) pane.iframe.contentWindow.postMessage({ type: "load", model: id, url: new URL(fileUrl(id, pane.form), location.href).href }, "*");
  }
}

// A Markdown table of the last load, one row per pane, for a note or a paper.
export function resultsTable(results, modelTitle) {
  const at = (r, state) => { const s = r.states.find((x) => x.state === state); return s ? seconds(s.t / 1000) : ""; };
  const last = (r) => r.states.at(-1);
  const rows = results.map((r) => {
    const end = last(r);
    const outcome = !end ? "no answer" : end.state === "failed" ? `failed: ${end.message ?? ""}` : end.state;
    const conv = r.conversion ? `${seconds(r.conversion.seconds)} by ${r.conversion.tool}` : (r.form === "ifc" ? "none" : "");
    return `| ${r.tool} | ${r.version} | .${r.form} | ${conv} | ${at(r, "first-frame")} | ${at(r, "done")} | ${outcome} |`;
  });
  return [
    `Model: ${modelTitle}. Times are seconds from the Load click, in this browser on this machine.`,
    "",
    "| Viewer | Version | Form | Converted ahead | First frame | Done | Outcome |",
    "|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

copyButton.addEventListener("click", async () => {
  const text = resultsTable(window.benchResults, select.selectedOptions[0]?.textContent ?? select.value);
  await navigator.clipboard.writeText(text);
  copyButton.textContent = "Copied";
  setTimeout(() => { copyButton.textContent = "Copy table"; }, 1500);
});

loadButton.addEventListener("click", load);
select.addEventListener("change", maybeEnable);

const manifest = await fetch("../models/manifest.json").then((r) => r.json());
// Local cache when it is there, else the release assets; the note says which, so a slow load is explained.
const local = await fetch(`../models/cache/${manifest.models[0].id}.ifc`, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
const base = local ? "../models/cache" : manifest.release?.baseUrl;
function fileUrl(id, form) { return `${base}/${id}.${form}`; }
if (!local) document.getElementById("note").textContent = base
  ? `Models come from the release assets at ${base}, not a local cache, so fetch time includes the download.`
  : "No local model cache and no release assets named in the manifest: nothing can load here.";
for (const model of manifest.models) {
  const option = document.createElement("option");
  option.value = model.id;
  option.textContent = `${model.title} (${kb(model.bytes)} IFC)`;
  select.append(option);
}
const wanted = query.get("model");
if (wanted && manifest.models.some((m) => m.id === wanted)) select.value = wanted;
maybeEnable();
