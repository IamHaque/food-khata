"""Generate a deterministic, entirely fictional SQLite database for local development.

The database schema is created by :class:`food_khata.db.AnalyticsDB`; orders are
ingested through the same ``ingest_swiggy_order`` / ``ingest_zomato_order`` methods
used by the real importers, so the generated data exercises real parsing paths.

Usage::

    python scripts/make_dev_db.py --out .test-tmp/dev-data
    python scripts/make_dev_db.py --out .test-tmp/dev-data --large --seed 7

Then serve it (see section 1.1 of the project brief)::

    food-khata serve --db-path .test-tmp/dev-data/food_analytics.db

The generator refuses to write anywhere below ``~/.food-khata`` so development
data can never clobber a real, user-owned archive.
"""

import argparse
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from food_khata.db import IST, AnalyticsDB  # noqa: E402

DB_FILENAME = "food_analytics.db"
DEFAULT_SEED = 42
DEFAULT_ORDERS = 1_600
LARGE_ORDERS = 20_000
HISTORY_DAYS = 3 * 365
STREAK_DAYS = 10
END_DATE = date(2026, 10, 31)

ACCOUNTS = (
    ("alice", "9000000001"),
    ("bob", "9000000002"),
    ("carol", "9000000003"),
)

PAYMENT_METHODS = ("UPI", "UPI", "UPI", "Credit Card", "Cash", "Wallet", "NetBanking")

CITY_CENTERS = {
    "Bengaluru": (12.97, 77.64),
    "Pune": (18.52, 73.85),
    "Delhi": (28.61, 77.21),
    "Mumbai": (19.07, 72.88),
}

# (name, cuisine, city, locality)
BRANDS = (
    ("Fictional Dhaba", "Indian", "Bengaluru", "Indiranagar"),
    ("Paper Lantern Kitchen", "Chinese", "Bengaluru", "Koramangala"),
    ("Trattoria Fantasia", "Italian", "Bengaluru", "Jayanagar"),
    ("Basil & Bamboo", "Thai", "Bengaluru", "Indiranagar"),
    ("Casa Inventada", "Mexican", "Bengaluru", "Koramangala"),
    ("Northern Spice House", "Mughlai", "Delhi", "Saket"),
    ("Imaginary Tandoor", "Indian", "Delhi", "Hauz Khas"),
    ("Dragon Wok Fiction", "Chinese", "Delhi", "Saket"),
    ("Not Real Pizzeria", "Italian", "Delhi", "Hauz Khas"),
    ("Taco Make Believe", "Mexican", "Delhi", "Hauz Khas"),
    ("Deccan Dosa Corner", "South Indian", "Pune", "Baner"),
    ("Sample Street Thai", "Thai", "Pune", "Kothrud"),
    ("Placeholder Burger Co", "Burgers", "Pune", "Baner"),
    ("Demo Bowl Kitchen", "Healthy", "Pune", "Kothrud"),
    ("Bandra Biryani Bureau", "Mughlai", "Mumbai", "Bandra"),
    ("Andheri Noodle Lab", "Chinese", "Mumbai", "Andheri"),
    ("Fictional Dessert Bar", "Desserts", "Mumbai", "Bandra"),
    ("Mocktail Meals", "Indian", "Mumbai", "Andheri"),
)

