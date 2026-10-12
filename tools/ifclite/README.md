# IFClite pane

IFClite (https://github.com/LTplus-AG/ifc-lite, MPL-2.0) is an IFC engine in Rust compiled to WebAssembly, with a WebGPU renderer. This pane loads an `.ifc` file into the renderer the way the packages' READMEs show, and reports the pane states.

## What is installed

Exact versions in `package.json`, lockfile `package-lock.json` (both committed):

| Package | Version | Role |
|---|---|---|
| `@ifc-lite/renderer` | 6.0.1 | `Renderer`: WebGPU drawing, camera, `fitToView` |
| `@ifc-lite/geometry` | 7.7.0 | `GeometryProcessor.processAdaptive`: parses the IFC and streams meshes from a worker pool |
| `@ifc-lite/wasm` | 10.4.0 | the parser and geometry engine (about 10 MB), pulled in by `geometry` |
| `vite` | 7.1.12 | the bundler (dev dependency) |

`@ifc-lite/sdk` is not used: it is a scripting API (`bim.query()`, `bim.export`), and its viewer calls need a host that owns a renderer. `@ifc-lite/parser` is not used either: `GeometryProcessor` reads the IFC bytes itself, so the pane measures the shortest path from bytes to pixels, which is what `renderer`'s README shows.

`node scripts/tools.mjs ifclite` runs `npm ci && npx vite build` here and writes `dist/` (git-ignored: `pane.js`, the geometry worker, the wasm). Every file is served from the repository; nothing comes from a CDN. A clean build took 2 to 5 minutes on the 2026-10-11 machine, which was at full CPU load from other work. `vite.config.js` sets `worker.format: "es"` (the geometry README asks for it) and `assetsInlineLimit: 0` (otherwise Vite inlines the 10 MB wasm as base64 into two bundles).

## How the pane drives it

1. `fetching` when the fetch starts.
2. `parsing` when all bytes have arrived (`bytes` is the file size). `GeometryProcessor` has no separate parse phase to observe, so `parsing` here means "handed to IFClite".
3. `new Renderer(canvas)` and `GeometryProcessor` start (`init()` on both; the wasm loads here), then `processAdaptive(bytes)` streams `batch` events. Each batch goes to `renderer.addMeshes(meshes, true)`.
4. `first-frame` after the first batch is uploaded, the camera has been fitted (`fitToView()`), and the frame loop has drawn once.
5. `done` when the stream ends, the camera is fitted again to the whole model, and one more frame has drawn.
6. `failed` with the message on any thrown error, a failed GPU upload (`addMeshes` returns `{ ok: false }`), a model with no geometry, or WebGPU missing.

The renderer does not run its own frame loop. `requestRender()` only sets a flag; the host must call `consumeRenderRequest()` and `render()`. The renderer README's snippet ends with `requestRender()` and nothing draws after it, so the pane runs a `requestAnimationFrame` loop. Left button orbits, right button pans, the wheel zooms.

Default settings are used: medium tessellation, no section plane, the default colours, `processAdaptive` with its 2 MB streaming threshold and 25-mesh batches.

## Observed and inferred

- Observed: `fetching` and `parsing` (the pane's own fetch); `first-frame` and `done` are after the pane's own frame loop called `render()`, so "drawn" means the draw call was issued, not that the GPU has finished. The screenshot from `check.mjs` shows pixels.
- Inferred: that the first batch is a usable picture. The first batch may hold only a few meshes; the Duplex screenshot after `done` shows the whole model.
- Not observable: how much of the time between `parsing` and `first-frame` is wasm load, shader compilation, parsing, or geometry (they are inside one library call), and per-element parse time. The wasm initialisation is counted in this interval, once per page.
- The first batch arrives only after the renderer and the geometry processor have both initialised, so `first-frame` includes a one-time startup that a second `load` message does not pay.

## WebGPU and WebGL

The question in the repository README: does IFClite's renderer fall back to WebGL where WebGPU is off?

- Read: no. `@ifc-lite/renderer` 6.0.1, `device.js`, `init()`: `if (!navigator.gpu) throw new Error('WebGPU not available')`, then `requestAdapter()`, and `Failed to get GPU adapter` when that returns null. There is no WebGL context code in the package (the "WebGL" strings are comments about the Y-up axis convention). The pane then reports `failed` with that message.
- Tested, headless Chrome (Chrome 2026-10, Windows 11):
  - `--enable-unsafe-webgpu` alone: `requestAdapter()` did not resolve within 8 seconds, so the pane would sit in `parsing`.
  - `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`: works; the adapter is Google SwiftShader (software). The Duplex reaches `done` and the screenshot shows the model. This is what `check.mjs` is run with.
  - Default flags and `--enable-features=Vulkan --use-angle=swiftshader` gave no `navigator.gpu` in the probe, but the probe may have run before the page loaded, so those two are inconclusive.
- A headed Chrome with a real GPU was not tried; WebGPU is on by default there.
- So a headless run of the `view` suite needs `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`, and its timings are software-rendered, not comparable with a GPU run. Machines without WebGPU cannot run this pane at all.

## Isolation headers

The server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, and `crossOriginIsolated` is true in the page. IFClite's geometry code uses a `SharedArrayBuffer` when it exists (`geometry-parallel.js` checks `typeof SharedArrayBuffer`). Whether it works without the headers was not tested here, so "needed" is not claimed.

## Checking

```
node scripts/serve.mjs --port 8774
node tools/ifclite/check.mjs duplex --flag=--enable-unsafe-webgpu --flag=--use-webgpu-adapter=swiftshader
```

`check.mjs` starts Chrome with a throwaway profile, opens `pane.html?model=<id>`, waits for `done` or `failed`, prints the status line and any console errors, and writes a PNG to the system temp folder (`--out` changes it). `--headed` shows the window. It needs Node 22. Exit code 0 means `done` and no console errors.

## Results

Run on 2026-10-11 with headless Chrome, SwiftShader (software WebGPU), while other builds kept the CPU at 100 percent and a 49 MB local fetch took about 50 seconds. Times are therefore far slower than a normal machine and only show the order of the states.

| Model | Size | parsing | first-frame | done | Screenshot |
|---|---|---|---|---|---|
| duplex | 2.4 MB | 4.4 s | 64.4 s | 68.9 s | whole building visible, no console errors |
| schependomlaan | 49 MB | 26.5 s | 186.1 s | 198.6 s | whole building visible, no console errors |
| sixty5 | 343 MB | not completed | | | the page did not open within 1500 s (WebGPU absent, no status line); the cause was not found, probably the overloaded machine |

An earlier Duplex run (28 MB bundle with the wasm inlined) took 61.7 s to `done`, and before the frame loop was added it reported `done` over an empty canvas, which is why `done` waits for a drawn frame.
