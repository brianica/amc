# AMC Error & Diagnostic Tool

An online log for students taking past AMC 8/10/12 papers under timed conditions. It
records what they got wrong and why, and builds a picture over many exams of which
topics they are strong and weak in — the thing a raw score cannot tell them.

Each student has their own account, so the diagnosis accumulates across every practice
paper they log.

## Running it locally

Needs Node 20 or newer (developed on 22).

```bash
git clone <this repo>
cd amc
npm install
cp .env.example .env.local
npm run seed:dev     # optional: four sample papers, so the dashboard isn't empty
npm run dev          # http://localhost:3000
```

That is the whole setup. **No database or account is needed to try it**: with no
Supabase project configured the app signs you in as a local development account and
stores attempts in `.dev-data/db.json`, and `SAMPLE_EXAMS=1` in `.env.example` supplies
one sample paper to log against. Both are clearly labelled in the interface so neither
can be mistaken for real data, and the development account refuses to start in
production, where running without real auth would give every visitor the same account.

To try the whole flow: pick the sample exam, paste `ABCDEABCDEABCDEABCDEBCD--` into the
answer box (or tap the grid), score it, classify a few of the missed questions, and
save. The dashboard fills in.

### Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests — scoring, answer-key parsing, analytics |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run seed:dev` | Reset the local sample data |
| `npm run seed:statements` | Stand-in problem text, to try in-app problem display |

Run `npm run build` only when the dev server is stopped — a production build
overwrites the `.next` directory the dev server is serving from, and the symptom is a
completely unstyled page.

### Showing the problems inside the app

By default the app never displays problem text — AMC problems are MAA copyright, so a
public deployment links out to the official page instead. A private instance can render
them from its own local cache:

```bash
npm run seed:statements                      # stand-in text, no network needed
SHOW_PROBLEM_STATEMENTS=1 npm run dev
```

Open the sample exam, choose **Sit it on the clock**, and the problems appear in the
page. Problem 3 is the one with a diagram that cannot be drawn, so you can see how that
is handled.

For real papers, `npm run fetch` caches them under `pipeline/.cache/` and the same
switch shows those instead. Leave `SHOW_PROBLEM_STATEMENTS` unset on anything other
people can reach.

## Going beyond the sample data

Two things are needed for a real deployment, in either order:

1. **Accounts that persist** — create a Supabase project and follow
   [`supabase/README.md`](supabase/README.md). It covers applying the schema,
   configuring magic-link sign-in, and running `npx tsx scripts/verify-rls.ts`, which
   proves one student cannot read another's attempts.
2. **Real exams** — run the tagging pipeline to populate `data/exams/`. See
   [`pipeline/README.md`](pipeline/README.md). The fetch stage needs access to the AoPS
   wiki, so it has to run somewhere with general internet access.

The app renders correctly with a partial exam library, so the pipeline can be filled in
incrementally.

## Layout

| Path | What's in it |
| --- | --- |
| `src/app` | Pages: exam list, answer entry and triage, dashboard, sign-in |
| `src/lib` | Auth, data store, exam loading, and the analytics behind the dashboard |
| `pipeline/` | Builds the pre-tagged problem database ([how it works](pipeline/README.md)) |
| `data/` | The committed database: topic taxonomy, per-exam answer keys and tags |
| `supabase/` | Schema with row-level security, and the setup runbook |
| `scripts/` | Local seeding and the row-level-security check |
| `problem.md` | The original problem statement and market research |
