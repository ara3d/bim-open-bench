// Bundles src/pane.mjs into dist/pane.js, one ES module that pane.html loads.
//
// BIM Open Viewer's version-2 packages (model, formats, render, interact, features, viewer) are not
// built in the checkout: they ship TypeScript sources, and the viewer's own gallery resolves them
// with the alias below (packages/demos/vite.gallery.config.mjs). The old packages (core, loaders)
// are built to dist by the `build` command in tool.json. `three` is aliased to this folder's copy so
// the sources in the checkout and this bundle share one.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const packages = join(here, "checkout", "packages");

export default defineConfig({
  root: here,
  base: "./",
  resolve: {
    alias: [
      { find: /^@bim-open-viewer\/(core|loaders)$/, replacement: `${packages}/$1/dist/index.js` },
      { find: /^@bim-open-viewer\/(?!(?:core|loaders|controls|visualization)$)([^/]+)$/, replacement: `${packages}/$1/src/index.ts` },
      { find: /^three$/, replacement: join(here, "node_modules", "three", "build", "three.module.js") },
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: { entry: join(here, "src", "pane.mjs"), formats: ["es"], fileName: () => "pane.js" },
    chunkSizeWarningLimit: 4096,
  },
});
