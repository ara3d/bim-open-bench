// Pane for the Speckle viewer fork (bim-open-web-viewer). Reads a .bos file:
// @bim-open-web-viewer/bos decodes the Parquet tables, the core's
// InstancedModelLoader builds the world tree and render tree, and the viewer
// batches and draws. See README.md here.
import { createPane } from "../../pane.mjs";
import {
  Viewer,
  DefaultViewerParams,
  CameraController,
  InstancedModelLoader,
  LoaderEvent,
} from "@bim-open-web-viewer/viewer";
import { readBos } from "@bim-open-web-viewer/bos";

const POLL_MS = 10;
const container = document.getElementById("viewer");

let viewerPromise;
const getViewer = () => (viewerPromise ??= (async () => {
  const viewer = new Viewer(container, { ...DefaultViewerParams, verbose: false, showStats: false });
  await viewer.init();
  const camera = viewer.createExtension(CameraController);
  return { viewer, camera };
})());

async function version() {
  try {
    const pin = await (await fetch("tool.json")).json();
    const pkg = await (await fetch("checkout/packages/viewer/package.json")).json();
    return `${pkg.name} ${pkg.version} @ ${pin.commit.slice(0, 7)}, three ${pkg.dependencies.three}`;
  } catch {
    return "unknown (run node scripts/tools.mjs speckle)";
  }
}

// The core logs "InstancedModelLoader ... tree X ms, render tree Y ms" and the
// batcher "Batcher <label>: N ms" into globalThis.__phases.
function loaderPhases(since) {
  const out = { batcher: {} };
  for (const line of (globalThis.__phases ?? []).slice(since)) {
    const m = /tree (\d+) ms, render tree (\d+) ms/.exec(line);
    if (m) { out.traverseMs = +m[1]; out.renderTreeMs = +m[2]; }
    const b = /^Batcher (.+): (\d+) ms$/.exec(line);
    if (b) out.batcher[b[1]] = +b[2];
  }
  return out;
}

let generation = 0;

async function run({ url, report }) {
  const mine = ++generation;
  const stale = () => mine !== generation;
  const origin = performance.now();
  const since = (t) => Math.round(t - origin);
  const phases = {};
  const fail = (e) => { if (!stale()) report("failed", { message: String(e?.message ?? e) }); };
  try {
    report("fetching");
    const [{ viewer }, response] = await Promise.all([getViewer(), fetch(url)]);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const buffer = await response.arrayBuffer();
    if (stale()) return;
    phases.fetchedAt = since(performance.now());
    report("parsing", { bytes: buffer.byteLength });

    const model = await readBos(buffer);
    if (stale()) return;
    phases.decodedAt = since(performance.now());
    phases.instances = model.instanceCount;
    phases.meshes = model.meshes.length;

    for (const node of viewer.getWorldTree().root.children) await viewer.unloadObject(node.model.id);
    const loader = new InstancedModelLoader(viewer.getWorldTree(), `bos/${Date.now()}`, model);
    const marks = {};
    for (const [name, ev] of [["traversedAt", LoaderEvent.Traversed], ["convertedAt", LoaderEvent.Converted]]) {
      loader.on(ev, () => { marks[name] = since(performance.now()); });
    }
    const phasesBefore = (globalThis.__phases ?? []).length;

    // First frame: the first batch exists in the renderer, then one animation frame.
    let firstFrame = false;
    const poll = setInterval(() => {
      if (stale()) return clearInterval(poll);
      if (viewer.getRenderer().renderingStats.batchCount === 0) return;
      clearInterval(poll);
      requestAnimationFrame(() => {
        if (stale()) return;
        firstFrame = true;
        phases.firstBatchAt = since(performance.now());
        report("first-frame", { bytes: buffer.byteLength, phases: { ...phases } });
      });
    }, POLL_MS);

    await viewer.loadObject(loader, true);
    clearInterval(poll);
    if (stale()) return;
    phases.batchedAt = since(performance.now());
    const stats = viewer.getRenderer().renderingStats;
    Object.assign(phases, marks, loaderPhases(phasesBefore), {
      nodes: viewer.getWorldTree().nodeCount,
      objects: stats.objects,
      drawCalls: stats.drawCalls,
      triangles: stats.trisCount,
    });
    document.body.dataset.phases = JSON.stringify(phases);
    // A model whose batching ends before the poll saw a batch still gets a first frame.
    await new Promise((r) => requestAnimationFrame(r));
    if (stale()) return;
    if (!firstFrame) report("first-frame", { bytes: buffer.byteLength, phases });
    report("done", { bytes: buffer.byteLength, phases });
  } catch (e) {
    fail(e);
  }
}

createPane({
  tool: "speckle",
  version: await version(),
  ext: "bos",
  load: run,
});
