# AMC Error & Diagnostic Tool

An online log for students taking past AMC 8/10/12 papers under timed conditions. It
records what they got wrong and why, and builds a picture over many exams of which
topics they are strong and weak in — the thing a raw score cannot tell them.

Each student has their own account, so the diagnosis accumulates across every practice
exam they log.

- `problem.md` — the original problem statement and market research
- `pipeline/` — builds the pre-tagged problem database ([how it works](pipeline/README.md))
- `data/` — the committed database: taxonomy and per-exam answer keys + topic tags

Status: the problem database pipeline is built and tested. The web app is next.
