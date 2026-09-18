/**
 * Writes a stand-in problem cache for the sample paper, so in-app problem display can
 * be tried before the real fetch has run.
 *
 *   npm run seed:statements
 *   SHOW_PROBLEM_STATEMENTS=1 npm run dev
 *
 * The content is invented and says so. Its only job is to exercise the rendering path
 * — maths, multiple-choice lines, an Asymptote diagram that cannot be drawn, and the
 * wiki furniture that has to be stripped — with the same shape a real AoPS page has.
 * `npm run fetch` overwrites nothing here: it caches real pages under their own names.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sampleExam } from "../src/lib/sample-exam";

const exam = sampleExam();
const dir = join(process.cwd(), "pipeline", ".cache", exam.wikiPage);

/** Ordinary problem: inline maths, a choices line, and a navigation box to strip. */
const plain = (n: number) => String.raw`== Problem ==
Sample problem ${n} — invented, not a real contest question. What is the value of
<math>\frac{${n + 10}! - ${n + 9}!}{9!}</math>?

<math>\textbf{(A) }99\qquad\textbf{(B) }100\qquad\textbf{(C) }110\qquad\textbf{(D) }121\qquad\textbf{(E) }132</math>

== Solution ==
This section must never be shown during a sitting.
The answer is <math>\boxed{\textbf{(B) }100}</math>.

{{AMC10 box|year=2099|ab=A|num-b=${n - 1}|num-a=${n + 1}}}
{{MAA Notice}}`;

/** Geometry: a diagram that cannot be rendered, plus display maths. */
const withDiagram = String.raw`== Problem ==
Sample problem — invented. A circle of radius <math>r</math> is inscribed in a right
triangle with legs <math>a</math> and <math>b</math> and hypotenuse <math>c</math>.
[asy]draw((0,0)--(3,0)--(0,4)--cycle); draw(circle((1,1),1));[/asy]
Which expression gives <math>r</math>?

<cmath>r = \frac{a + b - c}{2}</cmath>

== Solution ==
<math>\boxed{\textbf{(A) }1}</math>`;

async function main(): Promise<void> {
  await mkdir(dir, { recursive: true });

  for (const problem of exam.problems) {
    // Same envelope `fetch` writes, so the loader reads it by the ordinary path.
    const entry = {
      page: `${exam.wikiPage}/Problem_${problem.n}`,
      wikitext: problem.n === 3 ? withDiagram : plain(problem.n),
      fetchedAt: new Date().toISOString(),
    };
    await writeFile(join(dir, `Problem_${problem.n}.json`), JSON.stringify(entry, null, 2));
  }

  console.log(`wrote ${exam.problems.length} stand-in statements to ${dir}`);
  console.log("");
  console.log("  SHOW_PROBLEM_STATEMENTS=1 npm run dev");
  console.log("");
  console.log("then open the sample exam and choose 'Sit it on the clock'.");
  console.log("Problem 3 is the one with a diagram that cannot be drawn.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
