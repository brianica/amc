"use client";

import { useMemo, useState, useTransition } from "react";
import type { ExamFile } from "@pipeline/types";
import { parseAnswers, scoreAttempt, type ScoredAttempt } from "@pipeline/score";
import type { ErrorCategory, TimeBucket } from "@/lib/store";
import { saveAttempt, type TriageInput } from "./actions";

const LETTERS = ["A", "B", "C", "D", "E"] as const;

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
  { id: "1to3", label: "1–3" },
  { id: "3to6", label: "3–6" },
  { id: "over6", label: "6+" },
];

const today = () => new Date().toISOString().slice(0, 10);

export function LogForm({ exam, examLabel }: { exam: ExamFile; examLabel: string }) {
  const [answers, setAnswers] = useState<(string | null)[]>(() => Array(25).fill(null));
  const [takenOn, setTakenOn] = useState(today);
  const [duration, setDuration] = useState("");
  const [scored, setScored] = useState<ScoredAttempt | null>(null);
  const [triage, setTriage] = useState<Record<number, TriageInput>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const answerString = useMemo(() => answers.map((a) => a ?? "-").join(""), [answers]);
  const entered = answers.filter((a) => a !== null).length;

  function setAnswer(i: number, letter: string | null) {
    setAnswers((prev) => prev.map((a, j) => (j === i ? (a === letter ? null : letter) : a)));
  }

  function pasteString(raw: string) {
    try {
      setAnswers(parseAnswers(raw));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that answer string");
    }
  }

  function score() {
    setScored(scoreAttempt(exam, parseAnswers(answerString)));
  }

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
          answers: answerString,
          durationMin: duration ? Number(duration) : null,
          triage: Object.values(triage),
        });
      } catch (e) {
        // A redirect throws by design; only report real failures.
        if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) setError(e.message);
      }
    });
  }

  if (!scored) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block text-muted">Date taken</span>
            <input
              type="date"
              value={takenOn}
              onChange={(e) => setTakenOn(e.target.value)}
              className="mt-1 rounded-md border border-border bg-surface px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block text-muted">Minutes (optional)</span>
            <input
              type="number"
              min={1}
              max={300}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="75"
              className="mt-1 w-24 rounded-md border border-border bg-surface px-3 py-1.5"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="block text-muted">Or paste 25 answers (“-” for blank)</span>
            <input
              onChange={(e) => e.target.value.length >= 25 && pasteString(e.target.value)}
              placeholder="DBEAC-DB-EAACDBE-CCBAD--"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 font-mono"
            />
          </label>
        </div>

        {error && <p className="text-sm text-wrong">{error}</p>}

        <div className="grid gap-1 sm:grid-cols-2">
          {answers.map((answer, i) => (
            <div key={i} className="flex items-center gap-2 rounded px-1 py-0.5">
              <span className="w-6 text-right text-sm tabular-nums text-muted">{i + 1}</span>
              {LETTERS.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  aria-pressed={answer === letter}
                  onClick={() => setAnswer(i, letter)}
                  className={`h-8 w-8 rounded border text-sm ${
                    answer === letter
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-surface hover:border-accent"
                  }`}
                >
                  {letter}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAnswer(i, null)}
                className="h-8 px-2 text-xs text-muted hover:text-text"
              >
                blank
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={score}
            className="rounded-md bg-accent px-4 py-2 font-medium text-white"
          >
            Score it
          </button>
          <span className="text-sm text-muted">
            {entered} answered, {25 - entered} blank
          </span>
        </div>
      </div>
    );
  }

  const missed = scored.results.filter((r) => r.status !== "correct");

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
        <h2 className="text-lg font-semibold">What happened on each one?</h2>
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
                {r.area && <span className="text-sm text-muted">· {r.area.replace(/-/g, " ")}</span>}
              </div>

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
                {TIME_BUCKETS.map((b) => (
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
                ))}
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
        <button
          type="button"
          onClick={() => setScored(null)}
          className="rounded-md border border-border px-4 py-2"
        >
          Back to answers
        </button>
      </div>
    </div>
  );
}
