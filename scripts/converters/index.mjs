// The table of forms. To add one (bos, frag, xkt), write a module here that exports
// `form`, `extension`, and `convert(manifest, input, output)` returning { tool, version },
// then add one line below. convert.mjs needs no other change.
import * as glb from "./glb.mjs";

export const converters = Object.fromEntries([glb].map((module) => [module.form, module]));
