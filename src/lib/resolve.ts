/**
 * Scheduling for the three-day re-solve.
 *
 * Reading a solution creates a feeling of understanding that does not survive a blank
 * page. The rule this implements is the one competitive students use by hand: three
 * days after getting a problem wrong, solve it again from scratch, and only call it
 * learned once that works unassisted — twice, spaced apart.
 *
 * Dates are plain YYYY-MM-DD strings throughout. A re-solve is due on a calendar day,
 * not at an instant, and using Date objects here would make "due today" depend on the
 * student's timezone relative to the server's.
 */

/** 0: first re-solve. 1: confirmation a fortnight later. 2: done. */
export type ResolveStage = 0 | 1 | 2;

export const FIRST_INTERVAL_DAYS = 3;
export const RETRY_INTERVAL_DAYS = 2;
export const CONFIRM_INTERVAL_DAYS = 14;

export interface ResolveCard {
  examId: string;
  qNumber: number;
  stage: ResolveStage;
  /** null once mastered — nothing further is scheduled. */
  dueOn: string | null;
  attempts: number;
  lastResult: "solved" | "failed" | null;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  // Date.UTC normalises month and year rollover; the UTC accessors read it back
  // unchanged, so no local timezone can shift the calendar day.
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + days));
  return shifted.toISOString().slice(0, 10);
}

export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A problem just missed on a paper enters the queue three days out. */
export function newCard(examId: string, qNumber: number, missedOn: string): ResolveCard {
  return {
    examId,
    qNumber,
    stage: 0,
    dueOn: addDays(missedOn, FIRST_INTERVAL_DAYS),
    attempts: 0,
    lastResult: null,
  };
}

/**
 * Record the outcome of a re-solve.
 *
 * Failing sends the card back to the start rather than merely delaying it: not having
 * the method after three days means it was never learned, and a longer gap would only
 * postpone finding that out. Needing a hint counts as failing — a re-solve that leans
 * on the solution measures recall of the answer, which for multiple choice is worth
 * nothing.
 */
export function recordResult(
  card: ResolveCard,
  result: "solved" | "failed",
  on: string,
): ResolveCard {
  const attempts = card.attempts + 1;

  if (result === "failed") {
    return { ...card, stage: 0, dueOn: addDays(on, RETRY_INTERVAL_DAYS), attempts, lastResult: "failed" };
  }

  if (card.stage === 0) {
    return { ...card, stage: 1, dueOn: addDays(on, CONFIRM_INTERVAL_DAYS), attempts, lastResult: "solved" };
  }

  // Solved cleanly twice, a fortnight apart: stop asking.
  return { ...card, stage: 2, dueOn: null, attempts, lastResult: "solved" };
}

/**
 * Missing the same problem again on a later paper resets it. The card is evidence
 * about one problem, not about one sitting, so a later failure supersedes an earlier
 * success — including a card already marked mastered.
 */
export function reopen(card: ResolveCard, missedOn: string): ResolveCard {
  return {
    ...card,
    stage: 0,
    dueOn: addDays(missedOn, FIRST_INTERVAL_DAYS),
    lastResult: "failed",
  };
}

export function isDue(card: ResolveCard, on: string): boolean {
  return card.dueOn !== null && card.dueOn <= on;
}

export function isMastered(card: ResolveCard): boolean {
  return card.stage === 2;
}

export interface QueueSummary {
  due: number;
  upcoming: number;
  mastered: number;
  /** The next day anything falls due, when nothing is due now. */
  nextDueOn: string | null;
}

export function summarise(cards: ResolveCard[], on: string): QueueSummary {
  let due = 0;
  let upcoming = 0;
  let mastered = 0;
  let nextDueOn: string | null = null;

  for (const card of cards) {
    if (isMastered(card)) {
      mastered++;
      continue;
    }
    if (isDue(card, on)) {
      due++;
      continue;
    }
    upcoming++;
    if (card.dueOn !== null && (nextDueOn === null || card.dueOn < nextDueOn)) {
      nextDueOn = card.dueOn;
    }
  }

  return { due, upcoming, mastered, nextDueOn };
}

/** Oldest due first, so the longest-overdue problem is never buried. */
export function sortForQueue(cards: ResolveCard[]): ResolveCard[] {
  return [...cards].sort((a, b) => {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn.localeCompare(b.dueOn) || a.examId.localeCompare(b.examId) || a.qNumber - b.qNumber;
  });
}
