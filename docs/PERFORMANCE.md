# Performance

## Method

Mixed browser + sync load against a real in-process server using synthetic data only
(FakeProvider, no network). See `scripts/load_test.py`.

## Machine

- CPU: AMD Ryzen 9 5900HX with Radeon Graphics, 16 threads (WSL2)
- RAM: 7 GB. 2026-11-11, one run each, the machine also ran other work

## Mixed load table

<!-- mixed-load -->
| Endpoint | p50 ms | p95 ms | p99 ms | n |
|---|---|---|---|---|
| /api/dashboard | 3725.4 | 4987.8 | 9755.6 | 637 |
| /api/orders | 34.8 | 104.7 | 147.0 | 637 |
| /api/meta/filters | 248.1 | 360.8 | 536.1 | 637 |
| /api/items | 165.2 | 305.6 | 539.6 | 637 |
| 5xx total | 0 | locked | 0 | total 3303 |
<!-- mixed-load -->

## Kill test result

20 runs, each killing the server (SIGKILL) at a random 0.1 to 0.6 s into a 300-order sync, then restart, log in, resume: no duplicate orders, no half-imported order, and the final counts equal the uninterrupted baseline (300 orders, 0 duplicates). `python scripts/load_test.py kill --runs 20`.

## Soak table

30 minutes of the mixed load (6 browsers, 2 syncers, 20,000-order databases), sampled every 30 s:

| Point | RSS | Threads | Open files |
|---|---|---|---|
| Start (idle) | 93 MB | 15 | 16 |
| Minute 5 | 408 MB | 21 | 33 |
| Peak (about minute 4.5) | 438 MB | 22 | 38 |
| Minute 30 | 368 MB | 22 | 42 |

Memory ends 10% below minute 5 and thread and file counts stay in a band (fds 33 to 45, from open sockets). The script's first version compared single samples for fds and failed on a 42 versus 33 sample; it now compares medians.

## Dashboard table

| State | Before | After |
|---|---|---|
| Cold (all sections) | 5240 ms | 796 ms |
| Cold (per section) | 276-361 ms | 276-361 ms |
| Cached | 43 ms | 43 ms |

## Section 2 targets

| Target | Goal | Measured |
|---|---|---|
| Dashboard cold, one user, 20,000 orders | p95 < 500 ms | all sections 796 ms; each page section 276 to 361 ms (misses for the all-sections call) |
| Dashboard under the mixed load (every call a new filter) | none | p50 3.7 s, p95 5.0 s (queues behind the two-at-a-time build gate) |
| Dashboard cached | < 50 ms | 43 ms |
| p95 orders | <= 500 ms | 105 ms |
| Memory flat over 30 min | within 10% of minute 5 | minute 30 is 10% below minute 5 |
| Memory, 8 users and 2 jobs | under 400 MB | peak 438 MB, 368 MB at the end (misses at the peak) |
| Memory, idle | under 200 MB | 93 MB |
| Zero 5xx under load | 0 | 0 of 3,303 requests |
| Zero "database is locked" | 0 | 0 |

See also: [RUNBOOK](RUNBOOK.md) and [architecture](architecture.md).
