# Tools and panes

`tools/<name>/` holds one viewer or parser the bench measures. A tool that needs a build (a third-party repository) has a `tool.json`; each tool with a viewer has a `pane.html` that the side-by-side page puts in an iframe and the automated `view` suite drives with Playwright.

## Serving

`node scripts/serve.mjs [--port 8765]` serves the repository root, with Range requests and the headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, so panes that need SharedArrayBuffer (web-ifc threads, IFClite's WebGPU path) can run. Static glTF Viewer still loads under them (checked 2026-10-11 in Chrome). The server also sends `Cross-Origin-Resource-Policy: same-origin`. Consequence for later panes: under `require-corp`, anything loaded from another origin (a CDN script, Google Fonts) is blocked unless that origin sends CORP or CORS headers, so panes must load every resource from the repository.

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
4. A pane built with Vite (every pane but static-gltf) bundles `tools/pane.mjs` into `dist/`, so a change to the shared module needs `node scripts/tools.mjs` to rebuild the panes. Commit `package-lock.json` so `npm ci` works. Set `build.assetsInlineLimit: 0` in the Vite config, or a WASM file ends up inlined as base64. Under the isolation headers web-ifc picks its threaded build and its workers fail inside a bundle; the That Open pane forces single-thread and says so. Chrome's headless mode needs `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader` for a WebGPU pane (IFClite); without WebGPU that pane reports `failed`, since the renderer has no WebGL fallback.
5. Change no tool's source. The bench runs each tool as its authors ship it; a changed setting is written in the pane with the reason.
