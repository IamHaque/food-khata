# HTTP vault lifecycle

Setup and password login unlock the existing UserVault and migrate account metadata and provider sessions by atomic replacement. Keys are held per browser session in process memory. Logout removes that session key; already submitted sync jobs keep their independent key/session copies until completion (covered by test_outlives_session_and_discards_keys_at_end). Shutdown stops jobs and clears session keys. A restarted process requires password login before credential access, even with a valid persisted browser cookie.

Disable invalidates browser sessions, cancels jobs in the same application database, and deletes provider sessions. HTTP owner reset and stopped-server CLI recovery use the same reset primitive: delete provider sessions, clear unrecoverable phones, retain local account IDs, names, provider identity digests, archives and analytics, and create a fresh vault. Relinking the same provider identity reuses the account ID. Errors propagate rather than reporting successful recovery after a vault failure. Recovery is not a transaction spanning SQLite and filesystem; an I/O failure requires retry/recovery.

On unlock, legacy metadata and sessions in the adopted user folder and its recorded legacy-backup are encrypted with the user's vault key. Existing analytics databases and order archives are preserved. Atomic replacement does not promise forensic erasure, nor does this migrate independently created external backups.

Provider identifiers are encrypted because providers may return phone numbers as IDs. A SHA-256 identity digest supports cross-user duplicate detection without another user's key and survives recovery. These digests are equality identifiers, not password hashes: low-entropy provider IDs can be guessed offline.

Scope decision: analytics phones remain in SQLite. Evidence: food_khata/db.py accounts.phone is NOT NULL and ingest_account persists it; serve/app.py uses it in account filters and masked order labels. This patch protects vault/account credential metadata and session files, not the entire analytics dataset. Encrypting SQLite or changing these consumers is a separate data-format migration. Order archives may also contain provider-supplied personal data. No analytics/order data is deleted to claim blanket disk phone absence.

## Validation

- `python -m pytest tests/test_jobs.py tests/test_vault_http.py tests/test_owner.py tests/test_user_context.py tests/test_serve_sync.py -q -x`: 45 passed, 8 subtests passed; one existing Starlette/httpx deprecation warning.
- `node scripts/verify.mjs . --full --backend --browser`: guardrails, typecheck, lint, unit, Ruff, pytest and browser all passed (144.94 seconds).
- `node tests/e2e_access/journey.cjs`: FakeProvider journey passed at 1440 and 390 pixels.
- `git diff --check`: passed.

Only synthetic temporary data and FakeProvider were used; no real provider calls or user data were used. Cancellation is cooperative: a provider operation already in progress can take time to return, but cancelled workers do not checkpoint provider credentials. The focused lifecycle suites were rerun after adding that checkpoint guard.
