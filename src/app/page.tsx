import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { allExams, examLabel, findExam, isSample } from "@/lib/exams";
import { getStore } from "@/lib/store";
import { IncludeToggle } from "./IncludeToggle";
import { attemptOrdinals } from "@/lib/analytics";
import { summarise, today } from "@/lib/resolve";
import { toCard } from "@/lib/resolve-cards";


// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  const exams = allExams();

  if (!user) {
    return (
      <section className="max-w-prose">
        <h1 className="text-2xl font-semibold">Log a past AMC paper</h1>
        <p className="mt-3 text-muted">
          Record which questions you got wrong and why. After a few papers you get a
          picture of which topics are costing you points — the thing a raw score
          cannot tell you.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-accent px-4 py-2 font-medium text-white"
        >
          Sign in to start
        </Link>
      </section>
    );
  }

  const store = getStore();
  const [attempts, cardRows] = await Promise.all([
    store.listAttempts(user.id),
    store.listResolveCards(user.id),
  ]);
  const queue = summarise(cardRows.map(toCard), today());
  const ordinals = attemptOrdinals(attempts);
  const sittings = new Map<string, number>();
  for (const a of attempts) sittings.set(a.exam_id, (sittings.get(a.exam_id) ?? 0) + 1);

  return (
    <div className="space-y-10">
      {user.isDev && (
        <p className="rounded-md border border-blank/40 bg-blank/10 px-3 py-2 text-sm">
          Development mode — no Supabase configured, so you are signed in as a local
          test account and data is stored on disk.
        </p>
      )}

      {queue.due > 0 && (
        <Link
          href="/resolve"
          className="block rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 hover:border-accent"
        >
          <span className="font-medium">
            {queue.due} problem{queue.due === 1 ? "" : "s"} ready to re-solve
          </span>
          <span className="ml-2 text-sm text-muted">
            Three days on, from a blank page — that is where it sticks.
          </span>
        </Link>
      )}

      <section>
        <h1 className="text-2xl font-semibold">Log a paper</h1>
        {exams.length === 0 ? (
          <p className="mt-3 max-w-prose text-muted">
            No exams in the database yet. Run the pipeline (<code>npm run fetch</code>,{" "}
            <code>npm run extract</code>) to populate <code>data/exams/</code>, or set{" "}
            <code>SAMPLE_EXAMS=1</code> to try the app with a sample paper.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {exams.map((exam) => (
              <li key={exam.id} className="pb-1">
                <Link
                  href={`/log/${exam.id}`}
                  className="block rounded-md border border-border bg-surface px-4 py-3 hover:border-accent"
                >
                  <span className="font-medium">{examLabel(exam)}</span>
                  {isSample(exam) && (
                    <span className="ml-2 text-xs text-blank">invented answer key</span>
                  )}
                  {(sittings.get(exam.id) ?? 0) > 0 && (
                    <span className="ml-2 text-xs text-muted">sat {sittings.get(exam.id)}×</span>
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
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recent attempts</h2>
        {attempts.length === 0 ? (
          <p className="mt-2 text-muted">Nothing logged yet.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-2 font-normal">Exam</th>
                <th className="py-2 font-normal">Taken</th>
                <th className="py-2 text-right font-normal">Score</th>
                <th className="py-2 pl-3 text-right font-normal">Counted</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => {
                const exam = findExam(a.exam_id);
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2">
                      {exam ? examLabel(exam) : a.exam_id}
                      {(ordinals.get(a.id)?.total ?? 1) > 1 && (
                        <span className="ml-2 text-xs text-muted">
                          sitting {ordinals.get(a.id)!.ordinal} of {ordinals.get(a.id)!.total}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-muted">{a.taken_on}</td>
                    <td className="py-2 text-right tabular-nums">
                      {a.score}
                      {!a.include_in_stats && (
                        <span className="ml-2 text-xs font-normal text-muted">not counted</span>
                      )}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <IncludeToggle attemptId={a.id} included={a.include_in_stats} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
