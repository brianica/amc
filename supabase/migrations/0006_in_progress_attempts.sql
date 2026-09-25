-- Save timed-sitting and triage progress as it happens, not only at the end.
--
-- A browser crash or a forgotten tab during a 75-minute sitting, or during the
-- triage step right after scoring, should not cost the student everything typed
-- so far. An "in_progress" attempt row is created early and patched periodically;
-- it becomes 'complete' -- with a real, server-computed score -- only when the
-- student actually saves. Until then it is not a result: it must never appear in
-- listAttempts() callers that feed the dashboard, the home page list, or
-- retake-bias detection.
--
-- Every existing row gets 'complete' from the column default in the same
-- statement that adds it -- no backfill, no separate update, nothing at risk for
-- accounts that already have data.

alter table attempts
  add column if not exists status text not null default 'complete'
    check (status in ('in_progress', 'complete'));

comment on column attempts.status is
  'in_progress rows are incremental saves of a sitting/triage in progress, not a result. Never surfaced outside recovery.';

-- An in-progress row has no trustworthy score yet -- scoring is always
-- server-side and only meaningful once the paper is actually finished. Nullable
-- rather than a 0 sentinel, which would be indistinguishable from a real AMC
-- score of 0 in any query that forgets to filter by status.
alter table attempts alter column score drop not null;

comment on column attempts.score is
  'Null while status = in_progress. Always set, server-computed, once complete.';

-- Fast "find my open sitting of this exam" lookup for recovery, and a fast
-- filter for every listAttempts-style query that must now exclude in-progress
-- rows.
create index if not exists attempts_user_status_idx on attempts (user_id, status);
create index if not exists attempts_user_exam_status_idx on attempts (user_id, exam_id, status);

-- Follow-up, not built here: abandoned in_progress rows are never auto-cleaned.
-- They cost nothing in the UI (every page filters to status = 'complete'), but a
-- future storage-limit concern would want something like
--   delete from attempts where status = 'in_progress' and created_at < now() - interval '30 days'
-- run manually or on a schedule.
