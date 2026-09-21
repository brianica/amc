"use client";

import { useId, useState } from "react";
import type { Tier } from "@pipeline/types";
import type { Status } from "@pipeline/score";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  TIERS,
  TIER_LABEL,
  type Cell,
  type MixPoint,
  type TrendPoint,
} from "@/lib/analytics";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const areaLabel = (a: string) => a.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Every chart ships a table twin, so no value is reachable only through colour. */
function TableView({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted hover:text-text">{caption}</summary>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </details>
  );
}

function Tooltip({ text, x, y }: { text: string; x: number; y: number }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-sm"
      style={{ left: x, top: y - 8 }}
    >
      {text}
    </div>
  );
}

/* ---------------------------------------------------------------- heatmap -- */

const SEQ_STEPS = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6"];

/**
 * Six bins of accuracy onto the sequential ramp. The paired "-ink" variable comes
 * back with the fill: the ramp runs light-to-dark in light mode and dark-to-light
 * in dark mode, so which text colour clears contrast is a property of the theme,
 * not of the bin index.
 */
function seqStep(accuracy: number): { fill: string; ink: string } {
  const i = accuracy < 0.4 ? 0 : accuracy < 0.55 ? 1 : accuracy < 0.7 ? 2 : accuracy < 0.85 ? 3 : accuracy < 0.95 ? 4 : 5;
  const name = SEQ_STEPS[i]!;
  return { fill: `var(${name})`, ink: `var(${name}-ink)` };
}

