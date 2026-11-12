"""SQLite analytics database ingestion and query models for Food Khata."""

import hashlib
import json
import math
import re
import sqlite3
import traceback
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .contracts import KhataError
from .storage import DEFAULT_DATA_DIR, Storage, read_json

DEFAULT_DB_PATH = DEFAULT_DATA_DIR / "food_analytics.db"
IST = timezone(timedelta(hours=5, minutes=30))

# ==========================================
# 1. NORMALIZATION UTILITIES
# ==========================================


def clean_num(val: Any, default: float = 0.0) -> float:
    """Sanitize and parse numeric values, stripping currency symbols and formatting."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val) if math.isfinite(val) else default
    cleaned = re.sub(r"[^0-9.-]", "", str(val))
    try:
        return float(cleaned) if cleaned and math.isfinite(float(cleaned)) else default
    except ValueError:
        return default


def parse_date(
    date_str: str | None = None, epoch_secs: int | float | str | None = None
) -> tuple[str, str, str]:
    """Return (iso_timestamp, YYYY-MM-DD, HH:MM:SS) in IST timezone."""
    if date_str:
        try:
            dt = datetime.fromisoformat(date_str.strip().replace("Z", "+00:00"))
            dt = dt.replace(tzinfo=IST) if dt.tzinfo is None else dt.astimezone(IST)
            return dt.isoformat(), dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")
        except ValueError:
            pass
        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
            "%d %b %Y, %I:%M %p",
            "%B %d, %Y at %I:%M %p",
            "%B %d, %Y %I:%M %p",
            "%d-%m-%Y %H:%M:%S",
            "%Y-%m-%d",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str.strip(), fmt).replace(tzinfo=IST)
                return (
                    dt.isoformat(),
                    dt.strftime("%Y-%m-%d"),
                    dt.strftime("%H:%M:%S"),
                )
            except ValueError:
                pass

    if epoch_secs is not None:
        try:
            sec = float(epoch_secs)
            if sec > 0:
                dt = datetime.fromtimestamp(sec, tz=IST)
                return dt.isoformat(), dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")
        except (ValueError, OSError, OverflowError):
            pass

    return "", "", ""


def normalize_payment(payment_str: str | None) -> str:
    """Normalize payment gateway and instrument strings into uniform categories."""
    if not payment_str:
        return "Unknown"
    p = payment_str.lower()
    if "incomplete" in p:
        return "Incomplete"
    if "upi" in p:
        return "UPI"
    if "card" in p or "credit" in p or "debit" in p:
        return "Card"
    if "cash" in p or "cod" in p:
        return "Cash"
    if any(k in p for k in ["wallet", "paytm", "phonepe", "simpl", "lazy", "amazon"]):
        return "Wallet"
    if "netbanking" in p or "net_banking" in p:
        return "NetBanking"
    return payment_str.strip()


def normalize_address(raw_label: str | None, address_text: str | None = None) -> str:
    """Clean and normalize delivery address labels without hardcoded neighborhood or personal landmark dictionaries."""
    if not address_text or not address_text.strip():
        return "Unknown"
    lbl = (raw_label or "").strip()
    if not lbl or lbl.lower() in {
        "other",
        "oth",
        "delivered",
        "payment incomplete",
        "processing refund",
    }:
        return "Other"
    return lbl.title()


def hash_address(label: str | None, address: str | None) -> str:
    """Generate deterministic 12-char identifier for delivery address."""
    raw = f"{(label or '').strip()}_{(address or '').strip()}".lower()
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:12]


def infer_veg_tag(
    name: str | None,
    explicit_val: int | None = None,
    tags: list[str] | None = None,
) -> int | None:
    """Classify 1 = Veg, 0 = Non-Veg, None = Unknown."""
    if explicit_val is not None:
        return explicit_val
    if tags:
        t_lower = [t.lower() for t in tags]
        if any(k in t_lower for k in ["non-veg", "egg", "chicken", "mutton"]):
            return 0
        if "veg" in t_lower:
            return 1

    n = (name or "").lower()
    if re.search(r"\b(chicken|mutton|egg|eggs|fish|prawn|prawns|meat|pepperoni)\b", n):
        return 0
    if any(
        k in n
        for k in [
            "veg",
            "paneer",
            "dal",
            "soya",
            "cheese",
            "mushroom",
            "aloo",
            "paratha",
            "chili garlic",
            "garlic twisty",
            "taco",
            "margherita",
            "corn",
        ]
    ):
        return 1
    return None


def classify_cuisine(dish_name: str | None, rest_name: str | None) -> str:
    """Classify dishes into high-level cuisine families for visualization."""
    dn = (dish_name or "").lower()
    rn = (rest_name or "").lower()

    if any(
        k in dn
        for k in [
            "noodle",
            "fried rice",
            "chowmein",
            "chilli paneer",
            "schezwan",
            "manchurian",
            "kimchi",
        ]
    ):
        return "Chinese & Asian"
    if any(k in dn for k in ["burger", "snacker", "nikku"]) or "burger" in rn:
        return "Burgers & Sandwiches"
    if (
        any(
            k in dn
            for k in ["pizza", "pasta", "garlic bread", "calzone", "lasagna", "twisty", "taco"]
        )
        or "pizza" in rn
        or "pino" in rn
        or "rominus" in rn
        or "domino" in rn
    ):
        return "Pizza & Italian"
    if any(k in dn for k in ["momo", "wings", "fries", "parcel", "nugget", "popcorn", "crispy"]):
        return "Fried Chicken & Finger Bites"
    if (
        any(
            k in dn
            for k in [
                "biryani",
                "paratha",
                "shawarma",
                "kebab",
                "tikka",
                "curry",
                "roti",
                "rice",
                "dal",
            ]
        )
        or "al-baik" in rn
        or "shah ghouse" in rn
        or "dastarkhwan" in rn
    ):
        return "Mughlai, Shawarma & Desi"
    if (
        any(
            k in dn
            for k in [
                "waffle",
                "shake",
                "cake",
                "ice cream",
                "dessert",
                "brownie",
                "cookie",
                "sweet",
                "mousse",
            ]
        )
        or "sweet luscious" in rn
    ):
        return "Desserts & Shakes"
    if any(k in dn for k in ["box", "thali", "meal", "combo"]):
        return "Thalis & Value Meals"
    return "Other Delicacies"


# ==========================================
# 2. DATABASE MANAGEMENT & INGESTION
# ==========================================


class AnalyticsDB:
    """Manages SQLite schema and ingestion for multi-platform food order history."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        self.path = Path(db_path) if db_path is not None else DEFAULT_DB_PATH
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def connect(self, timeout: float = 30.0) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=timeout)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute(f"PRAGMA busy_timeout = {int(timeout * 1000)};")
        return conn

    @contextmanager
    def connection(self, timeout: float = 30.0) -> Iterator[sqlite3.Connection]:
        conn = self.connect(timeout=timeout)
        try:
            yield conn
        finally:
            conn.close()

    def init_db(self) -> None:
        with self.connection() as conn:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA busy_timeout = 30000;")
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                phone TEXT NOT NULL,
                local_id TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS archive_imports (
                account_id TEXT NOT NULL, platform TEXT NOT NULL,
                history_complete INTEGER NOT NULL, details_complete INTEGER NOT NULL,
                lifetime_complete INTEGER NOT NULL, order_count INTEGER NOT NULL,
                imported_at TEXT NOT NULL, PRIMARY KEY(account_id, platform)
            );

            CREATE TABLE IF NOT EXISTS partial_import_receipts (
                job_id TEXT PRIMARY KEY
            );

            CREATE TABLE IF NOT EXISTS restaurants (
                id TEXT PRIMARY KEY,
                platform TEXT NOT NULL,
                platform_restaurant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                locality TEXT,
                city TEXT,
                address TEXT,
                latitude REAL,
                longitude REAL,
                cuisine TEXT
            );

            CREATE TABLE IF NOT EXISTS delivery_addresses (
                id TEXT PRIMARY KEY,
                label TEXT,
                normalized_label TEXT,
                full_address TEXT NOT NULL,
                city TEXT,
                latitude REAL,
                longitude REAL
            );

            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                platform_order_id TEXT NOT NULL,
                order_timestamp TEXT NOT NULL,
                order_date TEXT NOT NULL,
                order_time TEXT NOT NULL,
                order_status TEXT NOT NULL,
                payment_method TEXT,
                restaurant_id TEXT,
                delivery_address_id TEXT,
                final_amount_paid REAL NOT NULL,
                item_subtotal REAL,
                total_discount REAL DEFAULT 0,
                discount_percentage REAL DEFAULT 0,
                delivery_fee REAL DEFAULT 0,
                delivery_fee_discount REAL DEFAULT 0,
                packaging_fee REAL DEFAULT 0,
                platform_fee REAL DEFAULT 0,
                total_tax REAL DEFAULT 0,
                user_rating REAL,
                FOREIGN KEY (account_id) REFERENCES accounts(id),
                FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
                FOREIGN KEY (delivery_address_id) REFERENCES delivery_addresses(id)
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                unit_price REAL,
                total_price REAL,
                is_veg INTEGER,
                category TEXT,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS quarantine (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                platform_order_id TEXT,
                reason TEXT NOT NULL,
                error_details TEXT,
                raw_payload TEXT,
                quarantined_at TEXT NOT NULL,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            );

            CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
            CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(platform);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
            CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id);
            CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
            CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
            CREATE INDEX IF NOT EXISTS idx_items_name ON order_items(item_name);
            CREATE INDEX IF NOT EXISTS idx_quarantine_account ON quarantine(account_id);
            CREATE INDEX IF NOT EXISTS idx_quarantine_platform ON quarantine(platform, platform_order_id);
            """)

            columns = {r[1] for r in conn.execute("PRAGMA table_info(orders)")}
            for name, sql_type in {
                "food_discount": "REAL DEFAULT 0",
                "tip": "REAL DEFAULT 0",
                "other_charges": "REAL DEFAULT 0",
                "refund_amount": "REAL DEFAULT 0",
                "reported_savings": "REAL DEFAULT 0",
                "reconciliation_difference": "REAL",
                "financial_verified": "INTEGER DEFAULT 0",
                "source_complete": "INTEGER DEFAULT 0",
                "source_bill_json": "TEXT",
                "discount_breakdown_json": "TEXT",
                "source_hash": "TEXT",
            }.items():
                if name not in columns:
                    try:
                        conn.execute(f"ALTER TABLE orders ADD COLUMN {name} {sql_type}")
                    except sqlite3.OperationalError as exc:  # a concurrent init added it first
                        if "duplicate column" not in str(exc):
                            raise
            conn.commit()

    def record_quarantine(
        self,
        cursor: sqlite3.Cursor,
        account_id: str,
        platform: str,
        order_id: str,
        reason: str,
        error_details: str,
        raw_payload: Any,
    ) -> None:
        """Record a malformed order in the quarantine table for auditing."""
        try:
            payload_str = (
                json.dumps(raw_payload, ensure_ascii=False)
                if not isinstance(raw_payload, str)
                else raw_payload
            )
        except Exception:
            payload_str = str(raw_payload)

        cursor.execute(
            """
            INSERT INTO quarantine (
                account_id, platform, platform_order_id, reason, error_details, raw_payload, quarantined_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                platform.upper(),
                str(order_id),
                reason,
                error_details,
                payload_str,
                datetime.now(IST).isoformat(),
            ),
        )

    def record_financials(
        self,
        cursor,
        order_id,
        *,
        food_discount,
        tip,
        other_charges,
        refund_amount,
        reported_savings,
        source_complete,
        source_bill,
        discounts,
    ):
        row = cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        expected = (
            row["item_subtotal"]
            + row["delivery_fee"]
            + row["packaging_fee"]
            + row["platform_fee"]
            + row["total_tax"]
            + tip
            + other_charges
            - food_discount
        )
        difference = round(row["final_amount_paid"] - expected, 2)
        verified = bool(
            source_complete
            and abs(difference) <= 1
            and row["order_date"]
            and row["order_status"] == "DELIVERED"
        )
        cursor.execute(
            """UPDATE orders SET food_discount=?, tip=?, other_charges=?,
            refund_amount=?, reported_savings=?, reconciliation_difference=?, financial_verified=?,
            source_complete=?, source_bill_json=?, discount_breakdown_json=? WHERE id=?""",
            (
                food_discount,
                tip,
                other_charges,
                refund_amount,
                reported_savings,
                difference,
                int(verified),
                int(source_complete),
                json.dumps(source_bill, ensure_ascii=False),
                json.dumps(discounts, ensure_ascii=False),
                order_id,
            ),
        )

    def check_order_owner(self, cursor, order_id, account_id):
        existing = cursor.execute(
            "SELECT account_id FROM orders WHERE id=?", (order_id,)
        ).fetchone()
        if existing and existing[0] != account_id:
            raise KhataError("Order belongs to another local account; import stopped")

    def ingest_swiggy_order(
        self, cursor: sqlite3.Cursor, account_id: str, order_id: str, order_data: dict[str, Any]
    ) -> bool:
        """Parse and upsert a Swiggy mobile order record."""
        details = order_data.get("details") or {}
        orders_list = details.get("orders") or []
        ord0 = orders_list[0] if orders_list else {}
        history = order_data.get("history") or {}

        unique_order_id = f"SWIGGY_{order_id}"
        self.check_order_owner(cursor, unique_order_id, account_id)
        cursor.execute(
            "INSERT OR IGNORE INTO accounts (id, phone, local_id) VALUES (?, ?, ?)",
            (account_id, "Unknown", account_id),
        )

        # 1. Timestamps
        iso_ts, o_date, o_time = parse_date(
            ord0.get("order_time") or history.get("orderedTime"),
            ord0.get("ordered_time_in_seconds"),
        )

        # 2. Restaurant
        rest_id_raw = str(ord0.get("restaurant_id") or history.get("restaurantId") or "unknown")
        rest_id = f"SWIGGY_REST_{rest_id_raw}"
        rest_name = (
            ord0.get("restaurant_name") or history.get("restaurantName") or "Unknown Restaurant"
        )
        rest_locality = ord0.get("restaurant_locality") or history.get("restaurantAreaName")
        rest_city = ord0.get("restaurant_city_name")
        rest_address = ord0.get("restaurant_address")
        lat_lng = str(ord0.get("restaurant_lat_lng") or "").split(",")
        lat = clean_num(lat_lng[0], None) if lat_lng else None
        lng = clean_num(lat_lng[1], None) if len(lat_lng) > 1 else None
        cuisines = ord0.get("restaurant_cuisine")
        cuisine_str = ", ".join(cuisines) if isinstance(cuisines, list) else None

        cursor.execute(
            """
            INSERT INTO restaurants (
                id, platform, platform_restaurant_id, name, locality, city, address, latitude, longitude, cuisine
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, locality=excluded.locality,
                city=excluded.city, address=excluded.address, latitude=excluded.latitude,
                longitude=excluded.longitude, cuisine=excluded.cuisine
            """,
            (
                rest_id,
                "SWIGGY",
                rest_id_raw,
                rest_name,
                rest_locality,
                rest_city,
                rest_address,
                lat,
                lng,
                cuisine_str,
            ),
        )

        # 3. Delivery Address
        addr_info = ord0.get("delivery_address") or {}
        raw_label = addr_info.get("annotation") or "Other"
        addr_text = addr_info.get("address") or ""
        norm_label = normalize_address(raw_label, addr_text)
        addr_id = hash_address(account_id + ":" + raw_label, addr_text)
        addr_city = addr_info.get("city")
        addr_lat = clean_num(addr_info.get("lat"), None)
        addr_lng = clean_num(addr_info.get("lng"), None)

        cursor.execute(
            """
            INSERT INTO delivery_addresses (
                id, label, normalized_label, full_address, city, latitude, longitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET normalized_label=excluded.normalized_label,
                city=excluded.city, latitude=excluded.latitude, longitude=excluded.longitude
            """,
            (addr_id, raw_label, norm_label, addr_text, addr_city, addr_lat, addr_lng),
        )

        # 4. Financials
        item_subtotal = clean_num(ord0.get("item_total"))
        food_discount = clean_num(ord0.get("order_discount", ord0.get("coupon_discount")))
        deliv_disc = clean_num(ord0.get("free_delivery_discount_hit")) + clean_num(
            ord0.get("delivery_discount_hit")
        )
        if not deliv_disc:
            deliv_disc = clean_num(
                (ord0.get("deliveryFeeCouponBreakup") or {}).get("totalDeliveryFeeDiscount")
            )
        total_discount = food_discount + deliv_disc
        final_paid = clean_num(
            ord0.get(
                "order_total_with_tip",
                ord0.get("order_total", ord0.get("net_total", history.get("orderTotal"))),
            )
        )
        delivery_fee = clean_num(
            ord0.get("discounted_total_delivery_fee", ord0.get("order_delivery_charge"))
        )
        # Older payloads leave named packing at zero while the bill lists a charge.
        charges = ord0.get("charges") or {}
        packaging_fee = clean_num(ord0.get("restaurant_packing_charges")) or clean_num(
            charges.get("Packing Charges")
        )
        platform_fee = clean_num(ord0.get("convenience_fees", ord0.get("convenience_fee")))
        if not platform_fee:
            platform_fee = clean_num(charges.get("Convenience Fee"))
        total_tax = clean_num(
            ord0.get(
                "total_tax_including_platform_fee",
                clean_num(ord0.get("order_tax", ord0.get("total_tax")))
                + clean_num(ord0.get("platform_fee_tax")),
            )
        )
        tip = (
            max(0, clean_num(ord0.get("order_total_with_tip")) - clean_num(ord0.get("order_total")))
            if "order_total" in ord0
            else 0
        )
        other_charges = (
            clean_num(ord0.get("subscription_total"))
            + clean_num(ord0.get("restaurant_fulfilment_charges"))
            + clean_num(ord0.get("priority_delivery_fee"))
        )
        rating = clean_num(ord0.get("restaurant_order_rating") or history.get("foodRating"), None)

        gross_baseline = final_paid + total_discount
        discount_pct = (
            round((total_discount / gross_baseline) * 100, 2) if gross_baseline > 0 else 0.0
        )

        raw_status = str(
            ord0.get("order_status")
            or ord0.get("order_delivery_status")
            or history.get("orderStatus")
            or ""
        ).upper()
        if "INCOMPLETE" in raw_status:
            status = "PAYMENT_INCOMPLETE"
        elif raw_status in {"DELIVERED", "COMPLETED", "COMPLETE", "DELIVERY_DELIVERED"}:
            status = "DELIVERED"
        elif "CANCEL" in raw_status:
            status = "CANCELLED"
        else:
            status = raw_status or "OTHER"

        cursor.execute(
            """
            INSERT OR REPLACE INTO orders (
                id, account_id, platform, platform_order_id, order_timestamp, order_date, order_time,
                order_status, payment_method, restaurant_id, delivery_address_id,
                final_amount_paid, item_subtotal, total_discount, discount_percentage,
                delivery_fee, delivery_fee_discount, packaging_fee, platform_fee, total_tax, user_rating
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                unique_order_id,
                account_id,
                "SWIGGY",
                order_id,
                iso_ts,
                o_date,
                o_time,
                status,
                normalize_payment(
                    ord0.get("payment_method") or ord0.get("payment_method_involved")
                ),
                rest_id,
                addr_id,
                final_paid,
                item_subtotal,
                total_discount,
                discount_pct,
                delivery_fee,
                deliv_disc,
                packaging_fee,
                platform_fee,
                total_tax,
                rating,
            ),
        )

        self.record_financials(
            cursor,
            unique_order_id,
            food_discount=food_discount,
            tip=tip,
            other_charges=other_charges,
            refund_amount=clean_num(ord0.get("edit_refund_amount")),
            reported_savings=clean_num(ord0.get("savings_shown_to_customer")),
            source_complete=bool(ord0 and "item_total" in ord0 and "order_total" in ord0),
            source_bill={
                k: v
                for k, v in ord0.items()
                if any(part in k for part in ("total", "discount", "fee", "charge", "tax", "tip"))
            },
            discounts={"food": food_discount, "delivery": deliv_disc},
        )

        # 5. Order Line Items
        cursor.execute("DELETE FROM order_items WHERE order_id = ?", (unique_order_id,))
        for it in ord0.get("order_items") or []:
            qty = max(1, int(clean_num(it.get("quantity"), 1)))
            total_price = clean_num(it.get("final_price", it.get("subtotal", it.get("total"))))
            unit_price = clean_num(it.get("base_price")) or (
                total_price / qty if qty > 0 else total_price
            )

            raw_veg = it.get("is_veg")
            explicit_veg = (
                1
                if raw_veg in ("1", 1, True, "yes")
                else (0 if raw_veg in ("0", 0, False, "no") else None)
            )
            item_name = it.get("name") or "Unknown Item"
            is_veg = infer_veg_tag(item_name, explicit_val=explicit_veg)
            category = classify_cuisine(item_name, rest_name)

            cursor.execute(
                """
                INSERT INTO order_items (
                    order_id, item_name, quantity, unit_price, total_price, is_veg, category
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (unique_order_id, item_name, qty, unit_price, total_price, is_veg, category),
            )
        return True

    def ingest_zomato_order(
        self, cursor: sqlite3.Cursor, account_id: str, order_id: str, order_data: dict[str, Any]
    ) -> bool:
        """Parse and upsert a Zomato mobile order record."""
        details = order_data.get("details") or {}
        order_meta = details.get("order") or {}
        items_list = order_meta.get("items") or []
        history = order_data.get("history") or {}

        unique_order_id = f"ZOMATO_{order_id}"
        self.check_order_owner(cursor, unique_order_id, account_id)
        cursor.execute(
            "INSERT OR IGNORE INTO accounts (id, phone, local_id) VALUES (?, ?, ?)",
            (account_id, "Unknown", account_id),
        )

        # 1. Timestamps
        iso_ts, o_date, o_time = parse_date(
            details.get("created_at_str"),
            details.get("created_at") or details.get("timestamp"),
        )

        # 2. Restaurant
        res_info = details.get("restaurant") or {}
        location_info = res_info.get("location") or {}
        rest_id_raw = str(res_info.get("id") or "unknown")
        rest_id = f"ZOMATO_REST_{rest_id_raw}"
        rest_name = (
            res_info.get("name")
            or history.get("top_container", {}).get("title")
            or "Unknown Restaurant"
        )
        rest_locality = location_info.get("locality")
        rest_city = location_info.get("city")
        rest_address = location_info.get("address")
        lat = clean_num(location_info.get("latitude"), None)
        lng = clean_num(location_info.get("longitude"), None)

        cursor.execute(
            """
            INSERT INTO restaurants (
                id, platform, platform_restaurant_id, name, locality, city, address, latitude, longitude, cuisine
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, locality=excluded.locality,
                city=excluded.city, address=excluded.address, latitude=excluded.latitude,
                longitude=excluded.longitude, cuisine=excluded.cuisine
            """,
            (
                rest_id,
                "ZOMATO",
                rest_id_raw,
                rest_name,
                rest_locality,
                rest_city,
                rest_address,
                lat,
                lng,
                None,
            ),
        )

        # 3. Delivery Address
        del_details = details.get("delivery_address_obj") or {}
        raw_label = del_details.get("alias") or details.get("delivery_label") or "Other"
        addr_text = del_details.get("full_address_text") or details.get("delivery_address") or ""
        norm_label = normalize_address(raw_label, addr_text)
        addr_id = hash_address(account_id + ":" + raw_label, addr_text)
        addr_city = del_details.get("city") or del_details.get("subzone_name")
        addr_lat = clean_num(del_details.get("latitude"), None)
        addr_lng = clean_num(del_details.get("longitude"), None)

        cursor.execute(
            """
            INSERT INTO delivery_addresses (
                id, label, normalized_label, full_address, city, latitude, longitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET normalized_label=excluded.normalized_label,
                city=excluded.city, latitude=excluded.latitude, longitude=excluded.longitude
            """,
            (addr_id, raw_label, norm_label, addr_text, addr_city, addr_lat, addr_lng),
        )

        # 4. Financials from items breakdown
        dishes: list[dict[str, Any]] = []
        delivery_fee = 0.0
        deliv_disc = 0.0
        packaging_fee = 0.0
        platform_fee = 0.0
        total_tax = 0.0
        voucher_discounts = 0.0
        savings_val = 0.0
        other_charges = 0.0
        tip = 0.0
        discounts = {}
        known_types = {
            "dish",
            "item_total",
            "subtotal2",
            "total_user",
            "savings",
            "charge",
            "subtotal_charge",
            "platform_charge",
            "tax",
            "voucher_discount",
            "discount",
            "salt_discount",
            "resell_discount",
            "gold_subscription_charge",
            "donations",
            "tip",
            "popUpItems",
        }
        unknown_types = set()
        direct_tax = any((w.get("item") or {}).get("type") == "tax" for w in items_list)
        direct_packaging = any(
            (w.get("item") or {}).get("type") in {"charge", "subtotal_charge"}
            and "pack" in (w["item"].get("item_name") or "").lower()
            for w in items_list
        )
        for wrapper in items_list:
            it = wrapper.get("item") or {}
            itype = it.get("type")
            cost = clean_num(it.get("total_cost"))
            iname = (it.get("item_name") or "").lower()
            dcost = (it.get("display_cost") or "").strip().upper()
            actual = 0.0 if dcost == "FREE" else clean_num(dcost, cost)
            if itype == "dish":
                dishes.append(it)
            elif itype in ("charge", "subtotal_charge"):
                if "deliver" in iname or "rider" in iname:
                    delivery_fee += actual
                    deliv_disc += max(0.0, cost - actual)
                elif "pack" in iname or "handling" in iname:
                    packaging_fee += actual
                else:
                    other_charges += actual
            elif itype == "platform_charge":
                platform_fee += actual
            elif itype == "tax":
                total_tax += actual
            elif itype in ("voucher_discount", "discount", "salt_discount", "resell_discount"):
                voucher_discounts += abs(cost)
                discounts[it.get("item_name") or itype] = abs(cost)
            elif itype == "savings":
                savings_val = max(savings_val, abs(cost))
            elif itype in ("gold_subscription_charge", "donations"):
                other_charges += actual
            elif itype == "tip":
                tip += actual
            elif itype == "popUpItems":
                if "tax" in iname and not direct_tax:
                    total_tax += actual
                elif "pack" in iname and not direct_packaging:
                    packaging_fee += actual
            elif itype not in known_types:
                unknown_types.add(str(itype))

        subtotal_row = next(
            (
                (w.get("item") or {})
                for w in items_list
                if (w.get("item") or {}).get("type") == "item_total"
            ),
            None,
        )
        item_subtotal = (
            clean_num(subtotal_row.get("total_cost"))
            if subtotal_row
            else sum(clean_num(d.get("total_cost")) for d in dishes)
        )
        total_discount = voucher_discounts + deliv_disc
        final_paid = clean_num(order_meta.get("total_cost", details.get("total_cost")))
        gross_baseline = final_paid + total_discount
        discount_pct = round(total_discount / gross_baseline * 100, 2) if gross_baseline > 0 else 0

        raw_status = (
            details.get("current_status")
            or details.get("status_text")
            or str(details.get("status") or "")
        ).upper()
        if "INCOMPLETE" in raw_status or "PAYMENT_INCOMPLETE" in raw_status:
            status = "PAYMENT_INCOMPLETE"
        elif "CANCEL" in raw_status:
            status = "CANCELLED"
        elif "DELIVER" in raw_status or raw_status == "6":
            status = "DELIVERED"
        else:
            status = raw_status or "OTHER"

        cursor.execute(
            """
            INSERT OR REPLACE INTO orders (
                id, account_id, platform, platform_order_id, order_timestamp, order_date, order_time,
                order_status, payment_method, restaurant_id, delivery_address_id,
                final_amount_paid, item_subtotal, total_discount, discount_percentage,
                delivery_fee, delivery_fee_discount, packaging_fee, platform_fee, total_tax, user_rating
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                unique_order_id,
                account_id,
                "ZOMATO",
                order_id,
                iso_ts,
                o_date,
                o_time,
                status,
                normalize_payment(details.get("payment_method") or details.get("payment_category")),
                rest_id,
                addr_id,
                final_paid,
                item_subtotal,
                total_discount,
                discount_pct,
                delivery_fee,
                deliv_disc,
                packaging_fee,
                platform_fee,
                total_tax,
                None,
            ),
        )

        self.record_financials(
            cursor,
            unique_order_id,
            food_discount=voucher_discounts,
            tip=tip,
            other_charges=other_charges,
            refund_amount=clean_num(details.get("refund_amount")),
            reported_savings=savings_val,
            source_complete=bool(items_list and "total_cost" in order_meta and not unknown_types),
            source_bill=items_list,
            discounts=discounts,
        )

        # 5. Items
        cursor.execute("DELETE FROM order_items WHERE order_id = ?", (unique_order_id,))
        for d in dishes:
            qty = max(1, int(clean_num(d.get("quantity"), 1)))
            total_price = clean_num(d.get("total_cost"))
            unit_price = clean_num(d.get("unit_cost")) or (
                total_price / qty if qty > 0 else total_price
            )
            item_name = d.get("item_name") or "Unknown Item"
            tags = d.get("tag_slugs") or []
            is_veg = infer_veg_tag(item_name, tags=tags)
            category = classify_cuisine(item_name, rest_name)

            cursor.execute(
                """
                INSERT INTO order_items (
                    order_id, item_name, quantity, unit_price, total_price, is_veg, category
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (unique_order_id, item_name, qty, unit_price, total_price, is_veg, category),
            )
        return True

    def ingest_account(
        self, storage: Storage, local_id: str, *, incremental: bool = True, partial_job_id: str | None = None
    ) -> dict[str, Any]:
        """Ingest all platform histories saved under a specific local account."""
        acc_path = storage.account_path(local_id)
        if not acc_path.exists():
            if partial_job_id is not None:
                with self.connection() as conn:
                    conn.execute("INSERT OR IGNORE INTO partial_import_receipts VALUES (?)", (partial_job_id,))
                    conn.commit()
            return {
                "swiggy": 0,
                "zomato": 0,
                "total": 0,
                "quarantined": 0,
                "quarantine": [],
            }

        meta = read_json(acc_path / "account.json")
        phone = meta.get("phone_suffix") or meta.get("phone") or "Unknown"
        phone = phone[-4:] if re.fullmatch(r"[0-9]{4,}", phone) else "Unknown"

        counts: dict[str, Any] = {
            "swiggy": 0,
            "zomato": 0,
            "total": 0,
            "quarantined": 0,
            "quarantine": [],
        }
        with self.connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """INSERT INTO accounts (id, phone, local_id) VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET phone=excluded.phone, local_id=excluded.local_id""",
                (local_id, phone, local_id),
            )

            for provider, ingest in (
                ("swiggy", self.ingest_swiggy_order),
                ("zomato", self.ingest_zomato_order),
            ):
                archive_path = acc_path / f"{provider}-history.json"
                if not archive_path.exists():
                    continue
                archive = read_json(archive_path)
                if not isinstance(archive, dict) or not isinstance(archive.get("orders"), dict):
                    raise KhataError(f"Invalid {provider} archive")

                existing_oids: set[str] = set()
                stored_hashes: dict[str, str | None] = {}
                if incremental:
                    # An order is skipped only when its archive content is unchanged since it was imported.
                    cursor.execute(
                        "SELECT platform_order_id, source_hash FROM orders WHERE account_id = ? AND platform = ?",
                        (local_id, provider.upper()),
                    )
                    stored_hashes = {str(row[0]): row[1] for row in cursor.fetchall()}
                    cursor.execute(
                        "SELECT platform_order_id FROM quarantine WHERE account_id = ? AND platform = ?",
                        (local_id, provider.upper()),
                    )
                    existing_oids.update(str(row[0]) for row in cursor.fetchall())

                cursor.execute(
                    """INSERT INTO archive_imports VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(account_id, platform) DO UPDATE SET
                    history_complete=excluded.history_complete, details_complete=excluded.details_complete,
                    lifetime_complete=excluded.lifetime_complete, order_count=excluded.order_count,
                    imported_at=excluded.imported_at""",
                    (
                        local_id,
                        provider.upper(),
                        int(archive.get("history_complete") is True),
                        int(archive.get("details_complete") is True),
                        int(archive.get("lifetime_complete") is True),
                        len(archive["orders"]),
                        datetime.now(IST).isoformat(),
                    ),
                )
                for oid, order in archive["orders"].items():
                    oid_str = str(oid)
                    digest = hashlib.sha256(json.dumps(order, sort_keys=True, default=str).encode()).hexdigest()
                    if incremental and (oid_str in existing_oids or stored_hashes.get(oid_str) == digest):
                        continue
                    sp_id = f"sp_{re.sub(r'[^a-zA-Z0-9_]', '_', oid_str)}"
                    cursor.execute(f"SAVEPOINT {sp_id}")
                    try:
                        if not isinstance(order, dict):
                            raise ValueError(
                                f"Malformed order payload: expected dict, got {type(order).__name__}"
                            )
                        if not order.get("details") and not order.get("history"):
                            raise ValueError("Malformed order: missing both details and history")
                        if ingest(cursor, local_id, oid_str, order):
                            counts[provider] += 1
                            cursor.execute(
                                "UPDATE orders SET source_hash = ? WHERE account_id = ? AND platform = ? AND platform_order_id = ?",
                                (digest, local_id, provider.upper(), oid_str),
                            )
                        cursor.execute(f"RELEASE SAVEPOINT {sp_id}")
                    except KhataError as exc:
                        cursor.execute(f"ROLLBACK TO SAVEPOINT {sp_id}")
                        cursor.execute(f"RELEASE SAVEPOINT {sp_id}")
                        if "another local account" in str(exc):
                            raise
                        reason = str(exc)
                        error_details = traceback.format_exc()
                        self.record_quarantine(
                            cursor, local_id, provider, oid_str, reason, error_details, order
                        )
                        counts["quarantined"] += 1
                        counts["quarantine"].append(
                            {
                                "order_id": oid_str,
                                "platform": provider.upper(),
                                "reason": reason,
                                "error_details": error_details,
                            }
                        )
                    except Exception as exc:
                        cursor.execute(f"ROLLBACK TO SAVEPOINT {sp_id}")
                        cursor.execute(f"RELEASE SAVEPOINT {sp_id}")
                        reason = f"Malformed order: {type(exc).__name__}: {exc}"
                        error_details = traceback.format_exc()
                        self.record_quarantine(
                            cursor, local_id, provider, oid_str, reason, error_details, order
                        )
                        counts["quarantined"] += 1
                        counts["quarantine"].append(
                            {
                                "order_id": oid_str,
                                "platform": provider.upper(),
                                "reason": reason,
                                "error_details": error_details,
                            }
                        )

            if partial_job_id is not None:
                conn.execute("INSERT OR IGNORE INTO partial_import_receipts VALUES (?)", (partial_job_id,))
            conn.commit()

        counts["total"] = counts["swiggy"] + counts["zomato"]
        return counts

    def open_order_ids(self, account_id: str, platform: str, days: int = 14, limit: int = 50) -> list[str]:
        """Recent orders whose status is not final yet; the next sync fetches their details again."""
        cutoff = (datetime.now(IST) - timedelta(days=days)).date().isoformat()
        with self.connection() as conn:
            return [
                str(r[0])
                for r in conn.execute(
                    "SELECT platform_order_id FROM orders WHERE account_id = ? AND platform = ? AND order_date >= ? "
                    "AND order_status NOT IN ('DELIVERED', 'CANCELLED') ORDER BY order_date DESC LIMIT ?",
                    (account_id, platform.upper(), cutoff, limit),
                )
            ]

    def ingest_all(self, storage: Storage, *, incremental: bool = True) -> dict[str, Any]:
        """Ingest histories from all accounts found in storage."""
        total_counts: dict[str, Any] = {
            "swiggy": 0,
            "zomato": 0,
            "total": 0,
            "quarantined": 0,
            "quarantine": [],
            "accounts": 0,
        }
        if not storage.accounts_dir.exists():
            return total_counts

        for path in storage.accounts_dir.iterdir():
            if not path.is_dir() or not (path / "account.json").exists():
                continue
            acc_counts = self.ingest_account(storage, path.name, incremental=incremental)
            total_counts["swiggy"] += acc_counts["swiggy"]
            total_counts["zomato"] += acc_counts["zomato"]
            total_counts["total"] += acc_counts["total"]
            total_counts["quarantined"] += acc_counts.get("quarantined", 0)
            total_counts["quarantine"].extend(acc_counts.get("quarantine", []))
            total_counts["accounts"] += 1

        return total_counts


def delete_account_data(
    db_path: Path | str, account_id: str, platform: str | None = None, job_ids: list[str] | None = None
) -> None:
    """Delete one account's rows (or one provider's) in a single transaction; raises and rolls back on any failure.

    Orphaned restaurants and addresses go too. `job_ids` are the account's jobs, whose import receipts are removed.
    """
    conn = sqlite3.connect(db_path, timeout=30.0, isolation_level=None)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.execute("BEGIN IMMEDIATE")
        try:
            scope, args = ("account_id = ?", [account_id])
            if platform:
                scope, args = (scope + " AND UPPER(platform) = UPPER(?)", [account_id, platform])
            conn.execute(f"DELETE FROM orders WHERE {scope}", args)  # items cascade
            conn.execute("DELETE FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)")
            conn.execute(f"DELETE FROM quarantine WHERE {scope}", args)
            conn.execute(f"DELETE FROM archive_imports WHERE {scope}", args)
            for job_id in job_ids or []:
                conn.execute("DELETE FROM partial_import_receipts WHERE job_id = ?", (job_id,))
            if not platform:
                conn.execute("DELETE FROM accounts WHERE id = ? OR local_id = ?", (account_id, account_id))
            conn.execute("DELETE FROM restaurants WHERE id NOT IN (SELECT restaurant_id FROM orders WHERE restaurant_id IS NOT NULL)")
            conn.execute("DELETE FROM delivery_addresses WHERE id NOT IN (SELECT delivery_address_id FROM orders WHERE delivery_address_id IS NOT NULL)")
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    finally:
        conn.close()
