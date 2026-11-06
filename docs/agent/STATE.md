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
Root local: E6 typed pages implemented; E7 final coverage/polish remains. No delegate transfer.
## Pending
1. Remaining visual/detail gaps, final modal stress and responsiveness.
2. Final a11y matrix after command palette and navigation changes.
3. README/architecture/migration plan and final backlog reconciliation.
4. Removal proposal for final human review; no deletion approved.
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
2026-11-06 root: pytest104 passed +10 subtests; Ruff lint/format pass; Node7+Vitest12 pass; typecheck/lint/build pass. Local read-only parity0 mismatches (ignored report only).
Synthetic seven-page browser suite passes; 56 page/theme/width screenshot+axe states pass without serious/critical findings or overflow after dark-link contrast fix. Palette/navigation additions awaiting final rerun.
Warnings: Starlette/httpx deprecation, dual legacy/new chart bundle size; nine moderate dev lint-chain audit findings remain. Router production findings fixed7.18.5. Python3.11 unavailable locally; CI configured, no remote pass claimed.
All working changes attributed to E6/E7; no private data staged. Legacy retained, uv.lock ignored and retained.
