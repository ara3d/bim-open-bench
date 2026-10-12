// Bundles src/pane.mjs (and the fork's packages, with their one three.js 0.140.2)
// into dist/pane.js, which pane.html loads. Every asset is inlined or emitted into
// dist/, because the server's Cross-Origin-Embedder-Policy blocks other origins.
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: { dedupe: ["three"] },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    lib: { entry: "src/pane.mjs", formats: ["es"], fileName: () => "pane.js" },
  },
});
