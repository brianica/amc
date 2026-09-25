import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Competition, ExamRef, Form } from "@pipeline/types";

/**
 * One row per (competition, year, season, form). Scores are raw points, not
 * percentages, so they can be compared directly against a ScoredAttempt's score
 * without knowing the paper's scoring rules in this module.
 */
export interface AimeCutoffEntry {
  competition: Competition;
  year: number;
  season: "spring" | "fall" | null;
  form: Form;
  /** The score floor to qualify for the AIME. Null for AMC 8, which does not feed AIME. */
  aimeCutoff: number | null;
  /**
   * Score needed to reach each percentile band, highest first. AoPS publishes
   * these inconsistently across years — populate whatever the source page gives
   * for that year and leave the rest out, rather than guessing.
   */
  percentiles: { top: number; score: number }[];
}

interface AimeCutoffsFile {
  version: number;
  note: string;
  entries: AimeCutoffEntry[];
}

const DATA_PATH = join(process.cwd(), "data", "aime-cutoffs.json");

let cache: AimeCutoffEntry[] | null = null;

function load(): AimeCutoffEntry[] {
  if (cache) return cache;
  try {
    const file = JSON.parse(readFileSync(DATA_PATH, "utf8")) as AimeCutoffsFile;
    cache = file.entries;
  } catch {
    cache = [];
  }
  return cache;
}

/** The cutoff/percentile row for one exam, or null when it hasn't been entered yet. */
export function cutoffFor(exam: Pick<ExamRef, "competition" | "year" | "season" | "form">): AimeCutoffEntry | null {
  return (
    load().find(
      (e) =>
        e.competition === exam.competition &&
        e.year === exam.year &&
        e.season === exam.season &&
        e.form === exam.form,
    ) ?? null
  );
}

/** Which percentile band a score falls into, best (lowest "top") first. Null if it
 *  misses every published band or none are recorded for this exam. */
export function percentileBand(entry: AimeCutoffEntry, score: number): { top: number } | null {
  const sorted = [...entry.percentiles].sort((a, b) => a.top - b.top);
  for (const band of sorted) {
    if (score >= band.score) return { top: band.top };
  }
  return null;
}
