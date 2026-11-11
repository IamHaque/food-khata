# PR-12 evidence report: dashboard/meta query performance

Synthetic DB: 20,000 orders / 46,505 items (seed 42, `scripts/make_dev_db.py --large` patched to 20k, no network).
Baseline indexes present: `idx_orders_date/status/platform/account/restaurant`, `idx_items_order/name`.
Measured with FastAPI `TestClient` + `authenticate_client`, `create_app(db, legacy_single_db=True)`, `sqlite3` trace callback. 5-run medians.

## Endpoint query counts (trace callback)

| Endpoint | SQL statements |
|---|---:|
| GET /api/meta/filters | 11 |
| GET /api/meta/data-health | 16 |
| POST /api/dashboard | 110 |
| GET /api/restaurants | 3 |
| GET /api/items | 45 |

## Endpoint wall time (5-run median ms)

| Endpoint | Before |
|---|---:|
| filters | 159.3 |
| data-health | 182.4 |
| dashboard | 5452.8 |
| restaurants | 53.4 |
| items | 185.1 |

## Candidate indexes (proposed)

Applied one at a time to a copy of the same DB.

| Index | filters | data-health | dashboard | restaurants | items |
|---|---:|---:|---:|---:|---:|
| baseline | 159.3 | 182.4 | 5452.8 | 53.4 | 185.1 |
| + idx_orders_account_platform_date | 149.1 | 169.1 | 5125.1 | 50.1 | 177.3 |
| + idx_items_order_category | 150.4 | 167.6 | 5192.9 | 52.4 | 182.4 |
| + both | 155.2 | 170.5 | 5244.5 | 54.5 | 178.2 |

No query plan switched to either proposed index under the default `status=DELIVERED` workload; deltas are within run noise (~5%). Both indexes target account/platform/date and item category, which the measured endpoints do not filter on.

## Top slowest unique queries (median ms, standalone)

| ms | rows | SQL (short) |
|---:|---:|---|
| 104.35 | 1 | `COUNT(DISTINCT i.item_name) FROM order_items i WHERE EXISTS (orders o ... status='DELIVERED')` |
| 38.70 | 39956 | `o.order_date,i.is_veg,i.quantity FROM order_items i JOIN orders o ...` |
| 35.84 | 17212 | `d.normalized_label,d.city,... FROM orders o LEFT JOIN restaurants r LEFT JOIN delivery_addresses d` |
| 34.47 | 17212 | `o.id,o.order_date,r.id,r.name,... FROM orders o LEFT JOIN restaurants r` |
| 31.35 | 1 | `COUNT(*),COUNT(DELIVERED),SUM(final_amount_paid),... FROM orders o LEFT JOIN restaurants r` |

## N+1 patterns

- `/api/items`: after the 2 aggregate queries, one price-trend query per returned item (42 items × 3.68 ms ≈ 155 ms) — `substr(o.order_date,1,7)... WHERE ... AND i.item_name=?`.
- `kpi_history`: `compute_metrics` (incl. the 104 ms distinct-item correlated subquery) is called once per month (36×) plus comparison/remaining → ~40 executions ≈ 4 s of the dashboard's 5.4 s.

## Unbounded response

- `GET /api/orders/slim`: no LIMIT/pagination; returns 17,212 rows in 88 ms on this DB.

## Per-endpoint unique query plans (selected)

filters (10 unique, all `SCAN o` / temp B-trees): distinct account/platform/status/city/locality/cuisine/payment; account aggregate 24.04 ms.
data-health (15 unique): all status-index searches; correlated duplicate check and item null rates.
dashboard (35 unique): status-index searches; `SCAN i USING INDEX idx_items_name` for distinct item count (104 ms); large row scans for food/places/behavior.
restaurants (2 unique): group-by restaurant, 27–29 ms.
items (3 unique + 42 trend queries): group-by item 27 ms; trends 3.68 ms each.

## Skipped / risk

- Only default filters measured (`status=DELIVERED`, no account/platform/date filters); proposed indexes may help filtered workloads but were not exercised.
- `EXPLAIN QUERY PLAN` gives no row-scan counts; reported rows are result rows from standalone runs.
- DB is synthetic (uniform-ish data); real distributions may differ.
