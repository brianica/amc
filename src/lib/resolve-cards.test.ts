import { describe, expect, it } from "vitest";
import { cardsForMissedProblems, toCard, toRecord } from "./resolve-cards";
import { newCard, type ResolveCard } from "./resolve";

describe("cardsForMissedProblems", () => {
  const EXAM = "amc10-2023-A";

  it("queues a newly missed problem three days out", () => {
    const changed = cardsForMissedProblems([], EXAM, [7, 14], "2026-03-01");
    expect(changed).toHaveLength(2);
    expect(changed[0]).toMatchObject({ qNumber: 7, stage: 0, dueOn: "2026-03-04" });
  });

  it("leaves an in-flight card's schedule alone", () => {
    // Re-saving the same paper must not push a pending re-solve further out.
    const existing: ResolveCard[] = [
      { examId: EXAM, qNumber: 7, stage: 1, dueOn: "2026-03-18", attempts: 1, lastResult: "solved" },
    ];
    expect(cardsForMissedProblems(existing, EXAM, [7], "2026-03-05")).toEqual([]);
  });

  it("reopens a mastered card when the problem is missed again", () => {
    const existing: ResolveCard[] = [
      { examId: EXAM, qNumber: 7, stage: 2, dueOn: null, attempts: 2, lastResult: "solved" },
    ];
    const changed = cardsForMissedProblems(existing, EXAM, [7], "2026-06-01");
    expect(changed).toEqual([
      { examId: EXAM, qNumber: 7, stage: 0, dueOn: "2026-06-04", attempts: 2, lastResult: "failed" },
    ]);
  });

  it("does not confuse the same question number on a different paper", () => {
    const existing: ResolveCard[] = [
      { examId: "amc10-2023-B", qNumber: 7, stage: 1, dueOn: "2026-03-18", attempts: 1, lastResult: "solved" },
    ];
    const changed = cardsForMissedProblems(existing, EXAM, [7], "2026-03-01");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ examId: EXAM, stage: 0 });
  });

  it("returns nothing when no problems were missed", () => {
    expect(cardsForMissedProblems([], EXAM, [], "2026-03-01")).toEqual([]);
  });
});

describe("record conversion", () => {
  it("round-trips a card", () => {
    const card = newCard("amc10-2023-A", 14, "2026-03-01");
    expect(toCard(toRecord(card, "user-1"))).toEqual(card);
  });

  it("round-trips a mastered card, whose due date is null", () => {
    const mastered: ResolveCard = {
      examId: "amc10-2023-A", qNumber: 3, stage: 2, dueOn: null, attempts: 2, lastResult: "solved",
    };
    expect(toCard(toRecord(mastered, "user-1"))).toEqual(mastered);
  });

  it("clamps an out-of-range stage from the database rather than trusting it", () => {
    const row = { ...toRecord(newCard("e", 1, "2026-03-01"), "u"), stage: 9 };
    expect(toCard(row).stage).toBe(0);
  });
});
