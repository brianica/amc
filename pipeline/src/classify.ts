import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { numberFlag } from "./args.js";
import { extractProblem } from "./extract.js";
import { getWikitextFollowingRedirect, problemPage } from "./wiki.js";
import type { ExamFile } from "./types.js";

const EXAMS_DIR = join(process.cwd(), "data", "exams");
const CLASSIFY_CACHE = join(process.cwd(), "pipeline", ".cache", "classify");
const PROMPT_VERSION = "v2"; // bumped: switched provider from Anthropic to Gemini
const CONCURRENCY = 6;

const MODEL = process.env.CLASSIFY_MODEL ?? "gemini-flash-latest";

interface Taxonomy {
  areas: { id: string; label: string; subtopics: { id: string; label: string }[] }[];
}

const taxonomy = JSON.parse(
  await readFile(join(process.cwd(), "data", "taxonomy.json"), "utf8"),
) as Taxonomy;

const areaIds = taxonomy.areas.map((a) => a.id) as [string, ...string[]];
const subtopicIds = taxonomy.areas.flatMap((a) => a.subtopics.map((s) => s.id)) as [string, ...string[]];

const Classification = z.object({
  area: z.enum(areaIds).describe("The single best-fitting area"),
  subtopics: z.array(z.enum(subtopicIds)).min(1).max(3)
    .describe("1-3 specific techniques, all belonging to the chosen area"),
  difficulty: z.number().min(1).max(5).describe("1 = trivial, 5 = hardest AMC problems"),
  descriptor: z.string().describe("At most 12 words, in your own words, describing what the problem asks. Never quote the original wording."),
});
type Classification = z.infer<typeof Classification>;
const classificationSchema = z.toJSONSchema(Classification);

const taxonomyText = taxonomy.areas
  .map((a) => `${a.id} (${a.label}): ${a.subtopics.map((s) => s.id).join(", ")}`)
  .join("\n");

const SYSTEM = `You classify past AMC competition math problems for a study-diagnostic tool.

Taxonomy — choose exactly one area, and 1-3 subtopics that belong to that area:
${taxonomyText}

Rules:
- Classify by the technique a student actually needs, not by surface wording. A word
  problem solved with modular arithmetic is number-theory, not algebra.
- Pick the area a student would study to get better at this problem.
- The descriptor must be your own words, at most 12 words, and must never reproduce
  the original problem text.`;

function client(): GoogleGenAI {
  return new GoogleGenAI({});
}

/** Thrown to mark a failed compute so it is never written to the cache as if it were a result. */
class ComputeFailed extends Error {}

async function cached<T>(key: string, compute: () => Promise<T>): Promise<T | null> {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
  const path = join(CLASSIFY_CACHE, `${hash}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    // readFile failing (cache miss) and compute() failing land in the same catch, so
    // only persist on real success — a transient API/auth error must never be written
    // to disk as a permanent "the model returned nothing" result.
  }
  try {
    const value = await compute();
    await mkdir(CLASSIFY_CACHE, { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2));
    return value;
  } catch (err) {
    if (err instanceof ComputeFailed) return null;
    throw err;
  }
}

/**
 * Two passes with genuinely different inputs: one sees the worked solutions, one sees
 * only the problem. Agreement between them is real evidence; running the same prompt
 * twice would only measure sampling noise.
 */
async function classifyOnce(
  api: GoogleGenAI,
  cacheKey: string,
  userContent: string,
): Promise<Classification | null> {
  return cached(cacheKey, async () => {
    let response;
    try {
      response = await api.models.generateContent({
        model: MODEL,
        contents: userContent,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseJsonSchema: classificationSchema,
        },
      });
    } catch (err) {
      // Network/auth/quota failure — not a verdict about this problem. Must not be
      // cached as a result, or a transient outage becomes a permanent gap.
      console.warn(`  classify request failed: ${String(err).slice(0, 160)}`);
      throw new ComputeFailed();
    }

    const text = response.text;
    if (!text) return null;
    try {
      return Classification.parse(JSON.parse(text));
    } catch (err) {
      // Structured output validation failure — model returned an out-of-enum value.
      // A parse failure is a legitimate "no usable answer", safe to cache as null so
      // the other pass is used and we don't keep re-asking for the same bad output.
      console.warn(`  classify parse error (will use other pass): ${String(err).slice(0, 120)}`);
      return null;
    }
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}

/**
 * Stage 3. Fills in area/subtopics/difficulty/descriptor for untagged problems.
 *   npm run classify                 # every untagged problem
 *   npm run classify -- --limit 1    # one exam, to check quality and cost first
 */
async function main(): Promise<void> {
  const api = client();
  const limit = numberFlag("limit");
  const all = (await readdir(EXAMS_DIR)).filter((f) => f.endsWith(".json")).sort();
  const files = limit === null ? all : all.slice(0, limit);
  console.log(`classifying ${files.length} exam file(s) with ${MODEL}\n`);
  let done = 0;
  let disagreements = 0;

  for (const f of files) {
    const exam = JSON.parse(await readFile(join(EXAMS_DIR, f), "utf8")) as ExamFile;
    const todo = exam.problems.filter((p) => p.tagSource !== "reviewed" && p.area === null);
    if (todo.length === 0) continue;

    await mapLimit(todo, CONCURRENCY, async (p) => {
      const text = await getWikitextFollowingRedirect(problemPage(exam.wikiPage, p.n));
      if (!text) return;
      const { statement, solutions } = extractProblem(p.n, text);
      if (!statement) return;

      const base = `${exam.id}#${p.n}|${PROMPT_VERSION}|${MODEL}`;
      const withSolutions = `Problem:\n${statement}\n\nWorked solutions:\n${solutions.slice(0, 3).join("\n\n---\n\n")}`;
      const statementOnly = `Problem:\n${statement}`;

      const [a, b] = await Promise.all([
        classifyOnce(api, `${base}|solutions`, withSolutions),
        classifyOnce(api, `${base}|statement`, statementOnly),
      ]);

      const chosen = a ?? b;
      if (!chosen) return;

      p.area = chosen.area;
      p.subtopics = chosen.subtopics;
      p.difficulty = chosen.difficulty;
      p.descriptor = chosen.descriptor;

      // Disagreement is the signal that a human should look; never silently pick one.
      if (a && b && a.area !== b.area) {
        disagreements++;
        p.tagSource = "auto";
        p.descriptor = `${chosen.descriptor} [REVIEW: passes disagreed — ${a.area} vs ${b.area}]`;
      }
      done++;
    });

    await writeFile(join(EXAMS_DIR, f), `${JSON.stringify(exam, null, 2)}\n`);
    console.log(`  ${exam.id}: tagged ${todo.length} problems`);
  }

  console.log(`tagged ${done} problems with ${MODEL}; ${disagreements} need review`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
