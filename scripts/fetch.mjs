// Downloads the corpus's IFC files into models/cache/ and checks them against models/manifest.json.
//
//   node scripts/fetch.mjs                 fetch what is missing or wrong, verify all
//   node scripts/fetch.mjs --only duplex   one model
//   node scripts/fetch.mjs --check         verify what is present; download nothing
import { existsSync, statSync } from "node:fs";
import { downloadVerified } from "./lib/download.mjs";
import { sha256File } from "./lib/hash.mjs";
import { readIfcSchema } from "./lib/ifc-header.mjs";
import { readManifest, selectModels } from "./lib/manifest.mjs";
import { cachePath } from "./lib/paths.mjs";

/** "ok", or a one-line reason the cached file is not the manifest's file. */
async function verify(model, path) {
  if (!existsSync(path)) return "missing";
  const bytes = statSync(path).size;
  if (bytes !== model.bytes) return `${bytes} bytes, expected ${model.bytes}`;
  const sha256 = await sha256File(path);
  if (sha256 !== model.sha256) return `sha256 ${sha256}, expected ${model.sha256}`;
  const schema = readIfcSchema(path);
  if (schema !== model.schema) return `schema ${schema}, expected ${model.schema}`;
  return "ok";
}

const checkOnly = process.argv.includes("--check");
const models = selectModels(readManifest(), process.argv);
let failed = false;

for (const model of models) {
  const path = cachePath(model.id, "ifc");
  let state = await verify(model, path);
  if (state !== "ok" && !checkOnly) {
    if (state !== "missing") console.log(`${model.id}: ${state}; downloading again`);
    await downloadVerified(model.id, model.source.url, path, model);
    state = await verify(model, path);
  }
  if (state === "ok") console.log(`${model.id}: verified (${model.schema}, ${model.bytes} bytes, sha256 ${model.sha256.slice(0, 12)}...)`);
  else { console.error(`${model.id}: ${state}`); failed = true; }
}
process.exit(failed ? 1 : 0);
