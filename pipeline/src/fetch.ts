import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hasFlag, numberFlag } from "./args.js";
import { candidateExams, priorityExams } from "./manifest.js";
import { answerKeyPage, getWikitext, problemPage } from "./wiki.js";

/**
 * Stage 1. The only stage that needs network access.
 *   npm run fetch                  # priority set: AMC 10, 2015 onward
 *   npm run fetch -- --limit 1     # just the first exam, to try it out
 *   npm run fetch -- --all         # every candidate exam
 */
async function main(): Promise<void> {
  const all = hasFlag("all");
  const limit = numberFlag("limit");
  const selected = all ? candidateExams() : priorityExams();
  // A limited run exists so the whole thing can be tried on one exam before
  // committing an hour of requests to someone else's wiki.
  const exams = limit === null ? selected : selected.slice(0, limit);
  const missing: string[] = [];
  let pages = 0;

  const scope = all ? "full backfill" : "priority set";
  console.log(
    `fetching ${exams.length} exam(s) (${limit === null ? scope : `${scope}, limited to ${limit}`})`,
  );
  console.log(`about ${Math.ceil((exams.length * 26) / 60)} min at one request per second\n`);

  for (const exam of exams) {
    const examText = await getWikitext(exam.wikiPage);
    if (examText === null) {
      missing.push(exam.id);
      console.log(`  ${exam.id}: no such page, skipping`);
      continue;
    }
    for (let n = 1; n <= exam.numQuestions; n++) {
      await getWikitext(problemPage(exam.wikiPage, n));
      pages++;
    }
    await getWikitext(answerKeyPage(exam.wikiPage)); // optional cross-check; may not exist
    console.log(`  ${exam.id}: ${exam.numQuestions} problems cached`);
  }

  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(
    join(process.cwd(), "data", "_missing.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), missing }, null, 2),
  );
  console.log(`done: ${pages} problem pages, ${missing.length} exams absent`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
