"use client";

import { useMemo, useState } from "react";
import type { ExamFile } from "@pipeline/types";
import { parseAnswers, scoreAttempt, type ScoredAttempt } from "@pipeline/score";
import { ReviewStep } from "./ReviewStep";

const LETTERS = ["A", "B", "C", "D", "E"] as const;

const today = () => new Date().toISOString().slice(0, 10);

export function LogForm({
  exam,
  examLabel,
  previousDates,
}: {
  exam: ExamFile;
  examLabel: string;
  /** Dates this paper has already been sat, so a retake can be flagged. */
  previousDates: string[];
}) {
  const [answers, setAnswers] = useState<(string | null)[]>(() => Array(25).fill(null));
  const [takenOn, setTakenOn] = useState(today);
  const [duration, setDuration] = useState("");
  const [scored, setScored] = useState<ScoredAttempt | null>(null);
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

        {/* Column-major so the numbers run 1-13 down the left and 14-25 down the
            right, the way they sit on a paper answer sheet. */}
        <div className="grid gap-1 sm:grid-flow-col sm:grid-cols-2 sm:[grid-template-rows:repeat(13,minmax(0,1fr))]">
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

  return (
    <ReviewStep
      exam={exam}
      examLabel={examLabel}
      scored={scored}
      takenOn={takenOn}
      durationMin={duration ? Number(duration) : null}
      previousDates={previousDates}
      onBack={() => setScored(null)}
      backLabel="Back to answers"
    />
  );
}
