"use client";

import { useState, useTransition } from "react";
import { markResolve } from "./actions";

export interface QueueItemProps {
  examId: string;
  examLabel: string;
  qNumber: number;
  area: string | null;
  descriptor: string | null;
  sourceUrl: string;
  dueOn: string;
  overdueDays: number;
  stage: number;
  attempts: number;
}

export function QueueItem(props: QueueItemProps) {
  // The answer stays hidden until asked for: on a multiple-choice paper, seeing "C"
  // is enough to end the exercise without any of the method coming back.
  const [revealed, setRevealed] = useState(false);
  const [pending, startTransition] = useTransition();

  function mark(result: "solved" | "failed") {
    startTransition(async () => {
      await markResolve({ examId: props.examId, qNumber: props.qNumber, result });
    });
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">
          {props.examLabel} · Q{props.qNumber}
        </span>
        {props.area && <span className="text-sm text-muted">{props.area.replace(/-/g, " ")}</span>}
        {props.stage === 1 && (
          <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">confirmation</span>
        )}
        {props.overdueDays > 0 && (
          <span className="text-xs text-blank">
            {props.overdueDays} day{props.overdueDays === 1 ? "" : "s"} overdue
          </span>
        )}
      </div>

      {props.descriptor && <p className="mt-1 text-sm text-muted">{props.descriptor}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {props.sourceUrl ? (
          <a href={props.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline">
            Open the problem
          </a>
        ) : (
          <span className="text-muted">No link for this paper — work from your copy.</span>
        )}
        {props.attempts > 0 && (
          <span className="text-muted">
            {props.attempts} previous attempt{props.attempts === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-muted">
        Solve it on paper from scratch, without looking at your notes or the solution.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => mark("solved")}
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          Solved it unaided
        </button>
        <button
          type="button"
          onClick={() => mark("failed")}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          Still stuck
        </button>

        {revealed ? (
          <span className="text-sm text-muted">
            Needing the solution counts as still stuck — that is the point of asking.
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="text-sm text-muted underline hover:text-text"
          >
            I need the solution
          </button>
        )}
      </div>
    </li>
  );
}
