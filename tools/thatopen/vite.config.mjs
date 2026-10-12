// Bundles pane.mjs into dist/pane.js and copies three files the viewer fetches at run time
// into dist/, because the server sends Cross-Origin-Embedder-Policy: require-corp and nothing
// may come from a CDN (web-ifc's .wasm; the Fragments worker, which the library would
// otherwise download from unpkg).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";

const packageDir = (name) => join(import.meta.dirname, "node_modules", name);

const copied = [
  ["wasm/web-ifc.wasm", join(packageDir("web-ifc"), "web-ifc.wasm")],
  ["wasm/web-ifc-mt.wasm", join(packageDir("web-ifc"), "web-ifc-mt.wasm")],
  ["fragments-worker.mjs", join(packageDir("@thatopen/fragments"), "dist/Worker/worker.min.mjs")],
];

const copyRuntimeFiles = {
  name: "copy-runtime-files",
  generateBundle() {
    for (const [fileName, from] of copied) this.emitFile({ type: "asset", fileName, source: readFileSync(from) });
  },
};

export default defineConfig({
  base: "./",
  plugins: [copyRuntimeFiles],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: "pane.mjs",
      output: { entryFileNames: "pane.js", chunkFileNames: "[name]-[hash].js", assetFileNames: "assets/[name]-[hash][extname]" },
    },
  },
});
