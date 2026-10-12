// Pane for Static glTF Viewer. The viewer is the page built by scripts/tools.mjs
// (checkout/dist), loaded in an inner iframe on the same origin; this file reads
// its load states from outside, without changing its code. See README.md here.
import { createPane } from "../pane.mjs";

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
