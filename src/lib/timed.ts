/**
 * State for sitting a paper against a clock, one problem at a time.
 *
 * The point of this mode is not convenience — logging answers afterwards is faster.
 * It is the per-problem timing, which cannot be recovered after the fact and is the
 * only way to see the failure that costs the most points: nine minutes sunk into
 * Q11 while Q16, which was easy, was never read.
 *
 * Time is accrued on every navigation rather than sampled by a ticker, so the totals
 * do not depend on a timer firing and are unaffected by a backgrounded tab.
 */

export type Letter = "A" | "B" | "C" | "D" | "E";

export interface TimedState {
  startedAt: number;
  durationMs: number;
  /** Index of the problem on screen, 0-based. */
  current: number;
  answers: (Letter | null)[];
  flagged: boolean[];
  /** Milliseconds spent on each problem, summed across every visit. */
  spentMs: number[];
  visits: number[];
  /** When the clock on the current problem started. */
  enteredAt: number;
  submitted: boolean;
  /** When the current pause began, or null while running. */
  pausedAt: number | null;
  /**
   * When this state last changed, for reconciling a localStorage copy against a
   * server-side in-progress row recovered on another device. Optional so state
   * saved before this field existed still parses.
   */
  updatedAt?: number;
}

export function startSession(count: number, durationMin: number, now: number): TimedState {
  return {
    startedAt: now,
    durationMs: durationMin * 60_000,
    current: 0,
    answers: Array(count).fill(null),
    flagged: Array(count).fill(false),
    spentMs: Array(count).fill(0),
    visits: Array(count).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
    enteredAt: now,
    submitted: false,
    pausedAt: null,
    updatedAt: now,
  };
}

/** Bank the time spent on the current problem without moving away from it. */
export function accrue(state: TimedState, now: number): TimedState {
  const elapsed = Math.max(0, now - state.enteredAt);
  const spentMs = [...state.spentMs];
  spentMs[state.current] = (spentMs[state.current] ?? 0) + elapsed;
  return { ...state, spentMs, enteredAt: now };
}

/**
 * Stop both clocks: the per-problem timer (banked immediately, like leaving for
 * another problem) and, once resumed, the deadline itself — a break should cost
 * nothing on either count, the way a proctor stopping the room clock would.
 */
export function pause(state: TimedState, now: number): TimedState {
  if (state.submitted || state.pausedAt !== null) return state;
  return { ...accrue(state, now), pausedAt: now };
}

/** Shift the deadline and the current problem's clock forward by the pause's length. */
export function resume(state: TimedState, now: number): TimedState {
  if (state.pausedAt === null) return state;
  const pausedMs = Math.max(0, now - state.pausedAt);
  return { ...state, startedAt: state.startedAt + pausedMs, enteredAt: now, pausedAt: null };
}

export function goTo(state: TimedState, index: number, now: number): TimedState {
  if (index < 0 || index >= state.answers.length || index === state.current) return state;

  const banked = accrue(state, now);
  const visits = [...banked.visits];
  visits[index] = (visits[index] ?? 0) + 1;

  return { ...banked, current: index, visits, enteredAt: now };
}

export function next(state: TimedState, now: number): TimedState {
  return goTo(state, state.current + 1, now);
}

export function previous(state: TimedState, now: number): TimedState {
  return goTo(state, state.current - 1, now);
}

/** Selecting the letter already chosen clears it, so a guess can be taken back. */
export function answer(state: TimedState, letter: Letter): TimedState {
  const answers = [...state.answers];
  answers[state.current] = answers[state.current] === letter ? null : letter;
  return { ...state, answers };
}

export function toggleFlag(state: TimedState): TimedState {
  const flagged = [...state.flagged];
  flagged[state.current] = !flagged[state.current];
  return { ...state, flagged };
}

export function remainingMs(state: TimedState, now: number): number {
  const clock = state.pausedAt ?? now;
  return Math.max(0, state.startedAt + state.durationMs - clock);
}

/** Running out while paused still ends the paper — pausing buys a break, not extra time. */
export function isExpired(state: TimedState, now: number): boolean {
  return remainingMs(state, now) === 0;
}

/** Bank the final problem's time and close the session. */
export function finish(state: TimedState, now: number): TimedState {
  const clock = state.pausedAt ?? now;
  return { ...accrue(state, clock), submitted: true, pausedAt: null };
}

export function answerString(state: TimedState): string {
  return state.answers.map((a) => a ?? "-").join("");
}

export interface QuestionTiming {
  q: number;
  seconds: number;
  visits: number;
}

/** Seconds per problem, for storing alongside the attempt. */
export function timings(state: TimedState): QuestionTiming[] {
  return state.spentMs.map((ms, i) => ({
    q: i + 1,
    seconds: Math.round(ms / 1000),
    visits: state.visits[i] ?? 0,
  }));
}

/** Whole minutes elapsed, for the attempt's duration. */
export function elapsedMinutes(state: TimedState, now: number): number {
  return Math.max(1, Math.round((Math.min(now, state.startedAt + state.durationMs) - state.startedAt) / 60_000));
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Problems never visited at all — the ones a pacing failure leaves unread. */
export function unseen(state: TimedState): number[] {
  return state.visits.flatMap((v, i) => (v === 0 ? [i + 1] : []));
}
