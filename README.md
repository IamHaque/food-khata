# Food Khata

A local CLI and analytics web application for saving, normalizing, and visualizing your Zomato and Swiggy food order history.
Log in or reuse active sessions, sync new orders incrementally, ingest order history into a local SQLite analytics database, and explore rich analytics through a modern 7-route web dashboard.

## Install and run

Requires Python 3.11 or newer and an existing Indian Zomato or Swiggy account. Node.js 22+ is required to build the web dashboard.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[serve]"
food-khata
```

On macOS/Linux activate with `source .venv/bin/activate`. The installed
`food-khata` command (or `python -m food_khata`) runs the flow.

### Commands & Subcommands

* **`food-khata serve`**:
  Starts the local read-only FastAPI web server and serves the built dashboard UI at `http://127.0.0.1:8765`.
  Flags:
  * `--host`: Host to bind to (loopback only, default: `127.0.0.1`). Non-loopback bindings are rejected.
  * `--port`: Port to listen on (default: `8765`).
  * `--db-path PATH`: Path to SQLite database (default: `.food-khata/food_analytics.db`).
  * `--data-dir PATH`: Private data root (default: `.food-khata/`).
  * `--dev`: Development mode with automatic reload.

* **`food-khata`** or **`food-khata sync`** *(Default)*:
  Interactive account selection, login/refresh, smart order sync, automatic local
  database update, and interactive prompt to export or view dashboard data.

* **`food-khata ingest`**:
  Migrates all saved order JSONs across all accounts into the local SQLite database
  (`food_analytics.db`) without performing any network or login requests.

* **`food-khata export`** (or **`food-khata dashboard`**, its alias):
  Exports complete dashboard data from SQLite into `.food-khata/dashboard.json` for
  offline file loading in the `/legacy` view.
  Use `--output PATH` to choose a different export path.

General Flags:
* `--data-dir PATH`: Override the private data directory (default: `.food-khata/`).
* `--db-path PATH`: Override the SQLite database location (default: `.food-khata/food_analytics.db`).
* `--no-dashboard`: Skip the post-sync dashboard prompt.
* `--output PATH`: Write the dashboard JSON export to this path.
* `--no-open`: Compatibility flag; export does not open a browser.

### Multi-Account & Session Management

Select a provider (`zomato` or `swiggy`). When saved accounts exist, the CLI displays
all accounts with clear status indicators (`[Active session]` or `[Unauthenticated]`),
along with the option to `"Log in to another account (add new)"`.

For any selected account:
* **Reuse session**: Proceed directly to sync using the stored credentials.
* **Refresh session**: Uses OAuth token refresh (Zomato) or silent profile verification (Swiggy)
  to refresh credentials in-place without re-entering OTP.
* **Reauthenticate (SMS OTP)**: Prompts for SMS OTP using the known phone number, updating
  credentials without wiping history archives.
* **Switch account**: Return to account selection without logging out.
* **Logout and log in again**: Revokes credentials only when explicitly requested.

### Sync Modes

When pre-existing history is found for an account, choose your sync mode:
1. **Sync new orders (incremental)** *(Default)*:
   Scans newest orders first and stops immediately upon reaching previously saved orders,
   fetching details only for newly discovered orders.
2. **Check and repair missing details**:
   Skips history pagination entirely and only scans existing saved orders to patch missing
   or incomplete detail payloads.
3. **Full history scan**:
   Paginate to the very end for deep manual recovery.

## Web Dashboard

The web dashboard is an interactive, accessible React application built with Tailwind CSS, Lucide icons, and shadcn/ui components.

```powershell
python -m pip install -e ".[serve]"
npm --prefix dashboard-ui ci
npm --prefix dashboard-ui run build
food-khata serve
```

Open `http://127.0.0.1:8765`. The server opens SQLite with `mode=ro` and `PRAGMA query_only=ON`; it never mutates source data.

### Dashboard Pages

All pages share account selection, global date range, platform, status, city, locality, cuisine, dietary, and payment filters synchronized in the URL:

