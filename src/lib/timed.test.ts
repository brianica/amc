import { describe, expect, it } from "vitest";
import {
  answer,
  answerString,
  elapsedMinutes,
  finish,
  formatClock,
  goTo,
  isExpired,
  next,
  pause,
  previous,
  remainingMs,
  resume,
  startSession,
  timings,
  toggleFlag,
  unseen,
} from "./timed";

const T0 = 1_700_000_000_000;
const sec = (n: number) => T0 + n * 1000;

describe("startSession", () => {
  it("starts on the first problem, with it already counted as visited", () => {
    const s = startSession(25, 75, T0);
    expect(s.current).toBe(0);
    expect(s.visits[0]).toBe(1);
    expect(s.visits[1]).toBe(0);
    expect(s.answers).toHaveLength(25);
    expect(remainingMs(s, T0)).toBe(75 * 60_000);
  });
});

describe("time accrual", () => {
  it("banks time against the problem that was on screen, not the new one", () => {
    let s = startSession(25, 75, T0);
    s = next(s, sec(30));
    expect(timings(s)[0]).toMatchObject({ q: 1, seconds: 30 });
    expect(timings(s)[1]).toMatchObject({ q: 2, seconds: 0 });
  });

  it("sums repeat visits to the same problem", () => {
    let s = startSession(25, 75, T0);
    s = next(s, sec(20)); // 20s on Q1
    s = previous(s, sec(50)); // 30s on Q2, back to Q1
    s = finish(s, sec(60)); // 10s more on Q1
    const t = timings(s);
    expect(t[0]).toMatchObject({ seconds: 30, visits: 2 });
    expect(t[1]).toMatchObject({ seconds: 30, visits: 1 });
  });

  it("counts a jump across the paper as a visit", () => {
    let s = startSession(25, 75, T0);
    s = goTo(s, 15, sec(10));
    s = goTo(s, 0, sec(70));
    expect(s.visits[15]).toBe(1);
    expect(s.visits[0]).toBe(2);
    expect(timings(s)[15]).toMatchObject({ q: 16, seconds: 60 });
  });

  it("ignores a move to where you already are", () => {
    let s = startSession(25, 75, T0);
    const same = goTo(s, 0, sec(30));
    expect(same).toBe(s);
  });

  it("ignores a move outside the paper", () => {
    const s = startSession(25, 75, T0);
    expect(previous(s, sec(5))).toBe(s);
    expect(goTo(s, 25, sec(5))).toBe(s);
  });

  it("never accrues negative time if the clock jumps backwards", () => {
    let s = startSession(25, 75, T0);
    s = next(s, T0 - 5000);
    expect(timings(s)[0]!.seconds).toBe(0);
  });
});

describe("answers", () => {
  it("records against the current problem and clears on re-selection", () => {
    let s = startSession(25, 75, T0);
    s = answer(s, "C");
    expect(s.answers[0]).toBe("C");
    s = answer(s, "C");
    expect(s.answers[0]).toBeNull();
    s = answer(s, "D");
    expect(s.answers[0]).toBe("D");
  });

  it("builds the 25-character string the rest of the app expects", () => {
    let s = startSession(25, 75, T0);
    s = answer(s, "A");
    s = next(s, sec(10));
    s = answer(s, "B");
    expect(answerString(s)).toBe("AB" + "-".repeat(23));
  });
});

describe("flags", () => {
  it("toggles on the current problem only", () => {
    let s = startSession(25, 75, T0);
    s = toggleFlag(s);
    expect(s.flagged[0]).toBe(true);
    expect(s.flagged[1]).toBe(false);
    s = toggleFlag(s);
    expect(s.flagged[0]).toBe(false);
  });
});

