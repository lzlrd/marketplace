# .pipeline/ — 4man crew working files (gitignored)

The crew runs as an agent team, so coordination lives in the native shared task list and the
mailbox, not in files. Besides this README, `.pipeline/` holds three working files,
regenerated each run:
- `specs.md`   — the spec, written by the Planner and read by every teammate
- `verdict.md` — the merge verdict, written by the lead from the Reviewer's report
- `run.md`     — the lead's record of the run (start commit, review base, branch, modes,
  snapshots of the work that was already uncommitted), read back after a compaction or a resume

At each commit the lead also writes `user-paths`, `uncommitted-paths`, and `commit-paths`, the
path lists it commits from, afresh each time.

Steering is native too: message the lead and it updates the task list — there is no interject file.
