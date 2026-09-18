-- Allow a paper to be sat more than once.
--
-- The original unique (user_id, exam_id, taken_on) was meant to stop a double
-- submission, but it blocks something students actually do: retaking a paper to see
-- whether the weak spots have closed. It also failed with a raw constraint-violation
-- message rather than anything a reader could act on.
--
-- Each sitting is now its own row, distinguished by taken_on and created_at, and the
-- app numbers them in the order they were taken.

alter table attempts drop constraint if exists attempts_user_id_exam_id_taken_on_key;

-- Ordering attempts within a paper is now a normal query, so support it.
create index if not exists attempts_user_exam_idx on attempts (user_id, exam_id, taken_on);
