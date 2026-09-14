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

**Authentication → Providers → Email**: make sure Email is enabled. This one provider
covers both sign-in methods the app offers — email with a password, and magic links.

**You do not need SMTP, and you do not need a domain.** Two things make that true:

- The app supports **email and password sign-in**, which sends no email at all. For a
  small number of known users this is the least friction: create the accounts once (see
  below) and the browser remembers the login, instead of hunting for a magic link every
  time a session expires.
- Supabase's built-in email sender works out of the box for magic links. It is
  rate-limited to a handful of messages per hour, which is ample for a family or a
  study group.

Configure your own SMTP only when you have enough users to hit that rate limit — it is
a scaling step, not a setup step, and it is the point at which you would want a domain.

### Creating accounts by hand (no email involved)

Under **Authentication → Users → Add user**, create each account with an email and
password and tick the option to auto-confirm it. Those accounts can sign in immediately
at `/login`. This is the recommended path for a private tool.

### If you would rather people sign themselves up

Leave **Confirm email** on so that addresses are verified, and Supabase's built-in
sender will deliver the confirmation. Be aware that with sign-up open, anyone who has
the URL can create an account.

## 5. Site URL and redirect allow-list

This step matters **only for magic links**. Password sign-in never leaves your site, so
if you are using accounts created by hand you can skip to step 6 and come back if you
later turn magic links on.

`src/app/login/page.tsx` asks Supabase to send the user back to
`${NEXT_PUBLIC_SITE_URL}/auth/callback`. Supabase refuses any redirect target that is
not on the allow-list and silently falls back to the Site URL, which is the usual
reason a magic link "works" but lands the user on the wrong page or signed out.

**You do not need a domain for this.** Running locally, `http://localhost:3000` is a
perfectly valid Site URL. When you deploy, your host gives you an origin for free — on
Vercel that is `https://<project>.vercel.app` — and that works just as well. A domain of
your own is cosmetic here; add one when you want the URL to look like yours.

Under **Authentication → URL Configuration**:

- **Site URL**: where the app actually runs today — `http://localhost:3000` while it is
  only on your machine, or your deployment origin once it is online.
- **Redirect URLs**: add every origin you use, explicitly —
  - `http://localhost:3000/auth/callback`
  - `https://<project>.vercel.app/auth/callback` (once deployed)

If your host gives every pull request its own domain, a wildcard such as
`https://*-yourteam.vercel.app/auth/callback` covers them; keep wildcards off anything
you do not control.

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

Add their credentials to `.env.local` alongside the two Supabase values — the script
reads that file, so there is nothing to paste on the command line:

```
RLS_TEST_A_EMAIL=rls-a@example.com
RLS_TEST_A_PASSWORD=<pw>
RLS_TEST_B_EMAIL=rls-b@example.com
RLS_TEST_B_PASSWORD=<pw>
```

Then, from the repo root:

```bash
npx tsx scripts/verify-rls.ts
```

If a variable is missing it names the one it wants and lists all six. Anything set in
your shell overrides the file, so a one-off run against a different project can pass
the values inline instead.

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
  Either wait, switch to password sign-in, or configure SMTP (step 4).
