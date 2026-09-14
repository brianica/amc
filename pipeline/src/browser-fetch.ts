/**
 * browser-fetch.ts
 *
 * Fetches all priority-set exam pages via the Chrome DevTools MCP (which has
 * a real browser fingerprint and can pass Cloudflare challenges), then writes
 * results in the same cache format that wiki.ts uses.
 *
 * Usage (not a standalone script — invoked from fetch-via-browser.ts):
 *   npm run fetch:browser
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { priorityExams } from "./manifest.js";
import { CACHE_DIR } from "./wiki.js";

export interface PageResult {
  page: string;
  wikitext: string | null;
  fetchedAt: string;
}

/** Mirrors wiki.ts cachePath() exactly so the normal pipeline can read these. */
export function cachePath(page: string): string {
  return join(CACHE_DIR, `${page.replace(/[^A-Za-z0-9._/-]/g, "_")}.json`);
}

export async function writeCacheEntry(result: PageResult): Promise<void> {
  const p = cachePath(result.page);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(result, null, 2));
}

/** All pages we need: exam index + 25 problems + answer key per exam. */
export function allPagesNeeded(): string[] {
  const pages: string[] = [];
  for (const exam of priorityExams()) {
    pages.push(exam.wikiPage);
    for (let n = 1; n <= exam.numQuestions; n++) {
      pages.push(`${exam.wikiPage}/Problem_${n}`);
    }
    pages.push(exam.wikiPage.replace(/_Problems$/, "_Answer_Key"));
  }
  return pages;
}
