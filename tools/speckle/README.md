# Speckle viewer pane (bim-open-web-viewer fork)

This pane runs the Speckle viewer's engine through an offline fork, [bim-open-web-viewer](https://github.com/ara3d/bim-open-web-viewer): `packages/viewer` of speckle-server at 51d43b91 (Apache-2.0, three.js 0.140.2) with every `@speckle/*` import removed. It needs no server and no account. The fork adds `packages/bos`, which decodes a `.bos` file (a ZIP of Parquet tables) into an `InstancedModel`, and an `InstancedModelLoader` in the core that builds the world tree and render tree from it and hands it to the batcher. The pane reads `.bos`.

## Pin

`tool.json` pins `ddf4727b75cb2bc9180e81a25fe4ba75f789b0aa` ("Load BOS models directly into the batcher"). `repo` is the local path `C:/Users/cdigg/git/bim-open-web-viewer` because the fork has no GitHub remote yet; once it is pushed, `repo` becomes the GitHub URL and `commit` stays the same.

`node scripts/tools.mjs speckle` clones the pin and runs `npm ci && npm run build` in the checkout (the three workspace packages and the fork's own sandbox). Then it runs `npm ci --no-audit --no-fund && npx vite build` here, which bundles `src/pane.mjs` with `file:checkout/packages/viewer` and `file:checkout/packages/bos` into `dist/pane.js` (git-ignored). Everything, including the viewer's default environment image, is inlined in that one file, so nothing loads from another origin under `Cross-Origin-Embedder-Policy: require-corp`. The pane depends on no `three` of its own; the bundle holds one copy, 0.140.2, from the checkout (`resolve.dedupe` in `vite.config.mjs` keeps it so). Three.js 0.140 builds cleanly in this bundle, with no warnings that matter.

## How the pane drives it

`src/pane.mjs` creates a `Viewer` with `CameraController` (nothing else: no selection, sections, or measurements), fetches the `.bos`, runs `readBos`, and calls `viewer.loadObject(new InstancedModelLoader(...), true)`. The `true` makes the viewer fit the camera to the model as batches arrive, so a screenshot shows the whole model.

| State | Observed as |
|---|---|
| `fetching` | the load starts; the viewer's `init()` and the fetch run together, so this includes starting WebGL |
| `parsing` | the response body has arrived (`bytes`). The pane counts the Parquet decode (`readBos`) as parsing, so `parsing` lasts until the decode returns, but the state message is sent at its start |
| `first-frame` | the first batch exists in the renderer (`renderingStats.batchCount > 0`, polled every 10 ms), then one `requestAnimationFrame`. Inferred: the viewer draws after each batch, but the pane does not see the draw itself |
| `done` | `loadObject` has returned: tree, render tree, and all batches built |
| `failed` | any exception from fetch, decode, or load, with its message |

`first-frame` and `done` carry a `phases` object (also written to `document.body.dataset.phases`). Times are milliseconds since the load began. `fetchedAt`, `decodedAt`, `traversedAt`, `convertedAt`, `firstBatchAt`, `batchedAt` are marks (the last `Traversed` and `Converted` loader events; `Converted` fires only every 1,000 nodes, so it is absent on a model smaller than that). `traverseMs`, `renderTreeMs`, and `batcher` (a time for each step the batcher logs) come from the fork's own timing log in `globalThis.__phases`, which is a debug aid, not an API. `instances`, `meshes`, `nodes`, `objects`, `drawCalls`, `triangles` are counts.

## Observed, 2026-10-12, Duplex (660 instances, 435 meshes), headless Chrome with SwiftShader (software WebGL), machine busy with other builds

`node tools/speckle/check.mjs duplex` reached `done` with the model visible and no console errors: parsing at 2.7 s (response and WebGL start), decode finished at 3.7 s, first frame 7.5 s, done 18.8 s, 20 draw calls, 26,774 triangles. The tree took 7 ms and the render tree 583 ms; the batcher's de-instancing took 1.4 s. These times include software rendering and a loaded machine (an earlier, quieter run reached `done` at 13.5 s, with batching finished at 7.4 s), so compare them only with other panes run the same way. Schependomlaan and Sixty5 have no `.bos` yet; run `check.mjs schependomlaan sixty5` once they exist.

## What the pane cannot observe

- Bytes while fetching: `bytes` is the size once the body is in.
- The Parquet decode is separate from the fetch only by the mark `decodedAt`; it is one `parsing` period in the state line.
- The true first draw (see `first-frame` above), and the per-batch draws after it. A hidden tab pauses animation frames, so `first-frame` waits until the pane is visible.
- Memory and frame rate: those belong to the Playwright `view` suite.

## The Speckle object path is not used

The fork also loads Speckle objects: `tools/bos-to-speckle.mjs` in the fork turns a `.bos` into a flat object array (one DataObject per entity, one InstanceProxy per instance, one Mesh and InstanceDefinitionProxy per unique mesh and material) that `SpeckleOfflineLoader` reads. On Snowdon the fork's README reports 188 s that way, most of it in the converter's instance expansion, against about 20 s for the direct path. The pane does not use it: the conversion is the fork's own code and its output is a 340 MB JSON for one model, so it would measure a converter nobody ships as a Speckle workflow, and the direct path is what the fork is built around.

Whether that is fair to Speckle stays open. The README's question is whether Speckle objects made ahead (the form a Speckle server stores) should be the input, with the conversion timed beside the load, like the GLB conversions for the other viewers. Running both on the Duplex with timings that mean anything needs a quiet machine and a second pane variant (a `.speckle.json` input and `SpeckleOfflineLoader`); that was not done here. The load phases above would be the "BOS path" half of the answer.

## Checking

`node scripts/serve.mjs --port 8775`, then `node tools/speckle/check.mjs [model ...] [--port 8775] [--timeout 300]`. The script starts headless Chrome, opens `pane.html?model=<model>`, waits for `done` or `failed`, prints the status line and phases, and saves `results/scratch/speckle-<model>.png` (git-ignored). It exits 1 on a failure, a console error, or a canvas with one flat colour. It needs Node 22 (global `WebSocket`) and Chrome (`CHROME` overrides the path).
