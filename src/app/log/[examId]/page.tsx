import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { examLabel, findExam } from "@/lib/exams";
import { LogForm } from "./LogForm";


// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function LogPage({ params }: { params: Promise<{ examId: string }> }) {
  if (!(await currentUser())) redirect("/login");

  const { examId } = await params;
  const exam = findExam(examId);
  if (!exam) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{examLabel(exam)}</h1>
      <LogForm exam={exam} examLabel={examLabel(exam)} />
    </div>
  );
}
