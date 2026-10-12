// Pane for IFClite (@ifc-lite/renderer + @ifc-lite/geometry), bundled by Vite
// into dist/pane.js. The calls follow the packages' READMEs. See README.md here.
import { Renderer } from "@ifc-lite/renderer";
import { GeometryProcessor } from "@ifc-lite/geometry";
import { createPane } from "../pane.mjs";

const canvas = document.getElementById("view");
const version = __IFCLITE_VERSIONS__; // set by vite.config.js from the installed packages
let gpu; // { renderer, geometry }, made on the first load and reused
let run = 0; // a second load message supersedes the first

function size() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}

// Orbit with the left button, pan with the right, zoom with the wheel.
function wireControls(renderer) {
  const camera = renderer.getCamera();
  let drag;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button !== 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", () => { drag = undefined; });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) camera.pan(dx, dy); else camera.orbit(dx, dy);
    renderer.requestRender();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    camera.zoom(e.deltaY, false, e.offsetX, e.offsetY, canvas.clientWidth, canvas.clientHeight);
    renderer.requestRender();
  }, { passive: false });
  new ResizeObserver(() => {
    const dpr = window.devicePixelRatio || 1;
    renderer.resize(Math.floor(canvas.clientWidth * dpr), Math.floor(canvas.clientHeight * dpr));
    renderer.requestRender();
  }).observe(canvas);
}

async function ensureGpu() {
  if (gpu) return gpu;
  size();
  const renderer = new Renderer(canvas);
  const geometry = new GeometryProcessor();
  await Promise.all([renderer.init(), geometry.init()]);
  wireControls(renderer);
  // The package leaves the frame loop to the host: requestRender() only sets a flag
  // (peekRenderRequest / consumeRenderRequest), and render() draws one frame.
  const loop = () => {
    if (renderer.consumeRenderRequest()) {
      renderer.render();
      for (const resolve of waiting.splice(0)) resolve();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__ifclite = { renderer, geometry }; // for check.mjs and debugging
  return (gpu = { renderer, geometry });
}

const waiting = [];
// Resolves after the frame loop has drawn once more.
const drawn = (renderer) => new Promise((resolve) => { waiting.push(resolve); renderer.requestRender(); });

async function load({ url, report }) {
  const mine = ++run;
  try {
    report("fetching");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    report("parsing", { bytes: bytes.byteLength });
    const { renderer, geometry } = await ensureGpu();
    let first = true;
    for await (const event of geometry.processAdaptive(bytes)) {
      if (mine !== run) return;
      if (event.type !== "batch" || event.meshes.length === 0) continue;
      const upload = renderer.addMeshes(event.meshes, true);
      if (upload && upload.ok === false) throw new Error(`GPU upload failed: ${upload.reason ?? "unknown"}`);
      if (first) {
        first = false;
        renderer.fitToView();
        await drawn(renderer);
        report("first-frame", { bytes: bytes.byteLength });
      }
    }
    if (mine !== run) return;
    if (first) throw new Error("the file produced no geometry");
    renderer.fitToView();
    await drawn(renderer);
    report("done", { bytes: bytes.byteLength });
  } catch (e) {
    report("failed", { message: String(e?.message ?? e) });
  }
}

createPane({ tool: "ifclite", version, ext: "ifc", load });
