<img src="brand/lockup.svg" alt="BIM Open Bench" height="48">

Reproducible benchmarks for IFC viewers, parsers, and AI agents, run on public building models with known answers.

BIM Open Bench measures tools that read building models. Every tool gets the same public IFC files, pinned by hash, and is run the way its authors ship it. Each result records the tool's version, the machine, the browser, and the hash of every file, so anyone can rerun it and check the numbers. It is part of the [BIM Open](https://github.com/ara3d/bim-open-toolkit) family, but it tests competing tools on equal terms, and the results are committed whether or not a BIM Open tool wins.

## What is here

- **A corpus** of three public IFC models (`models/`): the buildingSMART Duplex (2.4 MB), Schependomlaan (49 MB), and Sixty5 (343 MB), each pinned by SHA-256 to a commit of its source, with its licence and attribution in `models/NOTICE.md`. A script converts each into the other forms the viewers read (`.glb`, `.bos`, `.frag`, `.xkt`) and records how long each conversion took.
- **Six viewer panes** (`tools/`), one per viewer, each pinned to an exact version and each speaking one small message contract: BIM Open Viewer, IFClite, Speckle's viewer (through an offline fork), That Open Engine, xeokit, and Static glTF Viewer (a plain three.js page, the baseline). `tools/README.md` has the contract, the table of versions and licences, and how to add a viewer.
- **The side-by-side page** (`site/side-by-side.html`): one model opened in all six viewers at once, in six panes of the same size, with a line per pane giving the viewer's version, the form it reads, how long that form took to make ahead of time, its state, and its time. A viewer that reads two forms has a picker. "Copy table" puts the last load on the clipboard as a Markdown table.
- **The `view` suite** (`scripts/view.mjs`): drives the same page one pane at a time in headless Chrome on the machine's GPU and records every state with its time. The latest numbers are in [`results/view/README.md`](results/view/README.md); the result files beside it carry the full records.

## Quick start

Node 22 or later, Git, Chrome, .NET 8 (for the BOS converter), and about 1 GB of disk for the models and their forms (the viewer checkouts and their packages take several more).

```
npm run fetch        # download the three IFC files and verify their hashes
npm run tools        # clone and build the pinned viewers (the first run takes a while: two of them build from source)
npm run convert      # make .glb, .bos, .frag and .xkt for each model, timing each
npm run serve        # http://localhost:8765/site/side-by-side.html
npm run view         # the view suite: every pane, every model, every form; then results/view/README.md
```

`node scripts/view.mjs --tool thatopen --model duplex --form frag` runs one load; `--software` renders on SwiftShader instead of the GPU. Each pane can also be opened on its own: `http://localhost:8765/tools/<name>/pane.html?model=duplex`.

One pin is not yet public: the Speckle fork (`tools/speckle/tool.json`) points at a local path until it is pushed (TKT-275 in bim-open-toolkit), so a fresh clone builds five of the six panes.

## The published page

`.github/workflows/pages.yml` publishes `site/`, the pane bundles it can build, and the results to GitHub Pages on every push to `main`: `https://ara3d.github.io/bim-open-bench/` once Pages is switched on with source "GitHub Actions" (TKT-142). The models there come from release assets named by `release.baseUrl` in `models/manifest.json`, which do not exist yet (TKT-319); until they do, the published page shows the panes and can load nothing. The workflow builds every pane but Speckle's (its pin is a local path, above), and Pages sends no cross-origin isolation headers, so the checkout served by `npm run serve` stays the reference for the numbers.

## What the view suite measures, and what it does not

Each pane reports `fetching`, `parsing`, `first-frame`, `done`, or `failed`, with milliseconds since the Load message and the bytes fetched. The suite records those, plus the file's size and hash, the conversion that made it, the browser version, and the GPU as WebGL and WebGPU report it. Each pane's README says which states it observes and which it infers, and what it cannot see (the true first draw, parse time apart from conversion inside one library call). Not measured yet: peak memory, frame rate while orbiting, and multi-threaded web-ifc.

Two biases are declared rather than hidden. Three viewers parse the IFC in the browser (IFClite, That Open, xeokit); the other three read a form made ahead of time (BOS, GLB), and the conversion time is reported beside the load time. The Speckle pane feeds the fork BOS directly rather than Speckle objects made ahead, which may or may not be fairer to Speckle; its README says why.

## For the NRC paper's viewer test kit

The test kit in `nrc-ifc-llm/IFC-Test-Kit/` uses two files, `duplex.ifc` and `large_test_model.ifc`. They are byte-identical to this corpus's `duplex` and `schependomlaan` (the same SHA-256, `b347a2c8…` and `2c3565ca…`). The view suite's rows for those two models are therefore the kit's step 1 (load the Duplex) and step 6 (load the large model and record its speed) for every web viewer in the paper's comparison table, run rather than read from project pages, with the versions and the machine recorded. Steps 2 to 5 (colour from a CSV, a property panel, totals by level) are not measured here.

## Rules for a fair comparison

- Every tool runs on the same machine, the same models, and its own default settings. Any setting changed from the default is written in the pane with the reason.
- Conversion time is reported separately from load time, so a tool that converts ahead of time is neither hidden nor punished.
- Adapters are public, so each tool's authors can check that their tool was used properly. A fix from them is welcome.
- A tool that cannot run offline from a script (one that needs an account or a vendor's cloud) is left out or marked as run by hand.
- Results are committed, including the ones where a BIM Open tool loses.

## Planned suites

| Suite | Measures | Compares |
|---|---|---|
| `ask` | Correct answers, time, and tokens for questions and tasks over the corpus | Claude with the toolkit's MCP servers and skills, against Claude with raw files and a shell; IFC-Bench joins here. This is workflow 5 of the toolkit's `PROJECT.md` |
| `geometry` | Mesh correctness: volumes, bounding boxes, missing or extra elements, against ground truth kept in `truth/` | The toolkit's mesher, web-ifc, IfcOpenShell |
| `parse` | IFC load time, memory, and how many entities come back whole | web-ifc, IfcOpenShell, IFClite, the BOS converter |

Each suite is one folder under `suites/` with a task file, a scorer, and a README, and writes `results/<suite>/<date>.json` in the shape the view suite uses. `query` and `size` suites come later, if someone asks those questions. Desktop viewers (Bonsai, BIMcollab ZOOM, Solibri Anywhere, FZKViewer) get a one-off table filled by hand, not an automated suite; xBIM WeXplorer joins the panes if its conversion step can be scripted.

## Out of scope

- Release gates for single projects ("this release did not get slower"). Those belong in each project's own tests.
- Model files in the repository. The corpus is fetched by script; the open licensing question is TKT-144 in bim-open-toolkit.
- Hosted services that need accounts: Autodesk Platform Services, Bentley iTwin, Trimble Connect, Dalux, Revizto.

## Open questions

- Which public model of about 450,000 instances can stand in for the private Snowdon model, the size the toolkit claims to handle?
- Should the published numbers also come from a laptop without a dedicated GPU?
- How often is the report rerun: on each toolkit release, or on each release of any tool in it?

## Branding

The mark, colours, and fonts are in [`brand/BRANDING.md`](brand/BRANDING.md); the family guide is `docs/BRANDING.md` in `bim-open-toolkit`. The history of how each piece was built and what each step found is in the commit messages (`git log`), not here.