# (dish name, is_veg, base price)
MENU = {
    "Indian": (
        ("Paneer Butter Masala", 1, 260),
        ("Dal Tadka", 1, 190),
        ("Veg Thali", 1, 240),
        ("Garlic Naan", 1, 60),
        ("Chicken Biryani", 0, 320),
        ("Butter Chicken", 0, 340),
    ),
    "Chinese": (
        ("Schezwan Noodles", 1, 220),
        ("Veg Manchurian", 1, 210),
        ("Fried Rice", 1, 190),
        ("Chilli Chicken", 0, 280),
        ("Kung Pao Prawns", 0, 330),
    ),
    "Italian": (
        ("Margherita Pizza", 1, 310),
        ("Garlic Bread", 1, 120),
        ("Veg Lasagna", 1, 340),
        ("Chicken Alfredo Pasta", 0, 360),
        ("Pepperoni Pizza", 0, 420),
    ),
    "Mexican": (
        ("Veg Taco", 1, 180),
        ("Nachos", 1, 210),
        ("Bean Burrito", 1, 260),
        ("Chicken Quesadilla", 0, 300),
    ),
    "Thai": (
        ("Veg Pad Thai", 1, 280),
        ("Thai Green Curry", 1, 310),
        ("Basil Fried Rice", 1, 240),
        ("Chicken Satay", 0, 290),
    ),
    "Mughlai": (
        ("Paneer Tikka", 1, 260),
        ("Rumali Roti", 1, 40),
        ("Chicken Kebab", 0, 290),
        ("Mutton Biryani", 0, 380),
        ("Chicken Shawarma", 0, 220),
    ),
    "South Indian": (
        ("Masala Dosa", 1, 150),
        ("Idli Sambar", 1, 110),
        ("Filter Coffee", 1, 60),
        ("Chicken Chettinad", 0, 320),
    ),
    "Desserts": (
        ("Chocolate Brownie", 1, 180),
        ("Mango Shake", 1, 140),
        ("Ice Cream Sundae", 1, 160),
    ),
    "Burgers": (
        ("Veg Burger", 1, 190),
        ("Fries", 1, 110),
        ("Chicken Burger", 0, 240),
    ),
    "Healthy": (
        ("Quinoa Bowl", 1, 280),
        ("Fruit Bowl", 1, 190),
        ("Grilled Chicken Salad", 0, 320),
    ),
}

# label, full address, city, locality, latitude, longitude
ADDRESSES = {
    "alice": (
        (
            "Home",
            "12 Fictional Residency, Indiranagar, Bengaluru",
            "Bengaluru",
            "Indiranagar",
            12.9719,
            77.6412,
        ),
        ("Work", "88 Imaginary Tech Park, Baner, Pune", "Pune", "Baner", 18.5590, 73.7797),
        ("Other", "5 Make Believe Lane, Saket, Delhi", "Delhi", "Saket", 28.5245, 77.2066),
    ),
    "bob": (
        (
            "Home",
            "44 Sample Street, Koramangala, Bengaluru",
            "Bengaluru",
            "Koramangala",
            12.9352,
            77.6245,
        ),
        ("Work", "7 Demo Towers, Andheri, Mumbai", "Mumbai", "Andheri", 19.1197, 72.8468),
        ("Other", "3 Placeholder Road, Kothrud, Pune", "Pune", "Kothrud", 18.5074, 73.8077),
    ),
    "carol": (
        ("Home", "91 Example Nagar, Bandra, Mumbai", "Mumbai", "Bandra", 19.0596, 72.8295),
        ("Work", "6 Test Avenue, Hauz Khas, Delhi", "Delhi", "Hauz Khas", 28.5494, 77.2001),
        (
            "Other",
            "2 Fictional Colony, Jayanagar, Bengaluru",
            "Bengaluru",
            "Jayanagar",
            12.9250,
            77.5938,
        ),
    ),
}

HOUR_WEIGHTS = (
    1,
    1,
    1,
    1,
    1,
    2,
    4,
    8,
    12,
    9,
    6,
    10,
    16,
    14,
    8,
    5,
    4,
    5,
    8,
    14,
    18,
    16,
    10,
    4,
)


def _protected(out_path: Path) -> bool:
    """True when *out_path* would write into a real user data directory."""
    target = Path(out_path).expanduser().resolve()
    real_root = (Path.home() / ".food-khata").resolve()
    if str(target) == str(real_root) or str(target).startswith(str(real_root) + "\\"):
        return True
    if str(target).startswith(str(real_root) + "/"):
        return True
    return any(part == ".food-khata" or part.startswith(".food-khata-") for part in target.parts)


def _refuse_if_protected(out_path: Path) -> None:
    if _protected(out_path):
        sys.exit("REFUSED")


def _timestamp(day: date, hour: int, minute: int) -> str:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST).isoformat()


