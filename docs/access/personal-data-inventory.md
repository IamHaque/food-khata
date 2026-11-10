# AC08 personal-data inventory

This is an inventory of current retention, not a decision about encryption policy.
Full delivery addresses and coordinates are retained in plaintext analytics SQLite,
and raw history/detail archives retain provider payload fields beyond credentials.
Encrypting credentials and digesting provider IDs is **not full dataset encryption**.
This finding is material to the user's stated preference about credential-only scope;
the finding was presented before final Gate GB sign-off. Credential-only scope is approved under DEC-021; Gate GB remains user-only.

## Evidence and boundaries

Inspected repository code only, with one synthetic scenario:
`tests/test_db.py::test_personal_data_inventory_synthetic`. No real data directory,
payload, user account or provider request was used. Fixtures are provider-shaped
examples, not observations of what either provider currently returns. The test uses
the shared provider redactor and archive writer, then `AnalyticsDB.ingest_account`;
it does not exercise network clients or the full sync runner.

## Raw order archives and details

`food_khata/providers/swiggy.py` (`history_orders`/`order_details`) and
`food_khata/providers/zomato.py` (history/details methods) preserve provider history
cards and detail objects after `food_khata/providers/http.py::redact`. Redaction
recursively masks tid, sid, otp, cookie, set-cookie, authorization, x-swiggy-auth,
x-oz-tok and keys containing token after punctuation removal. It does not mask
ordinary name, phone or address keys.

`food_khata/services/sync.py::sync` stores history and details in
`<provider>-history.json` and checkpoints with `storage.save_json`. Archive headers
also retain provider, provider identity digest, version, completeness flags, pages,
counts and errors. A digest of the header identity does not sanitize order bodies.

The synthetic scenario proves history and details containing `name = SYNTHETIC
RECIPIENT`, `phone = 9000005678`, full delivery addresses and coordinates survive
redaction and plaintext JSON persistence, even with encrypted account storage.
Potential real payload fields include recipient names, phones, full addresses and
other provider-supplied personal information. Their actual keys, presence and values
are provider/version/account dependent and were not observed. **No absence of names
or full phones is established.** Arbitrary non-credential fields can survive here.

## Normalized analytics database

Schema and ingestion: `food_khata/db.py::AnalyticsDB`, especially
`init_db`, `ingest_swiggy_order`, `ingest_zomato_order`, `ingest_account` and the
financial update/quarantine paths. Tables retain:

| Table | Retained fields relevant to this inventory |
| --- | --- |
| `accounts` | Local account ID, local ID and phone label. Current ingestion takes the last four numeric digits from `phone_suffix` or legacy `phone`, otherwise `Unknown`. Historical databases/pages can still contain previous full values. |
| `delivery_addresses` | Address ID, raw label, normalized label, **full_address**, city, **latitude, longitude**. Hashing the address ID leaves these columns intact. |
| `restaurants` | Internal/platform restaurant IDs, platform, name, locality, city, **address, latitude, longitude**, cuisine. |
| `orders` | Account/platform/order IDs, timestamp/date/time, status, payment method, linked restaurant/delivery address; amount paid, subtotal, discounts/percentage, delivery/packaging/platform fees, tax, rating; food discount, tip, other charges, refund, savings, reconciliation difference, verification/completeness flags, source bill JSON and discount breakdown JSON. JSON content remains source dependent. |
| `order_items` | Linked order, item name, quantity, unit/total price, vegetarian flag, category. |
| `quarantine` | Account/platform/order IDs, reason, error details/traceback, **raw_payload** JSON, quarantine timestamp. Rejected inputs can therefore retain personal fields too. |
| Import bookkeeping | `archive_imports`: account/platform, completion flags, order count, import time; `partial_import_receipts`: job ID. |

The synthetic test confirms both providers' full delivery address, raw label, city
and exact coordinates in SQLite, the Swiggy restaurant address, and phone label
`1234` for both encrypted new metadata and legacy full-phone metadata. It does not
prove names/phones absent from normalized free text, source bill JSON or quarantine.

## Credential, account and session metadata

`food_khata/storage.py` encrypts provider session dictionaries when a cipher is
supplied. Provider headers/cookies and credential values are inside that envelope;
their exact contents depend on the provider session. Without a cipher, legacy
storage can be plaintext. Account metadata stores version/local ID/provider mapping;
with a cipher it encrypts provider IDs and full phone, retains `phone_suffix`, and
stores `provider_identities` SHA-256 digests. Migration rewrites secret metadata and
archive header identities, not history/detail payload bodies.

`food_khata/auth/sessions.py` defines plaintext auth SQLite metadata: user ID,
username, password hash, owner/disabled flags and creation time; session ID, user
ID, CSRF token, created/last-active/expiry times; failed-login usernames, IPs and
attempt times; registration IPs/times; server setting key/value pairs. Password
hashes are not plaintext passwords, but session identifiers remain sensitive.
`food_khata/users/crypto.py` vault metadata contains KDF algorithm/parameters/salt,
wrapping algorithm/nonce/wrapped data key and creation time. These are code-reviewed
fields, not all individually asserted by this bounded test.

## Backups, WAL and temporary files

`storage.save_json` writes an adjacent named temporary file, flushes/fsyncs, then
atomically replaces the target and removes the temporary file in `finally`.
For raw archives that temporary content is plaintext too; process termination can
interrupt cleanup. No secure-erasure guarantee is established.

`AnalyticsDB.connection` and auth database connections enable SQLite WAL. Database
pages/WAL can contain the same sensitive plaintext as their databases, including
earlier values; sidecars and filesystem remnants were not forensically inspected.

`storage.adopt_legacy` encrypts secret files before copying, creates
`legacy-backup` (or a uniquely suffixed directory), copies account directories and
archives, and uses SQLite backup including committed WAL data via an intermediate
`.analytics-snapshot`. The live legacy analytics database is kept in place. Thus
backups/snapshots can duplicate plaintext address/order data even when credentials
are encrypted. Existing older copies, interrupted migrations, external backups and
OS temporary/swap storage are not demonstrated sanitized by this inventory.

## Validation

Run `python -m pytest tests/test_db.py::test_personal_data_inventory_synthetic -q`.
This scenario documents present behavior; it introduces no retention or encryption
change. It does not validate live provider schemas, migration crash recovery,
physical disk erasure, or a comprehensive inventory of logs/exports/job metadata.

