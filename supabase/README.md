# Supabase setup

Everything here is done once, by hand, in your own Supabase account. Follow it in order.

Dashboard labels move around between releases — if a menu name below does not match
what you see, look for the nearest equivalent rather than assuming the step is gone.

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard> and create a new project.
2. Pick a region near your users and save the database password somewhere safe. The
   app never uses it; you will want it for `psql` or the CLI later.
3. Wait for provisioning to finish before the next step.

## 2. Copy the project URL and anon key

**Project Settings → API** (newer dashboards: **Project Settings → API Keys**):

| Dashboard field           | Environment variable             |
| ------------------------- | -------------------------------- |
| Project URL               | `NEXT_PUBLIC_SUPABASE_URL`       |
| `anon` / publishable key  | `NEXT_PUBLIC_SUPABASE_ANON_KEY`  |

The anon key is meant to ship to browsers — row-level security is what protects the
data, not the secrecy of this key. The `service_role` key is the opposite: it bypasses
row-level security entirely. It is not used anywhere in this app. Do not put it in
`.env.local`, and never expose it under a `NEXT_PUBLIC_` name.

## 3. Apply the schema

1. Open **SQL Editor → New query**.
2. Paste the entire contents of `supabase/migrations/0001_init.sql` and run it.
3. Confirm in **Table Editor** that `profiles`, `attempts` and `problem_logs` exist and
   each shows row-level security as enabled.

The script is not idempotent — it is the initial migration. Re-running it fails on
`create type error_category`. To start over, reset the database (or drop the three
tables, the two enum types, and `public.handle_new_user`) first.

If the last statement fails with `must be owner of relation users`, the trigger on
`auth.users` could not be created. Everything else will have applied; new sign-ups
just will not get a `profiles` row automatically. Run that statement from the SQL
Editor as the project owner, and if it still refuses, ask Supabase support rather than
loosening permissions on the `auth` schema.

## 4. Configure email sign-in

**Authentication → Providers → Email**: make sure Email is enabled. The app uses
`signInWithOtp`, so magic links are what matter; leave "Confirm email" on.

Supabase's built-in email sender is rate-limited to a handful of messages per hour and
is only meant for development. Before real users, configure your own SMTP under
**Project Settings → Authentication → SMTP Settings**.

## 5. Site URL and redirect allow-list — do not skip

`src/app/login/page.tsx` asks Supabase to send the user back to
`${NEXT_PUBLIC_SITE_URL}/auth/callback`. Supabase refuses any redirect target that is
not on the allow-list and silently falls back to the Site URL, which is the usual
reason a magic link "works" but lands the user on the wrong page or signed out.

Under **Authentication → URL Configuration**:

- **Site URL**: your production origin, e.g. `https://amc.example.com`.
- **Redirect URLs**: add both environments explicitly —
  - `http://localhost:3000/auth/callback`
  - `https://amc.example.com/auth/callback`

Add a line per deployment origin you actually use. If your host gives every pull
request its own domain, a wildcard such as `https://*-yourteam.vercel.app/auth/callback`
covers them; keep wildcards off anything you do not control.

`NEXT_PUBLIC_SITE_URL` must match the origin the user is browsing, per environment —
`http://localhost:3000` locally, the production origin in production. A mismatch sends
the link to the wrong host.

## 6. Environment variables

Local — `.env.local` in the repo root (git-ignored; copy `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Leave `SAMPLE_EXAMS=1` while `data/exams/` is empty. With the two Supabase variables
absent the app falls back to a local development account and a file-backed store, so
set them only when you want to exercise the real thing.

Hosting provider (Vercel: **Project Settings → Environment Variables**) — the same
three, with `NEXT_PUBLIC_SITE_URL` set to the production origin. `NEXT_PUBLIC_*`
variables are inlined at **build** time, so add them before you build and redeploy
after any change; editing them does not affect an existing deployment.

`ANTHROPIC_API_KEY` belongs only where `npm run classify` runs. The web app never
reads it, so it does not belong in the hosting environment.

## 7. Verify the isolation guarantee

`src/lib/store.ts` queries without a `user_id` filter on purpose — row-level security is
the only thing keeping students apart. `scripts/verify-rls.ts` proves that on the live
project instead of taking it on trust.

Create two throwaway users under **Authentication → Users → Add user**, both with
"Auto Confirm User" checked so no mailbox is needed:

- `rls-a@example.com` with any password
- `rls-b@example.com` with any password

Then, from the repo root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key> \
RLS_TEST_A_EMAIL=rls-a@example.com RLS_TEST_A_PASSWORD=<pw> \
RLS_TEST_B_EMAIL=rls-b@example.com RLS_TEST_B_PASSWORD=<pw> \
npx tsx scripts/verify-rls.ts
```

It prints a line per check, cleans up the rows it created, and exits non-zero if any
check fails. Run it after any change to the policies. Delete the two test users when
you are done; their `profiles`, `attempts` and `problem_logs` rows cascade away with
them.

## Troubleshooting

- **`permission denied for table attempts`** — the policies are in place but the
  `anon`/`authenticated` roles lack table privileges. Grant them in the SQL Editor:
  `grant all on table public.profiles, public.attempts, public.problem_logs to anon, authenticated;`
- **Every query returns zero rows while signed in** — the request is reaching Postgres
  without a JWT. Check that the browser has the Supabase auth cookies and that
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the anon key, not the service role key.
- **`Missing sign-in code` after clicking the link** — the callback expects a `?code=`
  parameter (PKCE). If the link instead lands with a `#access_token=` fragment, the
  email template is still on the older implicit-flow format; reset the Magic Link
  template to the default under **Authentication → Email Templates**.
- **New users have no profile row** — the `on_auth_user_created` trigger did not get
  created. See the note at the end of step 3.
- **Sign-in emails stop arriving** — you have hit the built-in sender's rate limit.
  Configure SMTP (step 4).
