/**
 * Bridges the pure scheduling logic in resolve.ts to the stored rows.
 *
 * Type-only import of the record shape, so this stays runnable in tests without
 * pulling in the server-only store.
 */
import type { ResolveCardRecord } from "./store";
import { newCard, reopen, type ResolveCard, type ResolveStage } from "./resolve";

export function toCard(row: ResolveCardRecord): ResolveCard {
  return {
    examId: row.exam_id,
    qNumber: row.q_number,
    stage: (row.stage === 1 ? 1 : row.stage === 2 ? 2 : 0) as ResolveStage,
    dueOn: row.due_on,
    attempts: row.attempts,
    lastResult: row.last_result,
  };
}

export function toRecord(card: ResolveCard, userId: string): ResolveCardRecord {
  return {
    user_id: userId,
    exam_id: card.examId,
    q_number: card.qNumber,
    stage: card.stage,
    due_on: card.dueOn,
    attempts: card.attempts,
    last_result: card.lastResult,
  };
}

/**
 * Work out the card changes a just-logged paper implies.
 *
 * Returns only what actually changed, so re-saving a paper does not churn every row
 * and, more importantly, does not reset the schedule of a card that is mid-flight.
 */
export function cardsForMissedProblems(
  existing: ResolveCard[],
  examId: string,
  missedQuestions: number[],
  takenOn: string,
): ResolveCard[] {
  const byQuestion = new Map(
    existing.filter((c) => c.examId === examId).map((c) => [c.qNumber, c]),
  );

  const changed: ResolveCard[] = [];

  for (const q of missedQuestions) {
    const current = byQuestion.get(q);

    if (!current) {
      changed.push(newCard(examId, q, takenOn));
      continue;
    }

    // Already queued for this exact problem and not yet finished: leave the existing
    // schedule alone. Re-logging the same paper should not push the due date back.
    if (current.stage !== 2) continue;

    changed.push(reopen(current, takenOn));
  }

  return changed;
}
