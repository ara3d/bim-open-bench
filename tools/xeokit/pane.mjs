// Pane for xeokit. Reads .ifc through WebIFCLoaderPlugin (web-ifc in the page) and .xkt through
// XKTLoaderPlugin, both with the SDK's defaults. See README.md here for what is observed.
import { Viewer, WebIFCLoaderPlugin, XKTLoaderPlugin } from "@xeokit/xeokit-sdk/dist/xeokit-sdk.es.js";
import { createPane } from "../pane.mjs";

// web-ifc comes from dist/web-ifc-api-iife.js, a classic <script> in pane.html that sets globalThis.WebIFC.
// The SDK's docs for WebIFCLoaderPlugin name web-ifc 0.0.51, installed here as "web-ifc-0.0.51"; 0.0.70 (the
// version convert2xkt needs, installed as "web-ifc" for to-xkt.mjs) fails inside the plugin with
// "RangeError: offset is out of bounds". Cross-origin isolation makes web-ifc start its multi-threaded build,
// whose worker threads load the page's main script with importScripts(): that works only for a classic script,
// not for this bundled module, hence the separate file (see vite.config.mjs).
const { WebIFC } = window;

const TIMEOUT_MS = 600_000;
const wasmDir = import.meta.url.replace(/[^/]*$/, ""); // dist/, where vite.config.mjs copied web-ifc's files
const absolute = (url) => new URL(url, location.href).href;

let viewer;
let ifcLoader;
let xktLoader;
let loadCount = 0;

function ensureViewer() {
  viewer ??= new Viewer({ canvasId: "canvas" });
  return viewer;
}

// web-ifc must be initialised before the first .ifc load: it fetches and compiles its wasm.
async function ensureIfcLoader() {
  if (ifcLoader) return ifcLoader;
  const api = new NonEmptyIfcAPI();
  api.SetWasmPath(wasmDir, true);
  await api.Init();
  ifcLoader = new WebIFCLoaderPlugin(ensureViewer(), { WebIFC, IfcAPI: api });
  ifcLoader.dataSource = reportingSource(ifcLoader.dataSource, "getIFC");
  return ifcLoader;
}

// Changed setting, .ifc only. web-ifc returns no triangles for some elements (Duplex's IfcRoof, with web-ifc
// 0.0.51, 0.0.70 and 0.0.78 alike), and the SDK's batching layer throws "RangeError: offset is out of bounds"
// on a mesh with no vertices, so the model never loads. The plugin's excludeTypes option cannot be used instead:
// the plugin reads options.excludeTypes but fills options.excludeTypesMap, so the list is ignored. This subclass
// hands the plugin only the placed geometries that have vertices, which draws the same picture (an empty mesh
// has nothing to draw) but leaves such an element out of the scene's objects.
class NonEmptyIfcAPI extends WebIFC.IfcAPI {
  StreamAllMeshes(modelID, callback) {
    super.StreamAllMeshes(modelID, (flatMesh) => {
      const kept = [];
      for (let i = 0; i < flatMesh.geometries.size(); i++) {
        const placed = flatMesh.geometries.get(i);
        const geometry = this.GetGeometry(modelID, placed.geometryExpressID);
        if (geometry.GetVertexDataSize() > 0) kept.push(placed);
        geometry.delete();
      }
      if (kept.length > 0) callback({ expressID: flatMesh.expressID, geometries: { size: () => kept.length, get: (i) => kept[i] } });
    });
  }
}

// The default data sources fetch with XMLHttpRequest; these wrap them so that `parsing` is reported at the
// moment the file has arrived, before the plugin's synchronous parse blocks the page.
let onFetched = () => {};
function reportingSource(source, method) {
  const wrapped = Object.create(source);
  wrapped[method] = (src, ok, error) => source[method](src, (data) => { onFetched(data.byteLength); ok(data); }, error);
  return wrapped;
}

async function load({ url, report }) {
  const id = `model${++loadCount}`;
  const abs = absolute(url);
  currentReport = report;
  failedOnce = false;
  report("fetching");
  try {
    const v = ensureViewer();
    const isXkt = new URL(abs).pathname.toLowerCase().endsWith(".xkt");
    if (loadCount > 1) for (const m of Object.values(v.scene.models)) m.destroy();
    let loader;
    if (isXkt) {
      if (!xktLoader) {
        xktLoader = new XKTLoaderPlugin(v);
        xktLoader.dataSource = reportingSource(xktLoader.dataSource, "getXKT");
      }
      loader = xktLoader;
    }
    else loader = await ensureIfcLoader();
    onFetched = (bytes) => report("parsing", { bytes });
    const timer = setTimeout(() => failWith("timed out"), TIMEOUT_MS);
    const model = loader.load({ id, src: abs });
    model.on("error", (message) => { clearTimeout(timer); failWith(message); });
    model.on("loaded", () => {
      clearTimeout(timer);
      v.cameraFlight.jumpTo(v.scene);
      // The next frame the scene renders holds the whole model: first frame and done coincide.
      v.scene.once("rendered", () => { report("first-frame"); report("done"); });
    });
  } catch (error) {
    failWith(error?.message ?? error);
  }
}

// An error thrown while the plugin builds the model (after parsing) never reaches model.on("error").
let currentReport;
let failedOnce = false;
const failWith = (m) => { if (!failedOnce) { failedOnce = true; currentReport?.("failed", { message: String(m) }); } };
addEventListener("error", (e) => failWith(e.message));
addEventListener("unhandledrejection", (e) => failWith(e.reason?.message ?? e.reason));

createPane({
  tool: "xeokit",
  version: `${__XEOKIT_SDK_VERSION__}, web-ifc ${__WEB_IFC_VERSION__}`,
  ext: "ifc",
  load,
});
