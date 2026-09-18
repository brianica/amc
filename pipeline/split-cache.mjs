/**
 * Split a browser-fetched JSON dump into individual pipeline cache files.
 *
 * Usage (from repo root):
 *   node pipeline/split-cache.mjs data/cache/amc10-batch1-cache.json
 *
 * Writes each entry to pipeline/.cache/<page>.json in the format wiki.ts expects:
 *   { "page": "...", "wikitext": "...", "fetchedAt": "..." }
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const CACHE_DIR = "pipeline/.cache";

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: node pipeline/split-cache.mjs <path-to-cache.json>");
  process.exit(1);
}

const entries = JSON.parse(await readFile(inputFile, "utf8"));
let written = 0;

for (const entry of entries) {
  const cacheFile = entry.page.replace(/[^A-Za-z0-9._/-]/g, "_") + ".json";
  const path = join(CACHE_DIR, cacheFile);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(entry, null, 2));
  const status = entry.wikitext ? `${entry.wikitext.length} chars` : "null";
  console.log(`  ${entry.page} — ${status}`);
  written++;
}

console.log(`\nwrote ${written} cache files to ${CACHE_DIR}/`);
