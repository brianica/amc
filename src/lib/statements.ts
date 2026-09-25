import "server-only";
import type { ExamFile } from "@pipeline/types";
import { splitSections } from "@pipeline/extract";
import { renderStatement, type RenderedStatement } from "./wikitext";
import { problemLink } from "./wiki-links";
// Generated TypeScript source, not a JSON file read at runtime: Vercel's serverless
// deploy was silently dropping pipeline/.cache/ files (thousands of individual
// entries, then a single merged bundle.json, then even a JSON import of it — Next
// still compiles a JSON import to a runtime file read for a Node target) despite a
// clean trace manifest and reasonable upload size each time. Actual .ts source is the
// only form guaranteed to compile into the bundle with no file reference involved.
// Run `npm run bundle-cache` after `npm run fetch` to regenerate it.
import bundle from "./statement-cache.generated";
// Same reasoning and same regeneration command as the statement bundle above —
// see render-diagrams.ts for how this cache is built and bundle-cache.ts for how
// it is compiled into source.
import diagramBundle from "./diagram-cache.generated";

/**
 * Serves problem statements from the local pipeline cache, for a private instance.
 *
 * AMC problems are MAA copyright. The rule this enforces is the one that actually
 * matters: statements are never committed and never served by a public deployment.
 * A personal instance reading its own local cache is a different thing from
 * republishing, and this switch is what keeps the two apart.
 *
 * Requires SHOW_PROBLEM_STATEMENTS=1, which `.env.example` sets — so a local checkout
 * has it on, while a host, which never receives the gitignored `.env.local`, does not
 * unless someone sets it there deliberately. Nothing in the code turns it on by
 * itself. Deliberately *not* a NEXT_PUBLIC_ variable: it is a deployment decision, not
 * something the browser can ask for.
 */
let warned = false;

export function showStatements(): boolean {
  const on = process.env.SHOW_PROBLEM_STATEMENTS === "1";

  // Enabled on a production build is legitimate for a private instance and a
  // copyright problem for a public one, and the app cannot tell which it is. Say so
  // once at startup so it is not a silent condition nobody notices.
  if (on && process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn(
      "[statements] SHOW_PROBLEM_STATEMENTS=1 in a production build: this instance " +
        "serves MAA-copyright problem text. Intended for a private instance only.",
    );
  }

  return on;
}

function readCachedWikitext(page: string): string | null {
  return bundle[page] ?? null;
}

/** A MediaWiki redirect stub, e.g. "#redirect [[2025 AMC 12A Problems/Problem 1]]". */
function redirectTarget(wikitext: string): string | null {
  const m = /^\s*#redirect\s*\[\[([^\]|]+)/i.exec(wikitext);
  return m ? m[1]!.trim().replace(/ /g, "_") : null;
}

/**
 * Some AMC 10 problems are cross-listed with AMC 12 and their wiki page is a one-line
 * redirect stub rather than real content — `fetch` caches that stub verbatim under the
 * AMC 10 page's own path, since resolving it is `extract`/`classify`'s job at read time.
 * Follow the same redirect here, from the cache only: a private instance's cache is
 * offline by design, so this never makes a network call, and a target that was never
 * fetched (rather than fetching the source exam directly) just falls through to null.
 */
function cachedWikitext(page: string): string | null {
  const text = readCachedWikitext(page);
  const target = text ? redirectTarget(text) : null;
  return target ? readCachedWikitext(target) : text;
}

export interface StatementSet {
  /** Indexed by question number minus one; null where nothing is available. */
  byQuestion: (RenderedStatement | null)[];
  /** How many of the paper's problems could actually be shown. */
  available: number;
}

/**
 * Load and render every statement for a paper.
 *
 * Returns nulls rather than throwing when the cache is missing: an instance with the
 * switch on but no cache yet should fall back to links, not break the sitting.
 */
export async function loadStatements(exam: ExamFile): Promise<StatementSet | null> {
  if (!showStatements()) return null;

  const byQuestion = exam.problems.map((problem) => {
    const page = `${exam.wikiPage}/Problem_${problem.n}`;
    const wikitext = cachedWikitext(page);
    if (!wikitext) return null;

    const { statement } = splitSections(wikitext);
    if (!statement.trim()) return null;

    // Only the problem, never the solutions: the point is to sit the paper.
    const svg = diagramBundle[page];
    return renderStatement(statement, problemLink(exam.wikiPage, problem.n), svg);
  });

  return { byQuestion, available: byQuestion.filter(Boolean).length };
}
