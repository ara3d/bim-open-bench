// Shared by every pane page. The contract is in tools/README.md.
//
//   createPane({ tool, version, ext, load })
//
// `ext` is the file form this pane reads ("glb", "ifc", "bos", ...). `load` is
// called with { model, url, report } once per load, from a message of the
// parent page or, when the page is opened on its own, from ?model= / ?url=.
// `report(state, extra)` sends { type: "state", state, t, ...extra } to the
// parent and prints it in the status line.

// "?model=duplex" -> /models/cache/duplex.glb; "?url=..." is used as given.
export function resolveTarget(search, ext) {
  const q = new URLSearchParams(search);
  const url = q.get("url");
  const model = q.get("model") ?? (url ? url.split("/").pop().replace(/\.[^.]*$/, "") : undefined);
  if (url) return { model, url };
  if (model) return { model, url: `/models/cache/${model}.${ext}` };
  return undefined;
}

export function formatState(msg) {
  const bytes = msg.bytes == null ? "" : `  ${msg.bytes} bytes`;
  const text = msg.message ? `  ${msg.message}` : "";
  return `${msg.state}  ${Math.round(msg.t)} ms${bytes}${text}`;
}

export function createPane({ tool, version, ext, load, win = window }) {
  const doc = win.document;
  const embedded = win.parent && win.parent !== win;
  let line = doc.getElementById("status");
  // Inside the side-by-side page the parent shows its own line per pane, so the
  // pane's line would only repeat it and wrap in a narrow slot. Messages still go out.
  if (!line) {
    line = doc.createElement("div");
    line.id = "status";
    line.style.cssText = "font:12px monospace;padding:2px 6px;background:#222;color:#eee;white-space:pre";
    doc.body.prepend(line);
  }
  if (embedded) line.hidden = true;
  // The credit beside a pane's logo (a <span> in #logo naming the company): one rule for every pane.
  const credit = doc.createElement("style");
  credit.textContent = "#logo span { font: 600 12px system-ui, sans-serif; color: #7d8490; white-space: nowrap; }";
  doc.head.append(credit);
  let origin = win.performance.now();
  let current = { model: "", url: "" };
  let history = [];

  const post = (msg) => { if (win.parent && win.parent !== win) win.parent.postMessage(msg, "*"); };
  const report = (state, extra = {}) => {
    const msg = { type: "state", state, t: win.performance.now() - origin, ...extra };
    history.push(formatState(msg));
    line.textContent = `${tool} ${current.model}: ${history.join("  >  ")}`;
    line.dataset.state = state;
    post(msg);
    return msg;
  };
  const start = (model, url) => {
    origin = win.performance.now();
    current = { model, url };
    history = [];
    load({ model, url, report });
  };

  win.addEventListener("message", (e) => {
    const m = e.data;
    if (m && m.type === "load" && typeof m.url === "string") start(m.model ?? "", m.url);
  });
  post({ type: "ready", tool, version });
  line.textContent = `${tool} ${version}: ready`;

  const target = resolveTarget(win.location.search, ext);
  if (target) start(target.model, target.url);
}
