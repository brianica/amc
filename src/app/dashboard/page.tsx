import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { allExams, examLabel, findExam } from "@/lib/exams";
import { getStore } from "@/lib/store";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  TIERS,
  TIER_LABEL,
  headline,
  mistakeMix,
  scoreTrend,
  strengthGrid,
  subtopicBreakdown,
} from "@/lib/analytics";
import { MistakeMix, ScoreTrend, StrengthGrid } from "./charts";

// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const store = getStore();
  const [attempts, logs] = await Promise.all([store.listAttempts(user.id), store.listLogs(user.id)]);
  const lookup = (id: string) => findExam(id);

  if (attempts.length === 0) {
    return (
      <section className="max-w-prose">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-3 text-muted">
          Nothing logged yet.{" "}
          <Link href="/" className="text-accent underline">
            Log a paper
          </Link>{" "}
          to get started. The topic picture needs three or four papers before it says
          much.
        </p>
      </section>
    );
  }

  const h = headline(attempts, logs, lookup);
  const grid = strengthGrid(attempts, lookup);
  const techniques = subtopicBreakdown(attempts, lookup);
  const trend = scoreTrend(attempts, lookup, examLabel);
  const mix = mistakeMix(attempts, logs, lookup, examLabel);
  const aimeRelevant = attempts.every((a) => {
    const e = lookup(a.exam_id);
    return e?.competition === "AMC10" || e?.competition === "AMC12";
  });
  const thin = attempts.length < 3;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          {h.papers} paper{h.papers === 1 ? "" : "s"} logged
          {thin && " — patterns get meaningful from about three."}
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm text-muted">Points left on the table, per paper</p>
        {/* Hero figure: proportional figures, same sans as everything else. */}
        <p className="mt-1 text-5xl font-semibold leading-none">
          {h.avgFixableLost === null ? "—" : Math.round(h.avgFixableLost * 10) / 10}
        </p>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Points given up to careless slips and running out of time — the ones you can
          take back without learning anything new.
          {h.classifiedShare < 1 && (
            <>
              {" "}
              Based on the {Math.round(h.classifiedShare * 100)}% of missed questions you
              have classified so far.
            </>
          )}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted">Latest score</dt>
            <dd className="mt-0.5 text-xl font-semibold">
              {h.latestScore ?? "—"}
              {h.latestMax && <span className="text-sm font-normal text-muted"> / {h.latestMax}</span>}
            </dd>
          </div>
          {(["T1", "T2", "T3"] as const).map((tier) => (
            <div key={tier}>
              <dt className="text-sm text-muted">Lost in {TIER_LABEL[tier]}</dt>
              <dd className="mt-0.5 text-xl font-semibold">{h.lostByTier[tier]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Card
        title="Strengths and weaknesses"
        hint="Accuracy across every question you have seen, by topic and by where it sat on the paper. Q11–18 is where AIME qualification is decided."
      >
        {grid.areas.length === 0 ? (
          <p className="text-sm text-muted">
            No tagged topics yet — the exam database needs to be populated before this
            can be filled in.
          </p>
        ) : (
          <StrengthGrid areas={grid.areas} cells={grid.cells} />
        )}
      </Card>

      <Card
        title="What to practise next"
        hint="Accuracy by technique, weakest first. This is the level that names a chapter to open, rather than a subject to worry about."
      >
        {techniques.length === 0 ? (
          <p className="text-sm text-muted">
            Needs tagged exams and a couple of papers before this says anything useful.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {techniques.slice(0, 8).map((t) => (
              <li key={`${t.area}-${t.subtopic}`} className="flex items-baseline justify-between gap-4 border-b border-border py-1.5">
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
        )}
      </Card>

      <Card title="Score over time" hint="Plotted as a percentage of each paper's maximum, so contests with different totals share one axis.">
        <ScoreTrend points={trend} showAimeBand={aimeRelevant} />
      </Card>

      <Card title="Kinds of mistake" hint="Whether carelessness is improving and whether concept gaps are closing.">
        {mix.every((m) => m.total === 0) ? (
          <p className="text-sm text-muted">No missed questions logged.</p>
        ) : (
          <MistakeMix points={mix} />
        )}
      </Card>

      <Card title="Points lost by cause">
        <ul className="space-y-1 text-sm">
          {CATEGORIES.map((c) => (
            <li key={c} className="flex justify-between border-b border-border py-1.5">
              <span>{CATEGORY_LABEL[c]}</span>
              <span className="tabular-nums text-muted">{h.lostByCause[c]}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
