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
- No deletion without approved REMOVALS and tested replacements.
- Old UI/export remain working until parity and approved retirement.
- Screenshots synthetic only; no .food-khata-derived captures or fixtures.
## Current phase / epic / story
E-1 complete; DATA-01 pulled forward and complete. STOP for MIGRATION_PLAN approval.
## In progress
None. Local workers finished and root verification completed.
## Pending
1. Human approval of docs/MIGRATION_PLAN.md (STOP; do not implement before approval).
2. DATA-02 proposed SQL measured against future query plans (Terra Medium).
3. CLI-01 optional read-only serve contract/dispatch (Terra Medium).
4. FILT-01/MET-01/MET-02 shared filtering and metrics (Terra Medium).
5. API-01/CI-01 schemas/types and supported runtime checks (Terra Low/Medium).
## Blocked
No execution blocker; waiting at requested human approval checkpoint.
## Done recently
- BASE-03 72dcc0b: guard, initial briefs/state/backlog; root reverified.
- BASE-02 draft 689afa9: baseline/source inventory.
- BASE-01 4b83f33: generated 3-account/36-month synthetic export, 8 screenshots/axe/contrast and existing functional browser suite; root reran.
- DATA-01 4b83f33: local read-only aggregate profile plus privacy/output-alias tests; root reran.
- BASE-02 4b83f33: final migration plan/source inventory; E-1 review: Terra Medium; root fixed DB-output alias and raster guard gaps.
## Open questions for the human
Approve MIGRATION_PLAN.md. No removal approval requested.
## Environment notes
Git/build/browser/uv execution needs sandbox escalation. Default Python lacks test tools; use temporary uv dependencies (pytest, ruff, requests, questionary, curl_cffi).
Python 3.11 unavailable locally; covered by configured Windows/Linux CI, no remote pass asserted.
Synthetic generated output: .test-tmp/synthetic/dashboard.json. Screenshots/results: dashboard-ui/test-results/synthetic-baseline/ (ignored).
Axe 4.10.3 via local cache; reproduce with commands in BASELINE_BROWSER.md. Chrome installed at C:/Program Files/Google/Chrome/Application/chrome.exe.
Gemini not used: shared checkout cannot enforce git-only snapshot scope; no transfer or transfer scan performed.
## Last verified
2026-11-06 root: pytest 57 passed +10 subtests; Ruff lint/format pass; npm test 7 pass; build pass (existing 826.85kB JS warning); functional browser suite pass; 8 synthetic captures/axe complete; generator self-check and loader validation pass; profile regenerated locally; guard self-check/tracked/staged checks pass.
Baseline defects: axe heading-order moderate and scrollable-region-focusable serious at all 8 states; light primary text/focus/5 chart-color contrast failures; axe incomplete contrast requires later manual review. No app fixes.
Lint script/tsc setup absent in existing frontend; establish in foundation phase. No new API/parity run yet.
Working changes are attributed E-1 artifacts and user-supplied technical brief; no data staged. Evidence committed as 4b83f33; clean checkpoint metadata committed with this update.

