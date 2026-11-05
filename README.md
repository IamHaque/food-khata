# Food Khata

A local CLI for saving your Zomato and Swiggy food order history. Choose a provider,
reuse a saved session or log in with your phone and SMS OTP, then sync automatically.
New orders and missing details are downloaded; valid saved details are reused.

## Install and run

Requires Python 3.11 or newer and an existing Indian Zomato or Swiggy account.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e .
python food_khata.py
```

On macOS/Linux activate with `source .venv/bin/activate`. The installed
`food-khata` command runs the same flow. Run `python food_khata.py --help` for options.
Use `--data-dir PATH` to choose a different private data directory.

Select a provider. If there is a saved session, choose reuse or logout and login
again. Enter your phone (10 digits or `+91` prefix) and the masked SMS OTP when
prompted. Login does not create new provider accounts. Zomato requires at least
one saved address in its app to supply history request context.

When multiple saved accounts exist, select one or log in to another. To switch
from a single saved account, choose logout and login again. Logout preserves all
order history. Zomato requests server signout; Swiggy logout removes only the
local session because remote session revocation is not implemented.

## Your data

```text
~/.food-khata/
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
Windows they inherit your directory's ACLs; use a private user directory.

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