1. **Overview**: Total spend, order count, AOV, separate explicit discounts and advertised savings, fee totals, interactive cost waterfall, and top restaurant/dish leaders.
2. **Spending**: Cumulative daily spend curves, rolling 30-day pace, annual month-by-month spend, fee breakdown scatter, and discount distributions.
3. **Food**: Dietary split (Veg / Non-Veg / Unknown), cuisine preferences, restaurant loyalty, monthly new vs repeat orders, and dish price trends.
4. **Behavior**: Weekday x hour ordering heatmap, meal slots (Breakfast, Lunch, Snack, Dinner, Late night), order size histograms, and ordering streaks / gaps.
5. **Places**: Spending distribution by delivery address and city, with order distance analysis.
6. **Ledger**: Server-sorted, server-paginated full order history table with instant search, filter presets, CSV export, and accessible centered order receipt modal.
7. **Data Health**: API-visible coverage tracking, data completeness checks, verified financial reconciliation ratios, and snapshot caveats.

The original static export flow is retained at `/legacy` for offline JSON file viewing via `food-khata export`.

## Your data

```text
food-khata/.food-khata/
  food_analytics.db     <-- Normalized SQLite relational analytics database
  dashboard.json       <-- Optional versioned export for legacy offline viewing
  accounts/
    <local-account-id>/
      account.json
      zomato-history.json
      swiggy-history.json
      sessions/
        zomato.json
        swiggy.json
```

The same phone used successfully for both provider logins shares one local account
folder. Provider account IDs remain separate in `account.json`; they are never
assumed equal. Different phone numbers stay separate. Changing phone numbers or
conflicting provider identities requires manual reconciliation; the CLI refuses
to merge conflicting identities automatically.

Sessions contain reusable credentials. Metadata contains your phone number, and
order payloads can contain addresses and other personal information. Keep this
directory private and out of Git, cloud sharing, and public bug reports. Per-user
provider sessions and phone numbers are encrypted at rest with a random data key
wrapped by the user's password (ChaCha20-Poly1305, DEC-P2). Order archives and
the analytics SQLite database remain plain files. On Windows the data directory
inherits your ACLs; keep the checkout private or use `--data-dir` to select
another private location.

**Honest limit:** host administrators can still read everything. Whoever controls
the machine, the Python environment, or the running process can read decrypted
data and capture the in-memory data key while a user is logged in. Encryption
separates users of the application and protects data at rest; it is not a
defence against the host owner.

## Sync and recovery

The first run follows history pagination to its end and saves individual details.
Every later run merges new IDs and checks the whole saved archive for missing or
invalid details. It never downloads valid existing details again or deletes orders
omitted by the provider. Existing saved history cards and details are preserved.

**History list pages are currently scanned on every run.** Neither integration has
a verified incremental cursor or ordering guarantee. Stopping at the first saved
order could silently miss older records, so incremental savings apply to detail
requests. Previously saved details are snapshots; later refunds or status changes
in those details are not automatically refreshed.

Completed pages and detail downloads are checkpointed with atomic file replacement.
After a network error, cancellation, or expired session, run again: discovery
restarts from the first page, while downloaded orders and details are reused.
Concurrent writes to an account are prevented with an operating-system lock;
locks are released when the process exits. Lock files may remain and are harmless.

The summary separates history coverage and detail coverage. `complete` means this
run retrieved all API-visible pages and all local orders have valid details.
`lifetime_complete` is always false: these unofficial endpoints may hide older
orders. Food history does not include Instamart, Dineout, or other service types.

Exit codes: `0` complete, `1` failure/incomplete sync, `130` cancellation.

- **Expired session:** log in again. Network or access-block errors retain credentials.
- **Zomato authentication HTTP error:** the message names the failing stage
  (authorization, OTP request/verification, consent, token exchange, or redirect).
  Report that stage; authentication requests are not automatically retried.
- **Invalid JSON/schema:** the original is preserved. Back up the affected file,
  then restore a known-good copy or move it aside before retrying. Moving history
  aside triggers a full download. Moving a session aside triggers login.
- **No Zomato saved address:** add one in the app and retry.
- **Provider changed its response:** stop and report a sanitized reproduction.
  Do not attach real session files or unredacted order history.

## Development

Install development dependencies:

```powershell
python -m pip install -e ".[dev,serve]" httpx
python -m pytest -q
python -m ruff check .
python -m ruff format --check .
```

Frontend development (`dashboard-ui/`):

```powershell
cd dashboard-ui
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

See [architecture and storage](docs/architecture.md) for module responsibilities and schema, and [metrics definitions](docs/METRICS.md) for calculation and reconciliation formulas.
Tests use synthetic responses and temporary directories without live API calls.
CI runs on Windows and Linux with Python 3.11 and 3.14.

The integrations were adapted from Jomato (MIT, copyright 2026 jatin-dot-py).
See [LICENSE](LICENSE). This repository is independent and imports no parent project
modules, configuration, sessions, or exports. Use only for accounts you control.
