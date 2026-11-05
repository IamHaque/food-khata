# Architecture and storage

`food_khata.py` and the installed command call `food_khata.cli.main`.

| Module | Responsibility |
| --- | --- |
| `cli.py` | Provider/account selection, masked OTP, session reuse/logout, exit codes |
| `contracts.py` | Provider protocol and safe public error types |
| `storage.py` | Account mapping, validated paths, atomic JSON writes, OS file locks |
| `sync.py` | Archive validation, merging, missing-detail repair, checkpoints |
| `providers/zomato.py` | PKCE login, account/address context, Zomato pagination/details |
| `providers/swiggy.py` | Swiggy SMS login, account profile, cursor pagination/details |
| `providers/http.py` | Safe read retries, HTTP error classification, credential redaction |

The provider protocol keeps service response parsing outside the sync engine.
Providers hold sessions in memory; the CLI persists them in the selected account.
Shared storage and sync logic serve both providers without a provider inheritance
hierarchy. No background service or database is required.

## Account identity

Each account has a random local UUID, a normalized 10-digit phone number, and a
`providers` mapping from service name to authenticated provider ID. Only successful
OTP authentication binds a new provider. Reusing a session rechecks its provider ID
against the mapping. The sync engine also checks identity before mutation and at
completion. A conflicting mapping fails rather than combining histories.

`account.json` version 1:

```json
{
  "version": 1,
  "local_id": "00000000-0000-0000-0000-000000000001",
  "phone": "9876543210",
  "providers": {"zomato": "123", "swiggy": "456"}
}
```

Session JSON is provider-specific: Zomato access/refresh tokens, or Swiggy headers
and scoped cookies. Credentials are excluded from history payloads through recursive
redaction of known credential keys. This does not remove personal order information.

## Archive schema (version 1)

Each `<provider>-history.json` contains:

- `version`, `provider`, `provider_id`: schema and owning identity.
- `orders`: object keyed by order ID. Each entry contains a provider-native
  `history` object and a `details` object once retrieved successfully.
- `history_complete`: this attempt reached the end of provider pagination.
- `details_complete`: all locally known orders have details passing provider validation.
- `complete`: this attempt completed history and details and passed its final identity check.
- `lifetime_complete`: always false; upstream account lifetime coverage is unverified.
- `pages`, `last_sync`, `errors`, `counts`: latest attempt's progress and outcome.

Absent or invalid `details` triggers a detail request. Other invalid archive
structure, a wrong schema version, or mismatched identity fails without replacement.
Orders are keyed by ID to deduplicate overlaps without discarding downloaded details.

## Durability and concurrency

JSON is written to a private temporary file in the destination directory, flushed,
fsynced, and atomically replaced. A failed replacement preserves the previous file.
Account metadata binding uses a root-level lock. The CLI holds an account lock
during session selection/logout and sync; callers using `sync()` directly must
hold the same account lock. OS locks are released on process death.

Each sync restarts discovery, checkpoints each page, then repairs details across
all local orders. No unverified pagination cursor is reused across sessions.
Reads use at most three attempts and bounded Retry-After delays. OTP requests,
verification, consent/token exchange, and signout are never automatically retried.
Requests have timeouts and reject unsafe redirects. OAuth state is verified before
token exchange. HTTP 403 remains an access failure, not proof of an expired session.

## Deliberate limits

Full list-page scans prioritize coverage over request reduction. Valid cached
details are immutable snapshots; refreshing changes to an already complete order
is outside this version's scope. Old Jomato exports and credentials are not imported.
There is no automatic schema migration: future schema changes must include an
explicit migration before an old archive can be updated.
