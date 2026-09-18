import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { examLabel, findExam } from "@/lib/exams";
import { getStore } from "@/lib/store";
import { loadStatements, showStatements } from "@/lib/statements";
import { TimedSession } from "./TimedSession";

// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

/** The real limits: 75 minutes for AMC 10/12, 40 for AMC 8. */
const MINUTES: Record<string, number> = { AMC8: 40, AMC10: 75, AMC12: 75 };

export default async function TimedPage({ params }: { params: Promise<{ examId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { examId } = await params;
  const exam = findExam(examId);
  if (!exam) notFound();

  const previous = (await getStore().listAttempts(user.id))
    .filter((a) => a.exam_id === exam.id)
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on));

  const statements = await loadStatements(exam);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{examLabel(exam)}</h1>
        <p className="mt-1 text-sm text-muted">
          Timed sitting ·{" "}
          <Link href={`/log/${exam.id}`} className="text-accent underline">
            log answers from paper instead
          </Link>
        </p>
      </div>

      {showStatements() && (statements?.available ?? 0) === 0 && (
        <p className="rounded-md border border-blank/50 bg-blank/10 px-4 py-3 text-sm">
          Problem display is switched on, but nothing is cached for this paper yet. Run{" "}
          <code>npm run fetch</code> to populate <code>pipeline/.cache/</code>. Until then
          the sitting falls back to links.
        </p>
      )}

      {previous.length > 0 && (
        <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          You have sat this paper {previous.length === 1 ? "once" : `${previous.length} times`}{" "}
          before — {previous.map((a) => `${a.score} on ${a.taken_on}`).join(", ")}.
        </p>
      )}

      <TimedSession
        exam={exam}
        examLabel={examLabel(exam)}
        previousDates={previous.map((a) => a.taken_on)}
        defaultMinutes={MINUTES[exam.competition] ?? 75}
        statements={statements?.byQuestion}
      />
    </div>
  );
}
