import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExamFile } from "@pipeline/types";
import { splitSections } from "@pipeline/extract";
import { renderStatement, type RenderedStatement } from "./wikitext";

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

const CACHE_DIR = join(process.cwd(), "pipeline", ".cache");

function cachePath(page: string): string {
  return join(CACHE_DIR, `${page.replace(/[^A-Za-z0-9._/-]/g, "_")}.json`);
}

async function cachedWikitext(page: string): Promise<string | null> {
  try {
    const entry = JSON.parse(await readFile(cachePath(page), "utf8")) as { wikitext: string | null };
    return entry.wikitext;
  } catch {
    return null;
  }
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

  const byQuestion = await Promise.all(
    exam.problems.map(async (problem) => {
      const page = `${exam.wikiPage}/Problem_${problem.n}`;
      const wikitext = await cachedWikitext(page);
      if (!wikitext) return null;

      const { statement } = splitSections(wikitext);
      if (!statement.trim()) return null;

      // Only the problem, never the solutions: the point is to sit the paper.
      return renderStatement(statement);
    }),
  );

  return { byQuestion, available: byQuestion.filter(Boolean).length };
}
