# Food Khata

A local CLI and analytics web application for saving, normalizing, and visualizing your Zomato and Swiggy food order history.
Log in or reuse active sessions, sync new orders incrementally, ingest order history into a local SQLite analytics database, and explore rich analytics through an interactive web dashboard.

## First-Hour Path (Quickstart with Synthetic Data)

Test the complete install, build, claim, link, sync, and backup cycle locally without real credentials or network access:

```bash
# 1. Install dependencies and build dashboard UI
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e ".[serve]"
npm --prefix dashboard-ui ci && npm --prefix dashboard-ui run build

# 2. Start server on a throwaway data directory with the fake provider switch
FOOD_KHATA_ENABLE_FAKE_PROVIDER=1 food-khata serve --data-dir /tmp/fk-demo

# 3. Open http://127.0.0.1:8765 in your browser and claim the owner account
# (Passwords must be at least 10 characters long).

# 4. Link an account: Choose "fake" provider, enter phone 9876543210 and OTP 123456.

# 5. Sync orders: Click sync; background job fetches and imports synthetic orders.

# 6. View dashboard: Explore Overview, Spending, Food, Behavior, Places, Ledger, and Data Health.

# 7. Take a hot backup while the server runs:
food-khata backup --out /tmp/demo-backup.tar.gz --data-dir /tmp/fk-demo

# 8. (Optional) Verify restore into an empty directory and clean up test data:
food-khata restore /tmp/demo-backup.tar.gz --data-dir /tmp/fk-restored
food-khata purge-fake --data-dir /tmp/fk-demo --yes
```

---

## Commands & Configuration

The CLI entrypoint is `food-khata` (or `python -m food_khata`). Every flag also reads an environment variable named `FOOD_KHATA_<FLAG>` (for example `FOOD_KHATA_PORT=9000`, `FOOD_KHATA_LAN=1`); explicit CLI flags always win.

- **`food-khata serve`**:
  Starts the FastAPI backend and serves the dashboard UI at `http://127.0.0.1:8765`.
  - `--host`: Host to bind to (default: `127.0.0.1`; binds `0.0.0.0` when `--lan` is specified).
  - `--port`: Port to listen on (default: `8765`).
  - `--data-dir PATH`: Private data root (default: `.food-khata/`).
  - `--lan`: Allow LAN access. Binds `0.0.0.0` and prints a one-time 10-character setup code (valid 30 minutes) at start; non-loopback claim requires it (5 wrong attempts in 10 minutes return HTTP 429).
  - `--allow-host HOST`: Add allowed Host header (repeatable or comma-separated).
  - `--provider-concurrency swiggy=1,zomato=1`: Maximum active sync jobs per provider (default 1 each).
  - `--trusted-proxy ADDR`: Read client IP from `X-Forwarded-For` only when connected from `ADDR`.
  - `--behind-https-proxy`: Mark session cookies `Secure` behind a TLS-terminating reverse proxy.
  - `--tls-cert PATH`, `--tls-key PATH`: Paths to TLS certificate and private key for HTTPS.
  - `--print-config`: Print effective runtime settings and exit.
  - `--dev`: Log slow requests taking over 150 ms.

- **`food-khata`** or **`food-khata sync`**:
  Interactive terminal sync: account selection, login/refresh, smart order sync, and SQLite update.

- **`food-khata ingest`**:
  Migrates all saved order JSONs across accounts into `food_analytics.db` without network requests.

- **`food-khata export`**:
  Exports complete dashboard data into `dashboard.json` for offline viewing in the `/legacy` view.

