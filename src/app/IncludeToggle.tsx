"use client";

import { useTransition } from "react";
import { setAttemptCounted } from "./actions";

/**
 * Lets a sitting be counted or not after the fact. The decision is easiest to make
 * at logging time but easiest to get wrong there, so it stays changeable.
 */
export function IncludeToggle({ attemptId, included }: { attemptId: string; included: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={included}
      onClick={() => startTransition(async () => setAttemptCounted(attemptId, !included))}
      className="text-xs text-muted underline hover:text-text disabled:opacity-60"
    >
      {included ? "exclude" : "count it"}
    </button>
  );
}
