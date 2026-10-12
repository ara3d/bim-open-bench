// IFC to XKT with @xeokit/xeokit-convert's convert2xkt, in Node, on the package's defaults.
//
//   node tools/xeokit/to-xkt.mjs <in.ifc> <out.xkt>
//
// Prints one line: "<package name> <version>". Run `node scripts/tools.mjs xeokit` first, which
// installs the packages this imports. scripts/converters/xkt.mjs calls this file.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [inArg, outArg] = process.argv.slice(2);
const input = inArg && resolve(inArg);
const output = outArg && resolve(outArg);
if (!input || !output) {
  console.error("usage: node tools/xeokit/to-xkt.mjs <in.ifc> <out.xkt>");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const webIfcDir = join(here, "node_modules/web-ifc");
const { convert2xkt } = await import("@xeokit/xeokit-convert/src/convert2xkt.js");
const pkg = JSON.parse(readFileSync(join(here, "node_modules/@xeokit/xeokit-convert/package.json"), "utf8"));

// convert2xkt hands web-ifc the fixed wasm path "./", which web-ifc's Node build reads from the
// working directory of the process as started (process.chdir does not help). Started from any other
// folder the conversion never finishes and prints nothing, so refuse that here.
// scripts/converters/xkt.mjs starts this file with the right working directory.
if (resolve(process.cwd()) !== resolve(webIfcDir)) {
  console.error(`run this from ${webIfcDir} (scripts/converters/xkt.mjs does); web-ifc loads its wasm from the working directory`);
  process.exit(2);
}

const log = [];
try {
  await convert2xkt({ source: input, output, log: (m) => log.push(m) });
} catch (error) {
  console.error(log.join("\n"));
  console.error(`convert2xkt failed on ${input}: ${error?.message ?? error}`);
  process.exit(1);
}
console.log(`${pkg.name} ${pkg.version}`);
