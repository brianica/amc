"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExamFile } from "@pipeline/types";
import { parseAnswers, scoreAttempt } from "@pipeline/score";
import {
  answer,
  answerString,
  elapsedMinutes,
  finish,
  formatClock,
  goTo,
  isExpired,
  next,
  pause,
  previous,
  remainingMs,
  resume,
  startSession,
  timings,
  toggleFlag,
  unseen,
  type Letter,
  type TimedState,
} from "@/lib/timed";
import type { RenderedStatement } from "@/lib/wikitext";
import { problemLink } from "@/lib/wiki-links";
import { ReviewStep } from "../ReviewStep";

const LETTERS: Letter[] = ["A", "B", "C", "D", "E"];

/** A 75-minute session is too much work to lose to a stray refresh. */
const storageKey = (examId: string) => `amc:timed:${examId}`;

function loadSaved(examId: string): TimedState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(examId));
    return raw ? (JSON.parse(raw) as TimedState) : null;
  } catch {
    return null;
  }
}

export function TimedSession({
  exam,
  examLabel,
  previousDates,
  defaultMinutes,
  statements,
}: {
  exam: ExamFile;
  examLabel: string;
  previousDates: string[];
  defaultMinutes: number;
  /** Rendered problem statements, when this instance is configured to show them. */
  statements?: (RenderedStatement | null)[];
}) {
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [state, setState] = useState<TimedState | null>(null);
  const [resumable, setResumable] = useState<TimedState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const hasStatements = (statements?.filter(Boolean).length ?? 0) > 0;

  useEffect(() => setResumable(loadSaved(exam.id)), [exam.id]);

  // One ticker for the clock display. Elapsed time per problem is banked on
  // navigation instead, so nothing depends on this firing. Paused, both clocks are
  // already frozen (see timed.ts), so there is nothing for a tick to update.
  useEffect(() => {
    if (!state || state.submitted || state.pausedAt !== null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [state?.submitted, state?.pausedAt !== null, state !== null]);

  useEffect(() => {
    if (!state) return;
    try {
      if (state.submitted) window.localStorage.removeItem(storageKey(exam.id));
      else window.localStorage.setItem(storageKey(exam.id), JSON.stringify(state));
    } catch {
      // Private browsing or a full quota: the session still works, it just cannot
      // be recovered after a refresh.
    }
  }, [state, exam.id]);

  const end = useCallback(() => setState((s) => (s && !s.submitted ? finish(s, Date.now()) : s)), []);

  // Out of time ends the paper, exactly as it would in the hall.
  useEffect(() => {
    if (state && !state.submitted && isExpired(state, now)) end();
  }, [state, now, end]);

  const apply = (fn: (s: TimedState, t: number) => TimedState) =>
    setState((s) => (s && !s.submitted ? fn(s, Date.now()) : s));

  const togglePause = useCallback(() => {
    setState((s) => {
      if (!s || s.submitted) return s;
      return s.pausedAt !== null ? resume(s, Date.now()) : pause(s, Date.now());
    });
  }, []);

  useEffect(() => {
    if (!state || state.submitted) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toUpperCase();
      if (key === "P") {
        togglePause();
      } else if (state!.pausedAt !== null) {
        return; // Paused: nothing else responds until resumed.
      } else if (LETTERS.includes(key as Letter)) {
        setState((s) => (s && !s.submitted ? answer(s, key as Letter) : s));
      } else if (e.key === "ArrowRight") apply(next);
      else if (e.key === "ArrowLeft") apply(previous);
      else if (key === "F") setState((s) => (s && !s.submitted ? toggleFlag(s) : s));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, togglePause]);

  const scored = useMemo(
    () => (state?.submitted ? scoreAttempt(exam, parseAnswers(answerString(state))) : null),
    [state, exam],
  );

  // --- Start screen -------------------------------------------------------

  if (!state) {
    return (
      <div className="space-y-6">
        <p className="max-w-prose text-muted">
          The clock runs for the whole paper and the app records how long you spend on
          each problem — which is the only way to see time lost on one question at the
          cost of an easier one later.
        </p>

        {resumable && (
          <div className="rounded-md border border-blank/50 bg-blank/10 px-4 py-3 text-sm">
            <p>An unfinished sitting of this paper is saved on this device.</p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setState(resumable)}
                className="rounded-md bg-accent px-3 py-1.5 font-medium text-white"
              >
                Resume it
              </button>
              <button
                type="button"
                onClick={() => {
                  window.localStorage.removeItem(storageKey(exam.id));
                  setResumable(null);
                }}
                className="rounded-md border border-border px-3 py-1.5"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block text-muted">Time limit (minutes)</span>
            <input
              type="number"
              min={1}
              max={300}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value) || defaultMinutes)}
              className="mt-1 w-24 rounded-md border border-border bg-surface px-3 py-1.5"
            />
          </label>

          <p className="text-sm text-muted">
            {hasStatements
              ? "The problems will be shown here, from this machine's local copy."
              : "Each problem links to the original, or use your own copy of the paper."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            const t = Date.now();
            setNow(t);
            setState(startSession(exam.problems.length, minutes, t));
          }}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white"
        >
          Start the clock
        </button>
      </div>
    );
  }

  // --- Results ------------------------------------------------------------

  if (state.submitted && scored) {
    const skipped = unseen(state);
    return (
      <div className="space-y-6">
        {skipped.length > 0 && (
          <p className="rounded-md border border-blank/50 bg-blank/10 px-4 py-3 text-sm">
            You never opened {skipped.length} problem{skipped.length === 1 ? "" : "s"} —{" "}
            {skipped.map((q) => `Q${q}`).join(", ")}. Those are points that were never in
            play, which is usually a pacing problem rather than a maths one.
          </p>
        )}
        <ReviewStep
          exam={exam}
          examLabel={examLabel}
          scored={scored}
          takenOn={new Date().toISOString().slice(0, 10)}
          durationMin={elapsedMinutes(state, Date.now())}
          previousDates={previousDates}
          timings={timings(state)}
          statements={statements}
        />
      </div>
    );
  }

  // --- Running ------------------------------------------------------------

  const left = remainingMs(state, now);
  const q = state.current;
  const problem = exam.problems[q];
  const answered = state.answers.filter((a) => a !== null).length;
  const lowOnTime = left < 5 * 60_000;
  const paused = state.pausedAt !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
        <span
          className={`text-4xl font-semibold tabular-nums ${lowOnTime && !paused ? "text-wrong" : ""}`}
          aria-live="off"
        >
          {formatClock(left)}
        </span>
        <span className="text-base text-muted">
          {answered} of {state.answers.length} answered
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={togglePause}
            className="rounded-md border border-border px-3 py-1.5 text-base"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingEnd(true)}
            disabled={paused}
            className="rounded-md border border-border px-3 py-1.5 text-base disabled:opacity-40"
          >
            Finish early
          </button>
        </div>
      </div>

      {paused ? (
        <section className="rounded-md border border-border bg-surface p-5 text-center">
          <p className="text-xl font-semibold">Paused</p>
          <p className="mt-2 text-base text-muted">
            The clock is stopped and the problem is hidden. Nothing here is being timed
            against you while you take a break.
          </p>
          <button
            type="button"
            onClick={togglePause}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-lg font-medium text-white"
          >
            Resume
          </button>
        </section>
      ) : (
        <>
          {confirmingEnd && (
            <div className="rounded-md border border-border bg-surface px-4 py-3 text-base">
              <p>End the paper now and score it? Anything unanswered counts as blank.</p>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={end}
                  className="rounded-md bg-accent px-3 py-1.5 font-medium text-white"
                >
                  End and score
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingEnd(false)}
                  className="rounded-md border border-border px-3 py-1.5"
                >
                  Keep going
                </button>
              </div>
            </div>
          )}

          <section className="rounded-md border border-border bg-surface p-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-xl font-semibold">Problem {q + 1}</h2>
              <span className="text-base text-muted">{problem?.tier === "T1" ? "Q1–10" : problem?.tier === "T2" ? "Q11–18" : "Q19–25"}</span>
              {state.flagged[q] && <span className="text-base text-blank">flagged</span>}
              <a
                href={problemLink(exam.wikiPage, q + 1)}
                target="_blank"
                rel="noreferrer"
                className="text-base text-accent underline"
              >
                Original problem
              </a>
            </div>

            {statements?.[q] && (
              <div className="mt-3 space-y-2 text-lg leading-relaxed">
                <div
                  className="statement"
                  // Built by renderStatement, which escapes every character of the source
                  // and emits only its own markup plus KaTeX output.
                  dangerouslySetInnerHTML={{ __html: statements[q]!.html }}
                />
                {statements[q]!.hasDiagram && (
                  <p className="text-base text-muted">
                    This problem has a diagram that cannot be drawn here — see the
                    original problem link above, or check your paper.
                  </p>
                )}
              </div>
            )}

            {!statements?.[q] && (
              <p className="mt-2 text-base text-muted">
                Use the original problem link above, or check your paper.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {LETTERS.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  aria-pressed={state.answers[q] === letter}
                  onClick={() => setState((s) => (s ? answer(s, letter) : s))}
                  className={`h-14 w-14 rounded-md border text-2xl ${
                    state.answers[q] === letter
                      ? "border-accent bg-accent text-white"
                      : "border-border hover:border-accent"
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => apply(previous)}
                disabled={q === 0}
                className="rounded-md border border-border px-3 py-1.5 text-base disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => apply(next)}
                disabled={q === state.answers.length - 1}
                className="rounded-md border border-accent bg-accent px-3 py-1.5 text-base text-white disabled:opacity-40"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setState((s) => (s ? toggleFlag(s) : s))}
                className="rounded-md border border-border px-3 py-1.5 text-base"
              >
                {state.flagged[q] ? "Unflag" : "Flag for review"}
              </button>
              <span className="text-xs text-muted">
                A–E to answer · ← → to move · F to flag · P to pause
              </span>
            </div>
          </section>

          <div ref={gridRef}>
            <p className="mb-2 text-base text-muted">Jump to a problem</p>
            <div className="grid grid-cols-8 gap-1 sm:grid-cols-13">
              {state.answers.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => apply((s, t) => goTo(s, i, t))}
                  aria-current={i === q ? "true" : undefined}
                  className={`relative h-10 rounded border text-base tabular-nums ${
                    i === q
                      ? "border-accent bg-accent text-white"
                      : a
                        ? "border-border bg-bg font-medium"
                        : "border-border text-muted"
                  }`}
                  title={`Problem ${i + 1}${a ? ` — answered ${a}` : " — unanswered"}`}
                >
                  {i + 1}
                  {state.flagged[i] && (
                    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-blank" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
