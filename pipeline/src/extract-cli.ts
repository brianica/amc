import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringFlag } from "./args.js";
import { candidateExams } from "./manifest.js";
import { extractProblem, parseAnswerKeyPage } from "./extract.js";
import { answerKeyPage, getWikitext, getWikitextFollowingRedirect, problemPage } from "./wiki.js";
import { tierOf, type ExamFile, type TaggedProblem } from "./types.js";

const EXAMS_DIR = join(process.cwd(), "data", "exams");

/** Preserve tags a human already approved; only answers are recomputed. */
async function existingTags(id: string): Promise<Map<number, TaggedProblem>> {
  try {
    const prev = JSON.parse(await readFile(join(EXAMS_DIR, `${id}.json`), "utf8")) as ExamFile;
    return new Map(prev.problems.filter((p) => p.tagSource === "reviewed").map((p) => [p.n, p]));
  } catch {
    return new Map();
  }
}

/**
 * Stage 2. Offline: turns cached wikitext into committed exam files.
 * Problem statements and solutions stay in the cache and are never written here.
 */
async function main(): Promise<void> {
  await mkdir(EXAMS_DIR, { recursive: true });
  const examId = stringFlag("exam");
  let exams = candidateExams();
  if (examId !== null) exams = exams.filter((e) => e.id === examId);
  let written = 0;
  let flagged = 0;

  for (const exam of exams) {
    if ((await getWikitext(exam.wikiPage)) === null) continue;

    const keyText = await getWikitext(answerKeyPage(exam.wikiPage));
    const publishedKey = keyText ? parseAnswerKeyPage(keyText) : null;
    const keep = await existingTags(exam.id);
    const problems: TaggedProblem[] = [];

    for (let n = 1; n <= exam.numQuestions; n++) {
      const text = await getWikitextFollowingRedirect(problemPage(exam.wikiPage, n));
      const extracted = text ? extractProblem(n, text) : null;
      const kept = keep.get(n);

      let answer = extracted?.answer ?? null;
      let confidence = extracted?.answerConfidence ?? "low";

      // A published key disagreeing with the solutions means one of them is wrong,
      // and we must not guess which: demote to low so a human looks at it.
      const fromKey = publishedKey?.[n - 1] ?? null;
      if (fromKey && answer && fromKey !== answer) confidence = "low";
      if (fromKey && !answer) {
        answer = fromKey;
        confidence = "medium";
      }
      if (confidence === "low") flagged++;

      problems.push({
        n,
        answer,
        answerConfidence: confidence,
        answerEvidence: extracted?.answerEvidence ?? [],
        area: kept?.area ?? null,
        subtopics: kept?.subtopics ?? [],
        difficulty: kept?.difficulty ?? null,
        tier: tierOf(n),
        descriptor: kept?.descriptor ?? null,
        sourceUrl: `https://artofproblemsolving.com/wiki/index.php/${problemPage(exam.wikiPage, n)}`,
        tagSource: kept ? "reviewed" : "auto",
        statement: null,
      });
    }

    const file: ExamFile = { ...exam, problems };
    await writeFile(join(EXAMS_DIR, `${exam.id}.json`), `${JSON.stringify(file, null, 2)}\n`);
    written++;
  }

  console.log(`wrote ${written} exam files; ${flagged} problems need answer review`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
