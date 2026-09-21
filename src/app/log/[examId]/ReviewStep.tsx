"use client";

import { useMemo, useState, useTransition } from "react";
import type { ExamFile } from "@pipeline/types";
import type { ScoredAttempt } from "@pipeline/score";
import type { ErrorCategory, TimeBucket } from "@/lib/store";
import type { QuestionTiming } from "@/lib/timed";
import type { RenderedStatement } from "@/lib/wikitext";
import { assessRetake, BIAS_WINDOW_DAYS } from "@/lib/retake";
import { problemLink } from "@/lib/wiki-links";
import { saveAttempt, type TriageInput } from "./actions";

/**
 * Plain wording rather than the A/B/C/D labels of the taxonomy: students reliably
 * confuse "didn't know the method" with "couldn't find the path" when the options
 * are abstract, and a mis-tagged error is worse than an untagged one.
 */
const CATEGORIES: { id: ErrorCategory; label: string; hint: string }[] = [
  { id: "careless", label: "Careless slip", hint: "Knew the maths, misread or miscalculated" },
  { id: "concept", label: "Didn't know the method", hint: "A tool or theorem I haven't learned" },
  { id: "no_path", label: "Couldn't find the path", hint: "Knew the tools, didn't see the way in" },
  { id: "triage", label: "Ran out of time", hint: "Never got a real attempt at it" },
];

const TIME_BUCKETS: { id: TimeBucket; label: string }[] = [
  { id: "under1", label: "<1 min" },
  { id: "1to3", label: "1\u20133" },
  { id: "3to6", label: "3\u20136" },
  { id: "over6", label: "6+" },
];

