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
    assert clean_num("₹ 149.50") == 149.50
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

    assert normalize_address("DG", "Begariya Road, Dubagga") == "Home (Dubagga)"
    assert normalize_address("Work", "Gachibowli, Hyderabad") == "Work/PG (Hyderabad)"

    assert infer_veg_tag("Chicken Burger") == 0
    assert infer_veg_tag("Paneer Pizza") == 1
    assert infer_veg_tag("Mineral Water") is None

    assert classify_cuisine("Chicken Burger Combo", "Burger Singh") == "Burgers & Sandwiches"
    assert classify_cuisine("Cheese Pizza", "La Pino'z") == "Pizza & Italian"


def test_db_initialization_and_schema(tmp_path: Path):
    db_file = tmp_path / "test_analytics.db"
    db = AnalyticsDB(db_file)
    assert db_file.exists()

    with db.connect() as conn:
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
                    "restaurant_locality": "Chowk",
                    "restaurant_city_name": "Lucknow",
                    "restaurant_address": "Chowk Lucknow",
                    "restaurant_cuisine": ["Burgers", "Fast Food"],
                    "delivery_address": {
                        "annotation": "Home",
                        "address": "Dubagga, Lucknow",
                        "city": "Lucknow",
                        "lat": 26.87,
                        "lng": 80.85,
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
                    "locality": "Husainabad",
                    "city": "Lucknow",
                    "address": "Husainabad, Lucknow",
                    "latitude": 26.88,
                    "longitude": 80.91,
                },
            },
            "delivery_address_obj": {
                "alias": "Home",
                "full_address_text": "Dubagga, Lucknow",
                "latitude": 26.87,
                "longitude": 80.85,
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

    with db.connect() as conn:
        cursor = conn.cursor()
        assert db.ingest_swiggy_order(cursor, "acc-1", "999111", swiggy_order)
        assert db.ingest_zomato_order(cursor, "acc-1", "888222", zomato_order)
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM orders;")
        assert cursor.fetchone()[0] == 2

        cursor.execute("SELECT id, platform, final_amount_paid, total_discount FROM orders ORDER BY platform;")
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
                                "restaurant_name": "Test Café",
                                "order_items": [{"name": "Coffee", "quantity": 1, "final_price": 100}],
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
