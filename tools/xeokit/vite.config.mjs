// Builds pane.mjs and everything it imports into dist/pane.js, and copies web-ifc's wasm and
// worker files next to it, with web-ifc itself as a classic script. The server sends
// Cross-Origin-Embedder-Policy: require-corp, so the pane may load nothing from another origin.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const webIfcDir = resolve(here, "node_modules/web-ifc-0.0.51");
const webIfcFiles = ["web-ifc.wasm", "web-ifc-mt.wasm", "web-ifc-mt.worker.js"];
const versionOf = (pkg) => JSON.parse(readFileSync(resolve(here, "node_modules", pkg, "package.json"), "utf8")).version;

// web-ifc 0.0.51 ships only an ES module, but its worker threads load the page's main script with
// importScripts(), which needs a classic script that leaves `WebIFCWasm` as a global. This turns the
// file's one trailing `export { A, B as C };` into `globalThis.WebIFC = { A, C: B }` and changes
// nothing else in it.
function classicScript(source) {
  const at = source.lastIndexOf("\nexport {");
  const names = source.slice(at).match(/\{([^}]*)\}/)[1].split(",").map((n) => n.trim()).filter(Boolean);
  const pairs = names.map((n) => {
    const [local, exported = local] = n.split(/\s+as\s+/);
    return `${exported}: ${local}`;
  });
  return `${source.slice(0, at)}\nglobalThis.WebIFC = { ${pairs.join(", ")} };\n`;
}

export default defineConfig({
  root: here,
  base: "./",
  publicDir: false,
  define: {
    __XEOKIT_SDK_VERSION__: JSON.stringify(versionOf("@xeokit/xeokit-sdk")),
    __WEB_IFC_VERSION__: JSON.stringify(versionOf("web-ifc-0.0.51")),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: { entry: resolve(here, "pane.mjs"), formats: ["es"], fileName: () => "pane.js" },
  },
  plugins: [{
    name: "copy-web-ifc",
    closeBundle() {
      mkdirSync(resolve(here, "dist"), { recursive: true });
      writeFileSync(resolve(here, "dist/web-ifc-api-iife.js"), classicScript(readFileSync(resolve(webIfcDir, "web-ifc-api.js"), "utf8")));
      for (const f of webIfcFiles) copyFileSync(resolve(webIfcDir, f), resolve(here, "dist", f));
    },
  }],
});
