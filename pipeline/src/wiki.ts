import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const API = "https://artofproblemsolving.com/wiki/api.php";
const WIKI_INDEX = "https://artofproblemsolving.com/wiki/index.php";
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
 *
 * Two transports are tried, because a MediaWiki install may expose either, both, or
 * neither depending on how it is configured and fronted:
 *
 *   1. api.php  — the JSON API
 *   2. index.php?action=raw — plain wikitext, which survives an api.php that is
 *      disabled or sitting behind something that answers HTML
 *
 * Whichever works first for this wiki is remembered for the rest of the run, so the
 * fallback costs one wasted request, not one per page.
 */
type Transport = "api" | "raw";
let preferred: Transport | null = null;

interface Attempt {
  wikitext: string | null;
  missing: boolean;
}

/** An HTML body where JSON or wikitext was expected means this transport is no good. */
function looksLikeHtml(body: string): boolean {
  return /^\s*(<!DOCTYPE|<html|<\?xml)/i.test(body.slice(0, 200));
}

async function viaApi(page: string): Promise<Attempt> {
  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`;
  const res = await request(url);
  if (res.status === 404) return { wikitext: null, missing: true };

  const text = await res.text();
  if (looksLikeHtml(text)) {
    throw new TransportUnavailable(`api.php returned HTML (HTTP ${res.status})`, text);
  }

  let body: { parse?: { wikitext?: string }; error?: { code?: string } };
  try {
    body = JSON.parse(text);
  } catch {
    throw new TransportUnavailable(`api.php returned unparseable content (HTTP ${res.status})`, text);
  }

  if (body.error) {
    if (body.error.code === "missingtitle") return { wikitext: null, missing: true };
    throw new Error(`wiki error: ${body.error.code}`);
  }
  return { wikitext: body.parse?.wikitext ?? null, missing: false };
}

async function viaRaw(page: string): Promise<Attempt> {
  const url = `${WIKI_INDEX}?title=${encodeURIComponent(page)}&action=raw`;
  const res = await request(url);
  if (res.status === 404) return { wikitext: null, missing: true };

  const text = await res.text();
  if (looksLikeHtml(text)) {
    throw new TransportUnavailable(`action=raw returned HTML (HTTP ${res.status})`, text);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from action=raw`);
  return { wikitext: text, missing: false };
}

class TransportUnavailable extends Error {
  constructor(message: string, readonly body: string) {
    super(message);
  }
}

async function request(url: string): Promise<Response> {
  await throttle();
  return globalThis.fetch(url, {
    headers: {
      "User-Agent": "amc-diagnostic-tagger/1.0 (topic metadata extraction; contact repo owner)",
      Accept: "application/json, text/plain, */*",
    },
    redirect: "follow",
  });
}

/** Keep the offending response so a failure can be diagnosed instead of guessed at. */
async function dumpFailure(page: string, body: string): Promise<string> {
  const path = join(CACHE_DIR, "_last-failure.html");
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path, `<!-- page: ${page} -->\n${body.slice(0, 20000)}`);
  return path;
}

export async function getWikitext(page: string, opts: { refresh?: boolean } = {}): Promise<string | null> {
  if (!opts.refresh) {
    const hit = await readCache(page);
    if (hit) return hit.wikitext;
  }

  const order: Transport[] = preferred ? [preferred] : ["api", "raw"];
  const unavailable: TransportUnavailable[] = [];

  for (const transport of order) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
      try {
        const result = transport === "api" ? await viaApi(page) : await viaRaw(page);
        preferred = transport;
        await writeCache({ page, wikitext: result.wikitext, fetchedAt: new Date().toISOString() });
        return result.wikitext;
      } catch (err) {
        // A wrong transport is a settled fact, not bad luck: retrying cannot fix it.
        if (err instanceof TransportUnavailable) {
          unavailable.push(err);
          lastError = err;
          break;
        }
        lastError = err;
      }
    }

    if (!(lastError instanceof TransportUnavailable)) {
      throw new Error(`failed to fetch ${page} after 4 attempts: ${String(lastError)}`);
    }
  }

  const dump = await dumpFailure(page, unavailable[unavailable.length - 1]?.body ?? "");
  throw new Error(
    [
      `Could not read ${page} from the wiki.`,
      ...unavailable.map((e) => `  - ${e.message}`),
      "",
      `The response was saved to ${dump}.`,
      "An HTML body usually means a bot check or an access block rather than a missing",
      "page — open the page URL in a browser and compare.",
    ].join("\n"),
  );
}

export function problemPage(examWikiPage: string, n: number): string {
  return `${examWikiPage}/Problem_${n}`;
}

export function answerKeyPage(examWikiPage: string): string {
  return examWikiPage.replace(/_Problems$/, "_Answer_Key");
}
