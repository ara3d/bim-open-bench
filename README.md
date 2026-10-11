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
| `ask` | Correct answers, time, and tokens for questions and tasks | Claude with the toolkit's MCP servers and skills, against Claude with raw files and a shell; IFC-Bench lives here | First |
| `geometry` | Mesh correctness: volumes, bounding boxes, missing or extra elements | The toolkit's mesher, web-ifc, IfcOpenShell | Second |
| `view` | Time to first frame, peak memory, frame rate while orbiting | See the shortlist below | Third |
| `parse` | IFC load time, memory, and how many entities come back whole | web-ifc, IfcOpenShell, ifc-lite, the BOS converter | Third |
| `query` | Query speed and answers after conversion | DuckDB over BOS, SQLite, IfcOpenShell scripts | Later, if asked for |
| `size` | File size and conversion time | IFC, BOS (Parquet), That Open Fragments, glTF | Later, if asked for |

The `view` suite starts with five tools, all of which run offline in a browser from a script:

1. BIM Open Viewer
2. That Open Engine, timed on raw IFC and on Fragments made ahead
3. ifc-lite
4. xeokit, timed on raw IFC and on XKT made ahead
5. IfcConvert to GLB in a plain three.js viewer, as a baseline

Speckle and xBIM WeXplorer come next if their conversion steps can be scripted. Desktop viewers (Bonsai, BIMcollab ZOOM, Solibri Anywhere, FZKViewer) get a one-off manual table, not an automated suite.

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

1. **Corpus.** Manifest, fetch script, and five to ten models with known licences, from small to large. Done when a fresh clone fetches and verifies every model with one command.
2. **`ask` suite.** Port the toolkit's question sets and IFC-Bench; write the scorer; run both arms (with the toolkit, and with raw files and a shell) with the same Claude model. Done when one command runs both arms and writes a report with correctness, time, and tokens per arm. This is the toolkit's workflow 5, and it should install the toolkit through its documented one-command install, which then gets checked on every run.
3. **Runner and report.** The result format and the report page, shared by every suite after this one.
4. **`geometry` suite.** Ground-truth volumes and bounding boxes per element; reuse the toolkit's mesher parity checks.
5. **`view` and `parse` suites.** Adapters for the five shortlisted viewers and the four parsers.
6. **Later.** `query` and `size`, when someone asks those questions.

## Open questions

- Which public model of about 450,000 instances can stand in for Snowdon?
- Which machine runs the published numbers, and should the `view` suite also report a laptop without a dedicated GPU?
- Does the `ask` suite wait for the toolkit's one-command install (workflow 1), or build from source until it exists?
- How often is the published report rerun: on each toolkit release, or on each release of any tool in it?

## Branding

The mark, colours, and fonts are in [`brand/BRANDING.md`](brand/BRANDING.md); the family guide is `docs/BRANDING.md` in `bim-open-toolkit`.
