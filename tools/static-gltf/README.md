# Static glTF Viewer pane

Static glTF Viewer ([EverseDevelopment/Static.glTF.Viewer](https://github.com/EverseDevelopment/Static.glTF.Viewer), MIT) is a Vite page adapted from Don McCurdy's three-gltf-viewer. It is not on npm. Its `package.json` (version 1.5.1) asks for three.js `^0.160.0`. It reads only glTF and GLB, through three.js `GLTFLoader`, and has no BIM code, so it is the bench's plain-three.js baseline. It shows a GLB that IfcOpenShell's IfcConvert made ahead of time.

`node scripts/tools.mjs static-gltf` clones the commit in `tool.json` and runs `npm ci && npx vite build --base ./`. The build copies everything the page needs into `checkout/dist/` (its `assets/` folder is built output; no environment maps are used), so nothing is copied by hand.

## How the pane drives it

`pane.html` holds an inner iframe on `checkout/dist/index.html?file=<absolute url>&kiosk=1`, same origin as the pane. The viewer tries to base64-decode `file`, and uses it as given when that fails; an absolute URL always fails to decode, so it is used as given. `kiosk=1` hides its header (its e-verse logo stays). `pane.mjs` polls the inner window every 10 ms:

| State | Observed as |
|---|---|
| `fetching` | the inner iframe's `src` is set. The time up to the actual request includes the viewer booting its 1.2 MB script, about 1.5 s on the test machine |
| `parsing` | the inner window's resource entry for the GLB has a `responseEnd`; `bytes` is its `decodedBodySize` |
| `first-frame`, `done` | the viewer's `.spinner` is hidden (it hides it after `GLTFLoader` has parsed the model), then one inner `requestAnimationFrame`. Both are sent on the same `t` |
| `failed` | the viewer calls `window.alert` with its error text and `console.error`; the pane replaces both in the inner window and reports the first line. A load that never finishes fails with "timed out" after 300 s |

## What it cannot report

- Bytes while fetching: the resource entry exists only when the response ends, so there is no running total.
- Fetch and parse as separate costs inside the viewer: `parsing` begins at response end and the next event is the finished scene.
- The true first draw: the pane infers it from the spinner and one animation frame. If the pane is hidden or in a background tab the browser pauses animation frames, so `first-frame` waits until the pane is visible.
- A load error that the viewer logs but does not pass through `alert` or `console.error`.
- Memory or frame rate: those belong to the Playwright-driven `view` suite.
