/**
 * Writes null cache entries for every non-priority exam page so extract/classify/validate
 * can run offline without hitting the network for pages we haven't fetched yet.
 *
 * Safe to re-run: skips pages that already have a cache entry.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { candidateExams, priorityExams } from "./manifest.js";
import { CACHE_DIR } from "./wiki.js";

function cachePath(page: string): string {
  return join(CACHE_DIR, `${page.replace(/[^A-Za-z0-9._/-]/g, "_")}.json`);
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main(): Promise<void> {
  const priorityIds = new Set(priorityExams().map((e) => e.id));
  let stubbed = 0;

  for (const exam of candidateExams()) {
    if (priorityIds.has(exam.id)) continue;

    const pages: string[] = [exam.wikiPage];
    for (let n = 1; n <= exam.numQuestions; n++) pages.push(`${exam.wikiPage}/Problem_${n}`);
    pages.push(exam.wikiPage.replace(/_Problems$/, "_Answer_Key"));

    for (const page of pages) {
      const p = cachePath(page);
      if (await exists(p)) continue;
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, JSON.stringify({ page, wikitext: null, fetchedAt: new Date().toISOString() }, null, 2));
      stubbed++;
    }
  }

  console.log(`stubbed ${stubbed} non-priority pages as null cache entries`);
}

main().catch((err) => { console.error(err); process.exit(1); });
