# .pipeline/ — 4man crew working files (gitignored)

Handoff bus between the crew. Regenerated each run.
- `specs.md`            — Planner → Coders
- `changes.<unit>.md` → merged into `changes.md` — Coders → Testers
- `test-results.<unit>.md` → merged into `test-results.md` — Testers → Reviewer
- `verdict.md`          — written by the orchestrator from the Reviewer's verdict
