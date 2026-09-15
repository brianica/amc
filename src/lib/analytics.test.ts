import { describe, expect, it } from "vitest";
import { attemptOrdinals, headline, mistakeMix, scoreTrend, strengthGrid, subtopicBreakdown } from "./analytics";
import type { AttemptRecord, ProblemLogRecord } from "./store";
import { tierOf, type ExamFile, type Letter } from "@pipeline/types";

const KEY = "ABCDEABCDEABCDEABCDEABCDE";

function exam(id: string, competition: "AMC8" | "AMC10", correct: number, blank: number): ExamFile {
  const areas = ["algebra", "geometry"];
  return {
    id,
    competition,
    year: 2024,
    season: null,
    form: "A",
    wikiPage: "",
    sourceUrl: "",
    numQuestions: 25,
    scoring: { correct, blank, wrong: 0, needsVerification: false },
    problems: [...KEY].map((a, i) => ({
      n: i + 1,
      answer: a as Letter,
      answerConfidence: "high" as const,
      answerEvidence: [],
      area: areas[i % 2]!,
      subtopics: ["linear-systems"],
      difficulty: 2,
      tier: tierOf(i + 1),
      descriptor: null,
      sourceUrl: "",
      tagSource: "auto" as const,
      statement: null,
    })),
  };
}

const EXAMS: Record<string, ExamFile> = {
  "amc10-a": exam("amc10-a", "AMC10", 6, 1.5),
  "amc8-a": exam("amc8-a", "AMC8", 1, 0),
};
const lookup = (id: string) => EXAMS[id];
const label = (e: ExamFile) => e.id;

function attempt(id: string, examId: string, takenOn: string, answers: string, score: number): AttemptRecord {
  return {
    id, user_id: "u1", exam_id: examId, taken_on: takenOn, mode: "paper",
    answers, duration_min: 75, score, include_in_stats: true, timings: null, created_at: `${takenOn}T00:00:00Z`,
  };
}

function log(attemptId: string, q: number, category: ProblemLogRecord["error_category"]): ProblemLogRecord {
  return {
    attempt_id: attemptId, user_id: "u1", q_number: q,
    status: "incorrect", error_category: category, time_bucket: null, note: null,
  };
}

describe("strengthGrid", () => {
  it("counts every question seen, not only the missed ones", () => {
    // All 25 correct: 13 odd-index algebra, 12 geometry, spread across three tiers.
    const { areas, cells } = strengthGrid([attempt("a1", "amc10-a", "2026-01-01", KEY, 150)], lookup);
    expect(areas).toEqual(["algebra", "geometry"]);
    expect(cells.reduce((n, c) => n + c.seen, 0)).toBe(25);
    expect(cells.every((c) => c.accuracy === null || c.accuracy === 1)).toBe(true);
  });

  it("distinguishes 'not attempted' from 'zero percent'", () => {
    const { cells } = strengthGrid([], lookup);
    expect(cells).toEqual([]);
    const one = strengthGrid([attempt("a1", "amc10-a", "2026-01-01", KEY, 150)], lookup);
    expect(one.cells.some((c) => c.seen === 0 && c.accuracy === null)).toBe(false);
  });

  it("accumulates across papers", () => {
    const wrong = "E".repeat(25);
    const grid = strengthGrid(
      [
        attempt("a1", "amc10-a", "2026-01-01", KEY, 150),
        attempt("a2", "amc10-a", "2026-01-08", wrong, 24),
      ],
      lookup,
    );
    expect(grid.cells.reduce((n, c) => n + c.seen, 0)).toBe(50);
    // Q5,10,15,20,25 are "E" in the key, so the all-E paper gets exactly those right.
    expect(grid.cells.reduce((n, c) => n + c.correct, 0)).toBe(30);
  });

  it("ignores untagged problems rather than inventing an area for them", () => {
    const untagged = exam("untagged", "AMC10", 6, 1.5);
    untagged.problems.forEach((p) => (p.area = null));
    const grid = strengthGrid(
      [attempt("a1", "untagged", "2026-01-01", KEY, 150)],
      (id) => (id === "untagged" ? untagged : undefined),
    );
    expect(grid.cells).toEqual([]);
  });
});

describe("scoreTrend", () => {
  it("plots a percentage so contests with different maxima share one axis", () => {
    const points = scoreTrend(
      [
        attempt("a1", "amc10-a", "2026-01-01", KEY, 75),
        attempt("a2", "amc8-a", "2026-02-01", KEY, 20),
      ],
      lookup,
      label,
    );
    expect(points[0]).toMatchObject({ score: 75, maxScore: 150, pct: 0.5 });
    expect(points[1]).toMatchObject({ score: 20, maxScore: 25, pct: 0.8 });
  });

  it("orders oldest first regardless of input order", () => {
    const points = scoreTrend(
      [
        attempt("a2", "amc10-a", "2026-03-01", KEY, 100),
        attempt("a1", "amc10-a", "2026-01-01", KEY, 80),
      ],
      lookup,
      label,
    );
    expect(points.map((p) => p.takenOn)).toEqual(["2026-01-01", "2026-03-01"]);
  });
});

describe("mistakeMix", () => {
  it("separates classified from unclassified misses", () => {
    const [point] = mistakeMix(
      [attempt("a1", "amc10-a", "2026-01-01", KEY, 150)],
      [log("a1", 1, "careless"), log("a1", 2, "careless"), log("a1", 3, "concept"), log("a1", 4, null)],
      lookup,
      label,
    );
    expect(point!.counts.careless).toBe(2);
    expect(point!.counts.concept).toBe(1);
    expect(point!.unclassified).toBe(1);
    expect(point!.total).toBe(4);
  });
});

