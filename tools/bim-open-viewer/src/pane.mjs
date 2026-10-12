// Pane for BIM Open Viewer. The viewer is used as a library: createViewer on a canvas, then
// viewer.open(url), whose loaders report fetch and parse progress. See README.md here.
import { createViewer } from "@bim-open-viewer/viewer";
import { REVISION } from "three";
import { createPane } from "../../pane.mjs";

const stage = document.getElementById("stage");

async function version() {
  try {
    const pin = await (await fetch("tool.json")).json();
    return `${pin.commit.slice(0, 7)}, three r${REVISION}`;
  } catch {
    return `unknown, three r${REVISION}`;
  }
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const describe = (diagnostics) => diagnostics.map((d) => d.message).join("; ") || "load failed";

// What this pane holds between loads, so a second load starts clean.
let current;
function release() {
  current?.abort.abort();
  current?.viewer.dispose();
  current?.canvas.remove();
  current = undefined;
}

async function load({ url, report }) {
  release();
  const canvas = document.createElement("canvas");
  stage.append(canvas);
  const viewer = createViewer(canvas);
  const abort = new AbortController();
  const mine = { canvas, viewer, abort };
  current = mine;
  const stale = () => current !== mine;

  report("fetching");
  const problem = viewer.diagnostics().find((d) => d.severity === "error");
  if (problem) return report("failed", { message: problem.message });

  let bytes;
  let parsing = false;
  const onProgress = ({ phase, loaded }) => {
    if (stale()) return;
    if (phase === "fetch") { bytes = loaded; return; }
    // The first event after the fetch phase means the bytes are in hand and parsing has begun.
    if (!parsing) { parsing = true; report("parsing", { bytes }); }
  };

  try {
    const opened = await viewer.open(new URL(url, location.href).href, { onProgress, signal: abort.signal });
    if (stale()) return;
    if (!opened.ok) return report("failed", { message: describe(opened.diagnostics) });
    if (!parsing) report("parsing", { bytes });
    // viewer.open has bound the model and fitted the camera. Its frame loop draws on the next
    // animation frame, ahead of this callback, which was queued after it.
    await nextFrame();
    if (stale()) return;
    report("first-frame", { bytes });
    report("done", { bytes });
  } catch (error) {
    if (!stale()) report("failed", { message: String(error?.message ?? error) });
  }
}


createPane({ tool: "bim-open-viewer", version: await version(), ext: "bos", load });
