"""Read-only aggregate profile; never emits row contents or identity values."""

import json
import re
import sqlite3
from collections import Counter
from contextlib import closing
from pathlib import Path


def profile(db_path: Path) -> str:
    with closing(sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True)) as conn:
        conn.execute("PRAGMA query_only=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("BEGIN")
        tables = (
            "accounts",
            "orders",
            "order_items",
            "restaurants",
            "delivery_addresses",
            "archive_imports",
        )
        lines = [
            "# Data profile",
            "",
            "Local read-only SQLite aggregate audit; no identity or order contents emitted.",
            "",
        ]
        for table in tables:
            lines.append(
                f"- {table}: {conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]} rows"
            )
        lines += ["", "## Schema", ""]
        for table in tables:
            columns = conn.execute(f"PRAGMA table_info({table})").fetchall()
            # Only known schema names from application code are reported; never arbitrary DB metadata.
            lines.append(
                f"- {table}: {len(columns)} columns; {sum(bool(c[5]) for c in columns)} primary-key columns"
            )
        declared = {
            "accounts": "id phone local_id",
            "archive_imports": "account_id platform history_complete details_complete lifetime_complete order_count imported_at",
            "restaurants": "id platform platform_restaurant_id name locality city address latitude longitude cuisine",
            "delivery_addresses": "id label normalized_label full_address city latitude longitude",
            "orders": "id account_id platform platform_order_id order_timestamp order_date order_time order_status payment_method restaurant_id delivery_address_id final_amount_paid item_subtotal total_discount discount_percentage delivery_fee delivery_fee_discount packaging_fee platform_fee total_tax user_rating food_discount tip other_charges refund_amount reported_savings reconciliation_difference financial_verified source_complete source_bill_json discount_breakdown_json",
            "order_items": "id order_id item_name quantity unit_price total_price is_veg category",
        }
        for table, names in declared.items():
            expected = set(names.split())
            actual = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
            lines.append(
                f"- {table} vs declared columns: missing {', '.join(sorted(expected - actual)) or 'none'}; extra column count {len(actual - expected)}"
            )
        indexes = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
        ).fetchone()[0]
        views = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='view'").fetchone()[0]
        lines += [
            f"- Explicit indexes: {indexes}; views: {views}",
            "",
            "## Coverage, formats and duplicates",
            "",
        ]
        for field, pattern in (
            ("order_date", "????-??-??"),
            ("order_time", "??:??:??"),
            ("order_timestamp", "????-??-??T*"),
        ):
            row = conn.execute(
                f"SELECT COUNT(*), SUM({field} IS NULL OR {field}=''), SUM({field} GLOB ?) FROM orders",
                (pattern,),
            ).fetchone()
            lines.append(
                f"- {field}: total {row[0]}, missing {row[1] or 0}, expected-shape {row[2] or 0}"
            )
        for label, query in (
            (
                "Duplicate platform/order identities",
                "SELECT COUNT(*) FROM (SELECT platform, platform_order_id FROM orders GROUP BY platform,platform_order_id HAVING COUNT(*)>1)",
            ),
            (
                "Orphan items",
                "SELECT COUNT(*) FROM order_items i WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=i.order_id)",
            ),
            (
                "Accounts spanning both platforms",
                "SELECT COUNT(*) FROM (SELECT account_id FROM orders GROUP BY account_id HAVING COUNT(DISTINCT platform)>1)",
            ),
        ):
            lines.append(f"- {label}: {conn.execute(query).fetchone()[0]}")
        lines.append(
            f"- Duplicate account/platform/order key groups: {conn.execute('SELECT COUNT(*) FROM (SELECT account_id, platform, platform_order_id FROM orders GROUP BY 1,2,3 HAVING COUNT(*)>1)').fetchone()[0]}"
        )
        restaurant_groups = "SELECT COUNT(*) FROM (SELECT lower(trim(name)), lower(trim(COALESCE(locality,''))) FROM restaurants WHERE trim(name)<>'' GROUP BY 1,2 HAVING COUNT(DISTINCT {})>1)"
        for label, field in (("duplicate groups", "id"), ("groups spanning platforms", "platform")):
            count = conn.execute(restaurant_groups.format(field)).fetchone()[0]
            lines.append(f"- Normalized restaurant {label}: {count}")
        for field in ("order_date", "order_time", "order_timestamp"):
            failed = conn.execute(
                f"SELECT COUNT(*) FROM orders WHERE {field} IS NOT NULL AND strftime('%Y', {field}) IS NULL"
            ).fetchone()[0]
            lines.append(f"- {field} SQLite strftime failures (non-NULL): {failed}")
        dates = conn.execute(
            "SELECT MIN(order_date), MAX(order_date) FROM orders WHERE order_date GLOB '????-??-??' AND strftime('%Y-%m-%d', order_date)=order_date"
        ).fetchone()
        lines.append(
            f"- Valid shaped order_date minimum/maximum: {dates[0] or 'none'} / {dates[1] or 'none'}"
        )
        zones = Counter()
        for (value,) in conn.execute("SELECT order_timestamp FROM orders"):
            if not isinstance(value, str) or not value:
                zones["missing"] += 1
            elif re.search(r"[+-]\d{2}:\d{2}$", value):
                zones["numeric offset"] += 1
            elif value.endswith("Z"):
                zones["UTC Z"] += 1
            else:
                zones["no recognized timezone suffix"] += 1
        lines.append(f"- Timestamp timezone suffix shapes: {dict(sorted(zones.items()))}")
        lines += ["", "## Status and platform distributions", ""]
        for field, allowed in (
            ("platform", ("ZOMATO", "SWIGGY")),
            (
                "order_status",
                (
                    "DELIVERED",
                    "CANCELLED",
                    "FAILED",
                    "REFUNDED",
                    "UNKNOWN",
                    "PAYMENT_INCOMPLETE",
                    "OTHER",
                ),
            ),
        ):
            total = 0
            for value in allowed:
                count = conn.execute(
                    f"SELECT COUNT(*) FROM orders WHERE UPPER(TRIM({field}))=?", (value.upper(),)
                ).fetchone()[0]
                total += count
                variants = conn.execute(
                    f"SELECT COUNT(DISTINCT {field}) FROM orders WHERE UPPER(TRIM({field}))=?",
                    (value.upper(),),
                ).fetchone()[0]
                lines.append(f"- {field} {value}: {count}; case/spacing variants: {variants}")
            count = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] - total
            lines.append(f"- {field} other/missing: {count} (raw values withheld)")
        for value in ("Unknown", "Incomplete", "UPI", "Card", "Cash", "Wallet", "NetBanking"):
            count, variants = conn.execute(
                "SELECT COUNT(*), COUNT(DISTINCT payment_method) FROM orders WHERE UPPER(TRIM(payment_method))=?",
                (value.upper(),),
            ).fetchone()
            lines.append(f"- payment_method {value}: {count}; case/spacing variants: {variants}")
        count = conn.execute(
            "SELECT COUNT(*) FROM orders WHERE payment_method IS NULL OR UPPER(TRIM(payment_method)) NOT IN ('UNKNOWN','INCOMPLETE','UPI','CARD','CASH','WALLET','NETBANKING')"
        ).fetchone()[0]
        lines.append(f"- payment_method other/missing: {count} (raw values withheld)")
        lines += [
            "",
            "## NULL rates",
            "",
            "Table | Field | NULL count | Percent",
            "--- | --- | ---: | ---:",
        ]
        fields = {
            "orders": (
                "payment_method",
                "restaurant_id",
                "delivery_address_id",
                "item_subtotal",
                "user_rating",
                "financial_verified",
                "reconciliation_difference",
                "source_bill_json",
                "discount_breakdown_json",
            ),
            "order_items": ("unit_price", "total_price", "is_veg", "category"),
            "restaurants": ("city", "locality", "latitude", "longitude", "cuisine"),
            "delivery_addresses": ("city", "normalized_label", "latitude", "longitude"),
        }
        for table, names in fields.items():
            for field in names:
                n, nulls = conn.execute(
                    f"SELECT COUNT(*), SUM({field} IS NULL) FROM {table}"
                ).fetchone()
                nulls = nulls or 0
                lines.append(f"{table} | {field} | {nulls} | {100 * nulls / n if n else 0:.2f}%")
        lines += ["", "## Reconciliation and completeness", ""]
        for label, predicate in (
            ("Verified", "financial_verified=1"),
            ("Unverified", "financial_verified<>1 OR financial_verified IS NULL"),
            ("Within INR 1", "ABS(reconciliation_difference)<=1"),
            ("Outside INR 1", "ABS(reconciliation_difference)>1"),
            ("Missing reconciliation", "reconciliation_difference IS NULL"),
            ("Nonzero explicit discounts", "total_discount<>0"),
            ("Nonzero advertised savings", "reported_savings<>0"),
            ("Nonzero refunds", "refund_amount<>0"),
        ):
            lines.append(
                f"- {label}: {conn.execute(f'SELECT COUNT(*) FROM orders WHERE {predicate}').fetchone()[0]}"
            )
        for label, predicate in (
            ("zero", "=0"),
            ("above 0 to 1", ">0 AND ABS(reconciliation_difference)<=1"),
            ("above 1 to 10", ">1 AND ABS(reconciliation_difference)<=10"),
            ("above 10 to 100", ">10 AND ABS(reconciliation_difference)<=100"),
            ("above 100", ">100"),
        ):
            lines.append(
                f"- Absolute stored difference {label}: {conn.execute(f'SELECT COUNT(*) FROM orders WHERE ABS(reconciliation_difference){predicate}').fetchone()[0]}"
            )
        formula = "final_amount_paid - (item_subtotal - total_discount + delivery_fee + packaging_fee + platform_fee + total_tax + tip + other_charges - refund_amount)"
        for label, predicate in (
            ("within INR 1", "<=1"),
            ("outside INR 1", ">1"),
            ("missing inputs", "IS NULL"),
        ):
            lines.append(
                f"- Brief formula {label}: {conn.execute(f'SELECT COUNT(*) FROM orders WHERE ABS({formula}) {predicate}').fetchone()[0]}"
            )
        lines.append(
            "- Stored difference uses the parser formula: subtotal + fees + tax + tip + other charges - food discount; it excludes refunds and uses net delivery fee. The brief formula above uses total discount and subtracts refunds."
        )
        for field in ("history_complete", "details_complete", "lifetime_complete"):
            lines.append(
                f"- archive_imports {field}=false: {conn.execute(f'SELECT COUNT(*) FROM archive_imports WHERE {field}=0').fetchone()[0]}"
            )
        lines += ["", "## JSON structure distributions", ""]
        for field in ("source_bill_json", "discount_breakdown_json"):
            counts = Counter()
            keys = Counter()
            for (raw,) in conn.execute(f"SELECT {field} FROM orders"):
                if raw is None:
                    counts["missing"] += 1
                    continue
                try:
                    value = json.loads(raw)
                    counts[type(value).__name__] += 1
                    if isinstance(value, dict):
                        for key in (
                            ("food", "delivery")
                            if field == "discount_breakdown_json"
                            else ("item_total", "order_total")
                        ):
                            keys[key] += key in value
                except (ValueError, TypeError):
                    counts["invalid"] += 1
            lines.append(
                f"- {field}: {dict(sorted(counts.items()))}; known top-level key presence: {dict(sorted(keys.items()))}; other keys and contents withheld"
            )
        lines += [
            "",
            "## Units and limits",
            "",
            "Money fields are stored as REAL; the parser consumes numeric values without a general paise-to-rupee conversion. INR is the application convention, not independently proven for every source. Quantities are item counts; timestamp parsing uses IST. Runtime shape checks do not prove semantic dates. Advertised savings and explicit discounts remain separate. Reconciliation within INR 1 is component balance, not bank verification. lifetime_complete is informational and never a warning. Saved details are snapshots; later status/refund changes may be absent.",
            "",
            "Per-account identities, restaurant names, address values, exact order records, arbitrary JSON keys/contents and financial headline numbers are intentionally omitted. Profile is a transaction-consistent read, with no ingest/init or schema mutation.",
        ]
        export = Path("dashboard-ui/public/data/dashboard.json")
        lines += [
            "",
            "## Proposals (not applied)",
            "",
            "Consider a composite orders index on (account_id, platform, order_date) for common scoped date filters and an order-items index on (order_id, category) for EXISTS filters after measuring query plans. Consider a read-only reconciliation view; do not enforce uniqueness or non-null constraints until existing data and ingestion behavior are reviewed.",
            "",
            f"Existing dashboard export size: {export.stat().st_size if export.is_file() else 'not present'} bytes (file metadata only).",
        ]
        return "\n".join(lines) + "\n"


def write_profile(db_path: Path, output: Path) -> None:
    if output.resolve() == db_path.resolve() or (output.exists() and output.samefile(db_path)):
        raise ValueError("Profile output must not replace the source database")
    if output.suffix.lower() != ".md":
        raise ValueError("Profile output must be a Markdown report")
    output.write_text(profile(db_path), encoding="utf-8")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("db", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write_profile(args.db, args.output)
    print("Aggregate profile written; no row contents emitted.")