def _pick_status(rng: random.Random) -> str:
    roll = rng.random()
    if roll < 0.86:
        return "DELIVERED"
    if roll < 0.96:
        return "CANCELLED"
    if roll < 0.99:
        return "PAYMENT_INCOMPLETE"
    return "OTHER"


def _build_specs(rng: random.Random, count: int) -> list[dict]:
    """Build one deterministic order description per order, in generation order."""
    days = [END_DATE - timedelta(days=offset) for offset in range(HISTORY_DAYS)]
    chosen_days = [rng.choice(days) for _ in range(count)]

    streak_start = END_DATE - timedelta(days=240)
    for offset in range(STREAK_DAYS):
        day = streak_start + timedelta(days=offset)
        if day not in chosen_days:
            chosen_days.append(day)

    specs: list[dict] = []
    for index, day in enumerate(chosen_days):
        if index < 6:
            account = ACCOUNTS[index % len(ACCOUNTS)][0]
            platform = "SWIGGY" if index < 3 else "ZOMATO"
        else:
            account = rng.choice(ACCOUNTS)[0]
            platform = "SWIGGY" if rng.random() < 0.55 else "ZOMATO"

        hour = index if index < 24 else rng.choices(range(24), weights=HOUR_WEIGHTS)[0]
        minute = rng.randrange(60)

        address = rng.choice(ADDRESSES[account])
        label, text, city, locality, lat, lng = address
        if rng.random() < 0.02:
            brand = None  # missing restaurant name/locality/city
        else:
            local = [b for b in BRANDS if b[2] == city]
            brand = rng.choice(local or list(BRANDS))

        status = _pick_status(rng)
        has_items = rng.random() >= 0.02
        complete_bill = rng.random() >= 0.03
        cuisine = brand[1] if brand else rng.choice(sorted(MENU))

        dishes = []
        if has_items:
            menu = MENU[cuisine]
            picks = rng.choices(menu, k=rng.choices((1, 2, 3, 4), weights=(3, 5, 4, 2))[0])
            for dish, is_veg, price in picks:
                quantity = rng.choice((1, 1, 2, 2, 3))
                unit = round(price * rng.choice((1.0, 1.0, 1.05, 0.9)), 2)
                dishes.append(
                    {
                        "name": dish,
                        "is_veg": is_veg,
                        "quantity": quantity,
                        "unit_price": unit,
                        "total_price": round(unit * quantity, 2),
                    }
                )

        subtotal = round(sum(d["total_price"] for d in dishes), 2)
        if subtotal == 0:
            subtotal = float(rng.choice((180, 240, 320, 410)))

        food_discount = (
            round(subtotal * rng.choice((10, 15, 20, 25, 30, 40)) / 100, 2)
            if rng.random() < 0.55
            else 0.0
        )
        delivery_base = float(rng.choice((19, 25, 29, 35, 45, 59)))
        delivery_paid = 0.0 if rng.random() < 0.4 else delivery_base
        delivery_discount = round(delivery_base - delivery_paid, 2)
        packaging_fee = float(rng.choice((0, 5, 10, 15, 20, 25)))
        platform_fee = float(rng.choice((2, 3, 5, 7, 10, 12)))
        total_tax = round(subtotal * 0.05, 2)
        tip = (
            float(rng.choice((0, 0, 0, 10, 20, 30, 50)))
            if status == "DELIVERED" and rng.random() < 0.35
            else 0.0
        )
        other_charges = float(rng.choice((0, 0, 0, 5, 10, 15, 25, 35)))
        mismatch = rng.choice((3.5, 7.0, 12.0, 25.0, -4.0)) if rng.random() < 0.08 else 0.0

        final = round(
            subtotal
            + delivery_paid
            + packaging_fee
            + platform_fee
            + total_tax
            + tip
            + other_charges
            - food_discount
            + mismatch,
            2,
        )
        refund = 0.0
        if status == "CANCELLED" and rng.random() < 0.7:
            refund = final

        specs.append(
            {
                "index": index,
                "day": day,
                "hour": hour,
                "minute": minute,
                "account": account,
                "platform": platform,
                "status": status,
                "address": (label, text, city, locality, lat, lng),
                "brand": brand,
                "cuisine": cuisine,
                "dishes": dishes,
                "rating": (
                    rng.choice((None, 4.0, 4.0, 5.0, 3.0)) if status == "DELIVERED" else None
                ),
                "payment": rng.choice(PAYMENT_METHODS),
                "subtotal": subtotal,
                "food_discount": food_discount,
                "delivery_base": delivery_base,
                "delivery_paid": delivery_paid,
                "delivery_discount": delivery_discount,
                "packaging_fee": packaging_fee,
                "platform_fee": platform_fee,
                "total_tax": total_tax,
                "tip": tip,
                "other_charges": other_charges,
                "final": final,
                "refund": refund,
                "complete_bill": complete_bill,
            }
        )
    return specs


