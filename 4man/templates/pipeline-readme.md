# .pipeline/ — 4man crew working files (gitignored)

The crew runs as an agent team, so coordination lives in the native shared task list and the
mailbox, not in files. `.pipeline/` holds only the two durable documents, regenerated each run:
- `specs.md`   — the spec, written by the Planner and read by every teammate
- `verdict.md` — the merge verdict, written by the lead from the Reviewer's report

Steering is native too: message the lead and it updates the task list — there is no interject file.
