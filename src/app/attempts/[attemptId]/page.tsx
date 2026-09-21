import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { examLabel, findExam } from "@/lib/exams";
import { getStore } from "@/lib/store";
import { loadStatements } from "@/lib/statements";
import {
  attemptOrdinals,
  CATEGORIES,
  CATEGORY_LABEL,
  headline,
  strengthGrid,
  subtopicBreakdown,
  TIME_BUCKET_LABEL,
} from "@/lib/analytics";
import { problemLink } from "@/lib/wiki-links";
import { parseAnswers, scoreAttempt } from "@pipeline/score";
import { ScoreSummary } from "../ScoreSummary";
import { StrengthGrid, TimeSpent, type TimeSpentPoint } from "../../dashboard/charts";

// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * A single saved attempt: the same score summary shown right after saving, on any
 * later visit. Read-only — the triage was already recorded from ReviewStep; this page
 * just shows what was saved, it does not let it be edited again.
 */
export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { attemptId } = await params;
  const store = getStore();
  const [attempts, logs] = await Promise.all([store.listAttempts(user.id), store.listLogs(user.id)]);

  // listAttempts is already scoped to this user, so a missing match means either a
  // bad id or someone else's attempt — both are a 404, never a hint either way.
  const attempt = attempts.find((a) => a.id === attemptId);
  if (!attempt) notFound();

  const exam = findExam(attempt.exam_id);
  if (!exam) notFound();

  const parsed = parseAnswers(attempt.answers);
  const scored = scoreAttempt(exam, parsed);
  const ordinal = attemptOrdinals(attempts).get(attempt.id);
  const label =
    ordinal && ordinal.total > 1
      ? `${examLabel(exam)} (sitting ${ordinal.ordinal} of ${ordinal.total})`
      : examLabel(exam);

  const statements = await loadStatements(exam);
  const attemptLogs = logs.filter((l) => l.attempt_id === attempt.id);
  const logByQuestion = new Map(attemptLogs.map((l) => [l.q_number, l]));
  const missed = scored.results.filter((r) => r.status !== "correct");

  // Points lost by cause, area accuracy and technique accuracy, all scoped to this
  // one attempt — the same computations the dashboard runs across every counted
  // paper, run here across just this one sitting.
  const h = headline([attempt], attemptLogs, () => exam);
  const causesShown = CATEGORIES.some((c) => h.lostByCause[c] > 0);
  const grid = strengthGrid([attempt], () => exam);
  // minSeen 1, not the dashboard's default of 2: this is the one paper being
  // reviewed, not a pattern across many, so a technique seen once still belongs here.
  const techniques = subtopicBreakdown([attempt], () => exam, 1);

  const timePoints: TimeSpentPoint[] =
    attempt.mode === "timed" && attempt.timings
      ? attempt.timings
          .map((t) => {
            const r = scored.results.find((r) => r.n === t.q);
            return r ? { q: t.q, seconds: t.seconds, status: r.status } : null;
          })
          .filter((p): p is TimeSpentPoint => p !== null)
      : [];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">
          {attempt.taken_on} · {attempt.mode === "timed" ? "sat on the clock" : "logged from paper"}
          {attempt.duration_min && ` · ${attempt.duration_min} min`}
        </p>
        <h1 className="text-2xl font-semibold">{label}</h1>
        {!attempt.include_in_stats && (
          <p className="mt-1 text-sm text-blank">Not counted in your scores and topic accuracy.</p>
        )}
      </div>

      <ScoreSummary examLabel={label} scored={scored} />

      {causesShown && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Points lost by cause</h2>
          <ul className="mt-4 space-y-1 text-sm">
            {CATEGORIES.map((c) => (
              <li key={c} className="flex justify-between border-b border-border py-1.5">
                <span>{CATEGORY_LABEL[c]}</span>
                <span className="tabular-nums text-muted">{h.lostByCause[c]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {timePoints.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Time spent</h2>
          <p className="mt-1 text-sm text-muted">Seconds per problem, coloured by outcome.</p>
          <div className="mt-4">
            <TimeSpent points={timePoints} />
          </div>
        </section>
      )}

      {grid.areas.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">By subject</h2>
          <p className="mt-1 text-sm text-muted">
            Accuracy on this paper, by topic and by where it sat on the paper.
          </p>
          <div className="mt-4">
            <StrengthGrid areas={grid.areas} cells={grid.cells} />
          </div>
        </section>
      )}

      {techniques.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">By technique</h2>
          <p className="mt-1 text-sm text-muted">
            The same questions, broken down further. A problem can use more than one
            technique, so this adds up to more than the paper's question count.
          </p>
          <ul className="mt-4 space-y-1 text-sm">
            {techniques.map((t) => (
              <li
                key={`${t.area}-${t.subtopic}`}
                className="flex items-baseline justify-between gap-4 border-b border-border py-1.5"
              >
                <span>
                  {t.subtopic.replace(/-/g, " ")}
                  <span className="ml-2 text-xs text-muted">{t.area.replace(/-/g, " ")}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {t.correct} of {t.seen}
                  <span className="ml-2 text-text">{Math.round(t.accuracy * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {missed.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">What happened on each one</h2>
          <ul className="mt-4 space-y-3">
            {missed.map((r) => {
              const log = logByQuestion.get(r.n);
              return (
                <li key={r.n} className="rounded-md border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">Q{r.n}</span>
                    <span className={r.status === "blank" ? "text-blank" : "text-wrong"}>
                      {r.status === "blank" ? "blank" : `answered ${r.given}, correct ${r.correct}`}
                    </span>
                    {r.area && (
                      <span className="text-sm text-muted">
                        ·{" "}
                        {(exam.problems[r.n - 1]?.subtopics ?? []).length > 0
                          ? exam.problems[r.n - 1]!.subtopics.map((t) => t.replace(/-/g, " ")).join(", ")
                          : r.area.replace(/-/g, " ")}
                      </span>
                    )}
                    <a
                      href={problemLink(exam.wikiPage, r.n)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-accent underline"
                    >
                      Problem
                    </a>
                    {exam.problems[r.n - 1]?.sourceUrl && (
                      <a
                        href={exam.problems[r.n - 1]!.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-accent underline"
                      >
                        Solutions
                      </a>
                    )}
                  </div>

                  {statements?.byQuestion[r.n - 1] && (
                    <div className="mt-3 rounded-md border border-border bg-bg px-3 py-2 text-[0.95rem] leading-relaxed">
                      <div
                        className="statement"
                        // Built by renderStatement, which escapes every character of the
                        // source and emits only its own markup plus KaTeX output.
                        dangerouslySetInnerHTML={{ __html: statements.byQuestion[r.n - 1]!.html }}
                      />
                    </div>
                  )}

                  {(log?.error_category || log?.time_bucket || log?.note) && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                      {log.error_category && <span>{CATEGORY_LABEL[log.error_category]}</span>}
                      {log.time_bucket && <span>{TIME_BUCKET_LABEL[log.time_bucket]}</span>}
                      {log.note && <span className="text-text">&ldquo;{log.note}&rdquo;</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-sm">
        <Link href="/dashboard" className="text-accent underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
