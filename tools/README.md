# Tools and panes

`tools/<name>/` holds one viewer or parser the bench measures. A tool that needs a build (a third-party repository) has a `tool.json`; each tool with a viewer has a `pane.html` that the side-by-side page puts in an iframe and the `view` suite (`scripts/view.mjs`) drives in headless Chrome.

## Serving

`node scripts/serve.mjs [--port 8765]` serves the repository root, with Range requests and the headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, so panes that need SharedArrayBuffer (web-ifc threads, IFClite's WebGPU path) can run. Static glTF Viewer still loads under them (checked 2026-10-11 in Chrome). The server also sends `Cross-Origin-Resource-Policy: same-origin`. Consequence for later panes: under `require-corp`, anything loaded from another origin (a CDN script, Google Fonts) is blocked unless that origin sends CORP or CORS headers, so panes must load every resource from the repository. GitHub Pages sends none of these headers, so a pane that needs isolation may fail on the published copy while it works from the checkout; say which in the pane's README once known.

## The six panes

| Pane | Reads | Pinned by | Licence |
|---|---|---|---|
| `bim-open-viewer` | `.bos`, `.glb` | ara3d/bim-open-viewer at a commit, built from source | MIT |
| `ifclite` | `.ifc` | `@ifc-lite/renderer`, `geometry`, `wasm` exact versions | MPL-2.0 |
| `speckle` | `.bos` | the offline fork `bim-open-web-viewer` at a commit (local path until it is on GitHub, TKT-275 in bim-open-toolkit) | Apache-2.0 |
| `thatopen` | `.ifc`, `.frag` | `@thatopen/components`, `fragments`, `web-ifc` 0.0.77 exact versions | MIT (web-ifc MPL-2.0) |
| `xeokit` | `.ifc`, `.xkt` | `@xeokit/xeokit-sdk` exact version | AGPL-3.0 |
| `static-gltf` | `.glb` | EverseDevelopment/Static.glTF.Viewer at a commit | MIT |

`tools/ifc-to-bos/` is not a pane: it pins ara3d/bim-open-data for the `.bos` converter's console. Each pane's README lists its versions, what it observes and what it infers, and its measurements.

## Opening a pane on its own

`node scripts/serve.mjs`, then `http://localhost:8765/tools/<name>/pane.html?model=duplex` (resolves to `/models/cache/duplex.<ext>`, `ext` being the form the pane reads) or `?url=/models/cache/duplex.glb`. A status line at the top lists each state with its time.

## Checking a pane, and the `view` suite

```
node scripts/view.mjs --tool thatopen --model duplex [--form frag] [--software] [--timeout 600]
node scripts/view.mjs                                  every pane, model and form
node scripts/view.mjs --tool xeokit --model duplex --path [--warm 2] [--repeat 5]
```

The runner starts its own server on a free port, opens `site/side-by-side.html` with one pane in a fresh headless Chrome, waits for `done` or `failed`, and records every state message with its time, the file's size and hash, the conversion that made it, the browser, and what WebGL and WebGPU report as the GPU. Chrome draws on the machine's GPU; `--software` puts WebGL and WebGPU on SwiftShader instead, which is slower and is not comparable with a GPU run. Records go to `results/view/<date>.json` (a rerun replaces records with the same tool, model, form and renderer) and `results/view/README.md` is regenerated from the newest file; `--report` regenerates it alone. Screenshots go to `results/view/scratch/` (git-ignored). The exit code is 1 when any load failed or timed out. No packages; Node 22 or later and Chrome at its usual path (`--chrome <path>` or `CHROME` otherwise).

Three options go further than the load times. `--path` plays the camera path once the load is `done`, with Chrome started without vsync and frame-rate limit, and records the frame times (fps, p50, p95, p99, frames over 33 ms and 100 ms), then screenshots three viewpoints (iso, front, inside) to `results/view/scratch/`. `--warm N` reloads the page N times in the same Chrome after the cold load, so the HTTP and GPU shader caches are warm; each pass is its own record (`cache`, `pass`). `--repeat N` runs each load N times, each in a fresh Chrome, and prints the median and minimum. On Windows every load also samples the memory of that Chrome's processes (`scripts/lib/win-sampler.mjs`: private bytes, working set, and the GPU's dedicated and shared memory from the `GPU Process Memory` counters) and records the peaks during the load, after it, and during the path. Only one run measures at a time: a second waits on `results/view/.view.lock` until the first ends.

