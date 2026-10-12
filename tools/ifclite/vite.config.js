// Builds pane.mjs into dist/pane.js. The geometry workers ship as ES modules, which
// Vite's default worker format (iife) cannot bundle: this is the one line
// @ifc-lite/geometry's README asks for. base "./" keeps every URL relative.
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const installed = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version;
const versions = ["renderer", "geometry", "wasm"].map((n) => `${n} ${installed(`@ifc-lite/${n}`)}`).join(", ");

export default defineConfig({
  base: "./",
  define: { __IFCLITE_VERSIONS__: JSON.stringify(versions) },
  worker: { format: "es" },
  build: {
    outDir: "dist",
    target: "es2022",
    assetsInlineLimit: 0, // keep the 10 MB wasm a separate file, served from dist/assets
    rollupOptions: { input: "pane.mjs", output: { entryFileNames: "pane.js" } },
  },
});
