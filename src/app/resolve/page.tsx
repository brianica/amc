import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { examLabel, findExam } from "@/lib/exams";
import { getStore } from "@/lib/store";
import { isDue, isMastered, sortForQueue, summarise, today } from "@/lib/resolve";
import { toCard } from "@/lib/resolve-cards";
import { QueueItem } from "./QueueItem";

// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function renderCard(card: ReturnType<typeof toCard>, now: string, early: boolean) {
  const exam = findExam(card.examId);
  const problem = exam?.problems[card.qNumber - 1];
  return (
    <QueueItem
      key={`${card.examId}-${card.qNumber}`}
      examId={card.examId}
      examLabel={exam ? examLabel(exam) : card.examId}
      qNumber={card.qNumber}
      area={problem?.area ?? null}
      subtopics={problem?.subtopics ?? []}
      descriptor={problem?.descriptor ?? null}
      sourceUrl={problem?.sourceUrl ?? ""}
      dueOn={card.dueOn!}
      overdueDays={early ? 0 : Math.max(0, daysBetween(card.dueOn!, now))}
      early={early}
      daysEarly={early ? Math.max(0, daysBetween(now, card.dueOn!)) : 0}
      stage={card.stage}
      attempts={card.attempts}
    />
  );
}

export default async function ResolvePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const now = today();
  const cards = (await getStore().listResolveCards(user.id)).map(toCard);
  const summary = summarise(cards, now);
  const due = sortForQueue(cards.filter((c) => isDue(c, now)));
  const scheduled = sortForQueue(cards.filter((c) => !isDue(c, now) && !isMastered(c)));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Re-solve queue</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Every problem you miss comes back three days later. Reading a solution feels
          like understanding; reproducing it from a blank page is the thing that lasts.
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="text-muted">
          Nothing queued yet. Missed questions are added automatically when you{" "}
          <Link href="/" className="text-accent underline">
            log a paper
          </Link>
          .
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-surface p-4">
            <div>
              <dt className="text-sm text-muted">Due now</dt>
              <dd className="mt-0.5 text-2xl font-semibold">{summary.due}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Scheduled</dt>
              <dd className="mt-0.5 text-2xl font-semibold">{summary.upcoming}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Mastered</dt>
              <dd className="mt-0.5 text-2xl font-semibold">{summary.mastered}</dd>
            </div>
          </dl>

          {due.length === 0 ? (
            <p className="text-muted">
              Nothing due today.
              {summary.nextDueOn && ` Next up on ${summary.nextDueOn}.`}
            </p>
          ) : (
            <ul className="space-y-3">{due.map((card) => renderCard(card, now, false))}</ul>
          )}

          {scheduled.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Scheduled</h2>
              <p className="mt-1 max-w-prose text-sm text-muted">
                Not due yet. You can take one early if you want the practice — it keeps
                its place in the queue either way.
              </p>
              <ul className="mt-3 space-y-2">
                {scheduled.map((card) => renderCard(card, now, true))}
              </ul>
            </section>
          )}

          {summary.mastered > 0 && (
            <p className="text-sm text-muted">
              {summary.mastered} problem{summary.mastered === 1 ? "" : "s"} solved cleanly
              twice, a fortnight apart, and retired from the queue.
            </p>
          )}
        </>
      )}
    </div>
  );
}
