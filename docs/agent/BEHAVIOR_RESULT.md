# Behavior result

Added charts.behavior: timing_unavailable_reason, date_unavailable_reason, hour_weekday, meals, day_type, aov_histogram, gaps, longest_streak, longest_gap, orders_per_week. Rows carry aggregate counts and delivered spend only; no identifiers.

Verification: 91 tests passed with uv dev/serve extras and temporary httpx2; Ruff check passed. Synthetic behavior test covers empty scope, account filter, missing timing, weekend, meal boundaries and streak/gap.

Limits: multi-item filtering and fractional-money reconciliation need dedicated behavior tests; existing dashboard overview behavior on malformed dates was not independently verified. OpenAPI was not regenerated.
Root verification:93tests+10subtests/Ruff pass with dedicated multiitem/fractional and malformed-dashboard tests. Datasets with >80% missing timing/date inputs are omitted with reasons.
