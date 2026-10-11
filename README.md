<img src="brand/lockup.svg" alt="BIM Open Bench" height="48">

Reproducible benchmarks for IFC parsers, viewers, and AI agents, run on public building models with known answers.

BIM Open Bench measures tools that read building models. Every tool gets the same public IFC files and is scored against the same known answers. Each run records the tool's version, the machine, and the hash of every model, so anyone can rerun it and check the numbers. It is part of the [BIM Open](https://github.com/ara3d/bim-open-toolkit) family, but it tests competing tools on equal terms.

Nothing below is built yet. This README is the plan.

## Why it exists

The BIM Open Toolkit claims four things: what it can do, how easy it is to start, how large a model it handles, and how little time and how few tokens an answer costs. None of these claims means anything without a number next to another tool's number. The toolkit already measures things in four separate places, each with its own models and scripts:

- IFC-Bench, an external question set with ground truth, run against the toolkit's IFC server (TKT-145 in `bim-open-toolkit`).
- Ten questions over the DuckDB export and eight over IFC files (`samples/ask/` in `bim-open-toolkit`).
- Mesher parity: the toolkit's geometry compared against a reference mesher (TKT-65).
- The planned comparison of Claude with the toolkit against Claude with only the raw files and a shell (workflow 5 in the toolkit's `PROJECT.md`).

Each needs the same three things: models it may redistribute, answers to compare against, and a fixed way to run and report. This repository builds them once.

## What it will hold

### 1. A model corpus

`models/manifest.json` lists public IFC files: the buildingSMART samples, the IFC-Bench models, and open sample projects. Each entry has the source URL, the licence, a SHA-256 hash, the file size, and basic facts (element count, storeys, bounding box). A fetch script downloads and checks them. The files themselves are never committed, not even through Git LFS; the open licensing question is TKT-144 (sample model redistribution) in `bim-open-toolkit`.

The corpus should span sizes, from a single-room sample to a model of about 450,000 instances, because size is one of the four claims. The Snowdon model is private and stays out; a public model of similar size is needed in its place.

### 2. Ground truth

`truth/<model>/` holds the known answers for each model, kept apart from any tool: element counts by type, quantities, property values, storey membership, and geometry statistics such as volumes and bounding boxes per element. Each answer records how it was obtained: by hand, from IfcOpenShell, or from two independent tools that agree. When a tool disagrees with the truth, that record is what settles who is wrong.

### 3. Suites

Each suite is one folder under `suites/`, with the same shape: a task or question file, a scorer, and a README saying what is measured and how.

| Suite | Measures | Compares | Order |
|---|---|---|---|
| `ask` | Correct answers, time, and tokens for questions and tasks | Claude with the toolkit's MCP servers and skills, against Claude with raw files and a shell; IFC-Bench lives here | Second |
| `geometry` | Mesh correctness: volumes, bounding boxes, missing or extra elements | The toolkit's mesher, web-ifc, IfcOpenShell | Third |
| `view` | Time to first frame, peak memory, frame rate while orbiting; and a page that opens the same model in every viewer at once | See the shortlist below | First |
| `parse` | IFC load time, memory, and how many entities come back whole | web-ifc, IfcOpenShell, ifc-lite, the BOS converter | Fourth |
| `query` | Query speed and answers after conversion | DuckDB over BOS, SQLite, IfcOpenShell scripts | Later, if asked for |
| `size` | File size and conversion time | IFC, BOS (Parquet), That Open Fragments, glTF | Later, if asked for |

The `view` suite starts with six viewers, all of which run offline in a browser from a script:

1. BIM Open Viewer
2. IFClite
3. Speckle's viewer, through the offline fork in `bim-open-web-viewer` (no server, no account)
4. That Open Engine, timed on raw IFC and on Fragments made ahead
5. xeokit, timed on raw IFC and on XKT made ahead
6. Static glTF Viewer (EverseDevelopment/Static.glTF.Viewer, MIT, three.js 0.160, a Vite page adapted from Don McCurdy's three-gltf-viewer, last pushed 2025-10-14), showing a GLB made ahead by IfcConvert: the baseline, a plain three.js scene with no BIM code

xBIM WeXplorer comes next if its conversion step can be scripted. Desktop viewers (Bonsai, BIMcollab ZOOM, Solibri Anywhere, FZKViewer) get a one-off manual table, not an automated suite.

#### The side-by-side page

The first thing the suite ships is not a table of numbers but a page, `site/side-by-side.html`, that opens one model in all six viewers at once, so a person can watch them load and then orbit each. The layout is deliberately partial: BIM Open Viewer takes the left half, and the other five share the right half in a grid of two columns and three rows. A toolbar holds the model picker, a Load button that starts every pane at the same instant, and a per-pane line with the viewer's name and version, its state (fetching, parsing, first frame, done, failed), the elapsed time, and the bytes it fetched. The page is a demo first and a measurement second; the numbers it shows are honest but the automated suite, not the page, produces the published ones.

What each pane loads, and why it differs. Three of the six parse IFC in the browser themselves: IFClite (its own Rust parser in WebAssembly), That Open (web-ifc, then Fragments), and xeokit (`WebIFCLoaderPlugin`, also over web-ifc). The other three do not read IFC at all: BIM Open Viewer reads BOS, GLB, and OBJ; Speckle's viewer reads Speckle objects, which the fork can build from BOS in memory; and Static glTF Viewer reads only glTF and GLB. So every model in the corpus is kept in the forms each viewer accepts, converted ahead of time by script, and the page shows the conversion time beside the load time, as the fairness rules require. The conversions and who makes them:

| Form | Made by | Used by |
|---|---|---|
| `.ifc` | the source | IFClite, That Open, xeokit |
| `.bos` (Parquet) | the toolkit's `ifc_to_bos` | BIM Open Viewer, Speckle fork |
| `.frag` | That Open's `IfcImporter` in Node | That Open, second timing |
| `.xkt` | xeokit's `convert2xkt` | xeokit, second timing |
| `.glb` | IfcOpenShell's IfcConvert, pinned release | Static glTF Viewer; BIM Open Viewer, second timing |

This is the bias the page admits: the BIM Open side gets a pre-converted file and the largest pane. The per-pane line says so in words ("BOS, converted ahead in 4.1 s"), which is enough for now.

Each pane is an iframe with its own small Vite page and its own `node_modules`, under `tools/<viewer>/`. Six viewers pin four different three.js versions (Speckle's fork 0.140, Static glTF Viewer 0.160, That Open 0.182 or later, BIM Open Viewer 0.185), IFClite renders with WebGPU, and xeokit has its own WebGL engine; one bundle cannot hold them, and a crash in one must not take the others down. The page and the panes speak one small `postMessage` contract: the page sends `{load, model, url}`; a pane replies with `{state, t, bytes}` at each state change, and `{error, message}` on failure. Static glTF Viewer is not on npm and takes its model from a `?file=` query parameter (`?kiosk=1` hides its header), so its pane is the viewer's own page built from a pinned commit under `tools/static-gltf/`, wrapped by a few lines that pass the URL in and report the states out. The same pane pages, driven by Playwright instead of the toolbar, are the automated `view` suite's adapters, so nothing is written twice.

Questions the first build answers: whether IFClite's renderer falls back to WebGL where WebGPU is off (a laptop without it, or a headless run); whether the Speckle fork's BOS path, measured at about 20 s for Snowdon in Node, is also the right path for the small models or whether Speckle objects made ahead are fairer to it; whether xeokit's `WebIFCLoaderPlugin` and That Open's loader can share one `web-ifc` WASM fetch or each pay for their own; and what the page does with a model one viewer cannot open (show the failure, keep the others running).

### 4. Tool adapters

`tools/<name>/` holds one small adapter per tool: load a model, answer or render, and report what the suite measures. Each tool is installed the way a real user would install it, pinned to an exact version:

- JavaScript packages: exact versions in `package.json` and the lockfile, no `^` ranges.
- Python tools: a lock file.
- Native programs such as IfcConvert: a pinned release URL and hash, downloaded by script.
- BIM Open tools: the same route as everyone else, a published package or release. Where none exists yet, a URL and commit hash, as `deps.json` does in `bim-open-toolkit`.

No submodules. The bench depends on the toolkit; the toolkit never depends on the bench.

### 5. One runner, one result format, one report

```
bench run <suite> --tool <name> [--model <id>]
```

writes `results/<suite>/<date>-<tool>.json` with the tool and version, the machine (OS, CPU, GPU, memory), the model hashes, the scores, and for the `ask` suite the full transcript. A report script turns the latest results into one page per suite, published with GitHub Pages and styled per [`brand/BRANDING.md`](brand/BRANDING.md).

## Rules for a fair comparison

- Every tool runs on the same machine, the same models, and its own default settings. Any setting changed from the default is written in the adapter with the reason.
- Conversion time is reported separately from load time, so a tool that converts ahead of time is neither hidden nor punished.
- Adapters are public, so each tool's authors can check that their tool was used properly. A fix from them is welcome.
- A tool that cannot run offline from a script (one that needs an account or a vendor's cloud) is left out or marked as run by hand.
- Results are committed, including the ones where a BIM Open tool loses.

## Out of scope

- Release gates for single projects ("this release did not get slower"). Those belong in each project's own tests.
- Model files in the repository.
- Hosted services that need accounts: Autodesk Platform Services, Bentley iTwin, Trimble Connect, Dalux, Revizto.

## Plan

Each step ends with something that runs and a result committed.

1. **A small corpus.** Manifest, fetch script, and three models with known licences: one small (the buildingSMART Duplex, CC BY 4.0), one medium (Schependomlaan), one large enough to separate the viewers. Each kept in the four forms the table above lists, made by a `convert` script that records its own time. Done when a fresh clone fetches, verifies, and converts every model with one command.
2. **Six panes.** One iframe page per viewer under `tools/<viewer>/`, each pinned to an exact version, each speaking the `postMessage` contract, each shown to load the Duplex on its own. Order: Static glTF Viewer, BIM Open Viewer, and That Open first (the baseline is the smallest adapter, and the toolkit already builds against the other two), then xeokit, IFClite, and the Speckle fork, which carry the open questions. Done when each pane page loads the three models and reports its states.
3. **The side-by-side page.** The toolbar, the layout, the per-pane lines, and the published copy on GitHub Pages. Done when a person opens the page, picks a model, presses Load, and watches all six.
4. **The automated `view` suite.** Playwright drives the same pane pages, records first frame, peak memory, and orbit frame rate per viewer and model, and writes the result format. Done when `bench run view` produces one result file per viewer and the report page lists them.
5. **Runner and report.** The result format and the report page, generalised from step 4 and shared by every later suite.
6. **`ask` suite.** Port the toolkit's question sets and IFC-Bench; write the scorer; run both arms (with the toolkit, and with raw files and a shell) with the same Claude model. Done when one command runs both arms and writes a report with correctness, time, and tokens per arm. This is the toolkit's workflow 5, and it should install the toolkit through its documented one-command install, which then gets checked on every run.
7. **`geometry` suite.** Ground-truth volumes and bounding boxes per element; reuse the toolkit's mesher parity checks.
8. **`parse` suite.** Adapters for the four parsers.
9. **Later.** `query` and `size`, when someone asks those questions.

## Open questions

- Does the side-by-side page run from GitHub Pages with the models fetched from their source URLs, or only locally after the fetch script, because the converted forms (BOS, Fragments, XKT) have nowhere public to live? A release asset per model on this repository is the likely answer.
- Which public model of about 450,000 instances can stand in for Snowdon?
- Which machine runs the published numbers, and should the `view` suite also report a laptop without a dedicated GPU?
- Does the `ask` suite wait for the toolkit's one-command install (workflow 1), or build from source until it exists?
- How often is the published report rerun: on each toolkit release, or on each release of any tool in it?

## Branding

The mark, colours, and fonts are in [`brand/BRANDING.md`](brand/BRANDING.md); the family guide is `docs/BRANDING.md` in `bim-open-toolkit`.
