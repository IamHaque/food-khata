# Decisions
1. 2026-11-06: Brownfield branch dashboard-v2 overrides orchestrator dev branch.
2. 2026-11-06: User authorized both initial briefs in first commit.
3. 2026-11-06: docs/BRIEF.md is the orchestrator prompt; referenced technical sections are unavailable. Do not invent design requirements.
4. 2026-11-06: Routed pages and Account terminology follow brownfield decisions; no UI changes before audit.
5. 2026-11-06: Technical BRIEF.md supplied; orchestrator source preserved as docs/agent/ORCHESTRATOR_PROMPT.md from 72dcc0b. Earlier missing-source blocker resolved.
6. 2026-11-06: Brownfield sequencing overrides technical greenfield phases/scaffolding/Makefile; centered order modal overrides side sheet. Existing UI remains until parity. Technical sections now define filters, metrics, endpoints and design/DoD.
7. 2026-11-06: User approves only generated synthetic screenshot data; no real DB/export rendering. Generator writes ignored .test-tmp output, scripts may be committed.
8. 2026-11-06: Gemini shared-checkout access cannot enforce git-only scope; no transfer performed. Use local Terra workers for baseline/profile; no external secret/PII scan needed because nothing shared.
9. 2026-11-06: DATA-01 is pulled into E-1 at explicit user request. Aggregate reports may include counts/rates/distributions but no raw identities or order contents.
10. 2026-11-06: Local profile confirms existing reconciliation uses net stored delivery fee and food_discount, while the technical illustrative formula subtracts total_discount/refunds. Preserve ingestion and current INR1 flags. Future metrics/parity must explain this difference before changing displayed reconciliation; no parser changes authorized.
11. 2026-11-06: Independent E-1 review safety findings fixed: report output cannot alias source DB; commit guard rejects all raster extensions because filenames cannot prove data provenance. Synthetic captures remain local/ignored.
12. 2026-11-06: Existing browser test gains network containment for safe synthetic-only functional baseline; all existing scenarios pass. No application behavior changed.
13. 2026-11-06: User authorizes implementation through intermediate STOPs, final review at end. No specific removal list/schema/parser proposal approved; prepare replacements and evidence while retaining legacy/export.
14. 2026-11-06: Cuisine filter uses restaurants.cuisine (item category is a different field). Serve minimums Pydantic2.12, FastAPI0.118.3, Uvicorn0.38 follow official Python3.14 support releases: https://pydantic.dev/articles/pydantic-v2-12-release https://fastapi.tiangolo.com/release-notes/ https://uvicorn.dev/release-notes/ .
15. 2026-11-06: User overrides escalation policy: all future workers GPT-6.1 Terra Medium or Low only; never High/Max. Split tasks if needed.
16. 2026-11-06: Parity uses all-status counts, delivered money/AOV, net stored delivery fees and all-scope refunds. Restaurant parity compares listing identity/spend totals, while legacy leaderboard grouped case-insensitive names and ranked by count; these are distinct views, not unexplained numerical mismatches. Root local run zero mismatches; all values remain ignored parity.local.md.
17. 2026-11-06: Preserve implicit DELIVERED default in URL until user chooses a status. Opening Ledger without explicit status sets shared all-status scope; this keeps filter controls and ledger consistent while showing complete history. Explicit status URLs remain unchanged.
18. 2026-11-06: Gemini3.8Flash Medium/High-only supersedes Terra worker preference. Prior Gemini git-only/scanned-file enforcement still applies; no repository transfer while harness cannot enforce scope. Root local fallback explicitly authorized earlier remains in effect.

2026-11-06: Restaurant count now follows normalized name+locality from the technical brief; listing identity remains an explicit leaderboard option. Root retains local-only execution under the Gemini transfer boundary. Router patched to 7.18.5; nine moderate development-only lint-chain audit findings remain after compatible fixes, with no forced transitive major override.
