// Reads the schema name from an IFC file's FILE_SCHEMA header line.
import { openSync, readSync, closeSync } from "node:fs";

/** "IFC2X3" for `FILE_SCHEMA(('IFC2X3'));`. The header is within the first few kilobytes. */
export function readIfcSchema(path) {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(65536);
    const n = readSync(fd, buffer, 0, buffer.length, 0);
    const match = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(buffer.toString("latin1", 0, n));
    if (!match) throw new Error(`${path}: no FILE_SCHEMA line in the first ${n} bytes`);
    return match[1].toUpperCase();
  } finally {
    closeSync(fd);
  }
}
