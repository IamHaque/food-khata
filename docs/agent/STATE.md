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
E6 page completion active; user authorizes intermediate checkpoints until final review.
## In progress
Root continuing locally. Cancellation requested for Terra Food/Spending and DataPages tasks after Gemini-only instruction; clean git confirmed, no partial edits. Gemini delegation blocked by prior enforced-scope rule; no transfer.
## Pending
1. Food/Spending datasets and remaining page views (root local).
2. Anomaly shortcut and final modal/Overview visual polish (root).
3. Parity passed6e86ee2; rerun after remaining serverchanges.
4. Dependency findings, responsive/a11y checks and documentation.
5. Final a11y/responsive/stress checks and removal proposals.
## Blocked
No execution blocker. Destructive removals and protected parser/schema edits remain separately approval-gated.
## Done recently
- BASE-03 72dcc0b: guard, initial briefs/state/backlog; root reverified.
- BASE-02 draft 689afa9: baseline/source inventory.
- BASE-01 4b83f33: generated 3-account/36-month synthetic export, 8 screenshots/axe/contrast and existing functional browser suite; root reran.
- DATA-01 4b83f33: local read-only aggregate profile plus privacy/output-alias tests; root reran.
- BASE-02 4b83f33: final migration plan/source inventory; E-1 review: Terra Medium; root fixed DB-output alias and raster guard gaps.
## Open questions for the human
Nothing during implementation; final review pending. No deletion approval inferred.
## Worker constraint
Sub-agents: Gemini3.8Flash Medium/High ONLY (latest user override). No other models. Gemini Git-only scoping remains mandatory; current harness cannot enforce it, so root works locally and transfers nothing.
## Environment notes
Git/build/browser/uv execution needs sandbox escalation. Default Python lacks test tools; use temporary uv dependencies (pytest, ruff, requests, questionary, curl_cffi).
Python 3.11 unavailable locally; covered by configured Windows/Linux CI, no remote pass asserted.
Synthetic generated output: .test-tmp/synthetic/dashboard.json. Screenshots/results: dashboard-ui/test-results/synthetic-baseline/ (ignored).
Axe 4.10.3 via local cache; reproduce with commands in BASELINE_BROWSER.md. Chrome installed at C:/Program Files/Google/Chrome/Application/chrome.exe.
Gemini not used: shared checkout cannot enforce git-only snapshot scope; no transfer or transfer scan performed.
## Last verified
2026-11-06 root: pytest 97 passed +10 subtests; Ruff lint/format pass (one Starlette/httpx warning); npm test 7 pass; build pass (existing 826.85kB JS warning); functional browser suite pass; 8 synthetic captures/axe complete; generator self-check and loader validation pass; profile regenerated locally; guard self-check/tracked/staged checks pass.
Baseline defects: axe heading-order moderate and scrollable-region-focusable serious at all 8 states; light primary text/focus/5 chart-color contrast failures; axe incomplete contrast requires later manual review. No app fixes.
Lint script/tsc setup absent in existing frontend; establish in foundation phase. API core now present and verified; real parity not run yet.
Working changes attributed to current Places/Overview/modal slices; no private data staged. Generated unrequested uv.lock ignored, retained without deletion.




















