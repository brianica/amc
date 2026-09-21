import type { ExamFile, Tier } from "@pipeline/types";
import { parseAnswers, scoreAttempt } from "@pipeline/score";
import type { AttemptRecord, ErrorCategory, ProblemLogRecord, TimeBucket } from "./store";

export const TIERS: Tier[] = ["T1", "T2", "T3"];
export const TIER_LABEL: Record<Tier, string> = {
  T1: "Q1–10",
  T2: "Q11–18",
  T3: "Q19–25",
};

export const CATEGORIES: ErrorCategory[] = ["careless", "concept", "no_path", "triage"];
export const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  careless: "Careless slip",
  concept: "Didn't know the method",
  no_path: "Couldn't find the path",
  triage: "Ran out of time",
};

export const TIME_BUCKET_LABEL: Record<TimeBucket, string> = {
  under1: "<1 min",
  "1to3": "1–3 min",
  "3to6": "3–6 min",
  over6: "6+ min",
};

export type ExamLookup = (examId: string) => ExamFile | undefined;

export interface Cell {
  area: string;
  tier: Tier;
  seen: number;
  correct: number;
  /** null when nothing of this kind has been attempted yet — not the same as 0%. */
  accuracy: number | null;
}

export interface AttemptOrdinal {
  /** 1 for the first sitting of this paper, 2 for the next, and so on. */
  ordinal: number;
  total: number;
}

/**
 * Number each attempt within its own paper, oldest first.
 *
 * A paper can be sat more than once — that is the point of retaking one — so the
 * lists need to say which sitting they are showing rather than repeating a title.
 * Ties on the date fall back to insertion order, so two sittings on one day still
 * come out stable rather than swapping between renders.
 */
export function attemptOrdinals(attempts: AttemptRecord[]): Map<string, AttemptOrdinal> {
  const byExam = new Map<string, AttemptRecord[]>();
  for (const a of attempts) {
    byExam.set(a.exam_id, [...(byExam.get(a.exam_id) ?? []), a]);
  }

  const out = new Map<string, AttemptOrdinal>();
  for (const sittings of byExam.values()) {
    const ordered = [...sittings].sort(
      (x, y) => x.taken_on.localeCompare(y.taken_on) || x.created_at.localeCompare(y.created_at),
    );
    ordered.forEach((a, i) => out.set(a.id, { ordinal: i + 1, total: ordered.length }));
  }
  return out;
}

export interface SubtopicRow {
  area: string;
  subtopic: string;
  seen: number;
  correct: number;
  accuracy: number;
}

export interface TrendPoint {
  attemptId: string;
  takenOn: string;
  label: string;
  score: number;
  maxScore: number;
  /** Papers are scored out of 150 or 25 depending on contest, so the plotted
   *  value is a percentage — one axis, comparable across contests. */
  pct: number;
}

export interface MixPoint {
  attemptId: string;
  takenOn: string;
  label: string;
  counts: Record<ErrorCategory, number>;
  unclassified: number;
  total: number;
}

export interface Headline {
  papers: number;
  latestScore: number | null;
  latestMax: number | null;
  /** Average points per paper given up to causes the student can act on. */
  avgFixableLost: number | null;
  lostByCause: Record<ErrorCategory, number>;
  lostByTier: Record<Tier, number>;
  classifiedShare: number;
}

/** Every question of every logged paper, with whether it was answered correctly. */
function questionOutcomes(attempts: AttemptRecord[], lookup: ExamLookup) {
  return attempts.flatMap((attempt) => {
    const exam = lookup(attempt.exam_id);
    if (!exam) return [];
    let scored;
    try {
      scored = scoreAttempt(exam, parseAnswers(attempt.answers));
    } catch {
      return []; // a malformed stored answer string must not break the dashboard
    }
    // Join the tagged problem back on: scoring knows the area but not the techniques,
    // and the techniques are what turn a weak area into something to practise.
    return scored.results.map((r) => ({
      attempt,
      exam,
      ...r,
      subtopics: exam.problems[r.n - 1]?.subtopics ?? [],
    }));
  });
}

/**
 * Accuracy per area and tier, over every question seen — not just the missed ones.
 * The denominator is what makes this a strength/weakness picture rather than a
 * tally of mistakes, and it is only available because the exams are pre-tagged.
 */
export function strengthGrid(attempts: AttemptRecord[], lookup: ExamLookup): {
  areas: string[];
  cells: Cell[];
} {
  const seen = new Map<string, { seen: number; correct: number }>();
  const areas = new Set<string>();

  for (const o of questionOutcomes(attempts, lookup)) {
    if (!o.area) continue; // untagged problems cannot be attributed to an area
    areas.add(o.area);
    const key = `${o.area}|${o.tier}`;
    const bucket = seen.get(key) ?? { seen: 0, correct: 0 };
    bucket.seen++;
    if (o.status === "correct") bucket.correct++;
    seen.set(key, bucket);
  }

  const sortedAreas = [...areas].sort();
  const cells: Cell[] = [];
  for (const area of sortedAreas) {
    for (const tier of TIERS) {
      const b = seen.get(`${area}|${tier}`) ?? { seen: 0, correct: 0 };
      cells.push({
        area,
        tier,
        seen: b.seen,
        correct: b.correct,
        accuracy: b.seen === 0 ? null : b.correct / b.seen,
      });
    }
  }
  return { areas: sortedAreas, cells };
}