export function StrengthGrid({
  areas,
  cells,
  cellLabel = "pct",
}: {
  areas: string[];
  cells: Cell[];
  /** "pct" (default, used across many papers) or "count" — correct/seen reads better
   *  for one paper, where the denominator is small enough that a percentage rounds
   *  away the exact number that actually happened. */
  cellLabel?: "pct" | "count";
}) {
  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null);
  const at = (area: string, tier: Tier) => cells.find((c) => c.area === area && c.tier === tier);

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[2px] text-sm">
          <thead>
            <tr>
              <th className="w-40 text-left font-normal text-muted">Topic</th>
              {TIERS.map((t) => (
                <th key={t} className="px-2 text-center font-normal text-muted">
                  {TIER_LABEL[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area}>
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {areaLabel(area)}
                </th>
                {TIERS.map((tier) => {
                  const cell = at(area, tier);
                  if (!cell || cell.seen === 0 || cell.accuracy === null) {
                    return (
                      <td
                        key={tier}
                        className="h-11 rounded text-center text-xs text-muted"
                        style={{ background: "var(--seq-0)" }}
                      >
                        –
                      </td>
                    );
                  }
                  const { fill, ink } = seqStep(cell.accuracy);
                  return (
                    <td
                      key={tier}
                      tabIndex={0}
                      className="h-11 cursor-default rounded text-center text-sm font-medium tabular-nums outline-offset-2"
                      style={{
                        background: fill,
                        // A label inside a coloured fill is the one place text does
                        // not wear a text token; the ramp supplies the matching ink.
                        color: ink,
                      }}
                      onMouseMove={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const p = e.currentTarget.closest(".relative")!.getBoundingClientRect();
                        setHover({ cell, x: r.left - p.left + r.width / 2, y: r.top - p.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const p = e.currentTarget.closest(".relative")!.getBoundingClientRect();
                        setHover({ cell, x: r.left - p.left + r.width / 2, y: r.top - p.top });
                      }}
                      onBlur={() => setHover(null)}
                    >
                      {cellLabel === "count" ? `${cell.correct}/${cell.seen}` : pct(cell.accuracy)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hover && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          text={`${areaLabel(hover.cell.area)}, ${TIER_LABEL[hover.cell.tier]} — ${hover.cell.correct} of ${hover.cell.seen} correct`}
        />
      )}

      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span>Lower accuracy</span>
        <div className="flex gap-[2px]">
          {SEQ_STEPS.map((v) => (
            <span key={v} className="h-3 w-6 rounded-sm" style={{ background: `var(${v})` }} />
          ))}
        </div>
        <span>Higher</span>
      </div>

      <TableView caption="Show as table">
        <table className="w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-normal">Topic</th>
              <th className="py-1 font-normal">Tier</th>
              <th className="py-1 font-normal">Correct</th>
              <th className="py-1 font-normal">Seen</th>
              <th className="py-1 font-normal">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={`${c.area}-${c.tier}`} className="border-t border-border">
                <td className="py-1">{areaLabel(c.area)}</td>
                <td className="py-1">{TIER_LABEL[c.tier]}</td>
                <td className="py-1 tabular-nums">{c.correct}</td>
                <td className="py-1 tabular-nums">{c.seen}</td>
                <td className="py-1 tabular-nums">{c.accuracy === null ? "—" : pct(c.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </div>
  );
}

/* ------------------------------------------------------------- mistake mix -- */

const MIX_COLORS: Record<string, string> = {
  careless: "var(--viz-1)",
  concept: "var(--viz-2)",
  no_path: "var(--viz-3)",
  triage: "var(--viz-4)",
  unclassified: "var(--viz-none)",
};

export function MistakeMix({ points }: { points: MixPoint[] }) {
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const max = Math.max(1, ...points.map((p) => p.total));
  const H = 160;

  return (
    <div className="relative">
      <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: H + 56 }}>
        {points.map((p) => {
          const segments = [
            ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c], n: p.counts[c] })),
            { key: "unclassified", label: "Not classified", n: p.unclassified },
          ].filter((s) => s.n > 0);

          return (
            <div key={p.attemptId} className="flex shrink-0 flex-col items-center" style={{ width: 56 }}>
              <span className="mb-1 text-xs tabular-nums text-muted">{p.total}</span>
              <div className="flex w-[24px] flex-col justify-end" style={{ height: H }}>
                {segments.map((s, i) => (
                  <div
                    key={s.key}
                    className="w-full"
                    style={{
                      height: (s.n / max) * H,
                      background: MIX_COLORS[s.key],
                      // 2px surface gap, not a border, separates touching segments.
                      marginTop: i === 0 ? 0 : 2,
                      borderRadius: i === 0 ? "4px 4px 0 0" : 0,
                    }}
                    onMouseMove={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const par = e.currentTarget.closest(".relative")!.getBoundingClientRect();
                      setHover({
                        text: `${s.label}: ${s.n}`,
                        x: r.left - par.left + r.width / 2,
                        y: r.top - par.top,
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
              </div>
              <span className="mt-2 w-full truncate text-center text-xs text-muted" title={p.label}>
                {p.takenOn.slice(5)}
              </span>
            </div>
          );
        })}
      </div>

      {hover && <Tooltip text={hover.text} x={hover.x} y={hover.y} />}

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {[...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c] })), { key: "unclassified", label: "Not classified" }].map(
          (s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLORS[s.key] }} />
              {s.label}
            </li>
          ),
        )}
      </ul>

      <TableView caption="Show as table">
        <table className="w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-normal">Paper</th>
              {CATEGORIES.map((c) => (
                <th key={c} className="py-1 font-normal">{CATEGORY_LABEL[c]}</th>
              ))}
              <th className="py-1 font-normal">Not classified</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.attemptId} className="border-t border-border">
                <td className="py-1">{p.label} · {p.takenOn}</td>
                {CATEGORIES.map((c) => (
                  <td key={c} className="py-1 tabular-nums">{p.counts[c]}</td>
                ))}
                <td className="py-1 tabular-nums">{p.unclassified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </div>
  );
}

/* ------------------------------------------------------------- score trend -- */

export function ScoreTrend({ points, showAimeBand }: { points: TrendPoint[]; showAimeBand: boolean }) {
  const [hover, setHover] = useState<{ p: TrendPoint; x: number; y: number } | null>(null);
  const clipId = useId();
  const W = 640;
  const H = 200;
  const PAD = { top: 16, right: 84, bottom: 28, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - v) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.pct)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score as a percentage of the paper's maximum, over time">
        <clipPath id={clipId}>
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
        </clipPath>

        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            {/* Solid hairline gridlines, one step off the surface. */}
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular-nums">
              {Math.round(t * 100)}
            </text>
          </g>
        ))}

        {showAimeBand && (
          <g clipPath={`url(#${clipId})`}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(0.69)}
              y2={y(0.69)}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
            <text x={PAD.left + 4} y={y(0.69) - 5} fontSize={10} fill="var(--muted)">
              typical AIME cutoff
            </text>
          </g>
        )}

        <path d={path} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <g key={p.attemptId}>
            {/* 2px ring in the surface colour keeps the marker legible on the line. */}
            <circle cx={x(i)} cy={y(p.pct)} r={5} fill="var(--viz-1)" stroke="var(--surface)" strokeWidth={2} />
            <circle
              cx={x(i)}
              cy={y(p.pct)}
              r={14}
              fill="transparent"
              className="cursor-default"
              onMouseEnter={(e) => {
                const par = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                const r = e.currentTarget.getBoundingClientRect();
                setHover({ p, x: r.left - par.left + r.width / 2, y: r.top - par.top + r.height / 2 - 6 });
              }}
              onMouseLeave={() => setHover(null)}
            />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {p.takenOn.slice(5)}
            </text>
          </g>
        ))}

        {/* Only the endpoint is direct-labelled; the axis and tooltip carry the rest. */}
        {last && (
          <text x={x(points.length - 1) + 12} y={y(last.pct) + 4} fontSize={12} fill="var(--text)">
            {last.score}/{last.maxScore}
          </text>
        )}
      </svg>

      {hover && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          text={`${hover.p.label} · ${hover.p.takenOn} — ${hover.p.score}/${hover.p.maxScore} (${pct(hover.p.pct)})`}
        />
      )}

      <TableView caption="Show as table">
        <table className="w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-normal">Paper</th>
              <th className="py-1 font-normal">Taken</th>
              <th className="py-1 font-normal">Score</th>
              <th className="py-1 font-normal">Percent</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.attemptId} className="border-t border-border">
                <td className="py-1">{p.label}</td>
                <td className="py-1">{p.takenOn}</td>
                <td className="py-1 tabular-nums">{p.score}/{p.maxScore}</td>
                <td className="py-1 tabular-nums">{pct(p.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </div>
  );
}

