export type Competition = "AMC8" | "AMC10" | "AMC12";
export type Form = "A" | "B" | null;
export type Letter = "A" | "B" | "C" | "D" | "E";
export type Tier = "T1" | "T2" | "T3";
export type Confidence = "high" | "medium" | "low";

/** Scoring differs by contest and era, so it is stored per exam, never hardcoded. */
export interface Scoring {
  correct: number;
  blank: number;
  wrong: number;
  /** True until the values have been confirmed against the exam's own source page. */
  needsVerification: boolean;
}

export interface ExamRef {
  id: string;
  competition: Competition;
  year: number;
  /** The Nov-2021 contests share a year with the Feb-2021 ones; this disambiguates. */
  season: "spring" | "fall" | null;
  form: Form;
  /** MediaWiki page title for the whole exam, e.g. "2023_AMC_10A_Problems". */
  wikiPage: string;
  sourceUrl: string;
  numQuestions: 25;
  scoring: Scoring;
}

export interface TaggedProblem {
  n: number;
  answer: Letter | null;
  answerConfidence: Confidence;
  /** Every boxed letter found, kept so a reviewer can see what the sources disagreed on. */
  answerEvidence: Letter[];
  area: string | null;
  subtopics: string[];
  difficulty: number | null;
  tier: Tier;
  /** Our own <=12-word description. Never the original problem text. */
  descriptor: string | null;
  sourceUrl: string;
  tagSource: "auto" | "reviewed";
  /** Only ever populated if the problem text is properly licensed. Never committed. */
  statement: null;
}

export interface ExamFile extends ExamRef {
  problems: TaggedProblem[];
}

/** Intermediate, held in memory and cached to disk only. Never committed. */
export interface ExtractedProblem {
  n: number;
  statement: string;
  solutions: string[];
  answerEvidence: Letter[];
  answer: Letter | null;
  answerConfidence: Confidence;
}

export function tierOf(n: number): Tier {
  if (n <= 10) return "T1";
  if (n <= 18) return "T2";
  return "T3";
}
