# Migration state
## Sources (precedence order)
- docs/BRIEF_BROWNFIELD.md
- docs/agent/ORCHESTRATOR_PROMPT.md
- docs/BRIEF.md (technical brief, re-read 2026-11-06)
## Standing rules
- Brownfield > orchestrator > technical brief; migrate in place, no redesign/scaffold.
- Never modify login/session/sync/locking/archive/ingest or .food-khata/accounts/.
- Never open, print, log or copy sessions/*.json.
- No real phones, addresses or order payloads in logs/reports/screenshots/commits.
- Source DB read-only; parser/schema changes need approved proposals.
- Loopback only; no telemetry/external data requests.
- Python 3.11/3.14 compatible; Windows/PowerShell primary.
- Advertised savings and explicit bill discounts remain separate.
- lifetime_complete never warns; history/details warnings scoped to account.
- No deletion without approved REMOVALS and tested replacements; final approval retained.
- Old UI/export remain working until parity and approved retirement.
- Screenshots synthetic only; no .food-khata-derived captures or fixtures.
## Current phase / epic / story
Dashboard Redesign (docs/agent/REDESIGN_PLAN.md): Stories R01 through R11 COMPLETE and verified.
## In progress
None. All redesign stories delivered.
## Pending
None. Release gate verified.
## Blocked
None.
## Done recently
- feat(ui): complete overhaul of v2 UI using Tailwind CSS tokens and shadcn design system primitives.
- Fixed root cause of unstyled UI: imported `style.css` in `src/entry.tsx` and synchronized dark/light mode class toggles.
- Redesigned FilterBar, Overview KPI cards with sparklines, Ledger table, OrderModal digital receipt, and responsive mobile layout.
- Added global keyboard navigation in OrderModal (Escape, ArrowLeft, ArrowRight) and fixed focus retention on navigation buttons.
- 07052bf: analytics details, diet-month, bill modal keyboard region, targeted minimatch override, full verification.
- f26942b: seven-page analytics, router, typed page datasets.
- 4b83f33: E-1 baselines, synthetic screenshots/axe runs, local aggregate profile, staged guard.
## Open questions for the human
Feedback on the redesigned Tailwind/shadcn UI (screenshots provided below).
## Worker constraint
Sub-agents: Gemini 3.8 Flash Medium/High ONLY per user constraint. All root verification performed locally.
## Environment notes
Run Python tests with `uv run --extra dev --extra serve --with httpx python -m pytest -q` or virtualenv.
Default Python lacks test tools; uv manages dependencies. Python 3.11 tested in CI.
Synthetic data only for visual testing; no real data in screenshots or commits.
## Last verified
2026-11-06: Playwright synthetic foundation tests passing; Vitest (12 tests) + Node test suite (7 tests) passing; tsc/lint/build clean; pytest 105 passed, 10 subtests passed, 1 warning (Starlette httpx); Ruff check/format clean; staged-file guard clean.