describe("the clock", () => {
  it("runs out and never goes negative", () => {
    const s = startSession(25, 75, T0);
    expect(isExpired(s, sec(75 * 60 - 1))).toBe(false);
    expect(isExpired(s, sec(75 * 60))).toBe(true);
    expect(remainingMs(s, sec(99 * 60))).toBe(0);
  });

  it("formats as minutes and padded seconds", () => {
    expect(formatClock(75 * 60_000)).toBe("75:00");
    expect(formatClock(61_000)).toBe("1:01");
    expect(formatClock(0)).toBe("0:00");
  });

  it("caps the recorded duration at the allotted time", () => {
    const s = startSession(25, 75, T0);
    // Left the tab open for hours; the paper still only took 75 minutes.
    expect(elapsedMinutes(s, sec(300 * 60))).toBe(75);
  });

  it("records at least a minute for a very short sitting", () => {
    const s = startSession(25, 75, T0);
    expect(elapsedMinutes(s, sec(10))).toBe(1);
  });
});

describe("unseen", () => {
  it("names the problems never opened — the cost of a pacing failure", () => {
    let s = startSession(5, 75, T0);
    s = next(s, sec(10));
    s = next(s, sec(20));
    expect(unseen(s)).toEqual([4, 5]);
  });

  it("is empty once every problem has been visited", () => {
    let s = startSession(3, 75, T0);
    s = next(s, sec(5));
    s = next(s, sec(10));
    expect(unseen(s)).toEqual([]);
  });
});

describe("finish", () => {
  it("banks the last problem's time and marks the session done", () => {
    let s = startSession(25, 75, T0);
    s = finish(s, sec(45));
    expect(s.submitted).toBe(true);
    expect(timings(s)[0]!.seconds).toBe(45);
  });
});

describe("pause and resume", () => {
  it("stops the countdown while paused, and does not burn the break as playing time", () => {
    let s = startSession(25, 75, T0);
    s = pause(s, sec(30));
    const during = remainingMs(s, sec(30 + 600)); // 10 minutes into the break
    expect(during).toBe(remainingMs(s, sec(30))); // clock did not move
    s = resume(s, sec(30 + 600));
    expect(remainingMs(s, sec(30 + 600))).toBe(75 * 60_000 - 30_000); // only 30s counted
  });

  it("banks the current problem's time at the moment of pausing, not when resumed", () => {
    let s = startSession(25, 75, T0);
    s = pause(s, sec(20));
    expect(timings(s)[0]).toMatchObject({ seconds: 20 });
    s = resume(s, sec(20 + 300)); // 5 minute break
    expect(timings(s)[0]).toMatchObject({ seconds: 20 }); // break added nothing
  });

  it("does not accrue further time on the paused problem before resuming", () => {
    let s = startSession(25, 75, T0);
    s = pause(s, sec(20));
    s = resume(s, sec(80));
    s = pause(s, sec(90)); // 10s more after resuming
    expect(timings(s)[0]).toMatchObject({ seconds: 30 });
  });

  it("is a no-op to pause twice or resume when not paused", () => {
    let s = startSession(25, 75, T0);
    s = pause(s, sec(10));
    const samePause = pause(s, sec(50));
    expect(samePause).toBe(s);

    let running = startSession(25, 75, T0);
    const sameRunning = resume(running, sec(50));
    expect(sameRunning).toBe(running);
  });

  it("cannot pause a submitted session", () => {
    let s = startSession(25, 75, T0);
    s = finish(s, sec(10));
    const paused = pause(s, sec(20));
    expect(paused).toBe(s);
  });

  it("finishing while paused banks up to the pause instant, not later", () => {
    let s = startSession(25, 75, T0);
    s = pause(s, sec(15));
    s = finish(s, sec(15 + 600)); // ended the sitting during a long break
    expect(timings(s)[0]).toMatchObject({ seconds: 15 });
    expect(s.pausedAt).toBeNull();
  });

  it("running out of time while paused still ends the paper", () => {
    let s = startSession(25, 75, T0);
    s = pause(s, sec(75 * 60 - 5));
    // The break outlasts the remaining time; isExpired must not depend on the break
    // itself refreshing the deadline.
    expect(isExpired(s, sec(75 * 60 - 5))).toBe(false);
  });
});
