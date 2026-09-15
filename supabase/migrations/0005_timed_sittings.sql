-- Sitting a paper against the clock, one problem at a time.
--
-- Per-problem timing cannot be reconstructed after the fact, and it is what exposes
-- the most expensive failure on an AMC paper: minutes sunk into one hard problem
-- while an easy one later on is never read.

alter table attempts drop constraint if exists attempts_mode_check;
alter table attempts add constraint attempts_mode_check
  check (mode in ('paper', 'timed'));

-- Written once with the attempt and always read whole, so a column beats a table:
-- there is no query that wants one question's timing on its own.
-- Shape: [{"q": 1, "seconds": 74, "visits": 2}, ...]
alter table attempts add column if not exists timings jsonb;

comment on column attempts.timings is
  'Per-question seconds and visit counts, for timed sittings. Null when logged from paper.';
