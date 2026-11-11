# Performance

See [RUNBOOK.md](RUNBOOK.md) for operational targets and troubleshooting.

## Method

Mixed browser + sync load against a real in-process server using synthetic data only
(FakeProvider, no network). See `scripts/load_test.py`.

## Machine

- CPU: TBD (filled by load_test.py)
- RAM: TBD (filled by load_test.py)

## Mixed load table

<!-- mixed-load -->
| Endpoint | p50 ms | p95 ms | p99 ms | n |
|---|---|---|---|---|
| /api/dashboard | 3320.5 | 7437.1 | 9469.3 | 64 |
| /api/orders | 31.8 | 57.7 | 99.9 | 64 |
| /api/meta/filters | 282.4 | 331.3 | 341.4 | 64 |
| /api/items | 151.3 | 267.2 | 282.8 | 64 |
| 5xx total | 0 | locked | 0 | total 256 |
<!-- mixed-load -->

## Kill test result

TBD

## Soak table

TBD

## Dashboard table

| State | Before | After |
|---|---|---|
| Cold (all sections) | 5240 ms | 796 ms |
| Cold (per section) | 276-361 ms | 276-361 ms |
| Cached | 43 ms | 43 ms |

## Section 2 targets

| Target | Goal | Measured |
|---|---|---|
| p95 dashboard | <= 1000 ms | TBD |
| p95 orders | <= 500 ms | TBD |
| Memory growth (30 min) | <= 10% | TBD |
| Zero 5xx under load | 0 | TBD |
| Zero "database is locked" | 0 | TBD |
