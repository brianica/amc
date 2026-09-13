-- Every table is scoped to one student. Isolation is enforced by row-level security
-- in the database, not by filtering in application code, so a mistake in a query
-- cannot leak another student's attempts.

create type error_category as enum (
  'careless',   -- A: knew the maths, lost the points
  'concept',    -- B: did not know the tool
  'no_path',    -- C: knew the tools, could not find the path
  'triage'      -- D: ran out of time / never properly attempted
);

create type response_status as enum ('incorrect', 'blank');

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text,
  target_contest text check (target_contest in ('AMC8', 'AMC10', 'AMC12')),
  created_at  timestamptz not null default now()
);

create table attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  -- Exam identity lives in version-controlled JSON, not in the database, so tags can
  -- be corrected later and every past attempt is reinterpreted correctly.
  exam_id      text not null,
  taken_on     date not null,
  mode         text not null default 'paper' check (mode in ('paper', 'online')),
  answers      text not null check (answers ~ '^[A-E-]{25}$'),
  duration_min integer check (duration_min > 0 and duration_min <= 300),
  score        numeric(5,1) not null,
  created_at   timestamptz not null default now(),
  unique (user_id, exam_id, taken_on)
);

create table problem_logs (
  id             uuid primary key default gen_random_uuid(),
  attempt_id     uuid not null references attempts on delete cascade,
  -- Denormalised from the attempt so row-level security can check it directly.
  user_id        uuid not null references auth.users on delete cascade,
  q_number       integer not null check (q_number between 1 and 25),
  status         response_status not null,
  error_category error_category,
  time_bucket    text check (time_bucket in ('under1', '1to3', '3to6', 'over6')),
  note           text check (length(note) <= 500),
  created_at     timestamptz not null default now(),
  unique (attempt_id, q_number)
);

create index attempts_user_taken_idx on attempts (user_id, taken_on desc);
create index problem_logs_user_idx on problem_logs (user_id);

alter table profiles enable row level security;
alter table attempts enable row level security;
alter table problem_logs enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own attempts" on attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The attempt must also belong to the caller, so a log row cannot be attached to
-- someone else's attempt even though its own user_id checks out.
create policy "own problem logs" on problem_logs
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );

-- Give every new sign-up a profile row without a round-trip from the app.
-- Schema-qualified throughout: this runs inside GoTrue's own transaction, so an
-- unexpected search_path here would break sign-up rather than fail visibly.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  -- A profile that somehow already exists must not turn into "Database error
  -- saving new user", which would lock the account out of sign-in entirely.
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