def _restaurant_fields(spec: dict) -> dict:
    brand = spec["brand"]
    if brand is None:
        return {"id": 9000, "name": None, "locality": None, "city": None}
    for position, item in enumerate(BRANDS, start=1):
        if item is brand:
            name, _, city, locality = item
            return {"id": position, "name": name, "locality": locality, "city": city}
    raise AssertionError("brand not found")


def _swiggy_payload(rng: random.Random, spec: dict) -> dict:
    restaurant = _restaurant_fields(spec)
    label, text, city, locality, lat, lng = spec["address"]
    brand = spec["brand"]
    rest_lat, rest_lng = CITY_CENTERS[restaurant["city"] or city]
    rating = spec["rating"]

    order: dict = {
        "order_time": _timestamp(spec["day"], spec["hour"], spec["minute"]),
        "restaurant_id": restaurant["id"],
        "delivery_address": {
            "annotation": label,
            "address": text,
            "city": city,
            "lat": lat,
            "lng": lng,
        },
        "item_total": spec["subtotal"],
        "order_discount": spec["food_discount"],
        "free_delivery_discount_hit": spec["delivery_discount"],
        "discounted_total_delivery_fee": spec["delivery_paid"],
        "restaurant_packing_charges": spec["packaging_fee"],
        "convenience_fees": spec["platform_fee"],
        "order_tax": spec["total_tax"],
        "priority_delivery_fee": spec["other_charges"],
        "net_total": spec["final"],
        "savings_shown_to_customer": round(
            spec["food_discount"] + spec["delivery_discount"] + rng.choice((0, 5, 10)), 2
        ),
        "order_status": spec["status"],
        "payment_method": spec["payment"],
        "restaurant_order_rating": rating,
        "edit_refund_amount": spec["refund"],
        "order_items": [
            {
                "name": dish["name"],
                "quantity": dish["quantity"],
                "final_price": dish["total_price"],
                "base_price": dish["unit_price"],
                "is_veg": "1" if dish["is_veg"] else "0",
            }
            for dish in spec["dishes"]
        ],
    }
    if restaurant["name"]:
        order["restaurant_name"] = restaurant["name"]
        order["restaurant_locality"] = restaurant["locality"]
        order["restaurant_city_name"] = restaurant["city"]
        order["restaurant_address"] = f"Fictional address, {restaurant['locality']}"
        order["restaurant_lat_lng"] = f"{rest_lat},{rest_lng}"
        order["restaurant_cuisine"] = [brand[1] if brand else "Indian"]
    if spec["complete_bill"]:
        order["order_total_with_tip"] = spec["final"]
        order["order_total"] = round(spec["final"] - spec["tip"], 2)

    return {"details": {"orders": [order]}, "history": {}}


