// The table of forms, found on disk: every module in this folder except this one.
// To add a form (bos, frag, xkt), write `<form>.mjs` here exporting `form`, `extension`,
// and `convert(manifest, input, output)` returning { tool, version, build }. Nothing else changes.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const names = readdirSync(here).filter((f) => f.endsWith(".mjs") && f !== "index.mjs").sort();
const modules = await Promise.all(names.map((f) => import(pathToFileURL(join(here, f)).href)));

export const converters = Object.fromEntries(modules.map((m) => [m.form, m]));
