import { describe, expect, it } from "vitest";
import { parseAnswers, scoreAttempt } from "../src/score.js";
import { tierOf, type Competition, type ExamFile, type Letter } from "../src/types.js";

/** Minimal exam fixture. Not real contest data — answer keys here are invented. */
function fixture(
  competition: Competition,
  year: number,
  key: string,
  scoring: { correct: number; blank: number },
): ExamFile {
  return {
    id: `${competition.toLowerCase()}-${year}-X`,
    competition,
    year,
    season: null,
    form: "A",
    wikiPage: "fixture",
    sourceUrl: "fixture",
    numQuestions: 25,
    scoring: { ...scoring, wrong: 0, needsVerification: false },
    problems: [...key].map((answer, i) => ({
      n: i + 1,
      answer: answer as Letter,
      answerConfidence: "high" as const,
      answerEvidence: [answer as Letter],
      area: i % 2 === 0 ? "algebra" : "geometry",
      subtopics: ["linear-systems"],
      difficulty: 2,
      tier: tierOf(i + 1),
      descriptor: "fixture problem",
      sourceUrl: "fixture",
      tagSource: "auto" as const,
      statement: null,
    })),
  };
}

const KEY = "ABCDEABCDEABCDEABCDEABCDE";
const modern = fixture("AMC10", 2023, KEY, { correct: 6, blank: 1.5 });

describe("scoreAttempt — era-specific scoring", () => {
  it("scores a perfect AMC 10 paper at 150", () => {
    expect(scoreAttempt(modern, parseAnswers(KEY)).score).toBe(150);
  });

  it("scores an all-blank modern paper at 37.5", () => {
    expect(scoreAttempt(modern, parseAnswers("-".repeat(25))).score).toBe(37.5);
  });

  it("scores an all-blank 2002-2006 paper at 62.5", () => {
    const old = fixture("AMC10", 2005, KEY, { correct: 6, blank: 2.5 });
    expect(scoreAttempt(old, parseAnswers("-".repeat(25))).score).toBe(62.5);
  });

  it("scores an all-blank 2000-2001 paper at 50", () => {
    const oldest = fixture("AMC10", 2000, KEY, { correct: 6, blank: 2 });
    expect(scoreAttempt(oldest, parseAnswers("-".repeat(25))).score).toBe(50);
  });

  it("scores AMC 8 out of 25 with no blank credit", () => {
    const amc8 = fixture("AMC8", 2024, KEY, { correct: 1, blank: 0 });
    expect(scoreAttempt(amc8, parseAnswers(KEY)).score).toBe(25);
    expect(scoreAttempt(amc8, parseAnswers("-".repeat(25))).score).toBe(0);
  });

  it("scores a realistic mixed paper", () => {
    // First 20 correct, next 3 deliberately wrong, last 2 blank.
    const wrong = [...KEY.slice(20, 23)].map((c) => (c === "A" ? "B" : "A")).join("");
    const r = scoreAttempt(modern, parseAnswers(KEY.slice(0, 20) + wrong + "--"));
    expect(r.counts).toEqual({ correct: 20, incorrect: 3, blank: 2 });
    expect(r.score).toBe(20 * 6 + 3 * 0 + 2 * 1.5); // 123
  });
});

describe("scoreAttempt — diagnostics", () => {
  it("attributes lost points to the tier they were lost in", () => {
    // Miss Q1-Q3 (tier 1) only.
    const given = "EEE" + KEY.slice(3);
    const r = scoreAttempt(modern, parseAnswers(given));
    expect(r.lostByTier.T1).toBe(18); // three wrong answers at 6 points each
    expect(r.lostByTier.T2).toBe(0);
    expect(r.lostByTier.T3).toBe(0);
  });

  it("counts a blank as a partial loss, not a full one", () => {
    const r = scoreAttempt(modern, parseAnswers(`-${KEY.slice(1)}`));
    expect(r.lostByTier.T1).toBe(4.5); // 6 earnable minus 1.5 blank credit
  });

  it("reports per-question status and carries the topic through", () => {
    const r = scoreAttempt(modern, parseAnswers(`E${KEY.slice(1, 24)}-`));
    expect(r.results[0]).toMatchObject({ n: 1, status: "incorrect", given: "E", correct: "A" });
    expect(r.results[1]).toMatchObject({ n: 2, status: "correct", area: "geometry" });
    expect(r.results[24]).toMatchObject({ n: 25, status: "blank", given: null });
  });
});

describe("parseAnswers", () => {
  it("accepts dash, dot and space as blank", () => {
    expect(parseAnswers(`-.${"A".repeat(23)}`).slice(0, 2)).toEqual([null, null]);
  });

  it("is case-insensitive", () => {
    expect(parseAnswers("abcde".repeat(5))[0]).toBe("A");
  });

  it("rejects a string of the wrong length rather than silently padding", () => {
    expect(() => parseAnswers("ABC")).toThrow(/expected 25/);
  });

  it("rejects an answer outside A-E", () => {
    expect(() => parseAnswers(`F${"A".repeat(24)}`)).toThrow(/expected 25/);
  });
});
