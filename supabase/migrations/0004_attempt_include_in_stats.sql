-- Let a sitting be recorded without counting toward the analytics.
--
-- Sitting the same paper again within a couple of weeks measures recall of a paper
-- already worked through rather than the method, and on multiple choice remembering a
-- letter is enough. Such a sitting is still worth keeping — it is real practice and its
-- misses still belong in the re-solve queue — but counting it would inflate the topic
-- accuracy the student is meant to be steering by.
--
-- The default is true: an ordinary first sitting counts, and only the student can
-- decide to exclude one.

alter table attempts
  add column if not exists include_in_stats boolean not null default true;

comment on column attempts.include_in_stats is
  'False for sittings the student chose not to count, typically a retake from memory.';
