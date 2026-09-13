import type { ExamFile } from "@pipeline/types";

/**
 * A stand-in so the app can be developed and demonstrated before the real database
 * is seeded. Its answer key is invented, and it is labelled as such everywhere it
 * appears, so it can never be mistaken for a real past paper.
 */
export function sampleExam(): ExamFile {
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

