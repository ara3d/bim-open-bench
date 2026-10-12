# Tools and panes

`tools/<name>/` holds one viewer or parser the bench measures. A tool that needs a build (a third-party repository) has a `tool.json`; each tool with a viewer has a `pane.html` that the side-by-side page puts in an iframe and the automated `view` suite drives with Playwright.

## Serving

`node scripts/serve.mjs [--port 8765]` serves the repository root, with Range requests and the headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, so panes that need SharedArrayBuffer (web-ifc threads, IFClite's WebGPU path) can run. Static glTF Viewer still loads under them (checked 2026-10-11 in Chrome). The server also sends `Cross-Origin-Resource-Policy: same-origin`. Consequence for later panes: under `require-corp`, anything loaded from another origin (a CDN script, Google Fonts) is blocked unless that origin sends CORP or CORS headers, so panes must load every resource from the repository.

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

`tools/pane.mjs` implements the shared half (`createPane`); a tool's `pane.mjs` supplies `load({ model, url, report })` and calls `report(state, extra)`. Tests: `node --test tools/pane.test.mjs`.

## Adding a tool

1. Make `tools/<name>/`. For a third-party repository, add `tool.json`: `{ "repo": "<git url>", "commit": "<full sha>", "build": "<shell command run in the checkout>" }`. Pin by full commit sha; take it from `git ls-remote`.
2. `node scripts/tools.mjs <name>` clones to `tools/<name>/checkout/` (git-ignored), checks out the pin, and builds. `node scripts/tools.mjs <name> --check` compares the checkout with the pin.
3. Write `pane.html` and `pane.mjs` using `createPane` from `../pane.mjs`, and a README that says what the viewer is, how the pane drives it, and what it cannot report.
4. Change no tool's source. The bench runs each tool as its authors ship it; a changed setting is written in the pane with the reason.
