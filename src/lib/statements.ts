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
 * Off unless SHOW_PROBLEM_STATEMENTS=1. Deliberately *not* a NEXT_PUBLIC_ variable:
 * it is a deployment decision, not something the browser can ask for.
 */
export function showStatements(): boolean {
  return process.env.SHOW_PROBLEM_STATEMENTS === "1";
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
