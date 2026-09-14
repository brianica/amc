# AMC problem database pipeline

Produces `data/exams/*.json`: one file per AMC exam holding the answer key and our own
topic tags. Four resumable stages; only `fetch` and `classify` need network access.

```
npm install
npm run fetch       # 1. cache wikitext        (needs artofproblemsolving.com)
npm run extract     # 2. answers -> data/exams (offline)
npm run classify    # 3. topic tags            (needs api.anthropic.com + credentials)
npm run review      # 4. decide the flagged ones (offline, interactive)
npm run validate    # 5. gate                  (offline)
npm test            # unit tests for the answer parser
```

**Try one exam first.** `--limit N` takes the first N exams, so the whole loop can be
walked through in a couple of minutes and the cost measured before committing an hour
of requests:

```
npm run fetch -- --limit 1
npm run extract
npm run classify -- --limit 1
npm run review
npm run validate
```

Then check the answer key by hand against the real paper before trusting any of it.

`npm run fetch` seeds AMC 10 from 2015 on; add `-- --all` for the full backfill of
AMC 8/10/12 (~131 exams, ~3,275 problems, about an hour at 1 request/second).

## What is and is not committed

Committed: answer keys, topic tags, difficulty, our own ≤12-word descriptors, and deep
links to the source pages. **Never committed:** problem statements, diagrams, or
solution text — those are MAA copyright. They live in `pipeline/.cache/` (gitignored)
purely as input to tagging. `npm run validate` fails the build if a `statement` field
is ever non-null. Students read the problems from their own paper exam.

## Why the answer key is derived, not typed

A wrong answer key silently corrupts every analytic downstream, so answers are taken
from the wiki and cross-checked rather than trusted to one source:

- every `\boxed{...}` in every solution on the page is parsed for its (A)–(E) label
- each solution gets one vote, so a solution boxing three intermediate steps cannot
  outvote two agreeing solutions
- two or more solutions agreeing → `high`; a lone solution → `medium`; any
  disagreement, or a clash with the published answer-key page → `low`
- `low` blocks validation until a human reviews it

## Network

`fetch` needs `artofproblemsolving.com`, which is blocked by the default Claude Code
web sandbox. Run it locally, or create an environment with a permissive network
policy (https://code.claude.com/docs/en/claude-code-on-the-web). Everything is cached,
so the other stages then run anywhere.

## Cost of classification

`classify` runs two passes per problem — one seeing the worked solutions, one seeing
only the statement — because agreement between different inputs is real evidence,
where re-running one prompt twice only measures sampling noise. Disagreement flags the
problem for review.

Defaults to `claude-opus-5`. For ~3,275 problems × 2 passes this is the accuracy-first
choice; set `CLASSIFY_MODEL=claude-haiku-4-5` to trade some accuracy for a much
cheaper run. Every call is cached by content hash, so re-runs are free.
