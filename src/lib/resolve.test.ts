import { describe, expect, it } from "vitest";
import {
  addDays,
  isDue,
  isMastered,
  newCard,
  recordResult,
  reopen,
  sortForQueue,
  summarise,
  type ResolveCard,
} from "./resolve";

const card = (over: Partial<ResolveCard> = {}): ResolveCard => ({
  examId: "amc10-2023-A",
  qNumber: 14,
  stage: 0,
  dueOn: "2026-03-04",
  attempts: 0,
  lastResult: null,
  ...over,
});

describe("addDays", () => {
  it("rolls over a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("rolls over a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("is stable across the DST switch, which a local-time date would not be", () => {
    // Late March in Europe, early November in the US: both shift the wall clock.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("newCard", () => {
  it("falls due three days after the paper", () => {
    expect(newCard("amc10-2023-A", 14, "2026-03-01")).toMatchObject({
      stage: 0,
      dueOn: "2026-03-04",
      attempts: 0,
      lastResult: null,
    });
  });
});

describe("recordResult", () => {
  it("sends a first clean solve out a fortnight for confirmation", () => {
    const after = recordResult(card(), "solved", "2026-03-04");
    expect(after).toMatchObject({ stage: 1, dueOn: "2026-03-18", attempts: 1, lastResult: "solved" });
  });

  it("retires a card solved cleanly a second time", () => {
    const confirmed = recordResult(card({ stage: 1, attempts: 1 }), "solved", "2026-03-18");
    expect(confirmed).toMatchObject({ stage: 2, dueOn: null, attempts: 2 });
    expect(isMastered(confirmed)).toBe(true);
  });

  it("sends a failure back to the start, not merely further out", () => {
    // Failing at the confirmation stage means the method was never secure; a longer
    // gap would only postpone discovering that.
    const after = recordResult(card({ stage: 1, attempts: 1 }), "failed", "2026-03-18");
    expect(after).toMatchObject({ stage: 0, dueOn: "2026-03-20", lastResult: "failed" });
  });

  it("counts every attempt, including failures", () => {
    let c = card();
    c = recordResult(c, "failed", "2026-03-04");
    c = recordResult(c, "failed", "2026-03-06");
    c = recordResult(c, "solved", "2026-03-08");
    expect(c.attempts).toBe(3);
    expect(c.stage).toBe(1);
  });
});

describe("reopen", () => {
  it("resets a mastered card when the problem is missed again", () => {
    const mastered = card({ stage: 2, dueOn: null, attempts: 2, lastResult: "solved" });
    const reopened = reopen(mastered, "2026-06-01");
    expect(reopened).toMatchObject({ stage: 0, dueOn: "2026-06-04", lastResult: "failed" });
    expect(isMastered(reopened)).toBe(false);
  });

  it("keeps the attempt history rather than pretending the card is new", () => {
    expect(reopen(card({ attempts: 3 }), "2026-06-01").attempts).toBe(3);
  });
});

describe("isDue", () => {
  it("is due on the day itself and every day after", () => {
    expect(isDue(card({ dueOn: "2026-03-04" }), "2026-03-03")).toBe(false);
    expect(isDue(card({ dueOn: "2026-03-04" }), "2026-03-04")).toBe(true);
    expect(isDue(card({ dueOn: "2026-03-04" }), "2026-04-01")).toBe(true);
  });

  it("is never due once mastered", () => {
    expect(isDue(card({ stage: 2, dueOn: null }), "2030-01-01")).toBe(false);
  });
});

describe("summarise", () => {
  const cards = [
    card({ qNumber: 1, dueOn: "2026-03-01" }), // overdue
    card({ qNumber: 2, dueOn: "2026-03-04" }), // due today
    card({ qNumber: 3, dueOn: "2026-03-09" }), // upcoming
    card({ qNumber: 4, dueOn: "2026-03-06" }), // upcoming, sooner
    card({ qNumber: 5, stage: 2, dueOn: null }), // mastered
  ];

  it("counts due, upcoming and mastered separately", () => {
    expect(summarise(cards, "2026-03-04")).toMatchObject({ due: 2, upcoming: 2, mastered: 1 });
  });

  it("reports the soonest upcoming date, not just any", () => {
    expect(summarise(cards, "2026-03-04").nextDueOn).toBe("2026-03-06");
  });

  it("has no next date when everything is due or mastered", () => {
    expect(summarise([cards[0]!, cards[4]!], "2026-03-04").nextDueOn).toBeNull();
  });

  it("is empty-safe", () => {
    expect(summarise([], "2026-03-04")).toEqual({ due: 0, upcoming: 0, mastered: 0, nextDueOn: null });
  });
});

describe("sortForQueue", () => {
  it("puts the longest overdue first", () => {
    const sorted = sortForQueue([
      card({ qNumber: 2, dueOn: "2026-03-04" }),
      card({ qNumber: 1, dueOn: "2026-02-20" }),
      card({ qNumber: 3, dueOn: "2026-03-01" }),
    ]);
    expect(sorted.map((c) => c.qNumber)).toEqual([1, 3, 2]);
  });

  it("orders ties by exam then question, so the list does not jump about", () => {
    const sorted = sortForQueue([
      card({ examId: "amc10-2023-B", qNumber: 5, dueOn: "2026-03-04" }),
      card({ examId: "amc10-2023-A", qNumber: 9, dueOn: "2026-03-04" }),
      card({ examId: "amc10-2023-A", qNumber: 2, dueOn: "2026-03-04" }),
    ]);
    expect(sorted.map((c) => `${c.examId}#${c.qNumber}`)).toEqual([
      "amc10-2023-A#2",
      "amc10-2023-A#9",
      "amc10-2023-B#5",
    ]);
  });

  it("sinks mastered cards to the end", () => {
    const sorted = sortForQueue([card({ qNumber: 1, stage: 2, dueOn: null }), card({ qNumber: 2 })]);
    expect(sorted[0]!.qNumber).toBe(2);
  });
});
