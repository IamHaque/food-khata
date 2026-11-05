# Food Khata

A local CLI for saving and visualizing your Zomato and Swiggy food order history.
Log in or reuse active sessions, sync new orders incrementally, ingest order history
into a local SQLite analytics database, and export data for an independent React dashboard.

## Install and run

Requires Python 3.11 or newer and an existing Indian Zomato or Swiggy account.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e .
food-khata
```

On macOS/Linux activate with `source .venv/bin/activate`. The installed
`food-khata` command (or `python -m food_khata`) runs the flow.

### Commands & Subcommands

* **`food-khata`** or **`food-khata sync`** *(Default)*:
  Interactive account selection, login/refresh, smart order sync, automatic local
  database update, and interactive prompt to export dashboard data.
* **`food-khata ingest`**:
  Migrates all saved order JSONs across all accounts into the local SQLite database
  (`food_analytics.db`) without performing any network or login requests.
* **`food-khata export`** (or **`food-khata dashboard`**, its alias):
  Exports complete dashboard data from SQLite into `.food-khata/dashboard.json`.
  Use `--output PATH` to choose a different data file.

Flags:
* `--data-dir PATH`: Override the private data directory (default: `.food-khata/`).
* `--db-path PATH`: Override the SQLite database location (default: `.food-khata/food_analytics.db`).
* `--no-dashboard`: Skip the post-sync dashboard prompt.
* `--output PATH`: Write the React dashboard JSON export to this path.
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

### Local Analytics Database & Dashboard

Python owns syncing, normalization and financial parsing in SQLite. The React app
loads a versioned JSON export; Python does not generate HTML or serve the UI.

```powershell
food-khata ingest
food-khata export --output dashboard-ui/public/data/dashboard.json
cd dashboard-ui
npm ci
npm run dev
```

Open the local URL printed by Vite. The app automatically loads that JSON file.
You can also export to the default `.food-khata/dashboard.json` and choose **Load data**
in the app. Run the export again after syncing, then refresh or reload the file.

The dashboard is one continuous page: no routes or section tabs. It provides
shared customer/date/platform/restaurant/payment filters, chart tooltips, a
weekday/hour heatmap, searchable complete order history and receipt-style order
details. Light/dark themes persist locally. shadcn/ui components provide the controls,
tables, charts, calendars, cards, tooltips and receipt sheet.

## Your data

```text
food-khata/.food-khata/
  food_analytics.db     <-- Normalized SQLite relational analytics database
  dashboard.json       <-- Versioned data input for the separate React app
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
directory private and out of Git, cloud sharing, and public bug reports. Files
are stored locally in plain JSON; this application does not encrypt them. On
Windows they inherit your directory's ACLs; keep the checkout private or use
`--data-dir` to select another private location.

Earlier builds used `~/.food-khata/`. If upgrading on another machine, stop running
syncs and copy that directory into the checkout as `.food-khata/` before starting.
Do not overwrite existing account folders. The CLI does not automatically move
or delete the old home-directory copy.

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

```sh
python -m pip install -e ".[dev]"
python -m pytest -q
python -m ruff check .
python -m ruff format --check .
```

Tests use synthetic responses and temporary directories without live API calls.
CI runs on Windows and Linux with Python 3.11 and 3.14. See
[architecture and storage](docs/architecture.md) for module responsibilities and schema.
Authenticated end-to-end verification requires a real account and OTP and is a
separate manual check; offline tests do not prove current provider availability.

The integrations were adapted from Jomato (MIT, copyright 2026 jatin-dot-py).
See [LICENSE](LICENSE). This repository is independent and imports no parent project
modules, configuration, sessions, or exports. Use only for accounts you control.

## Dashboard development

The React app lives in `dashboard-ui/` and uses Vite, Tailwind, shadcn/ui and Recharts.
Node.js 22 or newer is recommended. In that directory:

```sh
npm ci
npm test
npm run build
npm run preview
```

`npm run build` creates a normal static web app in `dashboard-ui/dist`.
`npm run test:browser` tests the built app; install Chromium with
`npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
Vite binds to loopback by default. Exported JSON contains private account/address
information: keep it private and do not publish `public/data` or a build containing it.

Ingestion migrates SQLite additively and rolls back a failed account import.
Source archives remain untouched. Advertised savings remain distinct from explicit
bill discounts. Reconciliation means the known components balance within INR 1;
it does not independently verify bank transactions. Unreconciled bills retain
provider totals and show a concise notice in the receipt.
