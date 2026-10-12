// Converts the fetched IFC files into the other forms the viewers read, and records how long each took.
//
//   node scripts/convert.mjs                        every model, every form
//   node scripts/convert.mjs --only duplex          one model
//   node scripts/convert.mjs --form glb             one form (see scripts/converters/index.mjs)
//   node scripts/convert.mjs --force                redo conversions whose output already exists
//
// Writes models/cache/<id>.<ext> and models/cache/<id>.<ext>.json:
//   { tool, version, build, seconds, bytes, sha256 }   build is the tool's own banner; seconds is the wall time of the conversion alone.
import { existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { converters } from "./converters/index.mjs";
import { sha256File } from "./lib/hash.mjs";
import { flagValue, readManifest, selectModels } from "./lib/manifest.mjs";
import { cachePath } from "./lib/paths.mjs";

const manifest = readManifest();
const force = process.argv.includes("--force");
const formName = flagValue(process.argv, "--form");
if (formName !== undefined && !converters[formName]) {
  console.error(`unknown form "${formName}"; known: ${Object.keys(converters).join(", ")}`);
  process.exit(2);
}
const chosen = formName ? [converters[formName]] : Object.values(converters);

for (const model of selectModels(manifest, process.argv)) {
  const input = cachePath(model.id, "ifc");
  if (!existsSync(input)) {
    console.error(`${model.id}: ${input} is missing; run node scripts/fetch.mjs first`);
    process.exit(1);
  }
  for (const converter of chosen) {
    const output = cachePath(model.id, converter.extension);
    const record = `${output}.json`;
    const label = `${model.id} -> ${converter.form}`;
    if (!force && existsSync(output) && existsSync(record)) {
      console.log(`${label}: already converted (use --force to redo)`);
      continue;
    }
    // IfcConvert returns at once when its output file already exists (0.05 s for duplex against 5 s fresh), so a forced run must start clean.
    rmSync(output, { force: true });
    console.log(`${label}: converting`);
    const started = process.hrtime.bigint();
    const { tool, version, build } = await converter.convert(manifest, input, output);
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    const entry = { tool, version, build, seconds: Math.round(seconds * 100) / 100, bytes: statSync(output).size, sha256: await sha256File(output) };
    writeFileSync(record, JSON.stringify(entry, null, 2) + "\n");
    console.log(`${label}: ${entry.seconds} s, ${entry.bytes} bytes`);
  }
}
