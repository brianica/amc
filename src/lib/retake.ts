/**
 * Whether a sitting is close enough to a previous one that memory, rather than
 * method, may be doing the work.
 *
 * Sitting the same paper again is a good way to check whether a weak spot has closed,
 * but only once the answers have faded. Inside a couple of weeks the score measures
 * recall of a paper the student has already worked through — and on multiple choice,
 * remembering a letter is enough. Such a sitting is still worth recording; it just
 * should not silently move the topic accuracy it would inflate.
 */

/** Two weeks: long enough that the specific answers stop being the easy path. */
export const BIAS_WINDOW_DAYS = 14;

export interface RetakeWarning {
  /** Sittings of this paper before the one being logged. */
  previous: number;
  /** Days since the most recent one, when there is one. */
  daysSinceLast: number | null;
  /** True when the gap is short enough that the result is likely memory-assisted. */
  likelyBiased: boolean;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

export function assessRetake(previousDates: string[], takenOn: string): RetakeWarning {
  if (previousDates.length === 0) {
    return { previous: 0, daysSinceLast: null, likelyBiased: false };
  }

  // The most recent prior sitting is the one memory would be drawing on.
  const mostRecent = [...previousDates].sort().at(-1)!;
  const gap = daysBetween(mostRecent, takenOn);

  return {
    previous: previousDates.length,
    daysSinceLast: gap,
    // A negative gap means back-dating an older paper logged late, which is not a
    // retake-from-memory at all.
    likelyBiased: gap >= 0 && gap < BIAS_WINDOW_DAYS,
  };
}