def _zomato_payload(rng: random.Random, spec: dict) -> dict:
    restaurant = _restaurant_fields(spec)
    label, text, city, locality, lat, lng = spec["address"]
    rest_lat, rest_lng = CITY_CENTERS[restaurant["city"] or city]

    wrappers: list[dict] = [
        {
            "item": {
                "type": "dish",
                "item_name": dish["name"],
                "quantity": dish["quantity"],
                "total_cost": dish["total_price"],
                "unit_cost": dish["unit_price"],
                "tag_slugs": ["veg" if dish["is_veg"] else "non-veg"],
            }
        }
        for dish in spec["dishes"]
    ]
    wrappers.append(
        {"item": {"type": "item_total", "item_name": "Item Total", "total_cost": spec["subtotal"]}}
    )
    wrappers.append(
        {
            "item": {
                "type": "charge",
                "item_name": "Delivery Fee",
                "total_cost": spec["delivery_base"],
                "display_cost": str(spec["delivery_paid"]) if spec["delivery_paid"] else "FREE",
            }
        }
    )
    wrappers.append(
        {
            "item": {
                "type": "charge",
                "item_name": "Packaging Charges",
                "total_cost": spec["packaging_fee"],
                "display_cost": str(spec["packaging_fee"]),
            }
        }
    )
    wrappers.append(
        {
            "item": {
                "type": "platform_charge",
                "item_name": "Platform Fee",
                "total_cost": spec["platform_fee"],
                "display_cost": str(spec["platform_fee"]),
            }
        }
    )
    wrappers.append(
        {
            "item": {
                "type": "tax",
                "item_name": "GST",
                "total_cost": spec["total_tax"],
                "display_cost": str(spec["total_tax"]),
            }
        }
    )
    if spec["other_charges"]:
        wrappers.append(
            {
                "item": {
                    "type": "charge",
                    "item_name": rng.choice(("Rain Fee", "Surge Fee", "Peak Hour Fee")),
                    "total_cost": spec["other_charges"],
                    "display_cost": str(spec["other_charges"]),
                }
            }
        )
    if spec["food_discount"]:
        wrappers.append(
            {
                "item": {
                    "type": "voucher_discount",
                    "item_name": "FICTIONAL SAVER",
                    "total_cost": -spec["food_discount"],
                }
            }
        )
    if spec["tip"]:
        wrappers.append(
            {"item": {"type": "tip", "item_name": "Delivery Tip", "total_cost": spec["tip"]}}
        )
    wrappers.append(
        {
            "item": {
                "type": "savings",
                "item_name": "Total Savings",
                "total_cost": spec["food_discount"] + spec["delivery_discount"],
            }
        }
    )

    order_meta: dict = {"items": wrappers}
    if spec["complete_bill"]:
        order_meta["total_cost"] = spec["final"]

    details: dict = {
        "created_at_str": _timestamp(spec["day"], spec["hour"], spec["minute"]),
        "restaurant": {
            "id": restaurant["id"],
            "name": restaurant["name"],
            "location": {
                "locality": restaurant["locality"],
                "city": restaurant["city"],
                "address": f"Fictional address, {restaurant['locality']}",
                "latitude": rest_lat,
                "longitude": rest_lng,
            },
        },
        "delivery_address_obj": {
            "alias": label,
            "full_address_text": text,
            "city": city,
            "latitude": lat,
            "longitude": lng,
        },
        "payment_method": spec["payment"],
        "current_status": spec["status"],
        "refund_amount": spec["refund"],
        "order": order_meta,
    }
    if not spec["complete_bill"]:
        # Keep a payable total even when the itemised bill is incomplete.
        details["total_cost"] = spec["final"]

    return {"details": details, "history": {}}


def _record_imports(cursor, counts: dict[str, dict[str, int]], imported_at: str) -> None:
    for account, _phone in ACCOUNTS:
        for platform in ("SWIGGY", "ZOMATO"):
            cursor.execute(
                "INSERT OR REPLACE INTO archive_imports VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    account,
                    platform,
                    1,
                    1,
                    1,
                    counts[account].get(platform, 0),
                    imported_at,
                ),
            )


