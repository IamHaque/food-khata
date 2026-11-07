"""Unit tests for the local SQLite analytics database and ingestion pipeline."""

from pathlib import Path

from food_khata.db import (
    AnalyticsDB,
    classify_cuisine,
    clean_num,
    infer_veg_tag,
    normalize_address,
    normalize_payment,
    parse_date,
)
from food_khata.storage import Storage, save_json


def test_normalization_utilities():
    assert clean_num("â‚¹ 149.50") == 149.50
    assert clean_num(None, default=10.0) == 10.0
    assert clean_num(250) == 250.0

    iso, date, time = parse_date(epoch_secs=1790804517)
    assert date == "2026-10-01"
    assert "T" in iso and "+05:30" in iso

    iso2, date2, time2 = parse_date(date_str="2026-10-01 03:11:57")
    assert date2 == "2026-10-01"
    assert time2 == "03:11:57"

    assert normalize_payment("UPI / GPay") == "UPI"
    assert normalize_payment("Credit card") == "Card"
    assert normalize_payment("COD") == "Cash"
    assert normalize_payment("Paytm Wallet") == "Wallet"

    assert normalize_address("Home", "123 Main Street") == "Home"
    assert normalize_address("work", "456 Tech Park") == "Work"
    assert normalize_address("other", "789 Random Ave") == "Other"

    assert infer_veg_tag("Chicken Burger") == 0
    assert infer_veg_tag("Paneer Pizza") == 1
    assert infer_veg_tag("Mineral Water") is None

    assert classify_cuisine("Chicken Burger Combo", "Burger Singh") == "Burgers & Sandwiches"
    assert classify_cuisine("Cheese Pizza", "La Pino'z") == "Pizza & Italian"


def test_db_initialization_and_schema(tmp_path: Path):
    db_file = tmp_path / "test_analytics.db"
    db = AnalyticsDB(db_file)
    assert db_file.exists()

    with db.connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = {row[0] for row in cursor.fetchall()}
        assert {"accounts", "restaurants", "delivery_addresses", "orders", "order_items"}.issubset(
            tables
        )


def test_swiggy_and_zomato_ingestion(tmp_path: Path):
    db_file = tmp_path / "test_analytics.db"
    db = AnalyticsDB(db_file)

    swiggy_order = {
        "history": {
            "orderStatus": "Delivered",
            "orderTotal": 150,
            "restaurantName": "Test Burger",
            "orderedTime": "2026-10-01 03:11:57",
        },
        "details": {
            "orders": [
                {
                    "order_id": 999111,
                    "order_time": "2026-10-01 03:11:57",
                    "ordered_time_in_seconds": 1790804517,
                    "order_status": "Delivered",
                    "order_total": 150,
                    "item_total": 240,
                    "order_discount": 100,
                    "order_delivery_charge": 0,
                    "free_delivery_discount_hit": 50,
                    "restaurant_packing_charges": 20,
                    "convenience_fee": 5,
                    "order_tax": 10,
                    "restaurant_order_rating": 5,
                    "payment_method": "Credit/Debit card",
                    "restaurant_id": 1234,
                    "restaurant_name": "Test Burger Shop",
                    "restaurant_locality": "Bandra",
                    "restaurant_city_name": "Mumbai",
                    "restaurant_address": "Bandra West, Mumbai",
                    "restaurant_cuisine": ["Burgers", "Fast Food"],
                    "delivery_address": {
                        "annotation": "Home",
                        "address": "Bandra, Mumbai",
                        "city": "Mumbai",
                        "lat": 19.05,
                        "lng": 72.83,
                    },
                    "order_items": [
                        {
                            "name": "Chicken Burger",
                            "quantity": 2,
                            "base_price": 120,
                            "final_price": 240,
                            "is_veg": 0,
                        }
                    ],
                }
            ]
        },
    }

    zomato_order = {
        "history": {
            "top_container": {"title": "Test Pizza House"},
        },
        "details": {
            "id": 888222,
            "created_at_str": "November 05, 2026 at 07:47 PM",
            "timestamp": 1793888261,
            "current_status": "DELIVERED",
            "payment_method": "upi",
            "restaurant": {
                "id": 5678,
                "name": "Test Pizza House",
                "location": {
                    "locality": "Andheri",
                    "city": "Mumbai",
                    "address": "Andheri West, Mumbai",
                    "latitude": 19.13,
                    "longitude": 72.84,
                },
            },
            "delivery_address_obj": {
                "alias": "Home",
                "full_address_text": "Andheri, Mumbai",
                "latitude": 19.13,
                "longitude": 72.84,
            },
            "order": {
                "total_cost": 210,
                "items": [
                    {
                        "item": {
                            "type": "dish",
                            "item_name": "Paneer Pizza",
                            "quantity": 1,
                            "unit_cost": 200,
                            "total_cost": 200,
                            "tag_slugs": ["veg"],
                        }
                    },
                    {
                        "item": {
                            "type": "charge",
                            "item_name": "Delivery Charge",
                            "total_cost": 40,
                            "display_cost": "FREE",
                        }
                    },
                    {
                        "item": {
                            "type": "tax",
                            "item_name": "Taxes",
                            "total_cost": 10,
                        }
                    },
                    {
                        "item": {
                            "type": "savings",
                            "item_name": "Your total savings",
                            "total_cost": 40,
                        }
                    },
                ],
            },
        },
    }

    with db.connection() as conn:
        cursor = conn.cursor()
        assert db.ingest_swiggy_order(cursor, "acc-1", "999111", swiggy_order)
        assert db.ingest_zomato_order(cursor, "acc-1", "888222", zomato_order)
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM orders;")
        assert cursor.fetchone()[0] == 2

        cursor.execute(
            "SELECT id, platform, final_amount_paid, total_discount FROM orders ORDER BY platform;"
        )
        rows = cursor.fetchall()
        assert rows[0]["platform"] == "SWIGGY"
        assert rows[0]["final_amount_paid"] == 150.0
        assert rows[0]["total_discount"] == 150.0  # 100 food + 50 deliv

        assert rows[1]["platform"] == "ZOMATO"
        assert rows[1]["final_amount_paid"] == 210.0

        cursor.execute("SELECT COUNT(*) FROM order_items;")
        assert cursor.fetchone()[0] == 2

        # Verify idempotency (re-ingesting same order doesn't duplicate)
        assert db.ingest_swiggy_order(cursor, "acc-1", "999111", swiggy_order)
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM orders WHERE platform = 'SWIGGY';")
        assert cursor.fetchone()[0] == 1


