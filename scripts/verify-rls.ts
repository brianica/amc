/**
 * Proves that row-level security actually isolates students from one another.
 *
 * src/lib/store.ts deliberately issues queries with no user_id filter, so the only
 * thing standing between two students' data is the set of policies in
 * supabase/migrations/0001_init.sql. That is a property worth testing against the
 * real project rather than assuming, because a policy that fails open looks exactly
 * like a policy that works until someone else signs in.
 *
 * Run against a throwaway project (or at least throwaway users):
 *   npx tsx scripts/verify-rls.ts
 *
 * Required environment (see supabase/README.md for creating the two test users):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   RLS_TEST_A_EMAIL, RLS_TEST_A_PASSWORD
 *   RLS_TEST_B_EMAIL, RLS_TEST_B_PASSWORD
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the header of this file for the full list.`);
    process.exit(2);
  }
  return value;
}

const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/** A run tag, so a failed run's leftovers are identifiable and never collide. */
const RUN = Math.random().toString(36).slice(2, 10);

let failures = 0;

function pass(what: string): void {
  console.log(`  PASS  ${what}`);
}

function fail(what: string, detail: string): void {
  failures++;
  console.log(`  FAIL  ${what}\n        ${detail}`);
}

function check(what: string, ok: boolean, detail: string): void {
  if (ok) pass(what);
  else fail(what, detail);
}

/**
 * Signs in with a password. Magic links are the app's real sign-in path, but they
 * need a mailbox; password users exercise the same policies with the same
 * `authenticated` role, which is what is under test here.
 */
async function signIn(label: string, email: string, password: string): Promise<{ db: SupabaseClient; userId: string }> {
  // A separate client per user: sharing one would let the second sign-in silently
  // replace the first one's token and turn every isolation check into a tautology.
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    console.error(`Could not sign in ${label} (${email}): ${error?.message ?? "no user returned"}`);
    process.exit(2);
  }
  console.log(`Signed in ${label}: ${data.user.id}`);
  return { db, userId: data.user.id };
}

