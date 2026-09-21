import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_DIR } from "./wiki.js";

const OUT_PATH = join(CACHE_DIR, "bundle.json");

interface CacheEntry {
  page: string;
  wikitext: string | null;
}

/**
 * Stage 3.5 (deploy prep). Merges every wiki-fetch cache file under pipeline/.cache/
 * into one lookup object, keyed by page, at pipeline/.cache/bundle.json.
 *
 * Vercel silently drops files from a deployed function once the bundle has too many
 * of them — thousands of small per-problem cache files never made it to the deployed
 * filesystem even though `next build`'s own trace manifest listed them and the
 * upload size looked fine. One JSON file sidesteps whatever that ceiling is.
 *
 * Run after `npm run fetch` and before deploying with SHOW_PROBLEM_STATEMENTS=1.
 * Does not touch pipeline/.cache/classify/ (LLM tagging cache, unrelated to
 * statement display) or _last-failure.html (fetch debug dump).
 */
async function walk(dir: string, bundle: Record<string, string | null>): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "classify") continue;
      await walk(full, bundle);
    } else if (entry.name.endsWith(".json") && entry.name !== "bundle.json") {
      try {
        const data = JSON.parse(await readFile(full, "utf8")) as CacheEntry;
        if (typeof data.page === "string") bundle[data.page] = data.wikitext;
      } catch {
        console.warn(`  skipping unreadable cache file: ${full}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const bundle: Record<string, string | null> = {};
  await walk(CACHE_DIR, bundle);
  await writeFile(OUT_PATH, JSON.stringify(bundle));
  console.log(`bundled ${Object.keys(bundle).length} pages -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
