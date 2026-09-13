import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const API = "https://artofproblemsolving.com/wiki/api.php";
export const CACHE_DIR = join(process.cwd(), "pipeline", ".cache");

const MIN_INTERVAL_MS = 1000; // be a polite guest on someone else's wiki
let lastRequest = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cachePath(page: string): string {
  return join(CACHE_DIR, `${page.replace(/[^A-Za-z0-9._/-]/g, "_")}.json`);
}

/** `null` is cached too: a page that does not exist should not be re-probed forever. */
type CacheEntry = { page: string; wikitext: string | null; fetchedAt: string };

async function readCache(page: string): Promise<CacheEntry | null> {
  try {
    return JSON.parse(await readFile(cachePath(page), "utf8")) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  const p = cachePath(entry.page);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(entry, null, 2));
}

async function throttle(): Promise<void> {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
}

/**
 * Fetch one page's raw wikitext, or null if the page does not exist.
 * Results are cached on disk so the whole pipeline is re-runnable offline.
 */
export async function getWikitext(page: string, opts: { refresh?: boolean } = {}): Promise<string | null> {
  if (!opts.refresh) {
    const hit = await readCache(page);
    if (hit) return hit.wikitext;
  }

  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
    await throttle();
    try {
      const res = await globalThis.fetch(url, {
        headers: { "User-Agent": "amc-diagnostic-tagger/1.0 (metadata extraction; contact repo owner)" },
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as
        | { parse?: { wikitext?: string } }
        | { error?: { code?: string } };

      if ("error" in body && body.error) {
        // missingtitle is a real answer, not a failure: the page does not exist.
        if (body.error.code === "missingtitle") {
          await writeCache({ page, wikitext: null, fetchedAt: new Date().toISOString() });
          return null;
        }
        throw new Error(`wiki error: ${body.error.code}`);
      }

      const wikitext = "parse" in body ? (body.parse?.wikitext ?? null) : null;
      await writeCache({ page, wikitext, fetchedAt: new Date().toISOString() });
      return wikitext;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`failed to fetch ${page} after 4 attempts: ${String(lastError)}`);
}

export function problemPage(examWikiPage: string, n: number): string {
  return `${examWikiPage}/Problem_${n}`;
}

export function answerKeyPage(examWikiPage: string): string {
  return examWikiPage.replace(/_Problems$/, "_Answer_Key");
}
