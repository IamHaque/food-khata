# Ledger progress
Root implemented server-side TanStack Table v8 page, global scope, stable server sort URL, page sizes, full-scope footer total, visibility/density, masked account column in All accounts, row keyboard selection and local CSV export across all server pages.
Default status is implicit in overview URL; entering Ledger without explicit status writes all-status scope globally. Explicit status selection remains respected. No separate account math path.
Root verified7Node+11Vitest,typecheck/lint/build and synthetic browser sort/pagination/all-rowCSV/keyboard/360containment. CSV quoting/formula protection, aborted export and multipage scope have tests.
Remaining: centered bill modal, adjacent navigation, anomaly shortcut, full modal browser walkthrough and fine a11y/polish. Fees currently display stored delivery/packaging/platform components; add server aggregate field before final table acceptance. No browser financial aggregation.
