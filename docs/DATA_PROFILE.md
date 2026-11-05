# Data profile

Local read-only SQLite aggregate audit; no identity or order contents emitted.

- accounts: 2 rows
- orders: 464 rows
- order_items: 715 rows
- restaurants: 168 rows
- delivery_addresses: 39 rows
- archive_imports: 4 rows

## Schema

- accounts: 3 columns; 1 primary-key columns
- orders: 31 columns; 1 primary-key columns
- order_items: 8 columns; 1 primary-key columns
- restaurants: 10 columns; 1 primary-key columns
- delivery_addresses: 7 columns; 1 primary-key columns
- archive_imports: 7 columns; 2 primary-key columns
- accounts vs declared columns: missing none; extra column count 0
- archive_imports vs declared columns: missing none; extra column count 0
- restaurants vs declared columns: missing none; extra column count 0
- delivery_addresses vs declared columns: missing none; extra column count 0
- orders vs declared columns: missing none; extra column count 0
- order_items vs declared columns: missing none; extra column count 0
- Explicit indexes: 7; views: 0

## Coverage, formats and duplicates

- order_date: total 464, missing 0, expected-shape 464
- order_time: total 464, missing 0, expected-shape 464
- order_timestamp: total 464, missing 0, expected-shape 464
- Duplicate platform/order identities: 0
- Orphan items: 0
- Accounts spanning both platforms: 2
- Duplicate account/platform/order key groups: 0
- Normalized restaurant duplicate groups: 3
- Normalized restaurant groups spanning platforms: 3
- order_date SQLite strftime failures (non-NULL): 0
- order_time SQLite strftime failures (non-NULL): 0
- order_timestamp SQLite strftime failures (non-NULL): 0
- Valid shaped order_date minimum/maximum: 2018-06-26 / 2026-11-05
- Timestamp timezone suffix shapes: {'numeric offset': 464}

## Status and platform distributions

- platform ZOMATO: 68; case/spacing variants: 1
- platform SWIGGY: 396; case/spacing variants: 1
- platform other/missing: 0 (raw values withheld)
- order_status DELIVERED: 447; case/spacing variants: 1
- order_status CANCELLED: 9; case/spacing variants: 1
- order_status FAILED: 0; case/spacing variants: 0
- order_status REFUNDED: 0; case/spacing variants: 0
- order_status UNKNOWN: 0; case/spacing variants: 0
- order_status PAYMENT_INCOMPLETE: 8; case/spacing variants: 1
- order_status OTHER: 0; case/spacing variants: 0
- order_status other/missing: 0 (raw values withheld)
- payment_method Unknown: 15; case/spacing variants: 1
- payment_method Incomplete: 0; case/spacing variants: 0
- payment_method UPI: 39; case/spacing variants: 1
- payment_method Card: 262; case/spacing variants: 1
- payment_method Cash: 7; case/spacing variants: 1
- payment_method Wallet: 48; case/spacing variants: 1
- payment_method NetBanking: 0; case/spacing variants: 0
- payment_method other/missing: 93 (raw values withheld)

## NULL rates

Table | Field | NULL count | Percent
--- | --- | ---: | ---:
orders | payment_method | 0 | 0.00%
orders | restaurant_id | 0 | 0.00%
orders | delivery_address_id | 0 | 0.00%
orders | item_subtotal | 0 | 0.00%
orders | user_rating | 68 | 14.66%
orders | financial_verified | 0 | 0.00%
orders | reconciliation_difference | 0 | 0.00%
orders | source_bill_json | 0 | 0.00%
orders | discount_breakdown_json | 0 | 0.00%
order_items | unit_price | 0 | 0.00%
order_items | total_price | 0 | 0.00%
order_items | is_veg | 0 | 0.00%
order_items | category | 0 | 0.00%
restaurants | city | 0 | 0.00%
restaurants | locality | 1 | 0.60%
restaurants | latitude | 1 | 0.60%
restaurants | longitude | 1 | 0.60%
restaurants | cuisine | 42 | 25.00%
delivery_addresses | city | 0 | 0.00%
delivery_addresses | normalized_label | 0 | 0.00%
delivery_addresses | latitude | 0 | 0.00%
delivery_addresses | longitude | 0 | 0.00%

## Reconciliation and completeness

- Verified: 340
- Unverified: 124
- Within INR 1: 353
- Outside INR 1: 111
- Missing reconciliation: 0
- Nonzero explicit discounts: 447
- Nonzero advertised savings: 428
- Nonzero refunds: 0
- Absolute stored difference zero: 56
- Absolute stored difference above 0 to 1: 297
- Absolute stored difference above 1 to 10: 62
- Absolute stored difference above 10 to 100: 42
- Absolute stored difference above 100: 7
- Brief formula within INR 1: 57
- Brief formula outside INR 1: 407
- Brief formula missing inputs: 0
- Stored difference uses the parser formula: subtotal + fees + tax + tip + other charges - food discount; it excludes refunds and uses net delivery fee. The brief formula above uses total discount and subtracts refunds.
- archive_imports history_complete=false: 0
- archive_imports details_complete=false: 0
- archive_imports lifetime_complete=false: 4

## JSON structure distributions

- source_bill_json: {'dict': 396, 'list': 68}; known top-level key presence: {'item_total': 396, 'order_total': 396}; other keys and contents withheld
- discount_breakdown_json: {'dict': 464}; known top-level key presence: {'delivery': 396, 'food': 396}; other keys and contents withheld

## Units and limits

Money fields are stored as REAL; the parser consumes numeric values without a general paise-to-rupee conversion. INR is the application convention, not independently proven for every source. Quantities are item counts; timestamp parsing uses IST. Runtime shape checks do not prove semantic dates. Advertised savings and explicit discounts remain separate. Reconciliation within INR 1 is component balance, not bank verification. lifetime_complete is informational and never a warning. Saved details are snapshots; later status/refund changes may be absent.

Per-account identities, restaurant names, address values, exact order records, arbitrary JSON keys/contents and financial headline numbers are intentionally omitted. Profile is a transaction-consistent read, with no ingest/init or schema mutation.

## Proposals (not applied)

Consider a composite orders index on (account_id, platform, order_date) for common scoped date filters and an order-items index on (order_id, category) for EXISTS filters after measuring query plans. Consider a read-only reconciliation view; do not enforce uniqueness or non-null constraints until existing data and ingestion behavior are reviewed.

Existing dashboard export size: not present bytes (file metadata only).
