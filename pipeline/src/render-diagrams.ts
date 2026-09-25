import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { hasFlag, stringFlag } from "./args.js";
import { splitSections } from "./extract.js";
import { CACHE_DIR } from "./wiki.js";

const execFileAsync = promisify(execFile);

const DIAGRAM_DIR = join(CACHE_DIR, "diagrams");
const EXAMS_DIR = join(process.cwd(), "data", "exams");

interface DiagramEntry {
  page: string;
  /** SVG markup, or null when this problem has no diagram or rendering failed. */
  svg: string | null;
  renderedAt: string;
  /** Present only when svg is null and a diagram was found — why it didn't render. */
  error?: string;
}

function cachePath(page: string): string {
  return join(DIAGRAM_DIR, `${page.replace(/[^A-Za-z0-9._/-]/g, "_")}.json`);
}

async function readCache(page: string): Promise<DiagramEntry | null> {
  try {
    return JSON.parse(await readFile(cachePath(page), "utf8")) as DiagramEntry;
  } catch {
    return null;
  }
}

async function writeCache(entry: DiagramEntry): Promise<void> {
  const p = cachePath(entry.page);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(entry, null, 2));
}

/** The first [asy]...[/asy] or <asy>...</asy> block in a problem statement, if any. */
function firstDiagram(statement: string): string | null {
  const m = /\[asy\]([\s\S]*?)\[\/asy\]|<asy>([\s\S]*?)<\/asy>/i.exec(statement);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/**
 * AoPS diagrams are typically sized for a printed page (size(5cm), size(150) in
 * points, etc.), which comes out small and blurry-feeling next to the app's own
 * 16-18px problem text. There is no CLI flag or global unit override for this —
 * `cm`/`inch` are `restricted` constants in plain_constants.asy, so they cannot be
 * redefined from outside — the only reliable lever is rewriting the numbers inside
 * the diagram's own size()/unitsize() call before compiling.
 *
 * Multiplies every numeric argument to the first size(...)/unitsize(...) call by
 * SCALE; if the diagram has neither (about a third of them, relying on Asymptote's
 * own small default), injects a size() call so it isn't left at that default.
 */
const SCALE = 2;

function scaleUp(asy: string): string {
  const call = /\b(size|unitsize)\s*\(([^)]*)\)/.exec(asy);
  if (!call) {
    // No explicit sizing at all — 360pt (5in) is a reasonable "reads clearly
    // next to problem text" default, well above Asymptote's own tiny default.
    return `size(360);\n${asy}`;
  }
  const scaledArgs = call[2]!.replace(/-?\d+(\.\d+)?/g, (n) => String(Number(n) * SCALE));
  return asy.slice(0, call.index) + `${call[1]}(${scaledArgs})` + asy.slice(call.index + call[0].length);
}

/**
 * Shells out to the real Asymptote compiler. Asymptote is a full vector-graphics
 * language (arcs, fills, coordinate geometry) — there is no JS reimplementation
 * worth trusting, so this is the only way to render a diagram rather than just link
 * to it. Requires `asy` on PATH, which in turn needs a LaTeX install with the fonts
 * AoPS diagrams commonly request (texlive-fonts-recommended covers mathptmx).
 *
 * A diagram is source code, not data — some fraction will fail (a missing import, a
 * font AoPS itself doesn't ship the metrics for, a construct this Asymptote version
 * doesn't have) and that failure is cached too, so it isn't retried every run and the
 * page falls back to linking out, exactly as it did before this stage existed.
 */
async function renderToSvg(asy: string): Promise<{ svg: string | null; error?: string }> {
  const dir = await mkdtemp(join(tmpdir(), "amc-diagram-"));
  const src = join(dir, "diagram.asy");
  const out = join(dir, "diagram.svg");
  try {
    await writeFile(src, asy);
    await execFileAsync("asy", ["-f", "svg", "-o", out, src], {
      timeout: 20_000,
      cwd: dir,
    });
    const svg = await readFile(out, "utf8");
    return { svg };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Keep only the first line or two — asy's stderr on a real failure can run to
    // pages of LaTeX log noise, and the cached entry only needs enough to explain
    // itself to a human skimming it later, not the full transcript.
    return { svg: null, error: message.split("\n").slice(0, 3).join(" ") };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const examId = stringFlag("exam");
  const refresh = hasFlag("refresh");

  let examFiles = (await readdir(EXAMS_DIR)).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  if (examId !== null) examFiles = examFiles.filter((f) => f === `${examId}.json`);

  let rendered = 0;
  let cached = 0;
  let noDiagram = 0;
  let failed = 0;

  for (const file of examFiles) {
    const exam = JSON.parse(await readFile(join(EXAMS_DIR, file), "utf8")) as {
      id: string;
      wikiPage: string;
      problems: { n: number }[];
    };

    for (const problem of exam.problems) {
      const page = `${exam.wikiPage}/Problem_${problem.n}`;

      if (!refresh) {
        const hit = await readCache(page);
        if (hit) {
          cached++;
          continue;
        }
      }

      const cacheFile = join(CACHE_DIR, `${page.replace(/[^A-Za-z0-9._/-]/g, "_")}.json`);
      let wikitext: string | null = null;
      try {
        wikitext = (JSON.parse(await readFile(cacheFile, "utf8")) as { wikitext: string | null }).wikitext;
      } catch {
        wikitext = null;
      }
      if (!wikitext) continue; // not fetched — nothing to render

      const { statement } = splitSections(wikitext);
      const asy = firstDiagram(statement);
      if (!asy) {
        noDiagram++;
        await writeCache({ page, svg: null, renderedAt: new Date().toISOString() });
        continue;
      }

      const { svg, error } = await renderToSvg(scaleUp(asy));
      await writeCache({ page, svg, renderedAt: new Date().toISOString(), error });
      if (svg) {
        rendered++;
        console.log(`  ${page}: rendered`);
      } else {
        failed++;
        console.log(`  ${page}: failed — ${error}`);
      }
    }
  }

  console.log(
    `\ndone: ${rendered} rendered, ${failed} failed, ${noDiagram} had no diagram, ${cached} already cached`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
