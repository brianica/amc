import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { examLabel, findExam } from "@/lib/exams";
import { getStore } from "@/lib/store";


// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  careless: "Careless slip",
  concept: "Didn't know the method",
  no_path: "Couldn't find the path",
  triage: "Ran out of time",
};

export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const store = getStore();
  const [attempts, logs] = await Promise.all([store.listAttempts(user.id), store.listLogs(user.id)]);

  if (attempts.length === 0) {
    return (
      <section className="max-w-prose">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-3 text-muted">
          Nothing logged yet. <Link href="/" className="text-accent underline">Log a paper</Link> to
          get started — the topic picture needs three or four papers before it says much.
        </p>
      </section>
    );
  }

  // Topic counts come from the exam database, not from the log rows, so improving a
  // tag later retroactively corrects every attempt already recorded.
  const missesByArea = new Map<string, number>();
  const byCategory = new Map<string, number>();

  for (const log of logs) {
    const exam = findExam(attempts.find((a) => a.id === log.attempt_id)?.exam_id ?? "");
    const area = exam?.problems[log.q_number - 1]?.area ?? "untagged";
    missesByArea.set(area, (missesByArea.get(area) ?? 0) + 1);
    if (log.error_category) {
      byCategory.set(log.error_category, (byCategory.get(log.error_category) ?? 0) + 1);
    }
  }

  const sortedAreas = [...missesByArea.entries()].sort((a, b) => b[1] - a[1]);
  const sortedCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          {attempts.length} paper{attempts.length === 1 ? "" : "s"} logged
          {attempts.length < 3 && " — patterns get meaningful from about three."}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Scores</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-2 font-normal">Exam</th>
              <th className="py-2 font-normal">Taken</th>
              <th className="py-2 text-right font-normal">Score</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => {
              const exam = findExam(a.exam_id);
              return (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-2">{exam ? examLabel(exam) : a.exam_id}</td>
                  <td className="py-2 text-muted">{a.taken_on}</td>
                  <td className="py-2 text-right tabular-nums">{a.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Where the misses are</h2>
          {sortedAreas.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No missed questions logged.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {sortedAreas.map(([area, count]) => (
                <li key={area} className="flex justify-between border-b border-border py-1.5">
                  <span>{area.replace(/-/g, " ")}</span>
                  <span className="tabular-nums text-muted">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold">Kinds of mistake</h2>
          {sortedCategories.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No mistakes classified yet.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {sortedCategories.map(([category, count]) => (
                <li key={category} className="flex justify-between border-b border-border py-1.5">
                  <span>{CATEGORY_LABEL[category] ?? category}</span>
                  <span className="tabular-nums text-muted">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
