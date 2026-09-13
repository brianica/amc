import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExamFile } from "@pipeline/types";

const EXAMS_DIR = join(process.cwd(), "data", "exams");

/**
 * A stand-in so the app can be developed and demonstrated before the real database
 * is seeded. Its answer key is invented, and it is labelled as such everywhere it
 * appears, so it can never be mistaken for a real past paper.
 */
function sampleExam(): ExamFile {
  const key = "ABCDEABCDEABCDEABCDEABCDE";
  const areas = ["algebra", "geometry", "number-theory", "counting-probability"];
  const subtopics: Record<string, string> = {
    algebra: "quadratics-vieta",
    geometry: "circles",
    "number-theory": "modular-arithmetic",
    "counting-probability": "casework",
  };
  return {
    id: "sample-amc10",
    competition: "AMC10",
    year: 2099,
    season: null,
    form: "A",
    wikiPage: "",
    sourceUrl: "",
    numQuestions: 25,
    scoring: { correct: 6, blank: 1.5, wrong: 0, needsVerification: false },
    problems: [...key].map((answer, i) => {
      const area = areas[i % areas.length]!;
      return {
        n: i + 1,
        answer: answer as ExamFile["problems"][number]["answer"],
        answerConfidence: "high" as const,
        answerEvidence: [],
        area,
        subtopics: [subtopics[area]!],
        difficulty: Math.min(5, 1 + Math.floor(i / 6)),
        tier: (i < 10 ? "T1" : i < 18 ? "T2" : "T3") as "T1" | "T2" | "T3",
        descriptor: "Sample problem — not a real contest question.",
        sourceUrl: "",
        tagSource: "auto" as const,
        statement: null,
      };
    }),
  };
}

let cache: ExamFile[] | null = null;

export function allExams(): ExamFile[] {
  if (cache) return cache;

  let real: ExamFile[] = [];
  try {
    real = readdirSync(EXAMS_DIR)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => JSON.parse(readFileSync(join(EXAMS_DIR, f), "utf8")) as ExamFile);
  } catch {
    real = [];
  }

  // Only ever pad with the sample when there is nothing real to show.
  const useSample = real.length === 0 && process.env.SAMPLE_EXAMS === "1";
  cache = useSample ? [sampleExam()] : real;
  return cache;
}

export function isSample(exam: ExamFile): boolean {
  return exam.id === "sample-amc10";
}

export function examLabel(exam: ExamFile): string {
  if (isSample(exam)) return "SAMPLE EXAM — not real contest data";
  const contest = exam.competition.replace("AMC", "AMC ");
  const season = exam.season === "fall" ? " Fall" : "";
  return `${exam.year}${season} ${contest}${exam.form ?? ""}`;
}

export function findExam(id: string): ExamFile | undefined {
  return allExams().find((e) => e.id === id);
}
