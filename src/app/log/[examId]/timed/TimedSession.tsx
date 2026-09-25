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
import type { AttemptRecord } from "@/lib/store";
import { discardInProgressAttempt, listInProgressAttemptsForExam, saveTimedProgress, startTimedAttempt } from "../actions";
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

/** How often to write the running session to the database. localStorage stays the
 *  fast, synchronous safety net; this is the slower one that survives a cleared
 *  cache or a different device. */
const PROGRESS_SAVE_MS = 20_000;

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
  const [state, setRawState] = useState<TimedState | null>(null);
  // Every state change is stamped with when it happened, so a localStorage copy
  // can be compared against a server-side in-progress row recovered on another
  // device and the newer one can be trusted.
  const setState = useCallback((updater: TimedState | null | ((s: TimedState | null) => TimedState | null)) => {
    setRawState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next ? { ...next, updatedAt: Date.now() } : next;
    });
  }, []);
  const [resumable, setResumable] = useState<TimedState | null>(null);
  const [dbResumable, setDbResumable] = useState<AttemptRecord | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const hasStatements = (statements?.filter(Boolean).length ?? 0) > 0;

  useEffect(() => setResumable(loadSaved(exam.id)), [exam.id]);

  // A second, async check alongside the synchronous localStorage one above — this
  // is what makes a sitting recoverable from a cleared cache or a different
  // device. It's fine for this to resolve after paint; the local check already
  // covers the common (same-device) case immediately.
  useEffect(() => {
    listInProgressAttemptsForExam(exam.id)
      .then((rows) => setDbResumable(rows[0] ?? null))
      .catch(() => setDbResumable(null));
  }, [exam.id]);

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

  // Independent of the localStorage mirror above: that one is synchronous and
  // stays the fast path. This is the slower, network-backed copy that survives a
  // cleared cache or a different device — throttled, because it's a request, not
  // a local write.
  const stateRef = useRef(state);
  stateRef.current = state;
  const attemptIdRef = useRef(attemptId);
  attemptIdRef.current = attemptId;

  const flushProgress = useCallback(() => {
    const s = stateRef.current;
    const id = attemptIdRef.current;
    if (!s || s.submitted || !id) return;
    saveTimedProgress({ attemptId: id, answers: answerString(s), timings: timings(s) }).catch(() => {
      // The DB write failed — localStorage remains the safety net, and the
      // student is never blocked from continuing.
    });
  }, []);

  useEffect(() => {
    if (!state || state.submitted) return;
    const id = setInterval(flushProgress, PROGRESS_SAVE_MS);
    return () => clearInterval(id);
  }, [state?.submitted, state !== null, flushProgress]);

  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden") flushProgress();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flushProgress]);

  const end = useCallback(() => {
    flushProgress();
    setState((s) => (s && !s.submitted ? finish(s, Date.now()) : s));
  }, [flushProgress]);

  // Out of time ends the paper, exactly as it would in the hall.
  useEffect(() => {
    if (state && !state.submitted && isExpired(state, now)) end();
  }, [state, now, end]);

  const apply = (fn: (s: TimedState, t: number) => TimedState) =>
    setState((s) => (s && !s.submitted ? fn(s, Date.now()) : s));

  const togglePause = useCallback(() => {
    setState((s) => {
      if (!s || s.submitted) return s;
      const willPause = s.pausedAt === null;
      const next = willPause ? pause(s, Date.now()) : resume(s, Date.now());
      if (willPause) flushProgress();
      return next;
    });
  }, [flushProgress]);

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
    // Reconciling two possible saved copies: prefer whichever changed more
    // recently. localStorage carries its own updatedAt; the DB row's created_at
    // is coarser (it's only ever inserted once, then patched in place) but is the
    // best signal available for a row this browser has no local record of.
    const localTime = resumable?.updatedAt ?? resumable?.startedAt ?? 0;
    const dbTime = dbResumable ? new Date(dbResumable.created_at).getTime() : 0;
    const preferDb = dbResumable !== null && (resumable === null || dbTime > localTime);

    const resumeFromDb = () => {
      if (!dbResumable) return;
      const count = dbResumable.answers.length;
      const answers = dbResumable.answers.split("").map((c) => (c === "-" ? null : (c as Letter)));
      const timingsByQ = new Map((dbResumable.timings ?? []).map((t) => [t.q, t]));
      const now = Date.now();
      setNow(now);
      setAttemptId(dbResumable.id);
      setState({
        startedAt: now,
        durationMs: minutes * 60_000,
        current: 0,
        answers,
        flagged: Array(count).fill(false),
        spentMs: Array.from({ length: count }, (_, i) => (timingsByQ.get(i + 1)?.seconds ?? 0) * 1000),
        visits: Array.from({ length: count }, (_, i) => (timingsByQ.get(i + 1)?.visits ?? 0)),
        enteredAt: now,
        submitted: false,
        pausedAt: null,
        updatedAt: now,
      });
    };

    const discardDb = () => {
      if (dbResumable) discardInProgressAttempt(dbResumable.id).catch(() => {});
      setDbResumable(null);
    };

    return (
      <div className="space-y-6">
        <p className="max-w-prose text-muted">
          The clock runs for the whole paper and the app records how long you spend on
          each problem — which is the only way to see time lost on one question at the
          cost of an easier one later.
        </p>

        {resumable && !preferDb && (
          <div className="rounded-md border border-blank/50 bg-blank/10 px-4 py-3 text-sm">
            <p>An unfinished sitting of this paper is saved on this device.</p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setAttemptId(dbResumable?.id ?? null);
                  setState(resumable);
                }}
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

        {preferDb && dbResumable && (
          <div className="rounded-md border border-blank/50 bg-blank/10 px-4 py-3 text-sm">
            <p>An unfinished sitting of this paper was saved to your account.</p>
            <p className="mt-1 text-muted">
              This will restore your answers, but not exactly where you left off on the
              clock.
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={resumeFromDb}
                className="rounded-md bg-accent px-3 py-1.5 font-medium text-white"
              >
                Resume it
              </button>
              <button type="button" onClick={discardDb} className="rounded-md border border-border px-3 py-1.5">
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
            const takenOn = new Date(t).toISOString().slice(0, 10);
            setNow(t);
            setState(startSession(exam.problems.length, minutes, t));
            // Fire-and-forget: the clock and localStorage mirror are already
            // running and never wait on this. A failure here just means the
            // session has no DB-backed copy until the next successful flush.
            startTimedAttempt({ examId: exam.id, takenOn })
              .then(({ attemptId: id }) => setAttemptId(id))
              .catch(() => {});
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
          attemptId={attemptId}
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
                {statements[q]!.hasDiagram && !statements[q]!.diagramRendered && (
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
