import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExamFile } from "@pipeline/types";
import { sampleExam } from "./sample-exam";

const EXAMS_DIR = join(process.cwd(), "data", "exams");

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
