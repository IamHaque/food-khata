# Architecture and storage

`food_khata.py` and the installed CLI command invoke `food_khata.cli.main`.

## Module Responsibilities

### Core CLI and Storage

| Module | Responsibility |
| --- | --- |
| `cli.py` | Provider and account selection, masked OTP prompt, session reuse/refresh, subcommand dispatch (`sync`, `ingest`, `export`, `serve`) |
| `contracts.py` | Provider protocol definitions and safe public exception types |
| `storage.py` | Account filesystem mapping, atomic JSON writes, OS directory file locks |
| `sync.py` | Archive validation, incremental merging, missing-detail repair, pagination checkpoints |
| `db.py` | SQLite schema initialization, multi-platform normalization, additive migrations, idempotent upserts |
| `dashboard.py` | Legacy SQLite export compiler (`food-khata export`) generating versioned static JSON |
| `providers/zomato.py` | PKCE OAuth authentication, account/address context, Zomato pagination and detail fetching |
| `providers/swiggy.py` | Swiggy SMS OTP authentication, account profile, cursor pagination and detail fetching |
| `providers/http.py` | Resilient HTTP reads, backoff retries, error classification, credential redaction |
| `providers/zomato_headers.py` | Mobile client headers for Zomato API compatibility |

### FastAPI Serving Layer (`food_khata.serve`)

| Module | Responsibility |
| --- | --- |
| `serve/app.py` | FastAPI application factory (`create_app`), route registration, loopback security, cache coordination |
| `serve/cli.py` | CLI integration for `food-khata serve` (`--host`, `--port`, `--db-path`, `--dev`) |
| `serve/db.py` | Read-only SQLite connection dependency (`?mode=ro`, `PRAGMA query_only=ON`, busy timeout) |
| `serve/filters.py` | Central `build_where` SQL query generator with EXISTS predicates for item filters |
| `serve/metrics.py` | Core financial KPI calculations (spend, AOV, separate discounts/savings, fees, tax, tips) |
| `serve/charts.py` | Waterfall steps, daily spending pace, annual series, and calendar heatmap aggregations |
| `serve/food.py` | Dietary breakdown (Veg/Non-Veg), cuisine popularity, restaurant loyalty, dish price history |
| `serve/behavior.py` | Meal slot analysis, weekday x hour heatmap matrix, order size histograms, streaks and gaps |
| `serve/places.py` | Privacy-safe delivery locality and distance analysis |
| `serve/schemas.py` | Strict Pydantic models for API request filters and typed response schemas |

---

## Account Identity and Sessions

Each saved account folder corresponds to a single human user. It is identified by:
- A random local UUID (`local_id`)
- A normalized 10-digit Indian phone number
- A mapping from provider names (`zomato`, `swiggy`) to provider-specific customer IDs

```text
food-khata/.food-khata/
  food_analytics.db     <-- Relational SQLite database
  dashboard.json       <-- Optional legacy export file
  accounts/
    <local-account-id>/
      account.json
      zomato-history.json
      swiggy-history.json
      sessions/
        zomato.json     <-- Access & refresh tokens
        swiggy.json     <-- Authenticated cookies & headers
```

`account.json` (schema version 1):

```json
{
  "version": 1,
  "local_id": "00000000-0000-0000-0000-000000000001",
  "phone": "9876543210",
  "providers": {"zomato": "12345678", "swiggy": "87654321"}
}
```

Credentials in `sessions/*.json` are excluded from saved history files through recursive redaction of sensitive auth keys.
The `.food-khata/` folder is gitignored and must remain private on the host machine.

---

## Relational Database Schema (`food_analytics.db`)

Raw JSON order archives are normalized into a local SQLite database for fast analytical queries:

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
archive_imports (account_id PK, platform PK, history_complete, details_complete, ...)
```

- **`accounts`**: Local user identity records mapped to normalized phone numbers.
- **`restaurants`**: Restaurant profiles deduplicated across orders.
- **`delivery_addresses`**: Delivery locations (normalized localities and cities).
- **`orders`**: Individual orders with normalized timestamps in IST, financial totals, explicit discounts, advertised savings, fees, taxes, status, and payment instruments.
- **`order_items`**: Dish-level line items with inferred dietary classification (`is_veg`: 1 = Veg, 0 = Non-Veg, NULL = Unknown).
- **`archive_imports`**: Ingestion metadata tracking API-visible completeness per account and platform.

---

## Web Dashboard & API Serving Layer

The modern web application consists of:
1. **Backend (`food_khata.serve`)**:
   - Built with FastAPI and Pydantic v2.
   - Enforces loopback-only connections (`127.0.0.1` / `localhost`). Non-loopback Host/Origin headers are rejected.
   - Opens the SQLite database in read-only mode (`?mode=ro`, `PRAGMA query_only=ON`) with bounded retry timeouts to permit concurrent CLI sync/ingest operations.
   - Computes all financial aggregations, distributions, histograms, and waterfall coordinates on the server to ensure high performance and prevent data duplication.
   - Serves the built static frontend assets from `dashboard-ui/dist/`.

2. **Frontend (`dashboard-ui/`)**:
   - Built with React 18, Vite 6, TypeScript, Tailwind CSS, Lucide icons, and shadcn/ui.
   - Uses TanStack Query for caching and asynchronous state management.
   - Synchronizes all active filters (account, date range, platforms, order statuses, cuisines, dietary choices, payment methods, search queries) bidirectionally with URL search parameters.
   - Seven responsive views: Overview, Spending, Food, Behavior, Places, Ledger (server-paginated with full CSV export and keyboard-accessible order receipts), and Data Health.
   - Legacy export fallback available at `/legacy`.