async function main(): Promise<void> {
  const a = await signIn("user A", required("RLS_TEST_A_EMAIL"), required("RLS_TEST_A_PASSWORD"));
  const b = await signIn("user B", required("RLS_TEST_B_EMAIL"), required("RLS_TEST_B_PASSWORD"));

  if (a.userId === b.userId) {
    console.error("Both credentials resolve to the same user; the test would prove nothing.");
    process.exit(2);
  }

  let attemptId: string | null = null;

  try {
    // --- Setup: A creates an attempt and one problem log. ---
    const created = await a.db
      .from("attempts")
      .insert({
        user_id: a.userId,
        exam_id: `rls-verify-${RUN}`,
        taken_on: "2000-01-01",
        mode: "paper",
        answers: "ABCDE".repeat(5),
        score: 42.0,
      })
      .select("id")
      .single();

    if (created.error || !created.data) {
      console.error(`User A could not create an attempt: ${created.error?.message}`);
      console.error("That is a setup failure, not an isolation failure — check the migration applied.");
      process.exit(2);
    }
    attemptId = created.data.id as string;
    console.log(`User A created attempt ${attemptId}\n`);

    const log = await a.db
      .from("problem_logs")
      .insert({ attempt_id: attemptId, user_id: a.userId, q_number: 7, status: "incorrect", error_category: "careless" });
    if (log.error) {
      console.error(`User A could not create a problem log: ${log.error.message}`);
      process.exit(2);
    }

    console.log("Isolation checks (user B acting against user A's rows):");

    // --- Read ---
    const readAttempts = await b.db.from("attempts").select("id").eq("id", attemptId);
    check(
      "B cannot read A's attempt",
      !readAttempts.error && (readAttempts.data ?? []).length === 0,
      readAttempts.error ? `unexpected error: ${readAttempts.error.message}` : `returned ${readAttempts.data?.length} row(s)`,
    );

    const readLogs = await b.db.from("problem_logs").select("id").eq("attempt_id", attemptId);
    check(
      "B cannot read A's problem logs",
      !readLogs.error && (readLogs.data ?? []).length === 0,
      readLogs.error ? `unexpected error: ${readLogs.error.message}` : `returned ${readLogs.data?.length} row(s)`,
    );

    const readProfile = await b.db.from("profiles").select("id").eq("id", a.userId);
    check(
      "B cannot read A's profile",
      !readProfile.error && (readProfile.data ?? []).length === 0,
      readProfile.error ? `unexpected error: ${readProfile.error.message}` : `returned ${readProfile.data?.length} row(s)`,
    );

    // --- Write. An UPDATE or DELETE filtered out by a policy is not an error: it
    // reports success having touched nothing, so affected-row counts are the signal,
    // and A's row is re-read afterwards to confirm nothing changed behind the count. ---
    const upd = await b.db.from("attempts").update({ score: 999 }).eq("id", attemptId).select("id");
    check(
      "B cannot update A's attempt",
      !upd.error && (upd.data ?? []).length === 0,
      upd.error ? `unexpected error: ${upd.error.message}` : `updated ${upd.data?.length} row(s)`,
    );

    const del = await b.db.from("attempts").delete().eq("id", attemptId).select("id");
    check(
      "B cannot delete A's attempt",
      !del.error && (del.data ?? []).length === 0,
      del.error ? `unexpected error: ${del.error.message}` : `deleted ${del.data?.length} row(s)`,
    );

    const delLogs = await b.db.from("problem_logs").delete().eq("attempt_id", attemptId).select("id");
    check(
      "B cannot delete A's problem logs",
      !delLogs.error && (delLogs.data ?? []).length === 0,
      delLogs.error ? `unexpected error: ${delLogs.error.message}` : `deleted ${delLogs.data?.length} row(s)`,
    );

    // --- Inserts that forge ownership. These must be refused outright. ---
    const forgedAttempt = await b.db.from("attempts").insert({
      user_id: a.userId,
      exam_id: `rls-forge-${RUN}`,
      taken_on: "2000-01-02",
      mode: "paper",
      answers: "ABCDE".repeat(5),
      score: 1,
    });
    check(
      "B cannot insert an attempt owned by A",
      Boolean(forgedAttempt.error),
      "the insert succeeded",
    );

    // The specific hole the "own problem logs" policy exists to close: the row's own
    // user_id is honestly B's, so only the check on the parent attempt can stop it.
    const crossLog = await b.db.from("problem_logs").insert({
      attempt_id: attemptId,
      user_id: b.userId,
      q_number: 11,
      status: "blank",
    });
    check(
      "B cannot attach a problem log of their own to A's attempt",
      Boolean(crossLog.error),
      "the insert succeeded — a log row can be hung off another student's attempt",
    );

    const forgedLog = await b.db.from("problem_logs").insert({
      attempt_id: attemptId,
      user_id: a.userId,
      q_number: 12,
      status: "blank",
    });
    check(
      "B cannot insert a problem log owned by A",
      Boolean(forgedLog.error),
      "the insert succeeded",
    );

    // --- A's data must be exactly as it was, whatever the counts above claimed. ---
    const after = await a.db.from("attempts").select("id, score").eq("id", attemptId).maybeSingle();
    check(
      "A's attempt survived untouched",
      !after.error && after.data !== null && Number(after.data.score) === 42,
      after.error ? `unexpected error: ${after.error.message}` : `row is ${JSON.stringify(after.data)}`,
    );

    const logsAfter = await a.db.from("problem_logs").select("q_number").eq("attempt_id", attemptId);
    const qNumbers = (logsAfter.data ?? []).map((r) => r.q_number as number).sort((x, y) => x - y);
    check(
      "A's problem logs are unchanged",
      !logsAfter.error && qNumbers.length === 1 && qNumbers[0] === 7,
      logsAfter.error ? `unexpected error: ${logsAfter.error.message}` : `found q_numbers ${JSON.stringify(qNumbers)}`,
    );
  } finally {
    // Clean up as A, who owns the rows. The cascade on problem_logs.attempt_id takes
    // the log rows with it.
    if (attemptId) {
      const cleanup = await a.db.from("attempts").delete().eq("id", attemptId).select("id");
      if (cleanup.error) console.log(`\nWarning: could not clean up attempt ${attemptId}: ${cleanup.error.message}`);
      else console.log(`\nCleaned up ${cleanup.data?.length ?? 0} attempt row(s).`);
    }
    // Anything the forged inserts managed to create is A's problem to find, so sweep
    // by the run tag from both sides rather than trusting that they all failed.
    for (const who of [a, b]) {
      await who.db.from("attempts").delete().like("exam_id", `rls-%-${RUN}`);
    }
    await Promise.all([a.db.auth.signOut(), b.db.auth.signOut()]);
  }

  if (failures > 0) {
    console.log(`\n${failures} isolation check(s) FAILED. Row-level security is not protecting this data.`);
    process.exit(1);
  }
  console.log("\nAll isolation checks passed.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(2);
});
