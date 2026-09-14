import { describe, expect, it } from "vitest";
import { assessRetake, BIAS_WINDOW_DAYS } from "./retake";

describe("assessRetake", () => {
  it("says nothing about a paper never sat before", () => {
    expect(assessRetake([], "2026-03-01")).toEqual({
      previous: 0,
      daysSinceLast: null,
      likelyBiased: false,
    });
  });

  it("flags a retake inside the window", () => {
    expect(assessRetake(["2026-03-01"], "2026-03-08")).toMatchObject({
      previous: 1,
      daysSinceLast: 7,
      likelyBiased: true,
    });
  });

  it("treats the same day as the most biased case of all", () => {
    expect(assessRetake(["2026-03-01"], "2026-03-01").likelyBiased).toBe(true);
  });

  it("does not flag a retake on the window boundary or later", () => {
    expect(assessRetake(["2026-03-01"], `2026-03-15`).daysSinceLast).toBe(BIAS_WINDOW_DAYS);
    expect(assessRetake(["2026-03-01"], "2026-03-15").likelyBiased).toBe(false);
    expect(assessRetake(["2026-03-01"], "2026-06-01").likelyBiased).toBe(false);
  });

  it("measures from the most recent sitting, not the first", () => {
    // An old sitting plus a recent one: the recent one is what memory draws on.
    const r = assessRetake(["2025-01-01", "2026-03-01"], "2026-03-05");
    expect(r).toMatchObject({ previous: 2, daysSinceLast: 4, likelyBiased: true });
  });

  it("does not flag back-dating an older paper logged late", () => {
    // Recording a February sitting after a March one is not a retake from memory.
    expect(assessRetake(["2026-03-01"], "2026-02-01")).toMatchObject({
      daysSinceLast: -28,
      likelyBiased: false,
    });
  });
});