/** Bucket a measured time so a timed sitting fills in what the student would guess. */
function bucketFor(seconds: number): TimeBucket {
  if (seconds < 60) return "under1";
  if (seconds < 180) return "1to3";
  if (seconds < 360) return "3to6";
  return "over6";
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/**
 * The step after a paper is scored: what it came to, and what happened on each miss.
 * Shared by both ways in — entering answers from paper, and sitting it on the clock —
 * so the two cannot drift apart.
 */
export function ReviewStep({
  exam,
  examLabel,
  scored,
  takenOn,
  durationMin,
  previousDates,
  timings,
  statements,
  onBack,
  backLabel,
}: {
  exam: ExamFile;
  examLabel: string;
  scored: ScoredAttempt;
  takenOn: string;
  durationMin: number | null;
  previousDates: string[];
  timings?: QuestionTiming[] | null;
  /** Rendered statements, when this instance is configured to show them. */
  statements?: (RenderedStatement | null)[];
  onBack?: () => void;
  backLabel?: string;
}) {
  const [triage, setTriage] = useState<Record<number, TriageInput>>(() => {
    // A timed sitting already measured how long each problem took, so the student
    // is not asked to estimate what the app watched happen.
    if (!timings) return {};
    return Object.fromEntries(
      timings.map((t) => [
        t.q,
        { q: t.q, errorCategory: null, timeBucket: bucketFor(t.seconds), note: "" } as TriageInput,
      ]),
    );
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [includeInStats, setIncludeInStats] = useState<boolean | null>(null);
  // Shown by default: deciding between a careless slip and a method you never knew
  // is guesswork without the problem in front of you. Hideable because a paper with
  // a dozen misses becomes a very long page.
  const [showProblems, setShowProblems] = useState(true);
  // Which problems have had their measured time overridden — e.g. a distraction
  // mid-problem means the clock is not a fair measure. Starts empty: the measurement
  // is trusted until the student says otherwise.
  const [overridingTime, setOverridingTime] = useState<Set<number>>(new Set());

  const retake = useMemo(() => assessRetake(previousDates, takenOn), [previousDates, takenOn]);
  const counted = includeInStats ?? !retake.likelyBiased;
  const measuredSeconds = useMemo(
    () => new Map((timings ?? []).map((t) => [t.q, t.seconds])),
    [timings],
  );

  function updateTriage(q: number, patch: Partial<TriageInput>) {
    setTriage((prev) => ({
      ...prev,
      [q]: { q, errorCategory: null, timeBucket: null, note: "", ...prev[q], ...patch },
    }));
  }

  function submit() {
    startTransition(async () => {
      try {
        await saveAttempt({
          examId: exam.id,
          takenOn,
          answers: scored.results.map((r) => r.given ?? "-").join(""),
          durationMin,
          includeInStats: counted,
          timings: timings ?? null,
          triage: Object.values(triage),
        });
      } catch (e) {
        // A redirect throws by design; only report real failures.
        if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) setError(e.message);
      }
    });
  }

  const missed = scored.results.filter((r) => r.status !== "correct");
  const hasStatements = missed.some((r) => statements?.[r.n - 1]);

  return (
    <div className="space-y-8">
      <section className="rounded-md border border-border bg-surface p-5">
        <p className="text-sm text-muted">{examLabel}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {scored.score}
          <span className="ml-2 text-base font-normal text-muted">/ {scored.maxScore}</span>
        </p>
        <dl className="mt-4 flex gap-6 text-sm">
          <div>
            <dt className="text-muted">Correct</dt>
            <dd className="tabular-nums text-correct">{scored.counts.correct}</dd>
          </div>
          <div>
            <dt className="text-muted">Wrong</dt>
            <dd className="tabular-nums text-wrong">{scored.counts.incorrect}</dd>
          </div>
          <div>
            <dt className="text-muted">Blank</dt>
            <dd className="tabular-nums text-blank">{scored.counts.blank}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">
          Points given up — Q1–10: <strong className="text-text">{scored.lostByTier.T1}</strong>,
          Q11–18: <strong className="text-text">{scored.lostByTier.T2}</strong>, Q19–25:{" "}
          <strong className="text-text">{scored.lostByTier.T3}</strong>
        </p>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">What happened on each one?</h2>
          {hasStatements && (
            <button
              type="button"
              onClick={() => setShowProblems((v) => !v)}
              className="text-sm text-muted underline hover:text-text"
            >
              {showProblems ? "Hide the problems" : "Show the problems"}
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          Optional, but this is what turns a score into a diagnosis. About 20 seconds each.
        </p>

        <ul className="mt-4 space-y-3">
          {missed.map((r) => (
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

              {showProblems && statements?.[r.n - 1] && (
                <div className="mt-3 rounded-md border border-border bg-bg px-3 py-2 text-[0.95rem] leading-relaxed">
                  <div
                    className="statement"
                    // Built by renderStatement, which escapes every character of the
                    // source and emits only its own markup plus KaTeX output.
                    dangerouslySetInnerHTML={{ __html: statements[r.n - 1]!.html }}
                  />
                  {statements[r.n - 1]!.hasDiagram && (
                    <p className="mt-1 text-sm text-muted">
                      This problem has a diagram that cannot be drawn here — see the
                      Problem link above, or check your paper.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.hint}
                    aria-pressed={triage[r.n]?.errorCategory === c.id}
                    onClick={() => updateTriage(r.n, { errorCategory: c.id })}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      triage[r.n]?.errorCategory === c.id
                        ? "border-accent bg-accent text-white"
                        : "border-border hover:border-accent"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Time spent</span>
                {measuredSeconds.has(r.n) && !overridingTime.has(r.n) ? (
                  <>
                    <span className="font-medium">
                      {formatSeconds(measuredSeconds.get(r.n)!)}
                    </span>
                    <span className="text-muted">— measured while you sat it</span>
                    <button
                      type="button"
                      onClick={() => setOverridingTime((prev) => new Set(prev).add(r.n))}
                      className="text-muted underline hover:text-text"
                    >
                      Not accurate?
                    </button>
                  </>
                ) : (
                  TIME_BUCKETS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      aria-pressed={triage[r.n]?.timeBucket === b.id}
                      onClick={() => updateTriage(r.n, { timeBucket: b.id })}
                      className={`rounded border px-2 py-1 ${
                        triage[r.n]?.timeBucket === b.id
                          ? "border-accent bg-accent text-white"
                          : "border-border hover:border-accent"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))
                )}
              </div>

              <input
                value={triage[r.n]?.note ?? ""}
                onChange={(e) => updateTriage(r.n, { note: e.target.value })}
                maxLength={500}
                placeholder="One line on what you missed (optional)"
                className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
              />
            </li>
          ))}
        </ul>
      </section>

      {retake.previous > 0 && (
        <section
          className={`rounded-md border px-4 py-3 text-sm ${
            retake.likelyBiased ? "border-blank/50 bg-blank/10" : "border-border bg-surface"
          }`}
        >
          {retake.likelyBiased ? (
            <p>
              You last sat this paper{" "}
              {retake.daysSinceLast === 0
                ? "today"
                : `${retake.daysSinceLast} day${retake.daysSinceLast === 1 ? "" : "s"} ago`}
              . Within {BIAS_WINDOW_DAYS} days the score tends to measure how well you
              remember this paper rather than how well you can do the maths — and on
              multiple choice, remembering a letter is enough.
            </p>
          ) : (
            <p>
              You have sat this paper before, {retake.daysSinceLast} days ago. That is
              long enough for the answers to have faded, so it should be a fair measure.
            </p>
          )}

          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              checked={counted}
              onChange={(e) => setIncludeInStats(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Count this sitting in my scores and topic accuracy.
              <span className="block text-muted">
                Either way it is saved, and anything you miss still joins the re-solve
                queue.
              </span>
            </span>
          </label>
        </section>
      )}

      {error && <p className="text-sm text-wrong">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save attempt"}
        </button>
        {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-border px-4 py-2"
        >
          {backLabel ?? "Back"}
        </button>
        )}
      </div>
    </div>
  );
}