def test_ingest_all_from_storage(tmp_path: Path):
    storage = Storage(tmp_path / "storage")
    acc_id = "00000000-0000-0000-0000-000000000001"
    acc_dir = storage.account_path(acc_id)
    acc_dir.mkdir(parents=True)

    save_json(
        acc_dir / "account.json",
        {"version": 1, "local_id": acc_id, "phone": "9876543210", "providers": {"swiggy": "sw1"}},
    )
    save_json(
        acc_dir / "swiggy-history.json",
        {
            "version": 1,
            "provider": "swiggy",
            "provider_id": "sw1",
            "orders": {
                "ord1": {
                    "history": {"orderStatus": "Delivered", "orderTotal": 100},
                    "details": {
                        "orders": [
                            {
                                "order_id": "ord1",
                                "order_status": "Delivered",
                                "order_total": 100,
                                "order_time": "2026-10-10 12:00:00",
                                "restaurant_name": "Test CafÃ©",
                                "order_items": [
                                    {"name": "Coffee", "quantity": 1, "final_price": 100}
                                ],
                            }
                        ]
                    },
                }
            },
            "history_complete": True,
            "details_complete": True,
            "complete": True,
            "lifetime_complete": True,
            "pages": 1,
            "errors": [],
            "counts": {"orders": 1},
        },
    )

    db = AnalyticsDB(tmp_path / "analytics.db")
    counts = db.ingest_all(storage)
    assert counts["swiggy"] == 1
    assert counts["total"] == 1
    assert counts["accounts"] == 1


def test_dates_and_geographic_groups_do_not_invent_context():
    assert parse_date("not a date") == ("", "", "")
    assert clean_num(float("nan"), None) is None
    assert normalize_address("Home", "") == "Unknown"
    assert normalize_address("Home", None) == "Unknown"
    assert normalize_address("pg", "456 Side Street") == "Pg"
    assert normalize_address("Office", "789 Main Road") == "Office"
    assert normalize_address("delivered", "789 Main Road") == "Other"
    assert normalize_address("", "789 Main Road") == "Other"
    assert classify_cuisine("Chicken fried rice", "Test") == "Chinese & Asian"


