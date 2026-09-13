import type { ExamFile, Letter, Tier } from "./types.js";

export type Status = "correct" | "incorrect" | "blank";

export interface QuestionResult {
  n: number;
  tier: Tier;
  area: string | null;
  given: Letter | null;
  correct: Letter | null;
  status: Status;
  points: number;
}

export interface ScoredAttempt {
  score: number;
  maxScore: number;
  counts: Record<Status, number>;
  results: QuestionResult[];
  /** Points given up per tier, which is what tells careless errors from hard problems. */
  lostByTier: Record<Tier, number>;
}

/**
 * Parse a 25-character answer string. "-", ".", and " " all mean blank, so a student
 * can paste whichever convention they already use.
 */
export function parseAnswers(raw: string, expected = 25): (Letter | null)[] {
  const chars = [...raw.trim().toUpperCase()].filter((c) => !/\s/.test(c) || c === " ");
  const cleaned = chars.filter((c) => /[A-E\-. ]/.test(c));
  if (cleaned.length !== expected) {
    throw new Error(`expected ${expected} answers, got ${cleaned.length}`);
  }
  return cleaned.map((c) => (/[A-E]/.test(c) ? (c as Letter) : null));
}

export function scoreAttempt(exam: ExamFile, given: (Letter | null)[]): ScoredAttempt {
  if (given.length !== exam.problems.length) {
    throw new Error(`exam ${exam.id} has ${exam.problems.length} problems, got ${given.length} answers`);
  }

  const { correct: cPts, blank: bPts, wrong: wPts } = exam.scoring;
  const counts: Record<Status, number> = { correct: 0, incorrect: 0, blank: 0 };
  const lostByTier: Record<Tier, number> = { T1: 0, T2: 0, T3: 0 };
  const results: QuestionResult[] = [];
  let score = 0;

  for (const [i, problem] of exam.problems.entries()) {
    const answer = given[i] ?? null;
    const status: Status = answer === null ? "blank" : answer === problem.answer ? "correct" : "incorrect";
    const points = status === "correct" ? cPts : status === "blank" ? bPts : wPts;

    score += points;
    counts[status]++;
    // A blank still earns credit, so "lost" is measured against a correct answer.
    lostByTier[problem.tier] += cPts - points;

    results.push({
      n: problem.n,
      tier: problem.tier,
      area: problem.area,
      given: answer,
      correct: problem.answer,
      status,
      points,
    });
  }

  return {
    score,
    maxScore: cPts * exam.problems.length,
    counts,
    results,
    lostByTier,
  };
}
