import type { ExamFile } from "@pipeline/types";

/** Pure, no filesystem access — safe to import from a client component. */
export function isSample(exam: ExamFile): boolean {
  return exam.id === "sample-amc10";
}

export function examLabel(exam: ExamFile): string {
  if (isSample(exam)) return "SAMPLE EXAM — not real contest data";
  const contest = exam.competition.replace("AMC", "AMC ");
  const season = exam.season === "fall" ? " Fall" : "";
  return `${exam.year}${season} ${contest}${exam.form ?? ""}`;
}
