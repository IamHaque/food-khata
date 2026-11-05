# E1 filters and metrics result

Implemented `Filters` (Pydantic v2), `build_where(filters) -> (SQL, params)`,
`compute_metrics(conn, filters) -> dict`, and `monthly_totals(conn, filters) -> list[dict]`.
See `docs/METRICS.md` for scope, meal hours, refund treatment, and rounding.
Added the optional `serve` dependency extra and synthetic AnalyticsDB tests.
Requested pytest command: 6 passed. Ruff check and format check: passed for all
five Python files. No real database or private data accessed. API integration and
other suites were outside this task and not checked.
