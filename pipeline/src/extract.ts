import type { Confidence, ExtractedProblem, Letter } from "./types.js";

const LETTERS = new Set(["A", "B", "C", "D", "E"]);

export interface Sections {
  statement: string;
  solutions: string[];
}

/** Split MediaWiki text on == Heading == lines. */
export function splitSections(wikitext: string): Sections {
  const lines = wikitext.split(/\r?\n/);
  const sections: { title: string; body: string[] }[] = [{ title: "", body: [] }];

  for (const line of lines) {
    const heading = /^\s*={2,}\s*(.+?)\s*={2,}\s*$/.exec(line);
    if (heading) {
      sections.push({ title: heading[1]!, body: [] });
    } else {
      sections[sections.length - 1]!.body.push(line);
    }
  }

  const statement = sections
    .filter((s) => /^problem\b/i.test(s.title))
    .map((s) => s.body.join("\n").trim())
    .join("\n")
    .trim();

  const solutions = sections
    .filter((s) => /solution/i.test(s.title))
    .map((s) => s.body.join("\n").trim())
    .filter((b) => b.length > 0);

  return { statement, solutions };
}

/**
 * Return the contents of each \boxed{...}, honouring nested braces — the answer
 * almost always sits inside another macro, as in \boxed{\textbf{(C)}\ 42}.
 */
export function boxedContents(text: string): string[] {
  const out: string[] = [];
  const marker = /\\boxed\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = marker.exec(text)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === "\\") {
        i += 2; // skip an escaped character so \} never changes the depth
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth === 0) out.push(text.slice(start, i - 1));
  }
  return out;
}

/** First (A)-(E) style choice label inside a fragment, if there is one. */
export function letterIn(fragment: string): Letter | null {
  const m = /\(\s*([A-E])\s*\)/.exec(fragment);
  if (m && LETTERS.has(m[1]!)) return m[1] as Letter;
  return null;
}

/**
 * Every answer letter a solution asserts. Prefers \boxed{}; falls back to the last
 * \textbf{(X)} in the text, which is how some older pages mark their answer.
 */
export function answerLettersIn(solution: string): Letter[] {
  const boxed = boxedContents(solution)
    .map(letterIn)
    .filter((l): l is Letter => l !== null);
  if (boxed.length > 0) return boxed;

  const bold = [...solution.matchAll(/\\(?:textbf|mathbf|text|mathrm)\s*\{\s*\(\s*([A-E])\s*\)/g)]
    .map((m) => m[1] as Letter);
  return bold.length > 0 ? [bold[bold.length - 1]!] : [];
}

export interface Consensus {
  answer: Letter | null;
  confidence: Confidence;
  evidence: Letter[];
}

/**
 * Agreement across independent solutions is the whole point: a single parse can be
 * fooled by a solution that boxes an intermediate result, but two agreeing ones
 * rarely are. Anything short of unanimous agreement is flagged for a human.
 */
export function consensus(perSolution: Letter[][]): Consensus {
  // One vote per solution, so a solution that boxes several steps cannot outvote others.
  const votes = perSolution
    .map((letters) => (letters.length > 0 ? letters[letters.length - 1]! : null))
    .filter((l): l is Letter => l !== null);

  if (votes.length === 0) return { answer: null, confidence: "low", evidence: [] };

  const counts = new Map<Letter, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);

  if (counts.size > 1) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const tied = ranked[0]![1] === ranked[1]![1];
    return { answer: tied ? null : ranked[0]![0], confidence: "low", evidence: votes };
  }

  return {
    answer: votes[0]!,
    confidence: votes.length >= 2 ? "high" : "medium",
    evidence: votes,
  };
}

export function extractProblem(n: number, wikitext: string): ExtractedProblem {
  const { statement, solutions } = splitSections(wikitext);
  const { answer, confidence, evidence } = consensus(solutions.map(answerLettersIn));
  return { n, statement, solutions, answer, answerConfidence: confidence, answerEvidence: evidence };
}

/**
 * Independent cross-check: some years publish a standalone answer-key page listing
 * all 25 letters. Returns them in order when exactly 25 are found.
 */
export function parseAnswerKeyPage(wikitext: string): Letter[] | null {
  const letters = [...wikitext.matchAll(/^\s*#?\s*(?:\d{1,2}\s*[.)]\s*)?\**\s*\(?([A-E])\)?\**\s*$/gm)]
    .map((m) => m[1] as Letter);
  return letters.length === 25 ? letters : null;
}