- **`food-khata backup --out FILE --data-dir DIR`**:
  Hot snapshot of all SQLite databases (using SQLite's online backup API), archives, vaults, and a SHA-256 manifest. Safe to run while the server is active.

- **`food-khata restore FILE --data-dir EMPTY_DIR`**:
  Verifies all SHA-256 checksums from the backup manifest and unpacks into an empty directory (refuses non-empty folders).

- **`food-khata purge-fake --data-dir DIR`**:
  Removes synthetic test accounts and associated database records created with `fake` provider (`--yes` skips prompt).

- **`food-khata owner reset-password`**:
  Offline password reset for the instance owner or a specified user directly in `app.db` (stop server first).

- **`food-khata owner transfer`**:
  Offline ownership transfer directly in `app.db` (stop server first).

---

## Data Layout & Multi-User Architecture

Data is stored in the `--data-dir` directory (default `.food-khata/`):

```text
<data>/
  .server.lock            <-- Exclusive OS file lock (exit code 2 if locked)
  app.db                  <-- Global server database: users, sessions, jobs,
                              job_events, provider_links, audit_log, schema_migrations
  logs/
    food-khata.log        <-- Structured JSON lines, redacted secrets (10 MB x 5)
  users/
    <user-id>/            <-- Isolated per-user directory (mode 0700)
      vault.json          <-- ChaCha20-Poly1305 encrypted data key wrapped by password
      food_analytics.db   <-- Relational SQLite database: orders, items, restaurants
      accounts/
        <local-account-id>/
          account.json    <-- Encrypted phone metadata, SHA-256 provider digests
          zomato-history.json  <-- Plain JSON order and detail archive
          swiggy-history.json  <-- Plain JSON order and detail archive
          sessions/
            zomato.json   <-- ChaCha20-Poly1305 encrypted tokens
            swiggy.json   <-- ChaCha20-Poly1305 encrypted cookies
```

See [Architecture & Storage](docs/architecture.md) for complete schema, database migrations, and component details.

---

## Security Baseline

- **Cookie-Only Authentication**: Authentication uses `food_khata_session` cookies only (`HttpOnly`, `SameSite=Lax`). `Secure` is enabled under TLS or with `--behind-https-proxy`. Bearer tokens and header sessions are rejected.
- **CSRF Protection**: State-changing operations require matching `x-csrf-token` header and cookie.
- **Headers & Limits**: CSP (`default-src 'self'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. Request bodies are limited to 64 KB.
- **Passwords & Lifetimes**: Minimum 10 characters. Sessions have an 8-hour idle timeout and 7-day absolute lifetime. All sessions are deleted on server start (re-login required after restart).
- **Audit Trail**: Sensitive events (logins, failed attempts, owner administrative changes) append to `audit_log` in `app.db` and are viewable by the owner in Settings (`GET /api/owner/audit`).
- **LAN Setup Code**: When running with `--lan`, non-loopback claim requires a 10-character setup code printed at start; 5 incorrect attempts in 10 minutes return HTTP 429.

---

## Job States & Background Sync

Background sync jobs are queued and managed by `JobRunner` and `JobControl`:

- **States**: `queued`, `running`, `needs_code`, `paused`, `done`, `failed`, `cancelled`, `interrupted`.
- **Transitions**:
  - `queued` -> `running`: Enqueued jobs execute when a provider slot is available.
  - `running` -> `done`: Sync and SQLite ingestion complete successfully.
  - `running` -> `failed`: Fetch or import error. If the error is `IMPORT_FAILED`, `POST /api/sync/jobs/{id}/retry-import` reruns import without refetching.
  - `running` -> `needs_code`: Session expired during fetch. Completing `POST /api/accounts/{id}/verify-again` updates credentials and resumes the job back to `queued`.
  - `running` -> `interrupted`: Server restarts (`RESTART`) or graceful shutdown (`SHUTDOWN`).
  - `interrupted`, `failed`, `cancelled`, and `paused` jobs can be resumed back to `queued` with `POST /api/sync/jobs/{id}/resume`.
- **Concurrency**: Bounded per provider via `--provider-concurrency swiggy=1,zomato=1`. User quota allows 1 running and 2 queued jobs per user. Exactly one active job is allowed per `(account, provider)`; duplicate submissions return HTTP 409 (`ACCOUNT_BUSY`). The queue displays 1-based `queue_position` and calculated `eta_seconds`.

---

## Honest Limitations

1. **Archives and Analytics Are Not Encrypted**: While provider credentials (`sessions/*.json`) and vault keys are sealed with ChaCha20-Poly1305, raw order JSON files and `food_analytics.db` remain unencrypted plain files.
2. **Host Administrator Has Full Access**: Anyone with access to the host machine, process memory, or filesystem can inspect unencrypted data and capture unlocked keys. Encryption separates users of the application; it is not a defense against the host administrator.
3. **Unofficial Provider Endpoints**: Integrations rely on private mobile APIs that may change, rate-limit, or restrict accounts without warning.
4. **Single Server Process**: Multi-server setups against the same data folder are not supported. An exclusive OS lock (`.server.lock`) protects the directory.

---

## Documentation Links

- [Architecture & Storage](docs/architecture.md): System diagram, job lifecycle diagram, complete route listings, and schema reference.
- [Runbook](docs/RUNBOOK.md): Systemd service configuration, Windows service setup, backups, updates, and troubleshooting.
- [Performance Benchmarks](docs/PERFORMANCE.md): Mixed load latencies, soak tests, and database concurrency targets.
- [Access Security & Recovery](docs/access/security-and-recovery.md): Threat model, LAN security, password reset, and personal data inventory.
- [Metrics Definitions](docs/METRICS.md): Financial calculation formulas and data reconciliation definitions.
