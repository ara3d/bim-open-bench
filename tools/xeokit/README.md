# xeokit pane

[xeokit SDK](https://github.com/xeokit/xeokit-sdk) is a WebGL viewer for building models. This pane runs it two ways: reading `.ifc` in the browser (`WebIFCLoaderPlugin`, parsing with `web-ifc`), which is the primary timing, and reading `.xkt`, xeokit's own compact format (`XKTLoaderPlugin`), which is the second timing. The pane picks the reader from the extension of `?url=`; `?model=<id>` means the `.ifc`.

## Licence

`@xeokit/xeokit-sdk` is AGPL-3.0. This repository ships a benchmark, not a product built on it, and installs the package from npm without copying its code. `web-ifc` is MPL-2.0. Anyone who builds something on top of the SDK should read the AGPL first.

## Versions

Pinned exactly in `package.json`, with `package-lock.json`:

| Package | Version | Used by |
|---|---|---|
| `@xeokit/xeokit-sdk` | 2.6.114 | the pane |
| `web-ifc` (installed as `web-ifc-0.0.51`) | 0.0.51 | the pane; the version the SDK's `WebIFCLoaderPlugin` documentation names |
| `@xeokit/xeokit-convert` | 1.3.2 | `to-xkt.mjs`, which makes the `.xkt` files |
| `web-ifc` | 0.0.70 | `convert2xkt`, which pins that version itself |
| `vite` | 7.1.12 | the build |

Build: `node scripts/tools.mjs xeokit` runs `npm ci && npx vite build` here and writes `dist/` (git-ignored).

## The `.xkt` form

`node scripts/convert.mjs --form xkt` runs `scripts/converters/xkt.mjs`, which starts `to-xkt.mjs` in this folder. That calls `convert2xkt` on its defaults. The script must start in `node_modules/web-ifc`: `convert2xkt` gives web-ifc the wasm path `./`, and started anywhere else the conversion never finishes and prints nothing. Conversion times on the test machine (the other panes' builds were running, so treat them as upper bounds): Duplex 14.7 s and 1.0 MB, Schependomlaan 62 s and 15.9 MB, Sixty5 539 s and 121.7 MB. No memory flag was needed.

## How the pane drives it

| State | Observed as |
|---|---|
| `fetching` | the load starts. For `.ifc` this includes creating the viewer and `IfcAPI.Init()` (web-ifc's wasm fetch and compile, and its worker threads), about 1 s |
| `parsing`, `bytes` | the plugin's data source delivers the file. The pane wraps the default data source (the same XMLHttpRequest) to report this moment |
| `first-frame`, `done` | the model's `loaded` event, then the scene's next `rendered` event. Both are sent on the same `t` |
| `failed` | `model.on("error")`, an uncaught error, an unhandled rejection, or no result after 600 s |

The camera is fitted with `cameraFlight.jumpTo(scene)`. Everything else is the SDK's default: no edges, no section planes, default object colours.

## Settings changed from the defaults

All in `pane.mjs` and `vite.config.mjs`, with reasons beside them.

- **web-ifc 0.0.51, as a classic script.** The page is cross-origin isolated (the server's headers), so web-ifc starts its multi-threaded build. Its worker threads load the page's main script with `importScripts()`, which fails on a bundled ES module. `vite.config.mjs` therefore writes `dist/web-ifc-api-iife.js` from the package's file (only its trailing `export { ... }` becomes `globalThis.WebIFC = { ... }`) and `pane.html` loads it with a plain `<script>`. web-ifc 0.0.70 was tried first and fails inside the plugin; see the next item.
- **Empty geometries are dropped before the plugin sees them.** web-ifc returns no triangles for some elements (Duplex's one `IfcRoof`, with web-ifc 0.0.51, 0.0.70 and 0.0.78 alike). The SDK's batching layer then throws `RangeError: offset is out of bounds` while building its buffers (a mesh with zero vertices appends its colour zero times), and the model never loads. The plugin's `excludeTypes` option cannot be used instead: the plugin reads `options.excludeTypes` but fills `options.excludeTypesMap`, so the list is ignored. `NonEmptyIfcAPI` in `pane.mjs` hands the plugin only the placed geometries that have vertices. The picture is the same (an empty mesh draws nothing), the element is missing from the scene's objects, and the extra `GetGeometry` call per placed geometry adds a little to the `.ifc` time. `convert2xkt` skips these elements itself.

## What it cannot observe

- `parsing` for `.ifc` is when the file has arrived, not when the parse starts or ends. The plugin parses and builds the scene in one synchronous call, so no event separates web-ifc's work from xeokit's.
- Anything before the pane starts its clock: loading `pane.js` (1.5 MB) and the web-ifc script.
- The true first draw: `first-frame` is the first `rendered` event after `loaded`. With the pane hidden or in a background tab the browser pauses frames and the state waits.
- Memory and frame rate: the `view` suite does not measure them yet.

## Checking it

`node scripts/view.mjs --tool xeokit --model duplex --form xkt` opens the pane in headless Chrome on the machine's GPU (`--software` for SwiftShader), waits for `done` or `failed`, prints the times, and writes a screenshot to `results/view/scratch/` (git-ignored); `tools/README.md` describes the runner and `results/view/README.md` holds the latest numbers for every pane.

