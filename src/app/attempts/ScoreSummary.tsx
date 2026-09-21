import type { ScoredAttempt } from "@pipeline/score";

/** The score card shown right after scoring, and again on every later visit to the same attempt. */
export function ScoreSummary({ examLabel, scored }: { examLabel: string; scored: ScoredAttempt }) {
  return (
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
  );
}
