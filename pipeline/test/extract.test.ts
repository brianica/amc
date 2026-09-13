import { describe, expect, it } from "vitest";
import {
  answerLettersIn,
  boxedContents,
  consensus,
  extractProblem,
  parseAnswerKeyPage,
  splitSections,
} from "../src/extract.js";

// String.raw throughout: wikitext is full of backslashes that JS would otherwise eat.
const page = (body: string) => body;

describe("boxedContents", () => {
  it("honours nested braces", () => {
    expect(boxedContents(String.raw`x \boxed{\textbf{(E) }2\sqrt{3}} y`)).toEqual([
      String.raw`\textbf{(E) }2\sqrt{3}`,
    ]);
  });

  it("is not confused by escaped braces inside the box", () => {
    expect(answerLettersIn(String.raw`\boxed{\textbf{(A)}\ \{1,2\}}`)).toEqual(["A"]);
  });

  it("ignores an unterminated box rather than swallowing the rest of the page", () => {
    expect(boxedContents(String.raw`\boxed{\textbf{(A)}`)).toEqual([]);
  });
});

describe("answerLettersIn", () => {
  it("skips a boxed intermediate result and keeps the boxed choice", () => {
    const sol = String.raw`First \boxed{5} is the area, so the answer is \boxed{\textbf{(D)}\ 5}.`;
    expect(answerLettersIn(sol)).toEqual(["D"]);
  });

  it("falls back to the last bold choice when nothing is boxed", () => {
    const sol = String.raw`We test \textbf{(A)} and reject it, so the answer is \textbf{(B)}.`;
    expect(answerLettersIn(sol)).toEqual(["B"]);
  });

  it("accepts \\text and \\mathrm variants", () => {
    expect(answerLettersIn(String.raw`\boxed{\text{(C)}}`)).toEqual(["C"]);
    expect(answerLettersIn(String.raw`\boxed{\mathrm{(E)}\ 12}`)).toEqual(["E"]);
  });

  it("returns nothing when the box holds only a value", () => {
    expect(answerLettersIn(String.raw`\boxed{42}`)).toEqual([]);
  });
});

describe("consensus", () => {
  it("is high only when two or more solutions agree", () => {
    expect(consensus([["C"], ["C"], ["C"]])).toMatchObject({ answer: "C", confidence: "high" });
  });

  it("is medium on a lone solution", () => {
    expect(consensus([["C"]])).toMatchObject({ answer: "C", confidence: "medium" });
  });

  it("flags disagreement and still names the majority", () => {
    expect(consensus([["C"], ["C"], ["D"]])).toMatchObject({ answer: "C", confidence: "low" });
  });

  it("refuses to guess on a tie", () => {
    expect(consensus([["C"], ["D"]])).toMatchObject({ answer: null, confidence: "low" });
  });

  it("gives each solution one vote regardless of how many boxes it contains", () => {
    // A solution boxing three steps must not outvote two agreeing solutions.
    expect(consensus([["A", "A", "A"], ["B"], ["B"]])).toMatchObject({
      answer: "B",
      confidence: "low",
    });
  });

  it("is low with no evidence at all", () => {
    expect(consensus([[], []])).toMatchObject({ answer: null, confidence: "low" });
  });
});

describe("splitSections / extractProblem", () => {
  const wikitext = page(String.raw`
== Problem ==
How many positive integers <math>n</math> satisfy the condition?

== Solution 1 ==
Counting directly gives <math>\boxed{\textbf{(C)}\ 14}</math>.

== Solution 2 (faster) ==
By symmetry the answer is <math>\boxed{\textbf{(C)}\ 14}</math>.

== See Also ==
{{AMC10 box|year=2023|ab=A|num-b=13|num-a=15}}
`);

  it("separates the statement from the solutions", () => {
    const { statement, solutions } = splitSections(wikitext);
    expect(statement).toContain("How many positive integers");
    expect(solutions).toHaveLength(2);
    expect(statement).not.toContain("Counting directly");
  });

  it("excludes See Also from the solutions", () => {
    const { solutions } = splitSections(wikitext);
    expect(solutions.join("\n")).not.toContain("AMC10 box");
  });

  it("produces a high-confidence answer from agreeing solutions", () => {
    const p = extractProblem(14, wikitext);
    expect(p).toMatchObject({ n: 14, answer: "C", answerConfidence: "high" });
    expect(p.answerEvidence).toEqual(["C", "C"]);
  });
});

describe("parseAnswerKeyPage", () => {
  it("reads a numbered list of 25 letters", () => {
    const key = Array.from({ length: 25 }, (_, i) => `${i + 1}. ${"ABCDE"[i % 5]}`).join("\n");
    const parsed = parseAnswerKeyPage(key);
    expect(parsed).toHaveLength(25);
    expect(parsed![0]).toBe("A");
    expect(parsed![24]).toBe("E");
  });

  it("returns null when the count is not exactly 25", () => {
    expect(parseAnswerKeyPage("1. A\n2. B")).toBeNull();
  });
});
