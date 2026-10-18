# Model corpus

`manifest.json` lists the public IFC models the benchmarks use. The files are never committed. Two commands build the local copy in `models/cache/` (git-ignored):

```
node scripts/fetch.mjs      # download the IFC files; verify size, SHA-256, and schema
node scripts/convert.mjs    # make the .glb, .bos, .frag and .xkt forms of each, timing each conversion
```

Node 20 or later, no packages to install for the fetch and the `.glb` form; the other forms need the converters that `node scripts/tools.mjs` builds. Attribution is in [NOTICE.md](NOTICE.md).

## Commands

- `fetch.mjs [--only <id>] [--check]`: downloads what is missing or wrong, streaming to disk with progress. `--check` verifies and downloads nothing. A mismatch prints the expected and actual size and hash and exits 1.
- `convert.mjs [--only <id>] [--form <form>] [--force]`: converts every fetched model. An output with a record beside it is skipped unless `--force`. The first run downloads IfcConvert into `models/cache/tools/ifcconvert/<version>/` after checking its hash.

## What the cache holds

For model `<id>`: `<id>.ifc`, then one `<id>.<form>` per form (`glb` by IfcConvert, `bos` by the toolkit's `ifc-to-bos`, `frag` by That Open's `IfcImporter`, `xkt` by xeokit's `convert2xkt`) with `<id>.<form>.json` beside it, the conversion record: `tool`, `version`, `build` (the tool's own banner), `seconds` (wall time of the conversion alone), `bytes`, `sha256`. The side-by-side page and the view suite show the seconds beside load time.

## Manifest fields

- `models[]`: `id` (the file name stem), `title`, `source.url` (pinned to a commit or revision, the file itself), `source.page` (human page), `licence` (SPDX id), `licenceHolder`, `attribution`, `sha256` and `bytes` (of the downloaded `.ifc`), `schema` (the FILE_SCHEMA name, checked after download), `facts` (cheap known facts; empty today).
- `tools.<name>`: `version`, `release` page, and `platforms.<platform>-<arch>` with `url`, `sha256`, `bytes`, `executable`. Pinned today for `win32-x64` and `linux-x64`.

GitHub serves the buildingSMART files from Git LFS, so the raw URL returns a 130-byte pointer; the pinned URLs use `media.githubusercontent.com`.

## Add a model

Download it once, compute `sha256sum` and size, read the `FILE_SCHEMA` line, add an entry with a URL pinned to a commit, and run `fetch.mjs --only <id>`. Check the licence first (TKT-144 in bim-open-toolkit). To add a form (`.bos`, `.frag`, `.xkt`), write one module in `scripts/converters/` and add it to `index.mjs`.
