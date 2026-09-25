"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Competition, ExamFile } from "@pipeline/types";
import { examLabel, isSample } from "@/lib/exam-label";

const STORAGE_KEY = "amc:competition-filter";

const COMPETITIONS: { id: Competition; label: string; disabled?: boolean }[] = [
  { id: "AMC8", label: "AMC 8" },
  { id: "AMC10", label: "AMC 10" },
  // No AMC 12 papers in data/exams/ yet — listed so the control communicates what
  // exists rather than silently omitting a whole contest.
  { id: "AMC12", label: "AMC 12", disabled: true },
];

function loadSaved(): Competition | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "AMC8" || raw === "AMC10" || raw === "AMC12" ? raw : null;
  } catch {
    return null;
  }
}

export function ExamList({
  exams,
  sittings,
  lastTaken,
}: {
  exams: ExamFile[];
  sittings: Map<string, number>;
  lastTaken: Map<string, string>;
}) {
  // Defaults to whichever contest the exam database actually has, not a fixed
  // guess — the first render (before localStorage is read) should still show
  // something real rather than an empty list.
  const [competition, setCompetition] = useState<Competition>("AMC10");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCompetition(loadSaved() ?? "AMC10");
    setHydrated(true);
  }, []);

  function choose(next: Competition) {
    setCompetition(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or a full quota: the choice still applies this
      // session, it just won't be remembered next time.
    }
  }

  // Sample exams (SAMPLE_EXAMS=1) aren't tied to a real competition filter —
  // always show them alongside whatever is picked, since they're the only
  // thing to log when the database is otherwise empty.
  const filtered = exams.filter((e) => isSample(e) || e.competition === competition);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Log a paper</h1>
        <label className="text-sm">
          <span className="sr-only">Contest</span>
          <select
            value={competition}
            onChange={(e) => choose(e.target.value as Competition)}
            className="rounded-md border border-border bg-surface px-3 py-1.5"
          >
            {COMPETITIONS.map((c) => (
              <option key={c.id} value={c.id} disabled={c.disabled}>
                {c.label}
                {c.disabled ? " (coming soon)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!hydrated ? null : filtered.length === 0 ? (
        <p className="mt-3 max-w-prose text-muted">
          No {COMPETITIONS.find((c) => c.id === competition)?.label} exams in the database
          yet.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {filtered.map((exam) => {
            const taken = (sittings.get(exam.id) ?? 0) > 0;
            return (
              <li key={exam.id} className="pb-1">
                <Link
                  href={`/log/${exam.id}`}
                  className={`block rounded-md border px-4 py-3 ${
                    taken
                      ? "border-border bg-surface/50 text-muted hover:border-accent"
                      : "border-border bg-surface hover:border-accent"
                  }`}
                >
                  <span className={taken ? "font-medium text-muted" : "font-medium"}>
                    {examLabel(exam)}
                  </span>
                  {isSample(exam) && (
                    <span className="ml-2 text-xs text-blank">invented answer key</span>
                  )}
                  {taken && (
                    <span className="ml-2 text-xs text-muted">
                      taken {lastTaken.get(exam.id)}
                      {(sittings.get(exam.id) ?? 0) > 1 && ` · sat ${sittings.get(exam.id)}×`}
                    </span>
                  )}
                </Link>
                <div className="mt-1 flex gap-3 px-4 text-xs text-muted">
                  <Link href={`/log/${exam.id}`} className="hover:text-text">
                    Log answers from paper
                  </Link>
                  <Link href={`/log/${exam.id}/timed`} className="hover:text-text">
                    Sit it on the clock
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
