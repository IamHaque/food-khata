# Parity harness
Implemented scripts/parity_check.py and three synthetic tests. Compares export-path calculations independently with local TestClient API: headline metrics, per-account/platform splits, monthly spend, top ten restaurant listing totals/count.
Run: uv run --with requests --with questionary --with curl_cffi --with fastapi --with uvicorn --with httpx --no-project python scripts/parity_check.py .food-khata/food_analytics.db
Output fixed to git-ignored docs/agent/parity.local.md; no identity values in the report or business numbers on stdout. Output alias/ignore guards tested; deliberate API discrepancy detected. Source path remains read-only and version changes abort results.
Root ran live locally: zero mismatches. Restaurant comparison uses identity/spend listing semantics, not legacy name/count rank. No real export written and no screenshot taken. Optional remote API mode omitted; in-process local API exercises real endpoint contracts without a server.
