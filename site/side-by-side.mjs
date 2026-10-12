// The side-by-side page: one model, six viewer panes, each an iframe speaking the
// contract in tools/README.md. This page owns the layout, the model picker, the
// Load button, and one status line per pane. It reads nothing but
// /models/manifest.json and the conversion records /models/cache/<id>.<ext>.json.
//
// ?model=<id> preselects a model; &autoload=1 presses Load once every pane is ready.

const PANES = [
  { tool: "bim-open-viewer", title: "BIM Open Viewer", ext: "bos", side: "left" },
  { tool: "ifclite", title: "IFClite", ext: "ifc", side: "right" },
  { tool: "speckle", title: "Speckle viewer (offline fork)", ext: "bos", side: "right" },
  { tool: "thatopen", title: "That Open Engine", ext: "ifc", side: "right" },
  { tool: "xeokit", title: "xeokit", ext: "ifc", side: "right" },
  { tool: "static-gltf", title: "Static glTF Viewer", ext: "glb", side: "right" },
];

const main = document.getElementById("main");
const select = document.getElementById("model");
const loadButton = document.getElementById("load");
const query = new URLSearchParams(location.search);

const ms = (t) => `${Math.round(t)} ms`;
const seconds = (s) => (s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`);
const kb = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`);

function makePane(spec) {
  const el = document.createElement("section");
  el.className = "pane";
  el.dataset.tool = spec.tool;
  el.innerHTML = `
    <div class="line">
      <span class="name">${spec.title}</span>
      <span class="version">loading</span>
      <span class="form">.${spec.ext}</span>
      <span class="state">idle</span>
      <span class="num t"></span>
      <span class="num bytes"></span>
      <span class="message"></span>
    </div>
    <iframe title="${spec.title}" src="/tools/${spec.tool}/pane.html"></iframe>`;
  const pane = {
    ...spec, el, ready: false, version: "",
    iframe: el.querySelector("iframe"),
    fields: Object.fromEntries(["version", "form", "state", "t", "bytes", "message"].map((k) => [k, el.querySelector(`.${k}`)])),
  };
  pane.iframe.addEventListener("load", () => { if (!pane.ready) pane.fields.version.textContent = "ready?"; });
  return pane;
}

const panes = PANES.map(makePane);
const left = panes.filter((p) => p.side === "left");
const right = document.createElement("div");
right.className = "right";
for (const p of left) main.append(p.el);
for (const p of panes.filter((p) => p.side === "right")) right.append(p.el);
main.append(right);

// The form each pane reads, with the ahead-of-time conversion time from its record.
async function describeForm(pane, modelId) {
  if (pane.ext === "ifc") return "the IFC itself";
  try {
    const r = await fetch(`/models/cache/${modelId}.${pane.ext}.json`);
    if (!r.ok) return `.${pane.ext} (no record)`;
    const rec = await r.json();
    return `.${pane.ext} by ${rec.tool}, converted ahead in ${seconds(rec.seconds)} (${kb(rec.bytes)})`;
  } catch {
    return `.${pane.ext}`;
  }
}

window.addEventListener("message", (e) => {
  const pane = panes.find((p) => p.iframe.contentWindow === e.source);
  const m = e.data;
  if (!pane || !m || typeof m.type !== "string") return;
  if (m.type === "ready") {
    pane.ready = true;
    pane.version = m.version ?? "";
    pane.fields.version.textContent = pane.version;
    pane.fields.state.textContent = "ready";
    maybeEnable();
  } else if (m.type === "state") {
    pane.el.dataset.state = m.state;
    pane.fields.state.textContent = m.state;
    pane.fields.t.textContent = ms(m.t);
    pane.fields.bytes.textContent = m.bytes == null ? "" : kb(m.bytes);
    pane.fields.message.textContent = m.message ?? "";
    if (m.phases) pane.fields.state.title = JSON.stringify(m.phases);
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
  history.replaceState(null, "", `?model=${encodeURIComponent(id)}${query.get("autoload") ? "&autoload=1" : ""}`);
  for (const pane of panes) {
    pane.el.dataset.state = "";
    pane.fields.state.textContent = pane.ready ? "sent" : "not ready";
    pane.fields.t.textContent = pane.fields.bytes.textContent = pane.fields.message.textContent = "";
    describeForm(pane, id).then((text) => { pane.fields.form.textContent = text; });
  }
  // One instant for every pane: the message is posted in one synchronous loop.
  for (const pane of panes) {
    if (pane.ready) pane.iframe.contentWindow.postMessage({ type: "load", model: id, url: `/models/cache/${id}.${pane.ext}` }, "*");
  }
}

loadButton.addEventListener("click", load);
select.addEventListener("change", maybeEnable);

const manifest = await fetch("/models/manifest.json").then((r) => r.json());
for (const model of manifest.models) {
  const option = document.createElement("option");
  option.value = model.id;
  option.textContent = `${model.title} (${kb(model.bytes)} IFC)`;
  select.append(option);
}
const wanted = query.get("model");
if (wanted && manifest.models.some((m) => m.id === wanted)) select.value = wanted;
maybeEnable();
