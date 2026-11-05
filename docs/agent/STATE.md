# Migration state
## Standing rules
- Precedence: BRIEF_BROWNFIELD > orchestrator (currently docs/BRIEF.md) > earlier brief.
- Never modify login/session/sync/locking/archive/ingest or .food-khata/accounts/.
- Never open, print, log or copy sessions/*.json.
- No phones, addresses or order payloads in logs, reports, screenshots or commits.
- Source DB read-only; schema/parse changes need an approved proposal.
- Loopback only; no telemetry or external data requests.
- Python 3.11 and 3.14; Windows/PowerShell primary.
- Advertised savings and bill discounts stay separate.
- lifetime_complete never triggers warnings; scope history/details warnings.
- No deletions without approved REMOVALS.md and tested replacements.
- Old UI/export stay working until parity and approved retirement.
## Current phase / epic / story
E-1 / BASE-03: safety guard prepared; baseline and audit pending.
## In progress
BASE-03-T1 / safety worker / dashboard-v2: verify and commit safety guard.
## Pending
1. Supply missing technical brief and approve screenshot dataset.
2. BASE-01 baseline checks and approved-data screenshots.
3. BASE-02 inventories and migration plan.
4. Human STOP: approve MIGRATION_PLAN.md.
## Blocked
Screenshot dataset approval not yet supplied; do not use private data.
Full technical brief missing: docs/BRIEF.md contains the orchestrator prompt itself.
## Done recently
BASE-03 committed 72dcc0b; safety tag and branch created; root reverified guard.
## Open questions for the human
Provide the technical/design brief referred to by the orchestrator and approve a synthetic screenshot dataset.
## Environment notes
Git writes require sandbox escalation. Never inspect account/session files.
## Last verified
2026-11-06: Python 3.14 uv environment: 55 passed + 10 subtests; Ruff check/format pass (33 files); npm 7 pass; build passes (bundle warning). Guard self-check/staged/tracked scans pass. Python 3.11/browser/a11y not run. Git tree contains only attributed audit docs.

