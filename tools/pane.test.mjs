import assert from "node:assert/strict";
import { test } from "node:test";
import { formatState, resolveTarget } from "./pane.mjs";

test("a model id resolves to the cache file in the pane's form", () => {
  assert.deepEqual(resolveTarget("?model=duplex", "glb"), { model: "duplex", url: "/models/cache/duplex.glb" });
  assert.deepEqual(resolveTarget("?model=duplex", "ifc"), { model: "duplex", url: "/models/cache/duplex.ifc" });
});

test("an explicit url wins and names the model from its file", () => {
  assert.deepEqual(resolveTarget("?url=/models/cache/a.b.glb", "glb"), { model: "a.b", url: "/models/cache/a.b.glb" });
});

test("no query means standalone with nothing to load", () => {
  assert.equal(resolveTarget("", "glb"), undefined);
});

test("status text shows state, time, bytes, and message", () => {
  assert.equal(formatState({ state: "done", t: 12.4, bytes: 99 }), "done  12 ms  99 bytes");
  assert.equal(formatState({ state: "failed", t: 1, message: "x" }), "failed  1 ms  x");
});
