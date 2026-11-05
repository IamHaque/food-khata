# Food Khata

A local CLI for saving and visualizing your Zomato and Swiggy food order history.
Log in or reuse active sessions, sync new orders incrementally, ingest order history
into a local SQLite analytics database, and generate an interactive visual dashboard.

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
  database update, and interactive prompt to view the visual dashboard.
* **`food-khata ingest`**:
  Migrates all saved order JSONs across all accounts into the local SQLite database
  (`food_analytics.db`) without performing any network or login requests.
* **`food-khata dashboard`**:
  Compiles and opens the visual analytics dashboard (`dashboard.html`) in your default
  browser directly from the local database.

Flags:
* `--data-dir PATH`: Override the private data directory (default: `.food-khata/`).
* `--db-path PATH`: Override the SQLite database location (default: `.food-khata/food_analytics.db`).
* `--no-dashboard`: Skip the post-sync dashboard prompt.
* `--no-open`: Generate the dashboard without opening the browser.

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

After syncing, orders are automatically ingested into `.food-khata/food_analytics.db`.
The CLI then prompts to open the unified visual dashboard (`dashboard.html`), featuring:
* **Macro KPIs**: Delivered spend, total savings (food discounts + waived delivery), orders, and AOV.
* **Platform Battle**: Side-by-side comparison of Swiggy vs Zomato metrics.
* **Monthly & Fee Creep Timelines**: Historical spend curves and platform fee evolution.
* **Dietary & Cuisine Split**: Veg vs Non-Veg spending and dish distribution.
* **Ordering Habit Patterns**: 7x24 density heatmap and meal-time slots (Breakfast to Late Night).
* **Favorites**: Top 10 most visited restaurants and most ordered dishes.
* **Household Multi-Account Filter**: Switch between all accounts combined or individual phone numbers.


## Your data

```text
food-khata/.food-khata/
  food_analytics.db     <-- Normalized SQLite relational analytics database
  dashboard.html        <-- Standalone interactive visual analytics app
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
python -m unittest discover -s tests -v
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

## Local analytics and history

Run `food-khata ingest` to import saved archives, then `food-khata dashboard --no-open`
to generate `.food-khata/dashboard.html`. Open that file to explore all customers,
filter the timeline and search the complete paginated history. Each order exposes
its stored bill, items, restaurant and delivery address. The generated HTML contains
personal order/address data for every imported account; keep it private.

Ingestion migrates the SQLite schema additively and rolls back an account import
if a record fails, leaving source archives untouched. Bill discounts are stored
separately from provider-advertised savings. A delivered bill is marked reconciled
when known components match its total within INR 1 (provider rounding); mismatches,
missing dates and incomplete sources remain visible for review. Reconciled means
arithmetically consistent, not independently verified against bank transactions.
Address groups describe geography; original personal annotations remain available.
Chart.js and Tailwind load from CDNs and need an internet connection.