### The camera path

`tools/camera-path.mjs` is shared by the panes, as `pane.mjs` is. A pane calls `installCameraPath({ camera })` with an adapter to its viewer, in the viewer's own world: `box()` (the loaded model's box, or null), `up()` (the viewer's up axis) and `set(eye, target)` (place the camera, without animation, and make the viewer draw). The path is relative to the box, so every viewer flies the same route whatever its axes and origin: a full turn outside at 1.6 times the half diagonal, a dive towards the centre, and half a turn inside. Frame times are `requestAnimationFrame` intervals in the pane, measured the same way for every viewer. Each pane's README says how its adapter reaches the viewer and whether every path frame is a real draw.

## The pane contract

Parent page to pane:

```
{ type: "load", model: "<id>", url: "<absolute or root-relative url of the file, in the form this pane reads>" }
```

Pane to parent:

```
{ type: "ready", tool: "<name>", version: "<version string>" }
{ type: "state", state: "fetching" | "parsing" | "first-frame" | "done" | "failed", t, bytes?, message? }
```

- `ready` is sent once, when the pane can accept a `load` message.
- `t` is milliseconds since the `load` message, or since page open when the pane started itself from `?model=` or `?url=`.
- `bytes` is the size fetched so far, or in total, when known. `failed` carries `message`.
- A pane that cannot tell two states apart sends both with the same `t`. A pane says in its README which states it can observe and which it infers.
- A second `load` message restarts the pane; the clock restarts.
- A pane may add a `phases` object to a state message with its own intermediate timings (the Speckle fork reports traverse, convert, render tree, and batching); the side-by-side page shows it as a tooltip on the state.
- A pane hides its own status line when it runs inside another page (`window.parent !== window`), because the parent shows one per pane; the messages still go out.

`tools/pane.mjs` implements the shared half (`createPane`); a tool's `pane.mjs` supplies `load({ model, url, report })` and calls `report(state, extra)`. Tests: `node --test tools/pane.test.mjs`.

## Adding a tool

1. Make `tools/<name>/`. For a third-party repository, add `tool.json`: `{ "repo": "<git url>", "commit": "<full sha>", "build": "<shell command run in the checkout>" }`. Pin by full commit sha; take it from `git ls-remote`.
2. `node scripts/tools.mjs <name>` clones to `tools/<name>/checkout/` (git-ignored), checks out the pin, and builds. `node scripts/tools.mjs <name> --check` compares the checkout with the pin.
3. Write `pane.html` and `pane.mjs` using `createPane` from `../pane.mjs`, and a README that says what the viewer is, how the pane drives it, and what it cannot report.
4. A pane built with Vite (every pane but static-gltf) bundles `tools/pane.mjs` into `dist/`, so a change to the shared module needs `node scripts/tools.mjs` to rebuild the panes. Commit `package-lock.json` so `npm ci` works. Set `build.assetsInlineLimit: 0` in the Vite config, or a WASM file ends up inlined as base64. Under the isolation headers web-ifc picks its threaded build and its workers fail inside a bundle; the That Open pane forces single-thread and says so. The runner starts Chrome with `--enable-unsafe-webgpu`, which a WebGPU pane (IFClite) needs in headless mode; without WebGPU that pane reports `failed`, since the renderer has no WebGL fallback.
5. Add the tool to `site/panes.json` with the forms it reads, first the one it loads by default; the side-by-side page and the runner both read that file.
6. Change no tool's source. The bench runs each tool as its authors ship it; a changed setting is written in the pane with the reason.
