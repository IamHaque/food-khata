# HTTP vault lifecycle

Setup and password login unlock the existing UserVault and migrate account metadata and provider sessions by atomic replacement. Keys are held per browser session in process memory. Logout removes that session key; already submitted sync jobs keep a reference to the cipher capability and a session copy until completion (covered by test_outlives_session_and_discards_keys_at_end). Shutdown stops jobs and clears session keys. A restarted process requires password login before credential access, even with a valid persisted browser cookie.

Disable invalidates browser sessions, cancels jobs in the same application database, and deletes provider sessions. HTTP owner reset and stopped-server CLI recovery use the same reset primitive: delete provider sessions, clear unrecoverable phones, retain local account IDs, names, provider identity digests, archives and analytics, and create a fresh vault. Relinking the same provider identity reuses the account ID. Errors propagate rather than reporting successful recovery after a vault failure. Recovery is not a transaction spanning SQLite and filesystem; an I/O failure requires retry/recovery.

Adoption requires an unlocked vault. Account metadata and sessions are encrypted in place before copies are created, including preexisting legacy-backup folders left without an adoption marker. The live app.db and its SQLite sidecars stay in the root. Analytics is snapshotted with SQLite backup (including committed WAL data); the live legacy analytics database remains in place. A pending marker lets password login resume an interrupted adoption with the same owner ID and key. Setup/registration failures return an error; the committed owner remains available for password login and retry. On unlock, legacy metadata and sessions in the user folder and legacy-backup folders are migrated even without a completed adoption marker. Existing analytics databases and order archives are preserved. Atomic replacement does not promise forensic erasure, nor does this migrate independently created external backups.

Provider identifiers are encrypted because providers may return phone numbers as IDs. A SHA-256 identity digest supports cross-user duplicate detection without another user's key and survives recovery. These digests are equality identifiers, not password hashes: low-entropy provider IDs can be guessed offline.

New analytics imports store only the last four phone digits for masked account labels. Existing analytics databases may retain previously imported full numbers. Order archives may also contain provider-supplied personal data. No analytics/order data is deleted to claim blanket disk phone absence.

## Validation

- `python -m pytest tests/test_jobs.py tests/test_vault_http.py tests/test_owner.py tests/test_user_context.py tests/test_serve_sync.py -q -x`: 45 passed, 8 subtests passed; one existing Starlette/httpx deprecation warning.
- `node scripts/verify.mjs . --full --backend --browser`: guardrails, typecheck, lint, unit, Ruff, pytest and browser all passed (144.94 seconds).
- `node tests/e2e_access/journey.cjs`: FakeProvider journey passed at 1440 and 390 pixels.
- `git diff --check`: passed.

Only synthetic temporary data and FakeProvider were used; no real provider calls or user data were used. Cancellation is cooperative: a provider operation already in progress can take time to return, but cancelled workers do not checkpoint provider credentials. The focused lifecycle suites were rerun after adding that checkpoint guard.


Focused adoption validation for this slice uses live SQLite handles, committed WAL orders,
injected copy/marker failures, preexisting unmarked backups, and synthetic phone/token disk
scans. Existing identifier migration on disk and full lifecycle HTTP evidence remain next
slices; these checks do not establish Gate readiness. The earlier full-suite/browser results
above are historical and were not rerun for this backend adoption change.


Current backend slice verification: `python -m pytest tests/test_user_context.py
 tests/test_owner.py tests/test_vault_http.py tests/test_storage.py tests/test_auth.py
 tests/test_sync.py tests/test_serve_sync.py tests/test_uvicorn_proxy.py tests/test_jobs.py
 tests/test_db.py tests/test_serve_cli.py tests/test_serve_accounts.py -q` passed
99 tests and 8 subtests. After the final backup retention and stale SQLite snapshot
retry changes, user-context, vault-HTTP and owner tests passed again (20 tests).
Ruff and `git diff --check` passed. One existing Starlette/httpx deprecation warning remains.
