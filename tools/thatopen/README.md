# That Open Engine pane

[That Open Engine](https://github.com/ThatOpen) is an open-source set of packages for building BIM viewers in the browser (MIT; web-ifc is MPL-2.0). This pane drives it the way its documentation shows: a world with a simple scene, camera and renderer, `IfcLoader` for IFC, and the fragments manager for Fragments (`.frag`) files. It adds no viewer features and changes no package.

## Versions

Pinned exactly in `package.json`, with `package-lock.json`; read by `pane.mjs` for the `ready` message.

| Package | Version |
|---|---|
| `@thatopen/components` | 3.4.9 |
| `@thatopen/fragments` | 3.4.8 |
| `web-ifc` | 0.0.77 |
| `three` | 0.185.0 |
| `camera-controls` | 3.1.2 |
| `vite` (build only) | 8.3.4 |

`web-ifc` is 0.0.77, not the newest 0.0.78. `@thatopen/components` 3.4.9 accepts `>=0.0.77`, but `@thatopen/fragments` 3.4.8 calls `StreamMeshes` with four arguments, and the 0.0.78 build then fails with "function StreamMeshes called with 4 arguments, expected 3" (observed 2026-10-11, Duplex). 0.0.77 is the version the pair was released against.

## Build and run

`node scripts/tools.mjs thatopen` runs `npm ci && npx vite build` here and writes `dist/` (git-ignored). `pane.html` loads `dist/pane.js`. Open `http://localhost:8765/tools/thatopen/pane.html?model=duplex` (an `.ifc`) or `?url=/models/cache/duplex.frag` after `node scripts/serve.mjs`.

`dist/` also holds the files the viewer fetches at run time, copied by `vite.config.mjs`: `wasm/web-ifc.wasm` (and `web-ifc-mt.wasm`) and `fragments-worker.mjs`. The library would otherwise download its worker from unpkg, which the server's `Cross-Origin-Embedder-Policy: require-corp` blocks.

## Settings changed from the defaults

- The Fragments worker and web-ifc's wasm come from `dist/`, not a CDN (above).
- web-ifc is initialised once, single-threaded, before the first load. web-ifc chooses its multi-threaded build whenever the page is cross-origin isolated, which the server's headers make true; its pthread workers then failed in this bundle ("worker sent an error!", repeated, and the load never ended). The `.frag` path does not use web-ifc. A bench that wants the threaded numbers needs a pane that makes the threads start; this one does not.

## What each state observes

| State | Observed or inferred |
|---|---|
| `fetching` | Observed: the pane calls `fetch`. |
| `parsing` | Observed: the response body is fully read (`arrayBuffer`); `bytes` is its length. The pane reads the whole body at once, so there is no running byte count. |
| `first-frame` | Inferred: the model was added to the scene (`IfcLoader.load` or `fragments.core.load` resolved), the camera was fitted to `model.box`, the fragments `update(true)` resolved, and one `requestAnimationFrame` has passed. It is not a read of the renderer's first draw of the model. In a hidden tab animation frames pause, so this waits. |
| `done` | Inferred: a second `update(true)` has resolved after `first-frame`. Fragments streams geometry in tiles by level of detail, so the picture can still refine after `done`. The `.frag` path shows fewer small items at `done` than the `.ifc` path in the screenshots. |
| `failed` | Observed: an exception from the load, with its message. A hang is not detected by the pane. |

On `.ifc` the time from `parsing` to `first-frame` covers web-ifc's geometry stream and the importer's conversion to Fragments, then the load into the worker; on `.frag` it covers only the load into the worker. The loader does not report them apart.

## `.frag` form

`scripts/converters/frag.mjs` runs `node tools/thatopen/to-frag.mjs <in.ifc> <out.frag>`, which uses `IfcImporter` from `@thatopen/fragments` in Node with its defaults. Run `node scripts/tools.mjs thatopen` first so `node_modules` exists. `node scripts/convert.mjs --form frag` converts the corpus.

## Checking it

`node scripts/view.mjs --tool thatopen --model duplex --form frag` opens the pane in headless Chrome on the machine's GPU (`--software` for SwiftShader), waits for `done` or `failed`, prints the times, and writes a screenshot to `results/view/scratch/` (git-ignored); `tools/README.md` describes the runner and `results/view/README.md` holds the latest numbers for every pane.

## What it cannot report

- The renderer's true first draw of the model, and whether tiles are still streaming at `done`.
- Bytes while fetching, and parse time apart from conversion time inside `IfcLoader`.
- Memory and frame rate: the `view` suite does not measure them yet.
- Multi-threaded web-ifc timing (see above).