describe("headline", () => {
  const wrongFirstThree = "EEE" + KEY.slice(3); // Q1-Q3 wrong, rest correct

  it("charges a wrong answer the full 6 points and a blank only the difference", () => {
    const h = headline(
      [attempt("a1", "amc10-a", "2026-01-01", `--${KEY.slice(2)}`, 138)],
      [],
      lookup,
    );
    expect(h.lostByTier.T1).toBe(9); // two blanks at 6 - 1.5
  });

  it("counts only careless and triage as points that can be taken back", () => {
    const h = headline(
      [attempt("a1", "amc10-a", "2026-01-01", wrongFirstThree, 132)],
      [log("a1", 1, "careless"), log("a1", 2, "concept"), log("a1", 3, "triage")],
      lookup,
    );
    expect(h.lostByCause.careless).toBe(6);
    expect(h.lostByCause.concept).toBe(6);
    expect(h.lostByCause.triage).toBe(6);
    expect(h.avgFixableLost).toBe(12); // careless + triage, not concept
  });

  it("reports how much of the picture is actually classified", () => {
    const h = headline(
      [attempt("a1", "amc10-a", "2026-01-01", wrongFirstThree, 132)],
      [log("a1", 1, "careless")],
      lookup,
    );
    expect(h.classifiedShare).toBeCloseTo(1 / 3);
  });

  it("picks the later of two sittings on the same day", () => {
    const morning = { ...attempt("m", "amc10-a", "2026-03-01", KEY, 100), created_at: "2026-03-01T09:00:00Z" };
    const evening = { ...attempt("e", "amc10-a", "2026-03-01", KEY, 130), created_at: "2026-03-01T18:00:00Z" };
    expect(headline([morning, evening], [], lookup).latestScore).toBe(130);
    expect(headline([evening, morning], [], lookup).latestScore).toBe(130);
  });

  it("has no opinion when nothing is logged", () => {
    const h = headline([], [], lookup);
    expect(h).toMatchObject({ papers: 0, latestScore: null, avgFixableLost: null });
  });
});

describe("subtopicBreakdown", () => {
  it("counts a problem toward each technique it carries", () => {
    const multi = exam("multi", "AMC10", 6, 1.5);
    // One area throughout: validate enforces that a technique belongs to exactly one
    // area, so a fixture spanning two would not be reachable with real data.
    multi.problems.forEach((p) => {
      p.area = "algebra";
      p.subtopics = ["linear-systems", "quadratics-vieta"];
    });
    const rows = subtopicBreakdown(
      [attempt("a1", "multi", "2026-01-01", KEY, 150)],
      (id) => (id === "multi" ? multi : undefined),
    );
    expect(rows.map((r) => r.subtopic).sort()).toEqual(["linear-systems", "quadratics-vieta"]);
    expect(rows[0]!.seen).toBe(25);
  });

  it("puts the weakest technique first", () => {
    const e = exam("mix", "AMC10", 6, 1.5);
    // Odd questions get "weak", even get "strong"; answer only the even ones correctly.
    e.problems.forEach((p, i) => {
      p.area = "algebra";
      p.subtopics = [i % 2 === 0 ? "weak" : "strong"];
    });
    const answers = [...KEY].map((c, i) => (i % 2 === 0 ? (c === "A" ? "B" : "A") : c)).join("");
    const rows = subtopicBreakdown(
      [attempt("a1", "mix", "2026-01-01", answers, 0)],
      (id) => (id === "mix" ? e : undefined),
      1,
    );
    expect(rows[0]!.subtopic).toBe("weak");
    expect(rows[0]!.accuracy).toBe(0);
    expect(rows[rows.length - 1]!.subtopic).toBe("strong");
  });

  it("ignores techniques seen too few times to mean anything", () => {
    const e = exam("thin", "AMC10", 6, 1.5);
    e.problems.forEach((p, i) => {
      p.area = "algebra";
      p.subtopics = [i === 0 ? "rare" : "common"];
    });
    const rows = subtopicBreakdown(
      [attempt("a1", "thin", "2026-01-01", KEY, 150)],
      (id) => (id === "thin" ? e : undefined),
      2,
    );
    expect(rows.map((r) => r.subtopic)).toEqual(["common"]);
  });
});

describe("attemptOrdinals", () => {
  it("numbers sittings of the same paper oldest first", () => {
    const ords = attemptOrdinals([
      attempt("a2", "amc10-a", "2026-03-01", KEY, 120),
      attempt("a1", "amc10-a", "2026-01-01", KEY, 90),
      attempt("a3", "amc10-a", "2026-05-01", KEY, 140),
    ]);
    expect(ords.get("a1")).toEqual({ ordinal: 1, total: 3 });
    expect(ords.get("a2")).toEqual({ ordinal: 2, total: 3 });
    expect(ords.get("a3")).toEqual({ ordinal: 3, total: 3 });
  });

  it("numbers each paper independently", () => {
    const ords = attemptOrdinals([
      attempt("a1", "amc10-a", "2026-01-01", KEY, 90),
      attempt("b1", "amc8-a", "2026-02-01", KEY, 20),
    ]);
    expect(ords.get("a1")).toEqual({ ordinal: 1, total: 1 });
    expect(ords.get("b1")).toEqual({ ordinal: 1, total: 1 });
  });

  it("orders two sittings on the same day stably, by when they were recorded", () => {
    const first = { ...attempt("x", "amc10-a", "2026-03-01", KEY, 90), created_at: "2026-03-01T09:00:00Z" };
    const second = { ...attempt("y", "amc10-a", "2026-03-01", KEY, 120), created_at: "2026-03-01T17:00:00Z" };
    const ords = attemptOrdinals([second, first]);
    expect(ords.get("x")!.ordinal).toBe(1);
    expect(ords.get("y")!.ordinal).toBe(2);
  });
});
