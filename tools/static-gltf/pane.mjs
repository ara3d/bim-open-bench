// Pane for Static glTF Viewer. The viewer is the page built by scripts/tools.mjs
// (checkout/dist), loaded in an inner iframe on the same origin; this file reads
// its load states from outside, without changing its code. See README.md here.
import { createPane } from "../pane.mjs";
import { installCameraPath } from "../camera-path.mjs";

const frame = document.getElementById("viewer");
const POLL_MS = 10;
const TIMEOUT_MS = 300_000;

async function version() {
  try {
    const pin = await (await fetch("tool.json")).json();
    const pkg = await (await fetch("checkout/package.json")).json();
    return `${pkg.version} @ ${pin.commit.slice(0, 7)}, three ${pkg.dependencies.three}`;
  } catch {
    return "unknown (run node scripts/tools.mjs static-gltf)";
  }
}

// Watches one inner window until the model is drawn or the load fails.
function observe(absUrl, report) {
  let failure;
  let parsing = false;
  let finished = false;
  let bytes;
  const hooked = new WeakSet();

  const fail = (message) => { if (!finished && !failure) failure = message; };

  // The viewer reports a failed load with window.alert and console.error.
  const hook = (win) => {
    if (hooked.has(win)) return;
    hooked.add(win);
    win.alert = (m) => fail(String(m).split("\n")[0]);
    const err = win.console.error.bind(win.console);
    win.console.error = (...a) => { err(...a); fail(a.map((x) => x?.message ?? String(x)).join(" ")); };
    win.addEventListener("error", (e) => fail(e.message));
    win.addEventListener("unhandledrejection", (e) => fail(String(e.reason?.message ?? e.reason)));
  };

  const finish = (state, extra) => { finished = true; clearInterval(timer); report(state, extra); };
  const started = performance.now();

  const timer = setInterval(() => {
    if (performance.now() - started > TIMEOUT_MS) return finish("failed", { message: "timed out" });
    const win = frame.contentWindow;
    if (!win || win.location.href === "about:blank" || !win.document) return;
    hook(win);
    if (failure) return finish("failed", { message: failure });

    if (!parsing) {
      const entry = win.performance.getEntriesByType("resource").find((e) => e.name === absUrl);
      if (!entry || entry.responseEnd === 0) return;
      if (entry.responseStatus >= 400) return fail(`HTTP ${entry.responseStatus}`);
      bytes = entry.decodedBodySize || entry.encodedBodySize || entry.transferSize;
      parsing = true;
      return void report("parsing", { bytes });
    }
    // The viewer hides its spinner when the glTF has been parsed and added to the scene.
    const spinner = win.document.querySelector(".spinner");
    if (spinner && spinner.style.display !== "none") return;
    finished = true;
    clearInterval(timer);
    // One animation frame after the scene holds the model is the first frame drawn.
    win.requestAnimationFrame(() => {
      if (failure) return report("failed", { message: failure });
      report("first-frame", { bytes });
      report("done", { bytes });
    });
  }, POLL_MS);
}

// The camera path's adapter (tools/camera-path.mjs). The viewer exports its App as
// window.VIEWER.app in the inner window; app.viewer holds the three.js camera, OrbitControls,
// scene and the loaded model (content). The viewer draws in its own requestAnimationFrame loop
// (controls.update() then render, every frame), so set() only moves the camera and the target:
// the inner loop draws the pose, and no extra render is added to the frame being timed.
const inner = () => frame.contentWindow?.VIEWER?.app?.viewer;
installCameraPath({
  camera: {
    // Box3.setFromObject without three: each mesh's geometry box (the instances' box for an
    // InstancedMesh), its 8 corners through matrixWorld.
    box() {
      const v = inner();
      if (!v?.content) return null;
      v.content.updateMatrixWorld(true);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      v.content.traverse((node) => {
        if (!node.geometry || node.visible === false) return;
        let b;
        if (node.isInstancedMesh) { if (!node.boundingBox) node.computeBoundingBox(); b = node.boundingBox; }
        else { if (!node.geometry.boundingBox) node.geometry.computeBoundingBox(); b = node.geometry.boundingBox; }
        if (!b || b.isEmpty()) return;
        const e = node.matrixWorld.elements;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
          const p = [(e[0] * x + e[4] * y + e[8] * z + e[12]) / w, (e[1] * x + e[5] * y + e[9] * z + e[13]) / w, (e[2] * x + e[6] * y + e[10] * z + e[14]) / w];
          for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
        }
      });
      return min[0] <= max[0] ? { min, max } : null;
    },
    up: () => inner().activeCamera.up.toArray(),
    set(eye, target) {
      const v = inner();
      v.activeCamera.position.set(...eye);
      v.controls.target.set(...target);
      v.controls.update();
    },
  },
});

createPane({
  tool: "static-gltf",
  version: await version(),
  ext: "glb",
  load({ url, report }) {
    const abs = new URL(url, location.href).href;
    report("fetching");
    observe(abs, report);
    // The viewer reads ?file= (base64 first, then as given) and ?kiosk=1 hides its header.
    frame.src = `checkout/dist/index.html?file=${encodeURIComponent(abs)}&kiosk=1`;
  },
});
