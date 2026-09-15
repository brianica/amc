"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { findExam } from "@/lib/exams";
import { getStore, type ErrorCategory, type ProblemLogRecord, type TimeBucket } from "@/lib/store";
import { cardsForMissedProblems, toCard, toRecord } from "@/lib/resolve-cards";
import { parseAnswers, scoreAttempt } from "@pipeline/score";
import type { QuestionTiming } from "@/lib/timed";

export interface TriageInput {
  q: number;
  errorCategory: ErrorCategory | null;
  timeBucket: TimeBucket | null;
  note: string;
}

export async function saveAttempt(input: {
  examId: string;
  takenOn: string;
  answers: string;
  durationMin: number | null;
  /** False when the student chose to record this sitting without counting it. */
  includeInStats: boolean;
  /** Present only for a sitting taken against the clock in the app. */
  timings?: QuestionTiming[] | null;
  triage: TriageInput[];
}): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const exam = findExam(input.examId);
  if (!exam) throw new Error(`unknown exam ${input.examId}`);

  // Score on the server from the stored key. The client shows an instant score for
  // feedback, but what gets persisted is never taken on trust from the browser.
  const parsed = parseAnswers(input.answers);
  const scored = scoreAttempt(exam, parsed);

  const store = getStore();
  const attemptId = await store.createAttempt({
    user_id: user.id,
    exam_id: exam.id,
    taken_on: input.takenOn,
    mode: input.timings ? "timed" : "paper",
    answers: parsed.map((a) => a ?? "-").join(""),
    duration_min: input.durationMin,
    score: scored.score,
    include_in_stats: input.includeInStats,
    timings: input.timings ?? null,
  });

  const byQuestion = new Map(input.triage.map((t) => [t.q, t]));
  const logs: ProblemLogRecord[] = scored.results
    .filter((r) => r.status !== "correct")
    .map((r) => {
      const t = byQuestion.get(r.n);
      return {
        attempt_id: attemptId,
        user_id: user.id,
        q_number: r.n,
        status: r.status === "blank" ? "blank" : "incorrect",
        error_category: t?.errorCategory ?? null,
        time_bucket: t?.timeBucket ?? null,
        note: t?.note?.trim() ? t.note.trim().slice(0, 500) : null,
      };
    });

  await store.replaceLogs(user.id, attemptId, logs);

  // Every missed problem joins the re-solve queue, due in three days, whether or not
  // the sitting counts toward the analytics — it was still missed, and the practice
  // value of re-solving it does not depend on the score being comparable.
  const existing = (await store.listResolveCards(user.id)).map(toCard);
  const changed = cardsForMissedProblems(
    existing,
    exam.id,
    logs.map((l) => l.q_number),
    input.takenOn,
  );
  await store.upsertResolveCards(user.id, changed.map((c) => toRecord(c, user.id)));

  revalidatePath("/");
  revalidatePath("/resolve");
  redirect("/dashboard");
}