/**
 * Accuracy per technique, across every question seen.
 *
 * The area level says where the trouble is; this says what to actually practise. A
 * problem carries up to three techniques and counts toward each, so the rows overlap
 * by design — they answer "how do I do on this technique", not "how is my time split".
 *
 * `minSeen` keeps one bad day off the study plan: a single missed question is not
 * evidence of a weakness.
 */
export function subtopicBreakdown(
  attempts: AttemptRecord[],
  lookup: ExamLookup,
  minSeen = 2,
): SubtopicRow[] {
  const tally = new Map<string, { area: string; subtopic: string; seen: number; correct: number }>();

  for (const o of questionOutcomes(attempts, lookup)) {
    if (!o.area) continue;
    for (const subtopic of o.subtopics) {
      const key = `${o.area}|${subtopic}`;
      const row = tally.get(key) ?? { area: o.area, subtopic, seen: 0, correct: 0 };
      row.seen++;
      if (o.status === "correct") row.correct++;
      tally.set(key, row);
    }
  }

  return [...tally.values()]
    .filter((r) => r.seen >= minSeen)
    .map((r) => ({ ...r, accuracy: r.correct / r.seen }))
    // Weakest first, and among equals the one with most evidence behind it.
    .sort((a, b) => a.accuracy - b.accuracy || b.seen - a.seen);
}

export function scoreTrend(
  attempts: AttemptRecord[],
  lookup: ExamLookup,
  label: (exam: ExamFile, attempt: AttemptRecord) => string,
): TrendPoint[] {
  return attempts
    .map((a) => {
      const exam = lookup(a.exam_id);
      if (!exam) return null;
      const max = exam.scoring.correct * exam.problems.length;
      return {
        attemptId: a.id,
        takenOn: a.taken_on,
        label: label(exam, a),
        score: a.score,
        maxScore: max,
        pct: max === 0 ? 0 : a.score / max,
      };
    })
    .filter((p): p is TrendPoint => p !== null)
    .sort((x, y) => x.takenOn.localeCompare(y.takenOn));
}

export function mistakeMix(
  attempts: AttemptRecord[],
  logs: ProblemLogRecord[],
  lookup: ExamLookup,
  label: (exam: ExamFile, attempt: AttemptRecord) => string,
): MixPoint[] {
  const byAttempt = new Map<string, ProblemLogRecord[]>();
  for (const log of logs) {
    byAttempt.set(log.attempt_id, [...(byAttempt.get(log.attempt_id) ?? []), log]);
  }

  return attempts
    .map((a) => {
      const exam = lookup(a.exam_id);
      if (!exam) return null;
      const rows = byAttempt.get(a.id) ?? [];
      const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<ErrorCategory, number>;
      let unclassified = 0;
      for (const row of rows) {
        if (row.error_category) counts[row.error_category]++;
        else unclassified++;
      }
      return {
        attemptId: a.id,
        takenOn: a.taken_on,
        label: label(exam, a),
        counts,
        unclassified,
        total: rows.length,
      };
    })
    .filter((p): p is MixPoint => p !== null)
    .sort((x, y) => x.takenOn.localeCompare(y.takenOn));
}

export function headline(
  attempts: AttemptRecord[],
  logs: ProblemLogRecord[],
  lookup: ExamLookup,
): Headline {
  const lostByCause = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<ErrorCategory, number>;
  const lostByTier: Record<Tier, number> = { T1: 0, T2: 0, T3: 0 };
  const logByKey = new Map(logs.map((l) => [`${l.attempt_id}|${l.q_number}`, l]));
  let classified = 0;
  let missedTotal = 0;

  for (const o of questionOutcomes(attempts, lookup)) {
    if (o.status === "correct") continue;
    missedTotal++;
    const perQuestionLoss = o.exam.scoring.correct - o.points;
    lostByTier[o.tier] += perQuestionLoss;

    const log = logByKey.get(`${o.attempt.id}|${o.n}`);
    if (log?.error_category) {
      classified++;
      lostByCause[log.error_category] += perQuestionLoss;
    }
  }

  const papers = attempts.filter((a) => lookup(a.exam_id)).length;
  // Careless slips and triage failures are the points a student can take back
  // without learning anything new — the honest "left on the table" number.
  const fixable = lostByCause.careless + lostByCause.triage;
  // Two sittings can share a date, so fall back to when each was recorded rather
  // than letting sort order decide which one counts as "latest".
  const latest = [...attempts].sort(
    (a, b) => b.taken_on.localeCompare(a.taken_on) || b.created_at.localeCompare(a.created_at),
  )[0];
  const latestExam = latest ? lookup(latest.exam_id) : undefined;

  return {
    papers,
    latestScore: latest?.score ?? null,
    latestMax: latestExam ? latestExam.scoring.correct * latestExam.problems.length : null,
    avgFixableLost: papers === 0 ? null : fixable / papers,
    lostByCause,
    lostByTier,
    classifiedShare: missedTotal === 0 ? 0 : classified / missedTotal,
  };
}
