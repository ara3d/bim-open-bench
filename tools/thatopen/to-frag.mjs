// IFC to Fragments with That Open's IfcImporter, in Node. Run by scripts/converters/frag.mjs:
//
//   node tools/thatopen/to-frag.mjs <in.ifc> <out.frag>
//
// Prints one line, "@thatopen/fragments <version>", for the conversion record. Needs the pane's
// packages: node scripts/tools.mjs thatopen (npm ci in this folder).
// Settings: IfcImporter's defaults (README, "Rules for a fair comparison"); web-ifc's wasm is
// read from node_modules/web-ifc/ because the importer's default path is for browsers.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as FRAGS from "@thatopen/fragments";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: node to-frag.mjs <in.ifc> <out.frag>"); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(join(here, "node_modules/@thatopen/fragments/package.json"), "utf8")).version;

const importer = new FRAGS.IfcImporter();
importer.wasm = { path: join(here, "node_modules/web-ifc") + "/", absolute: true };

const bytes = new Uint8Array(readFileSync(input));
const fragments = await importer.process({ bytes });
writeFileSync(output, fragments);
console.log(`@thatopen/fragments ${version}`);