def test_swiggy_current_fees_zero_prices_and_reconciliation(tmp_path):
    db = AnalyticsDB(tmp_path / "analytics.db")
    record = {
        "details": {
            "orders": [
                {
                    "order_time": "2026-11-01 12:00:00",
                    "order_status": "Delivered",
                    "item_total": 200,
                    "order_discount": 100,
                    "order_total": 147,
                    "order_total_with_tip": 157,
                    "discounted_total_delivery_fee": 0,
                    "order_delivery_charge": 30,
                    "restaurant_packing_charges": 25,
                    "convenience_fee": "0",
                    "convenience_fees": 15,
                    "platform_fee_tax": 2,
                    "total_tax_including_platform_fee": 7,
                    "order_tax": 5,
                    "free_delivery_discount_hit": 30,
                    "order_items": [
                        {"name": "Free item", "quantity": 1, "final_price": 0, "subtotal": 50}
                    ],
                }
            ]
        }
    }
    with db.connection() as conn:
        for _ in range(2):
            db.ingest_swiggy_order(conn.cursor(), "account", "one", record)
            conn.commit()
        row = conn.execute("SELECT * FROM orders").fetchone()
        assert row["platform_fee"] == 15
        assert row["total_tax"] == 7
        assert row["delivery_fee"] == 0
        assert row["tip"] == 10
        assert row["total_discount"] == 130
        assert row["reconciliation_difference"] == 0
        assert row["financial_verified"] == 1
        assert conn.execute("SELECT total_price FROM order_items").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM order_items").fetchone()[0] == 1


def test_zomato_explicit_discounts_tax_and_other_charges(tmp_path):
    def item(kind, name, cost, display=None):
        return {
            "item": {
                "type": kind,
                "item_name": name,
                "total_cost": cost,
                "display_cost": display or "",
                "quantity": 1,
            }
        }

    db = AnalyticsDB(tmp_path / "analytics.db")
    record = {
        "details": {
            "current_status": "DELIVERED",
            "created_at_str": "2026-11-01",
            "restaurant": {"id": 1, "location": {"city": "Restaurant City"}},
            "delivery_address_obj": {"full_address_text": "Destination", "city": "Delivery City"},
            "order": {
                "total_cost": 98,
                "items": [
                    item("dish", "Food", 200),
                    item("item_total", "Item total", 200),
                    item("salt_discount", "Restaurant promo", 20),
                    item("resell_discount", "Food rescue", 80),
                    item("voucher_discount", "Coupon", -30),
                    item("charge", "Delivery", 40, "FREE"),
                    item("charge", "Packaging", 10),
                    item("platform_charge", "Platform", 10),
                    item("tax", "Taxes", 5, "Rs 6"),
                    item("gold_subscription_charge", "Gold", 1),
                    item("donations", "Donation", 1),
                    item("savings", "Advertised savings", 999),
                ],
            },
        }
    }
    with db.connection() as conn:
        db.ingest_zomato_order(conn.cursor(), "account", "one", record)
        row = conn.execute("SELECT * FROM orders").fetchone()
        assert row["final_amount_paid"] == 98
        assert row["food_discount"] == 130
        assert row["total_discount"] == 170
        assert row["reported_savings"] == 999
        assert row["total_tax"] == 6
        assert row["other_charges"] == 2
        assert row["financial_verified"] == 1
        assert conn.execute("SELECT city FROM delivery_addresses").fetchone()[0] == "Delivery City"


def test_account_import_rolls_back_on_bad_order(tmp_path):
    import pytest

    from food_khata.contracts import KhataError

    storage = Storage(tmp_path / "storage")
    acc_id = "00000000-0000-0000-0000-000000000001"
    directory = storage.account_path(acc_id)
    save_json(directory / "account.json", {"phone": "test"})
    save_json(
        directory / "swiggy-history.json",
        {"orders": {"good": {"details": {"orders": [{"order_total": 10}]}}, "bad": []}},
    )
    db = AnalyticsDB(tmp_path / "analytics.db")
    with pytest.raises(KhataError, match="rolled back"):
        db.ingest_account(storage, acc_id)
    with db.connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0


def test_ambiguous_diet_is_unknown_and_order_owner_is_preserved(tmp_path):
    import pytest

    from food_khata.contracts import KhataError

    assert infer_veg_tag("Veggie Pizza") == 1
    assert infer_veg_tag("Kebab") is None
    db = AnalyticsDB(tmp_path / "analytics.db")
    with db.connection() as conn:
        db.ingest_swiggy_order(conn.cursor(), "first", "same", {})
        with pytest.raises(KhataError, match="another local account"):
            db.ingest_swiggy_order(conn.cursor(), "second", "same", {})
        assert conn.execute("SELECT account_id FROM orders").fetchone()[0] == "first"


def test_named_zero_packing_uses_legacy_bill_charge(tmp_path):
    db = AnalyticsDB(tmp_path / "analytics.db")
    record = {
        "details": {
            "orders": [
                {
                    "order_time": "2026-11-01",
                    "order_status": "Delivered",
                    "order_total": 110,
                    "item_total": 100,
                    "restaurant_packing_charges": 0,
                    "charges": {"Packing Charges": "10"},
                }
            ]
        }
    }
    with db.connection() as conn:
        db.ingest_swiggy_order(conn.cursor(), "account", "one", record)
        row = conn.execute("SELECT * FROM orders").fetchone()
        assert row["packaging_fee"] == 10
        assert row["financial_verified"] == 1