/* -------------------------------------------------------------- time spent -- */

export interface TimeSpentPoint {
  q: number;
  seconds: number;
  status: Status;
}

const STATUS_COLOR: Record<Status, string> = {
  correct: "var(--correct)",
  incorrect: "var(--wrong)",
  blank: "var(--blank)",
};
const STATUS_LABEL: Record<Status, string> = { correct: "Correct", incorrect: "Wrong", blank: "Blank" };

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** One bar per problem, coloured by outcome — the pacing failure a clock actually measures. */
export function TimeSpent({ points }: { points: TimeSpentPoint[] }) {
  const [hover, setHover] = useState<{ p: TimeSpentPoint; x: number; y: number } | null>(null);
  const max = Math.max(1, ...points.map((p) => p.seconds));
  const H = 140;

  return (
    <div className="relative">
      <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height: H + 40 }}>
        {points.map((p) => (
          <div key={p.q} className="flex shrink-0 flex-col items-center" style={{ width: 20 }}>
            <div
              className="w-full cursor-default rounded-t-[4px]"
              style={{
                height: Math.max(2, (p.seconds / max) * H),
                background: STATUS_COLOR[p.status],
              }}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const par = e.currentTarget.closest(".relative")!.getBoundingClientRect();
                setHover({ p, x: r.left - par.left + r.width / 2, y: r.top - par.top });
              }}
              onMouseLeave={() => setHover(null)}
            />
            <span className="mt-1 text-[10px] text-muted">{p.q}</span>
          </div>
        ))}
      </div>

      {hover && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          text={`Q${hover.p.q} — ${formatSeconds(hover.p.seconds)}, ${STATUS_LABEL[hover.p.status].toLowerCase()}`}
        />
      )}

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(["correct", "incorrect", "blank"] as Status[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>

      <TableView caption="Show as table">
        <table className="w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-normal">Problem</th>
              <th className="py-1 font-normal">Time</th>
              <th className="py-1 font-normal">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.q} className="border-t border-border">
                <td className="py-1 tabular-nums">Q{p.q}</td>
                <td className="py-1 tabular-nums">{formatSeconds(p.seconds)}</td>
                <td className="py-1">{STATUS_LABEL[p.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </div>
  );
}
