/**
 * Fills .dev-data/db.json with a few sample papers so the dashboard has something to
 * show on a fresh local checkout. Development only: it writes to the file-backed
 * store used when no Supabase project is configured, and never touches a real one.
 *
 *   npm run seed:dev
 */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { sampleExam } from "../src/lib/sample-exam";
import { parseAnswers, scoreAttempt } from "../pipeline/src/score";
import type { AttemptRecord, ErrorCategory, ProblemLogRecord } from "../src/lib/store";

const exam = sampleExam();
const key = exam.problems.map((p) => p.answer!).join("");
const NEXT: Record<string, string> = { A: "B", B: "C", C: "D", D: "E", E: "A" };

/** Build an answer string that is wrong at some questions and blank at others. */
function paper(wrongAt: number[], blankAt: number[]): string {
  return [...key]
    .map((c, i) => (blankAt.includes(i + 1) ? "-" : wrongAt.includes(i + 1) ? NEXT[c]! : c))
    .join("");
}

interface Spec {
  date: string;
  wrong: number[];
  blank: number[];
  causes: ErrorCategory[];
}

// Four papers over six weeks, improving slightly, with the misses drifting later in
// the paper — roughly the shape of a real run of practice tests.
const SPECS: Spec[] = [
  {
    date: "2026-05-02",
    wrong: [3, 7, 12, 14, 19],
    blank: [21, 22, 24, 25],
    causes: ["careless", "careless", "concept", "no_path", "concept"],
  },
  {
    date: "2026-05-16",
    wrong: [2, 9, 13, 17],
    blank: [23, 24, 25],
    causes: ["careless", "concept", "no_path", "no_path"],
  },
  {
    date: "2026-06-01",
    wrong: [5, 11, 13, 15, 16, 18],
    blank: [24, 25],
    causes: ["careless", "no_path", "concept", "no_path", "concept", "no_path"],
  },
  {
    date: "2026-06-14",
    wrong: [8, 14, 17],
    blank: [24, 25],
    causes: ["careless", "no_path", "concept"],
  },
];

const attempts: AttemptRecord[] = [];
const logs: ProblemLogRecord[] = [];

for (const spec of SPECS) {
  const answers = paper(spec.wrong, spec.blank);
  const scored = scoreAttempt(exam, parseAnswers(answers));
  const id = randomUUID();

  attempts.push({
    id,
    user_id: "dev-user",
    exam_id: exam.id,
    taken_on: spec.date,
    mode: "paper",
    answers,
    duration_min: 75,
    score: scored.score,
    include_in_stats: true,
    timings: null,
    created_at: `${spec.date}T12:00:00Z`,
    status: "complete",
  });

  spec.wrong.forEach((q, i) => {
    logs.push({
      attempt_id: id,
      user_id: "dev-user",
      q_number: q,
      status: "incorrect",
      error_category: spec.causes[i] ?? null,
      time_bucket: null,
      note: null,
    });
  });

  // Blanks at the end of the paper are a triage failure, which is exactly what the
  // "points left on the table" headline is meant to surface.
  spec.blank.forEach((q) => {
    logs.push({
      attempt_id: id,
      user_id: "dev-user",
      q_number: q,
      status: "blank",
      error_category: "triage",
      time_bucket: null,
      note: null,
    });
  });

  console.log(`  ${spec.date}  ${scored.score}/${scored.maxScore}`);
}

await mkdir(".dev-data", { recursive: true });
await writeFile(".dev-data/db.json", JSON.stringify({ attempts, logs }, null, 2));
console.log(`seeded ${attempts.length} attempts and ${logs.length} logged questions`);
