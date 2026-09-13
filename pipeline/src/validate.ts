import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExamFile } from "./types.js";

const EXAMS_DIR = join(process.cwd(), "data", "exams");
const LETTERS = ["A", "B", "C", "D", "E"] as const;

interface Taxonomy {
  areas: { id: string; subtopics: { id: string }[] }[];
}

const problems: string[] = [];
const warnings: string[] = [];
const fail = (id: string, msg: string) => problems.push(`${id}: ${msg}`);
const warn = (id: string, msg: string) => warnings.push(`${id}: ${msg}`);

async function main(): Promise<void> {
  const taxonomy = JSON.parse(
    await readFile(join(process.cwd(), "data", "taxonomy.json"), "utf8"),
  ) as Taxonomy;
  const areaIds = new Set(taxonomy.areas.map((a) => a.id));
  const subsByArea = new Map(taxonomy.areas.map((a) => [a.id, new Set(a.subtopics.map((s) => s.id))]));

  let files: string[];
  try {
    files = (await readdir(EXAMS_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    console.error(`no exam files yet at ${EXAMS_DIR} — run fetch then extract first`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error("no exam files to validate");
    process.exit(1);
  }

  let totalProblems = 0;
  let tagged = 0;

  for (const f of files) {
    const exam = JSON.parse(await readFile(join(EXAMS_DIR, f), "utf8")) as ExamFile;
    const id = exam.id;

    if (exam.problems.length !== 25) fail(id, `has ${exam.problems.length} problems, expected 25`);

    const seen = new Set<number>();
    const letterCounts = new Map<string, number>();

    for (const p of exam.problems) {
      totalProblems++;
      if (seen.has(p.n)) fail(id, `duplicate problem number ${p.n}`);
      seen.add(p.n);
      if (p.n < 1 || p.n > 25) fail(id, `problem number ${p.n} out of range`);

      // Never ship copyrighted text, whatever else is wrong.
      if (p.statement !== null) fail(id, `problem ${p.n} carries a statement; must stay null`);

      if (p.answer === null) {
        fail(id, `problem ${p.n} has no answer`);
      } else {
        if (!LETTERS.includes(p.answer)) fail(id, `problem ${p.n} answer "${p.answer}" is not A-E`);
        letterCounts.set(p.answer, (letterCounts.get(p.answer) ?? 0) + 1);
      }

      if (p.answerConfidence === "low" && p.tagSource !== "reviewed") {
        fail(id, `problem ${p.n} answer is low-confidence and unreviewed (evidence: ${p.answerEvidence.join("/") || "none"})`);
      }

      if (p.area !== null) {
        tagged++;
        if (!areaIds.has(p.area)) fail(id, `problem ${p.n} area "${p.area}" not in taxonomy`);
        else {
          const allowed = subsByArea.get(p.area)!;
          for (const s of p.subtopics) {
            if (!allowed.has(s)) fail(id, `problem ${p.n} subtopic "${s}" does not belong to area "${p.area}"`);
          }
        }
        if (p.subtopics.length < 1 || p.subtopics.length > 3) {
          fail(id, `problem ${p.n} has ${p.subtopics.length} subtopics, expected 1-3`);
        }
        if (p.descriptor && p.descriptor.split(/\s+/).length > 12) {
          warn(id, `problem ${p.n} descriptor is longer than 12 words`);
        }
      }

      const expectedTier = p.n <= 10 ? "T1" : p.n <= 18 ? "T2" : "T3";
      if (p.tier !== expectedTier) fail(id, `problem ${p.n} tier ${p.tier} should be ${expectedTier}`);
    }

    // A parser bug usually shows up as one letter dominating an exam.
    for (const [letter, count] of letterCounts) {
      if (count >= 11) warn(id, `answer "${letter}" appears ${count}/25 times — check the parser`);
    }

    // Scoring sanity: a perfect paper must hit the documented maximum.
    const max = exam.scoring.correct * 25;
    const expectedMax = exam.competition === "AMC8" ? 25 : 150;
    if (max !== expectedMax) fail(id, `perfect score is ${max}, expected ${expectedMax}`);
    if (exam.scoring.wrong !== 0) fail(id, `wrong answers must score 0, found ${exam.scoring.wrong}`);
    if (exam.scoring.blank > exam.scoring.correct) fail(id, `blank credit exceeds a correct answer`);
    if (exam.scoring.needsVerification) warn(id, `scoring not yet verified against the source page`);

    const fullyTagged = exam.problems.every((p) => p.area !== null);
    if (!fullyTagged) warn(id, `not fully tagged — accuracy rates stay hidden for this exam`);
  }

  const pct = totalProblems === 0 ? 0 : Math.round((tagged / totalProblems) * 100);
  console.log(`${files.length} exams, ${totalProblems} problems, ${pct}% tagged`);
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const p of problems) console.error(`  FAIL  ${p}`);

  if (problems.length > 0) {
    console.error(`\n${problems.length} blocking problem(s)`);
    process.exit(1);
  }
  console.log("validation passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
