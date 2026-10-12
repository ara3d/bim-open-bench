// Where the corpus lives: the manifest, the git-ignored cache, and the cached files of one model.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const manifestPath = join(root, "models", "manifest.json");
export const cacheDir = join(root, "models", "cache");
export const toolsDir = join(cacheDir, "tools");

/** `models/cache/<id>.<ext>`: the source IFC is `ifc`, a converted form its own extension. */
export const cachePath = (id, ext) => join(cacheDir, `${id}.${ext}`);
