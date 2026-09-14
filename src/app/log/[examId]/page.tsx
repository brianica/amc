import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { examLabel, findExam } from "@/lib/exams";
import { getStore } from "@/lib/store";
import { LogForm } from "./LogForm";


// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function LogPage({ params }: { params: Promise<{ examId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { examId } = await params;
  const exam = findExam(examId);
  if (!exam) notFound();

  // Sitting a paper again is expected — say so rather than letting the student
  // wonder whether they are about to overwrite the first attempt.
  const previous = (await getStore().listAttempts(user.id))
    .filter((a) => a.exam_id === exam.id)
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{examLabel(exam)}</h1>

      {previous.length > 0 && (
        <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          You have sat this paper {previous.length === 1 ? "once" : `${previous.length} times`} before
          {" — "}
          {previous.map((a) => `${a.score} on ${a.taken_on}`).join(", ")}. This will be recorded as a
          separate sitting, not a replacement.
        </p>
      )}

      <LogForm exam={exam} examLabel={examLabel(exam)} />
    </div>
  );
}
