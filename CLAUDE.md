# AMC Error & Diagnostic Tool

A web app where a student logs past AMC 8/10/12 papers taken under timed conditions,
records what they got wrong and why, and sees over many papers which topics are costing
them points. Built for one real user — the author's son, preparing for AMC 10 — and
opened up for anyone.

`problem.md` is the original brief. Read it for the motivation; it is research, not spec.

## Where things stand

| Piece | State |
| --- | --- |
| Answer entry, scoring, triage | Working, verified end to end in a browser |
| Dashboard (4 views) | Working |
| Accounts + row-level security | Schema and setup runbook done; verified with `scripts/verify-rls.ts` |
| **Problem database (`data/exams/`)** | **Empty — this is the active task** |
| 3-day re-solve queue | Working |
| Retakes | Working |
| Timed sittings | Working. Per-problem timing captured; pacing view not built yet |
| In-app problem display | Behind `SHOW_PROBLEM_STATEMENTS=1`; off by default. Untested against real wikitext |
| Migrations | `0002`–`0005` must be applied in order |

Until `data/exams/` is populated the app runs against one clearly-labelled sample paper
with an invented answer key, gated behind `SAMPLE_EXAMS=1`.

## Commands

```bash
npm run dev          # app at localhost:3000
npm test             # unit tests: scoring, answer parsing, analytics
npm run seed:dev     # local sample attempts so the dashboard isn't empty
npm run build        # NEVER while the dev server is running — it overwrites .next
                     # and the only symptom is a completely unstyled page

npm run fetch -- --limit 1   # pipeline: cache wikitext (needs network)
npm run extract              # derive answer keys -> data/exams
npm run classify -- --limit 1 # topic tags (needs GEMINI_API_KEY)
npm run review               # decide the flagged problems, interactively
npm run validate             # gate; fails on anything unresolved
```

Run `npx tsc --noEmit` and `npm test` before committing.

## Layout

| Path | What |
| --- | --- |
| `src/app` | Pages: exam list, answer entry + triage, dashboard, sign-in |
| `src/lib` | Auth, store, exam loading, analytics. `analytics.ts` is pure and unit-tested |
| `pipeline/` | Builds the tagged problem database. See `pipeline/README.md` |
| `data/` | Committed: taxonomy, per-exam answer keys and topic tags |
| `supabase/` | Schema with RLS, plus the setup runbook. Migrations are applied by hand, in order |
| `scripts/` | Local seeding, RLS verification |

## Invariants — these are deliberate, do not "fix" them

- **Never commit problem statements, diagrams or solution text.** AMC problems are MAA
  copyright. Only derived metadata is committed: answer keys, our own topic tags, our
  own ≤12-word descriptors, and deep links. Statements live in the gitignored cache as
  classifier input only. `validate` fails the build if a `statement` field is populated.
- **Answer keys are derived and cross-checked, never typed.** Each solution on a page
  votes once with its boxed (A)–(E) label; agreement sets confidence; anything short of
  unanimous is blocked until a human reviews it. A wrong key is invisible from the app —
  every score and topic rate is quietly wrong and nothing looks broken.
- **`src/lib/store.ts` queries without a `user_id` filter on purpose.** Row-level
  security is what separates students, not query construction. Do not add filters and
  call it defence in depth; it hides a failing policy.
- **Scoring is read per exam, never hardcoded.** Blank credit changed across 2000–01,
  2002–06 and 2007–on, and AMC 8 has no blank credit at all.
- **Topics are joined from the exam database at display time**, not copied onto log
  rows, so correcting a tag retroactively fixes every attempt already recorded.
- **Pages that depend on the signed-in user are `force-dynamic`**, and the local
  development account refuses to start in production.
- **A paper can be sat any number of times.** Each sitting is its own `attempts` row;
  the app numbers them by date. Migration 0003 dropped the unique constraint that
  blocked this.
- **A retake inside 14 days is flagged, and counting it is the student's choice.**
  `attempts.include_in_stats` (migration 0004) drives every aggregate on the dashboard;
  a likely-biased retake defaults to excluded and the checkbox is theirs to override,
  before or after saving. Excluding a sitting never affects the re-solve queue: the
  problems were still missed, and the practice value does not depend on the score being
  comparable.
- **A paper can be sat two ways: answers logged from paper, or against the clock in
  the app.** Both end in the same `ReviewStep`, so scoring and triage cannot drift
  apart. A timed sitting banks elapsed time on every navigation rather than sampling a
  ticker, so totals do not depend on a timer firing or a tab staying in the foreground,
  and it is autosaved to `localStorage` — losing 75 minutes to a refresh is not
  acceptable. `attempts.timings` (migration 0005) holds per-question seconds and visits.
- **Problem statements are shown only when `SHOW_PROBLEM_STATEMENTS=1`, and are never
  committed or served by default.** A private instance may render statements from its
  own `pipeline/.cache`; a public deployment links out instead. The switch is a
  server-side env var, deliberately not `NEXT_PUBLIC_`, so it is a deployment decision
  rather than something a browser can ask for. `renderStatement` escapes every
  character of the source and emits only its own markup plus KaTeX output — the input
  is third-party HTML-ish wikitext, so whitelist, never blacklist. Solutions are never
  rendered, only the problem.
- **Re-solve dates are plain `YYYY-MM-DD` strings, and the column is `date`.** A
  re-solve is due on a calendar day; a timestamp would make "due today" depend on the
  reader's timezone. Failing a re-solve returns the card to stage 0 rather than
  nudging it out: not having the method after three days means it was never learned.

## Conventions

- TypeScript strict. Comments explain *why*, not what the code already says.
- Charts follow the `dataviz` skill: load it before writing any chart code. The palette
  in `globals.css` was validated against this app's surfaces — do not eyeball new colours.
- Verify UI changes by actually running the app and looking at it, not just typechecking.
  Playwright is available. Check both themes and 390px width.

## Active task: populating the problem database

Run on a machine with general internet access — the AoPS wiki is not reachable from the
Claude Code web sandbox.

1. `npm run fetch -- --limit 1` then `npm run extract`
2. **Spot-check ten answers against the published key by hand.** This is the one check
   that cannot be automated and the one failure that is silent.
3. `npm run classify -- --limit 1`, `npm run review`, `npm run validate`
4. If it holds up, drop `--limit` and run the priority set (AMC 10, 2015–2025, ~11 min),
   then commit `data/exams/`.

`classify` uses the Gemini API (`GEMINI_API_KEY`) and defaults to `gemini-flash-latest`;
set `CLASSIFY_MODEL` to a Pro model if flash's tagging quality isn't good enough.

Known-fragile: the wiki transport. `api.php` returns HTML on the real site, so the
fetcher falls back to `index.php?action=raw`. If both fail, the response body is written
to `pipeline/.cache/_last-failure.html` — read it rather than guessing.