def generate(out_dir: Path | str, seed: int = DEFAULT_SEED, large: bool = False) -> Path:
    """Create ``<out_dir>/food_analytics.db`` with fictional data and return its path."""
    out = Path(out_dir).expanduser()
    _refuse_if_protected(out)
    out.mkdir(parents=True, exist_ok=True)
    db_path = out / DB_FILENAME
    if db_path.exists():
        db_path.unlink()
    db_path.touch()

    rng = random.Random(seed)
    specs = _build_specs(rng, LARGE_ORDERS if large else DEFAULT_ORDERS)

    db = AnalyticsDB(db_path)
    counts: dict[str, dict[str, int]] = {account: {} for account, _ in ACCOUNTS}
    with db.connection() as conn:
        cursor = conn.cursor()
        cursor.executemany(
            "INSERT INTO accounts (id, phone, local_id) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET phone=excluded.phone, local_id=excluded.local_id",
            [(account, phone, account) for account, phone in ACCOUNTS],
        )
        for spec in specs:
            payload = (
                _swiggy_payload(rng, spec)
                if spec["platform"] == "SWIGGY"
                else _zomato_payload(rng, spec)
            )
            ingest = (
                db.ingest_swiggy_order if spec["platform"] == "SWIGGY" else db.ingest_zomato_order
            )
            ingest(cursor, spec["account"], f"dev-{spec['index']:05d}", payload)
            counts[spec["account"]][spec["platform"]] = (
                counts[spec["account"]].get(spec["platform"], 0) + 1
            )

        # Zomato ingest does not populate restaurant cuisine; enrich it here so
        # cuisine charts and filters work for both platforms.
        for position, brand in enumerate(BRANDS, start=1):
            cursor.execute(
                "UPDATE restaurants SET cuisine=? WHERE id=?",
                (brand[1], f"ZOMATO_REST_{position}"),
            )
        _record_imports(cursor, counts, "2026-11-01T00:00:00+05:30")
        conn.commit()

    return db_path


def self_check(db_path: Path) -> None:
    """Assert the generated database is rich enough for every dashboard chart."""
    db = AnalyticsDB(db_path)
    with db.connection() as conn:

        def count(sql):
            return conn.execute(sql).fetchone()[0]

        assert count("SELECT COUNT(*) FROM orders") >= DEFAULT_ORDERS
        assert count("SELECT COUNT(*) FROM accounts") >= 3
        assert count("SELECT COUNT(*) FROM restaurants") >= 20
        assert count("SELECT COUNT(DISTINCT platform) FROM orders") == 2
        assert count("SELECT COUNT(*) FROM orders WHERE order_status='CANCELLED'") > 0
        assert count("SELECT COUNT(*) FROM orders WHERE financial_verified=0") > 0
        assert count("SELECT COUNT(DISTINCT city) FROM restaurants WHERE city IS NOT NULL") >= 3
        assert (
            count("SELECT COUNT(DISTINCT locality) FROM restaurants WHERE locality IS NOT NULL")
            >= 5
        )
        assert (
            count("SELECT COUNT(DISTINCT cuisine) FROM restaurants WHERE cuisine IS NOT NULL") >= 5
        )
        assert count("SELECT COUNT(*) FROM order_items WHERE is_veg=1") > 0
        assert count("SELECT COUNT(*) FROM order_items WHERE is_veg=0") > 0
        hours = {
            row[0] for row in conn.execute("SELECT DISTINCT substr(order_time,1,2) FROM orders")
        }
        assert len(hours) == 24

        streak = best = 0
        previous = None
        for (raw,) in conn.execute("SELECT DISTINCT order_date FROM orders ORDER BY order_date"):
            day = date.fromisoformat(raw)
            streak = streak + 1 if previous and (day - previous).days == 1 else 1
            best = max(best, streak)
            previous = day
        assert best >= 7


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / ".test-tmp" / "dev-data",
        help="Directory for food_analytics.db (default: .test-tmp/dev-data)",
    )
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--large",
        action="store_true",
        help=f"Generate {LARGE_ORDERS} orders instead of about {DEFAULT_ORDERS}",
    )
    args = parser.parse_args()

    _refuse_if_protected(args.out)
    db_path = generate(args.out, seed=args.seed, large=args.large)
    self_check(db_path)
    with AnalyticsDB(db_path).connection() as conn:
        orders = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        items = conn.execute("SELECT COUNT(*) FROM order_items").fetchone()[0]
    print(f"Wrote fictional dev database: {db_path}")
    print(f"Orders: {orders}; order items: {items}; seed: {args.seed}")
    print(f"Serve it with: food-khata serve --db-path {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
