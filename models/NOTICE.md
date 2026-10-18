# Notice

`node scripts/fetch.mjs` downloads the three IFC files below from their public sources into `models/cache/` (git-ignored), and `node scripts/convert.mjs` converts them to the other forms the viewers read (GLB, BOS, Fragments, XKT). The one exception is the Duplex Apartment, small enough (4.7 MB in five forms) to be committed under `models/bundled/` so the published page and a fresh clone show a model with nothing fetched; the other two stay in the cache. `models/bundled/duplex.ifc` is the original file unchanged (same SHA-256 as the manifest); every other file there was converted from it with the tool named in the `.json` record beside it. Any repository or release that ships a converted copy must carry this notice, with the statement that the files were converted from the originals.

All three models are licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/).

## Duplex Apartment

BSI (2020) Duplex Apartment Test Files, buildingSMART International. File `Duplex_A_20110907.ifc` from https://github.com/buildingsmart-community/Community-Sample-Test-Files (`IFC 2.3.0.1 (IFC 2x3)/Duplex Apartment`), commit 7ddf57a201f88a0c213d5322b02ed15e94a60a40.

## Schependomlaan

Schependomlaan design model (Archicad export), (C) original owners. File `IFC Schependomlaan.ifc` from the same buildingSMART repository and commit (`IFC 2.3.0.1 (IFC 2x3)/Schependomlaan/Design model IFC`). Originally published as https://github.com/openBIMstandards/Archive-DataSetSchependomlaan.

## Sixty5

Sixty5 architecture model, from buildingSMART's Community-Sample-Test-Files (`SDK - S1`); the licence file in the IFC-Bench dataset names the holder as "unspecified". The file is taken from the IFC-Bench dataset (https://huggingface.co/datasets/sylvainHellin/ifc-bench, revision df630deb761efcb184f1a30ab374da7dbae38225, `projects/sixty5/arc.ifc`), which records it as CC BY 4.0.
