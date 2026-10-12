// Download a URL to a file with progress, a size check, and a SHA-256 check.
// The bytes go to `<target>.part` and are renamed only after both checks pass, so a
// half-written or wrong file is never mistaken for the real one.
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const megabytes = (n) => (n / 1048576).toFixed(1);

/**
 * @param {string} label shown in the progress line
 * @param {string} url
 * @param {string} target final path
 * @param {{ bytes: number, sha256: string }} expected both required; a mismatch throws with both values
 */
export async function downloadVerified(label, url, target, expected) {
  mkdirSync(dirname(target), { recursive: true });
  const part = `${target}.part`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status} for ${url}`);

  const hash = createHash("sha256");
  const out = createWriteStream(part);
  const interactive = process.stdout.isTTY;
  let received = 0, lastPrinted = -1;
  const started = Date.now();
  try {
    for await (const chunk of response.body) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((resolve) => out.once("drain", resolve));
      const percent = Math.floor((received / expected.bytes) * 100);
      const step = interactive ? percent : Math.floor(percent / 10) * 10;
      if (step !== lastPrinted) {
        lastPrinted = step;
        process.stdout.write(`${interactive ? "\r" : ""}${label}: ${megabytes(received)} of ${megabytes(expected.bytes)} MB (${percent}%)${interactive ? "" : "\n"}`);
      }
    }
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
  } catch (error) {
    out.destroy();
    rmSync(part, { force: true });
    throw error;
  }
  if (interactive) process.stdout.write("\n");

  const actual = hash.digest("hex");
  if (received !== expected.bytes || actual !== expected.sha256) {
    rmSync(part, { force: true });
    throw new Error(`${label}: download does not match the manifest\n  url:      ${url}\n  expected: ${expected.bytes} bytes, sha256 ${expected.sha256}\n  actual:   ${received} bytes, sha256 ${actual}`);
  }
  renameSync(part, target);
  console.log(`${label}: downloaded in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
