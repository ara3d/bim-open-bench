#!/usr/bin/env node
// Static file server for the repository root, with no dependencies.
//
//   node scripts/serve.mjs [--port 8765]
//
// Other scripts import startServer(port) to serve the same root in-process
// (scripts/view.mjs does, on a port of its own).
//
// Serves Range requests (so large models stream and seek) and sets the
// cross-origin isolation headers that SharedArrayBuffer needs (WebAssembly
// threads, WebGPU paths). tools/README.md says what happens to panes that
// load resources from other origins under those headers.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portArg = process.argv.indexOf("--port");
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 8765;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".ifc": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-cache",
};

// "bytes=a-b", "bytes=a-", "bytes=-n" against a file of `size` bytes; undefined when unusable.
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return undefined;
  let start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === "" || m[2] === "" ? size - 1 : Number(m[2]);
  end = Math.min(end, size - 1);
  start = Math.max(start, 0);
  return start <= end && start < size ? { start, end } : undefined;
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403, isolation).end("forbidden"); return; }
  let info = await stat(path).catch(() => undefined);
  if (info?.isDirectory()) { path = join(path, "index.html"); info = await stat(path).catch(() => undefined); }
  if (!info) { res.writeHead(404, isolation).end("not found"); return; }
  const headers = { ...isolation, "Content-Type": types[extname(path).toLowerCase()] ?? "application/octet-stream", "Accept-Ranges": "bytes" };
  const range = req.headers.range ? parseRange(req.headers.range, info.size) : undefined;
  if (req.headers.range && !range) { res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}` }).end(); return; }
  if (range) {
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`, "Content-Length": range.end - range.start + 1 });
  } else {
    res.writeHead(200, { ...headers, "Content-Length": info.size });
  }
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(path, range).pipe(res);
}

/** Starts the server; resolves to the listening http.Server (`server.address().port` when port is 0). */
export function startServer(port) {
  const server = createServer((req, res) => handle(req, res).catch((e) => { res.writeHead(500).end(String(e)); }));
  return new Promise((ok, fail) => server.once("error", fail).listen(port, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startServer(port);
  console.log(`serving ${root} at http://localhost:${port}/`);
}
