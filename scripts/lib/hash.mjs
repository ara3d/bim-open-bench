// SHA-256 of a file, streamed so a 343 MB model never sits in memory.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
