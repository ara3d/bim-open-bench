// Pane for That Open Engine. Drives @thatopen/components as its documentation shows: a world
// with a simple scene, camera and renderer; IfcLoader for .ifc, the fragments manager for
// .frag. Settings changed from the defaults are marked "changed:" with the reason.
// What each state observes is in README.md here.
import * as OBC from "@thatopen/components";
import * as WEBIFC from "web-ifc";
import { createPane } from "../pane.mjs";
import pkg from "./package.json";

const container = document.getElementById("viewer");
const dep = (name) => pkg.dependencies[name];
const version = `components ${dep("@thatopen/components")}, fragments ${dep("@thatopen/fragments")}, web-ifc ${dep("web-ifc")}, three ${dep("three")}`;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

let engine; // created on the first load: the world, the loaders; kept for later loads
async function startEngine() {
  const components = new OBC.Components();
  const worlds = components.get(OBC.Worlds);
  const world = worlds.create();
  world.scene = new OBC.SimpleScene(components);
  world.renderer = new OBC.SimpleRenderer(components, container);
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  components.init();
  world.scene.setup();
  world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);

  const fragments = components.get(OBC.FragmentsManager);
  // changed: the worker is served from dist/ because the library's default downloads it from
  // unpkg, which the cross-origin isolation headers (require-corp) block.
  fragments.init(new URL("fragments-worker.mjs", import.meta.url).href);
  world.camera.controls.addEventListener("update", () => fragments.core.update());
  fragments.list.onItemSet.add(({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
  });

  const ifcLoader = components.get(OBC.IfcLoader);
  const wasmPath = new URL("wasm/", import.meta.url).href;
  // changed: web-ifc picks its multi-threaded build whenever the page is cross-origin isolated
  // (the server's COOP/COEP headers), and its pthread workers then fail in this bundle with
  // "worker sent an error!" and the load never ends. Initialising web-ifc once here with
  // forceSingleThread caches the single-threaded module for every later Init (IfcLoader's and
  // the importer's own). Without the isolation headers the library would choose it anyway.
  const api = new WEBIFC.IfcAPI();
  api.SetWasmPath(wasmPath, true);
  await api.Init(undefined, true);
  // changed: web-ifc's wasm is served from dist/wasm/ (no CDN).
  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: { path: wasmPath, absolute: true },
  });
  return { components, world, fragments, ifcLoader };
}

async function fetchBytes(url, report) {
  report("fetching");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  report("parsing", { bytes: bytes.length });
  return bytes;
}

function fitCamera(world, model) {
  const box = model.box.clone();
  if (box.isEmpty()) return;
  // changed: the camera's far plane is 1000 (PerspectiveCamera(60, aspect, 1, 1000)), so a model
  // over a kilometre across (a building with its site and city context) is cut. Far is pushed to
  // three times the box diagonal when shorter; near is left as is.
  const camera = world.camera.three;
  const diagonal = box.max.distanceTo(box.min);
  if (camera.far < 3 * diagonal) {
    camera.far = 3 * diagonal;
    camera.updateProjectionMatrix();
  }
  world.camera.controls.fitToBox(box, false);
}

async function loadModel({ model: id, url, report }) {
  try {
    const isFrag = new URL(url, location.href).pathname.endsWith(".frag");
    const bytes = await fetchBytes(url, report);
    const size = bytes.length; // the fragments worker takes the buffer, leaving it empty
    engine ??= await startEngine();
    const { world, fragments, ifcLoader } = engine;
    for (const old of [...fragments.list.values()]) await fragments.core.disposeModel(old.modelId);
    const model = isFrag
      ? await fragments.core.load(bytes, { modelId: id || "model" })
      : await ifcLoader.load(bytes, true, id || "model");
    fitCamera(world, model);
    await fragments.core.update(true);
    await nextFrame();
    report("first-frame", { bytes: size });
    await fragments.core.update(true);
    report("done", { bytes: size });
  } catch (error) {
    console.error(error);
    report("failed", { message: String(error?.message ?? error) });
  }
}

createPane({ tool: "thatopen", version, ext: "ifc", load: loadModel });
