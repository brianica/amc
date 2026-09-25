"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { findExam } from "@/lib/exams";
import { getStore, type AttemptRecord, type ErrorCategory, type ProblemLogRecord, type TimeBucket } from "@/lib/store";
import { cardsForMissedProblems, toCard, toRecord } from "@/lib/resolve-cards";
import { parseAnswers, scoreAttempt } from "@pipeline/score";
import type { QuestionTiming } from "@/lib/timed";

export interface TriageInput {
  q: number;
  errorCategory: ErrorCategory | null;
  timeBucket: TimeBucket | null;
  note: string;
}

/** Create the in-progress row the moment a timed sitting's clock starts. */
export async function startTimedAttempt(input: { examId: string; takenOn: string }): Promise<{ attemptId: string }> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const exam = findExam(input.examId);
  if (!exam) throw new Error(`unknown exam ${input.examId}`);

  const attemptId = await getStore().createAttempt({
    user_id: user.id,
    exam_id: exam.id,
    taken_on: input.takenOn,
    mode: "timed",
    answers: "-".repeat(exam.problems.length),
    duration_min: null,
    score: null,
    include_in_stats: true,
    timings: null,
    status: "in_progress",
  });
  return { attemptId };
}

/**
 * Periodic save of answers/timings while the clock runs. Never scores — an
 * in-progress row is not a result, so there is nothing here worth trusting yet.
 */
export async function saveTimedProgress(input: {
  attemptId: string;
  answers: string;
  timings: QuestionTiming[];
}): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login");

  await getStore().patchAttemptProgress(user.id, input.attemptId, {
    answers: input.answers,
    timings: input.timings,
  });
}

/**
 * Periodic save of triage edits, for both the timed and paper-after-scoring
 * flows. Creates the in-progress row lazily on first call when the paper flow
 * hasn't made one yet (there is no row until "Score it" is clicked).
 */
export async function saveTriageProgress(input: {
  attemptId: string | null;
  examId: string;
  takenOn: string;
  answers: string;
  durationMin: number | null;
  mode: "paper" | "timed";
  triage: TriageInput[];
}): Promise<{ attemptId: string }> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const exam = findExam(input.examId);
  if (!exam) throw new Error(`unknown exam ${input.examId}`);

  const store = getStore();
  let attemptId = input.attemptId;
  if (!attemptId) {
    attemptId = await store.createAttempt({
      user_id: user.id,
      exam_id: exam.id,
      taken_on: input.takenOn,
      mode: input.mode,
      answers: input.answers,
      duration_min: input.durationMin,
      score: null,
      include_in_stats: true,
      timings: null,
      status: "in_progress",
    });
  } else {
    await store.patchAttemptProgress(user.id, attemptId, {
      answers: input.answers,
      duration_min: input.durationMin,
    });
  }

  // Which problems were missed is only known once scored — recompute here
  // (server-side, same as the final save) rather than trusting the client for it.
  const scored = scoreAttempt(exam, parseAnswers(input.answers));
  const logs = triageToLogs(scored, input.triage, attemptId, user.id);
  await store.replaceLogs(user.id, attemptId, logs);

  return { attemptId };
}

/** Delete an in-progress sitting the student explicitly chose to abandon. */
export async function discardInProgressAttempt(attemptId: string): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login");
  await getStore().discardInProgressAttempt(user.id, attemptId);
}

/** A user's open in-progress sittings of one exam — for the DB-backed resume banner. */
export async function listInProgressAttemptsForExam(examId: string): Promise<AttemptRecord[]> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return getStore().listInProgressAttempts(user.id, examId);
}

function triageToLogs(
  scored: ReturnType<typeof scoreAttempt>,
  triage: TriageInput[],
  attemptId: string,
  userId: string,
): ProblemLogRecord[] {
  const byQuestion = new Map(triage.map((t) => [t.q, t]));
  return scored.results
    .filter((r) => r.status !== "correct")
    .map((r) => {
      const t = byQuestion.get(r.n);
      return {
        attempt_id: attemptId,
        user_id: userId,
        q_number: r.n,
        status: r.status === "blank" ? "blank" : "incorrect",
        error_category: t?.errorCategory ?? null,
        time_bucket: t?.timeBucket ?? null,
        note: t?.note?.trim() ? t.note.trim().slice(0, 500) : null,
      };
    });
}

export async function saveAttempt(input: {
  /** Present when a progress row already exists — finalizes it instead of inserting. */
  attemptId?: string | null;
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
  const finalAnswers = parsed.map((a) => a ?? "-").join("");

  const store = getStore();
  let attemptId: string;
  if (input.attemptId) {
    attemptId = input.attemptId;
    await store.finalizeAttempt(user.id, attemptId, {
      answers: finalAnswers,
      score: scored.score,
      duration_min: input.durationMin,
      include_in_stats: input.includeInStats,
      timings: input.timings ?? null,
    });
  } else {
    attemptId = await store.createAttempt({
      user_id: user.id,
      exam_id: exam.id,
      taken_on: input.takenOn,
      mode: input.timings ? "timed" : "paper",
      answers: finalAnswers,
      duration_min: input.durationMin,
      score: scored.score,
      include_in_stats: input.includeInStats,
      timings: input.timings ?? null,
      status: "complete",
    });
  }

  const logs = triageToLogs(scored, input.triage, attemptId, user.id);
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
  redirect(`/attempts/${attemptId}`);
}
