# Architecture and storage

`food_khata.py` and the installed command call `food_khata.cli.main`.

| Module | Responsibility |
| --- | --- |
| `cli.py` | Provider/account selection, masked OTP, session reuse/logout, post-sync ingestion and dashboard triggers |
| `contracts.py` | Provider protocol and safe public error types |
| `storage.py` | Account mapping, validated paths, atomic JSON writes, OS file locks |
| `sync.py` | Archive validation, merging, missing-detail repair, checkpoints |
| `db.py` | SQLite schema management, multi-platform normalization, idempotent upserts |
| `dashboard.py` | SQL analytics aggregation, single-file HTML/JS dashboard compiler |
| `providers/zomato.py` | PKCE login, account/address context, Zomato pagination/details |
| `providers/swiggy.py` | Swiggy SMS login, account profile, cursor pagination/details |
| `providers/http.py` | Safe read retries, HTTP error classification, credential redaction |

The provider protocol keeps service response parsing outside the sync engine.
Providers hold sessions in memory; the CLI persists them in the selected account.
Shared storage and sync logic serve both providers without a provider inheritance
hierarchy. Order archives are stored as local JSON files and ingested into a local
SQLite database for analytical queries and dashboard visualization.

## Account identity

Each account has a random local UUID, a normalized 10-digit phone number, and a
`providers` mapping from service name to authenticated provider ID. Only successful
OTP authentication binds a new provider. Reusing a session rechecks its provider ID
against the mapping. The sync engine also checks identity before mutation and at
completion. A conflicting mapping fails rather than combining histories.

The default root is `.food-khata/` inside the source checkout, anchored to the
module location rather than the current working directory. Both `Storage()` and
the CLI share this default; `--data-dir` explicitly overrides it. The full data
directory, including sessions, is ignored by Git.

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

Zomato IDs are parsed from order navigation parameters or the observed
`zomato://delivery/<id>` path. Type-2 order cards without navigation can use their
top-level numeric `identifier`; arbitrary nested UI identifiers are not parsed as
order IDs. Downloaded details must match the requested ID and contain item data.

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
is outside this version's scope. There is no automatic import of old Jomato exports
or credentials. Validated exports can be converted and merged offline after an
explicit account mapping, preserving valid saved details and backing up prior archives.
There is no automatic schema migration: future schema changes must include an
explicit migration before an old archive can be updated.

## SQLite Analytics Database (`food_analytics.db`)

To support multi-platform analytical queries, spend visualization, and reporting,
the raw JSON archives are normalized into a local SQLite database (`db.py`).

### Relational Schema

```text
accounts (local_id PK, phone, created_at)
   │
   ├──< orders (order_id PK, platform, account_id FK, restaurant_id FK, address_id FK,
   │            order_time, order_status, total_amount, item_total, delivery_fee,
   │            platform_fee, taxes, packaging_fee, discount_amount, payment_method, ...)
   │       │
   │       └──< order_items (item_id PK, order_id FK, item_name, quantity,
   │                         price, total_cost, is_veg, cuisine, category)
   │
restaurants (restaurant_id PK, platform, name, city, locality, address)
delivery_addresses (address_id PK, address_line, city, tag)
```

- **`accounts`**: Local account identities mapped to normalized 10-digit phone numbers.
- **`restaurants`**: Extracted restaurant profiles deduplicated across orders.
- **`delivery_addresses`**: Normalizes delivery destinations (e.g., Home, Work).
- **`orders`**: Core order record capturing normalized timestamps (ISO 8601 in IST),
  financials (`total_amount`, item total, fees, taxes, discounts/savings), delivery status,
  and payment instrument.
- **`order_items`**: Dish-level line items with inferred dietary classifications (`is_veg`:
  1 = Veg, 0 = Non-Veg, NULL = Unknown) and heuristic cuisine tagging.

### Multi-Platform Ingestion Pipeline

Ingestion (`ingest_all`) iterates through all saved accounts and archives in the storage directory:
1. **Idempotence**: Orders and items use `INSERT OR REPLACE` upsert semantics keyed by primary keys.
2. **Payload Parsing**:
   - Swiggy mobile details: nested inside `details["orders"][0]`.
   - Zomato mobile details: flat item/charge list inside `details["order"]["items"]` classified by `item["type"]` (`dish`, `charge`, `tax`, `savings`, `voucher_discount`).
3. **Resilience**: Orders with legacy or redacted item arrays are preserved without failing the ingestion run.
4. **Offline Migration**: `food-khata ingest` performs full DB population directly from disk without network access or authentication.

## Visual Dashboard (`dashboard.py`)

The analytics engine runs fast SQL aggregations over `food_analytics.db` to compile a standalone,
single-file HTML/JS dashboard (`dashboard.html`):
- **Zero Server Overhead**: The generated dashboard is an offline-ready single HTML document using
  Tailwind CSS and Chart.js via CDN.
- **Interactive Multi-Account Filtering**: Allows toggling between aggregate household views and
  per-account phone number breakdowns.
- **Core Visualizations**:
  - **KPI Cards**: Delivered spend, total savings (item discounts + waived fees), order count, and AOV.
  - **Platform Battle**: Side-by-side volume, spend, and average fee comparison between Swiggy and Zomato.
  - **Monthly Spend Curves**: Longitudinal spend trends over time.
  - **Fee Creep Tracker**: Visualizing the historical rise of platform fees, packaging fees, and taxes.
  - **Dietary & Cuisine Splits**: Doughnut breakdown of Veg vs Non-Veg spending and popular cuisines.
  - **7x24 Ordering Heatmap**: Hour-of-day vs day-of-week order density matrix.
  - **Top Lists & Order Log**: Searchable top 10 restaurants, top dishes, and tabular order log.

## Post-Sync Workflow and CLI Subcommands

1. **`food-khata sync`** (default):
   - Authenticates / refreshes session.
   - Syncs orders incrementally or full scan.
   - Automatically executes `ingest_all()` to update `food_analytics.db`.
   - Prompts the user: `"Generate and view analytics dashboard? [Y/n]"`. If accepted, generates `dashboard.html` and launches the system browser.
2. **`food-khata ingest`**:
   - Standalone offline ingestion from local JSON archives into SQLite.
3. **`food-khata dashboard`**:
   - Directly compiles and launches `dashboard.html` from the SQLite database without syncing.

