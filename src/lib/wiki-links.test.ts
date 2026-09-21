import { describe, expect, it } from "vitest";
import { problemLink } from "./wiki-links";

describe("problemLink", () => {
  it("builds the exam page anchored at the problem", () => {
    expect(problemLink("2015_AMC_10A_Problems", 4)).toBe(
      "https://artofproblemsolving.com/wiki/index.php?title=2015_AMC_10A_Problems#Problem_4",
    );
  });
});
