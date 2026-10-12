# BIM Open Viewer pane

BIM Open Viewer ([ara3d/bim-open-viewer](https://github.com/ara3d/bim-open-viewer), MIT) is a TypeScript library on three.js and WebGL. It is not on npm; the bench uses it at the commit pinned in `tool.json`, the same one `deps.json` pins in `bim-open-toolkit`. The pane reads `.bos` (BIM Open Schema, a zip of Parquet tables, made ahead by `ifc-to-bos`) and, when the URL ends in `.glb`, a GLB (the "second timing", made by IfcConvert). The viewer picks the reader from the file's name.

## Build

`node scripts/tools.mjs bim-open-viewer` does three things:

1. Clones the viewer at the pin and runs `node deps.mjs && npm ci && npm run build -w @bim-open-viewer/core -w @bim-open-viewer/loaders` there. Only those two packages are built to `dist/`; the other packages in the repository (`model`, `formats`, `render`, `interact`, `features`, `viewer`) ship TypeScript sources only. `npm ci` there installs the whole workspace (about 330 packages) and took 34 minutes on a busy test machine.
2. Runs `npm ci && npx vite build` in this folder, which writes `dist/pane.js` (about 1.2 MB, plus a 290 kB chunk for the brotli decoder). `package.json` here pins `three` 0.185.1 (the viewer's own lockfile version) and `vite` 8.2.2 exactly.
3. `pane.html`, at this folder's root, loads `dist/pane.js`.

How the bundle depends on the checkout: `vite.config.mjs` aliases `@bim-open-viewer/core` and `loaders` to `checkout/packages/<name>/dist/index.js`, and every other `@bim-open-viewer/*` package to `checkout/packages/<name>/src/index.ts`, the rule the viewer's own gallery build uses. `three` is aliased to this folder's copy, so the checkout's sources and the bundle share one. The pane's `package.json` therefore lists no viewer package: there is no `file:` dependency, because those packages have no `dist/` to point at. Third-party packages the loaders need (`jszip`, `hyparquet`, `brotli-dec-wasm`) resolve from `checkout/node_modules`.

## How the pane drives it

`src/pane.mjs` creates a canvas, calls `createViewer(canvas)` with the default features, and calls `viewer.open(url, { onProgress })`. `open` fetches, parses, binds the model and fits the camera to it (the viewer's default). A second `load` message aborts the first, disposes the viewer and starts again on a new canvas. Nothing in the viewer is changed or configured; its default environment (light background, grid) is what the screenshot shows.

| State | Source | Observed or inferred |
|---|---|---|
| `fetching` | the pane, as `open` is called | Observed. The page-open to this point includes loading the 1.2 MB bundle only when the pane started itself from `?model=` |
| `parsing` | the first `onProgress` event whose phase is not `fetch`: the loaders report `parse` once the bytes are in hand. `bytes` is the last `fetch` progress value (the file's size) | Observed |
| `first-frame` | one `requestAnimationFrame` after `open` resolves. The viewer's frame loop was queued earlier and draws first, since `open` marks the view dirty and fitting the camera does too | Inferred: the pane does not see the draw call. A hidden or background pane waits for the next frame |
| `done` | the same `t` as `first-frame` | Inferred. The viewer uploads the model in one step, so there is no later incremental upload to wait for. When a future version of the viewer streams geometry, this is the state to change |
| `failed` | `open` returns diagnostics (fetch failure, unreadable file, no WebGL context) or throws; the message joins the diagnostics | Observed |

## What it cannot report

- Running bytes while fetching: the progress events carry them, but the contract takes one `bytes` value and the pane sends the final size with `parsing`.
- Parsing, conversion (BOS to the viewer's internal form) and upload as separate costs: the loaders emit `parse`, `convert` and `metadata` phases, and the pane merges them into `parsing`.
- The true first draw, as above. Under headless SwiftShader (software WebGL) the gap between `parsing` and `first-frame` is dominated by the CPU renderer.
- Memory and frame rate: those belong to the Playwright-driven `view` suite.
- GLB orientation: the viewer treats glTF as y-up, and IfcConvert's default GLB keeps the IFC's z-up axes, so the Duplex GLB appears on its end. The bench runs each tool with its defaults, so the pane does not correct it.

## Checking it

```
node scripts/serve.mjs --port 8771
node tools/bim-open-viewer/check.mjs duplex schependomlaan [--port 8771] [--timeout 600]
```

`check.mjs` drives headless Chrome (WebGL through SwiftShader) over the DevTools protocol with no dependencies, waits for `done` or `failed`, prints the status line, lists console errors, and writes `checkout/screenshot-<model>.png` (git-ignored). It exits 1 on a failure, a console error or a timeout. It needs Node 22 (global `WebSocket`) and Chrome (set `CHROME` if it is not in the usual path). A name ending `.glb` or `.bos` is opened as `?url=/models/cache/<name>`.
