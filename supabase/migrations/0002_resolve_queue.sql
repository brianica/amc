-- The three-day re-solve queue.
--
-- One row per problem a student has missed, not per time they missed it: the card is
-- evidence about that problem, and missing it again on a later paper reopens the same
-- card rather than starting a second one.

create table resolve_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  exam_id     text not null,
  q_number    integer not null check (q_number between 1 and 25),

  -- 0: first re-solve, three days out. 1: confirmation a fortnight later. 2: done.
  stage       smallint not null default 0 check (stage between 0 and 2),

  -- A calendar day, not an instant: a re-solve is due on a date, and a timestamp
  -- would make "due today" depend on the reader's timezone.
  due_on      date,

  attempts    integer not null default 0 check (attempts >= 0),
  last_result text check (last_result in ('solved', 'failed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A mastered card has nothing scheduled, and a scheduled card is not mastered.
  -- Keeping that in the database means no query has to remember it.
  constraint mastered_iff_unscheduled check ((stage = 2) = (due_on is null)),
  unique (user_id, exam_id, q_number)
);

-- The queue's only hot query: what is due for me today.
create index resolve_cards_due_idx on resolve_cards (user_id, due_on) where due_on is not null;

alter table resolve_cards enable row level security;

create policy "own resolve cards" on resolve_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
