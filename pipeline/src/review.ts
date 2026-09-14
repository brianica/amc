/**
 * Stage 4. Walks the problems the pipeline could not resolve on its own and takes a
 * human decision on each.
 *
 * `validate` refuses to pass a low-confidence answer, because a wrong answer key is
 * invisible from the app — every score and every topic rate is quietly wrong and
 * nothing looks broken. This is the only way to clear one.
 *
 *   npm run review
 *
 * Decisions are written after each answer, so quitting part-way loses nothing.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createInterface, type Interface } from "node:readline";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import type { ExamFile, Letter, TaggedProblem } from "./types.js";

const EXAMS_DIR = join(process.cwd(), "data", "exams");
const LETTERS: Letter[] = ["A", "B", "C", "D", "E"];

interface Item {
  file: string;
  exam: ExamFile;
  problem: TaggedProblem;
  /** Why this needs a person: a disputed answer, or two classifiers disagreeing. */
  kind: "answer" | "tags";
}

function needsAnswerReview(p: TaggedProblem): boolean {
  return p.tagSource !== "reviewed" && (p.answerConfidence === "low" || p.answer === null);
}

function needsTagReview(p: TaggedProblem): boolean {
  return p.tagSource !== "reviewed" && (p.descriptor?.includes("[REVIEW:") ?? false);
}

async function collect(): Promise<{ items: Item[]; exams: number; problems: number }> {
  let files: string[];
  try {
    files = (await readdir(EXAMS_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    console.error(`No exam files at ${EXAMS_DIR}. Run fetch and extract first.`);
    process.exit(1);
  }

  const items: Item[] = [];
  let problems = 0;

  for (const file of files) {
    const exam = JSON.parse(await readFile(join(EXAMS_DIR, file), "utf8")) as ExamFile;
    for (const problem of exam.problems) {
      problems++;
      // Answer first: a disputed answer matters more than a debatable topic tag.
      if (needsAnswerReview(problem)) items.push({ file, exam, problem, kind: "answer" });
      else if (needsTagReview(problem)) items.push({ file, exam, problem, kind: "tags" });
    }
  }
  return { items, exams: files.length, problems };
}

/** Rewrite one exam file with the decision just made. */
async function save(item: Item): Promise<void> {
  const path = join(EXAMS_DIR, item.file);
  const exam = JSON.parse(await readFile(path, "utf8")) as ExamFile;
  const target = exam.problems.find((p) => p.n === item.problem.n);
  if (!target) return;

  target.answer = item.problem.answer;
  target.answerConfidence = item.problem.answerConfidence;
  target.descriptor = item.problem.descriptor;
  target.tagSource = item.problem.tagSource;

  await writeFile(path, `${JSON.stringify(exam, null, 2)}\n`);
}

function describe(item: Item): void {
  const { exam, problem } = item;
  const form = exam.form ?? "";
  const season = exam.season === "fall" ? " Fall" : "";

  console.log(`\n${"─".repeat(66)}`);
  console.log(`${exam.year}${season} ${exam.competition} ${form}  ·  Problem ${problem.n}  (${problem.tier})`);
  console.log(problem.sourceUrl);
  console.log("");

  if (item.kind === "answer") {
    const evidence = problem.answerEvidence.length > 0 ? problem.answerEvidence.join(", ") : "none found";
    console.log(`  Answers found in the solutions: ${evidence}`);
    console.log(`  Best guess so far:              ${problem.answer ?? "none"} (${problem.answerConfidence} confidence)`);
    console.log("");
    console.log("  Open the link, read the solution, and enter the correct answer.");
  } else {
    console.log(`  Topic:      ${problem.area ?? "none"} / ${problem.subtopics.join(", ") || "none"}`);
    console.log(`  Descriptor: ${problem.descriptor ?? ""}`);
    console.log("");
    console.log("  The two classification passes disagreed on the area.");
    console.log("  Accept it if the topic above looks right for this problem.");
  }
}

/**
 * Line reader that works for a terminal and for piped input alike.
 *
 * readline's promise API closes the moment a piped stream hits EOF and drops any
 * lines still buffered, so a scripted run crashes partway through. Queuing the lines
 * ourselves keeps both cases on the same path: `null` means there is no more input,
 * which the caller treats as "stop", not as an error.
 */
function lineReader(rl: Interface) {
  const queued: string[] = [];
  const waiting: ((line: string | null) => void)[] = [];
  let closed = false;

  rl.on("line", (line) => {
    const next = waiting.shift();
    if (next) next(line);
    else queued.push(line);
  });

  rl.on("close", () => {
    closed = true;
    while (waiting.length > 0) waiting.shift()!(null);
  });

  return {
    async next(prompt: string): Promise<string | null> {
      stdout.write(prompt);
      const buffered = queued.shift();
      if (buffered !== undefined) {
        stdout.write(`${buffered}\n`);
        return buffered;
      }
      if (closed) return null;
      return new Promise((resolve) => waiting.push(resolve));
    },
  };
}

async function main(): Promise<void> {
  const { items, exams, problems } = await collect();

  console.log(`${exams} exam file(s), ${problems} problems.`);
  if (items.length === 0) {
    console.log("Nothing needs review. Run `npm run validate` next.");
    return;
  }

  const answers = items.filter((i) => i.kind === "answer").length;
  console.log(`${items.length} need a decision: ${answers} disputed answer(s), ${items.length - answers} disputed topic(s).`);
  console.log("\nAt each prompt: A-E to set the answer, Enter to accept, s to skip, q to save and quit.");

  const rl = createInterface({ input: stdin });
  const input = lineReader(rl);
  let decided = 0;
  let skipped = 0;

  try {
    for (const [index, item] of items.entries()) {
      describe(item);

      const prompt =
        item.kind === "answer"
          ? `  [${index + 1}/${items.length}] answer (A-E / Enter to keep ${item.problem.answer ?? "none"} / s / q): `
          : `  [${index + 1}/${items.length}] Enter to accept / s / q: `;

      const answer = await input.next(prompt);
      if (answer === null) {
        console.log("\nInput ended. Everything decided so far is saved.");
        break;
      }
      const reply = answer.trim().toUpperCase();

      if (reply === "Q") {
        console.log("\nStopping here. Everything decided so far is saved.");
        break;
      }
      if (reply === "S") {
        skipped++;
        continue;
      }

      if (item.kind === "answer") {
        if (reply === "") {
          if (item.problem.answer === null) {
            console.log("  No answer to keep — enter a letter, or s to skip.");
            skipped++;
            continue;
          }
        } else if (LETTERS.includes(reply as Letter)) {
          item.problem.answer = reply as Letter;
        } else {
          console.log(`  "${reply}" is not A-E — skipping.`);
          skipped++;
          continue;
        }
        // A person read the solution, so the answer is no longer in doubt.
        item.problem.answerConfidence = "high";
      } else if (reply !== "") {
        console.log(`  "${reply}" means nothing here — skipping.`);
        skipped++;
        continue;
      }

      // Strip the machine-written review marker now that it has been acted on.
      if (item.problem.descriptor) {
        item.problem.descriptor = item.problem.descriptor.replace(/\s*\[REVIEW:[^\]]*\]/g, "").trim();
      }
      item.problem.tagSource = "reviewed";

      await save(item);
      decided++;
    }
  } finally {
    rl.close();
  }

  console.log(`\n${decided} decided, ${skipped} skipped, ${items.length - decided - skipped} not reached.`);
  console.log(
    decided === items.length
      ? "All clear — run `npm run validate` next."
      : "Run `npm run review` again to pick up the rest.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
