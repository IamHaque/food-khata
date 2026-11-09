"""Unit tests for the local SQLite analytics database and ingestion pipeline."""

import os
import threading
import time
import uuid
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
from food_khata.serve.db import connect_readonly
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


def test_account_import_quarantines_bad_order(tmp_path):
    storage = Storage(tmp_path / "storage")
    acc_id = "00000000-0000-0000-0000-000000000001"
    directory = storage.account_path(acc_id)
    save_json(directory / "account.json", {"phone": "test"})
    save_json(
        directory / "swiggy-history.json",
        {"orders": {"good": {"details": {"orders": [{"order_total": 10}]}}, "bad": []}},
    )
    db = AnalyticsDB(tmp_path / "analytics.db")
    counts = db.ingest_account(storage, acc_id)
    assert counts["total"] == 1
    assert counts["quarantined"] == 1
    assert len(counts["quarantine"]) == 1
    assert counts["quarantine"][0]["order_id"] == "bad"

    with db.connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM quarantine").fetchone()[0] == 1
        q_row = conn.execute("SELECT * FROM quarantine").fetchone()
        assert q_row["platform_order_id"] == "bad"
        assert q_row["platform"] == "SWIGGY"
        assert "Malformed" in q_row["reason"]


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


def test_quarantine_one_malformed_order_among_hundred(tmp_path):
    storage = Storage(tmp_path / "storage")
    acc_id = str(uuid.uuid4())
    directory = storage.account_path(acc_id)
    save_json(directory / "account.json", {"phone": "9999999999"})

    orders_dict = {}
    for i in range(1, 100):
        orders_dict[f"order_{i}"] = {
            "history": {
                "orderStatus": "Delivered",
                "orderTotal": 100 + i,
                "orderedTime": "2026-10-01 12:00:00",
            },
            "details": {
                "orders": [
                    {
                        "order_id": f"order_{i}",
                        "order_status": "Delivered",
                        "order_total": 100 + i,
                        "item_total": 100 + i,
                    }
                ]
            },
        }
    # 1 malformed order
    orders_dict["order_bad"] = {"invalid": "payload without details or history"}

    save_json(
        directory / "swiggy-history.json",
        {
            "version": 1,
            "provider": "swiggy",
            "provider_id": "sw1",
            "orders": orders_dict,
            "history_complete": True,
            "details_complete": True,
            "complete": True,
            "lifetime_complete": True,
            "pages": 1,
            "errors": [],
            "counts": {"orders": 100},
        },
    )

    db = AnalyticsDB(tmp_path / "analytics.db")
    counts = db.ingest_account(storage, acc_id)

    # 99 imported, 1 bad order quarantined
    assert counts["swiggy"] == 99
    assert counts["total"] == 99
    assert counts["quarantined"] == 1
    assert len(counts["quarantine"]) == 1
    assert counts["quarantine"][0]["order_id"] == "order_bad"
    assert counts["quarantine"][0]["platform"] == "SWIGGY"
    assert counts["quarantine"][0]["reason"]
    assert counts["quarantine"][0]["error_details"]

    with db.connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 99
        q_count = conn.execute("SELECT COUNT(*) FROM quarantine").fetchone()[0]
        assert q_count == 1
        q_row = conn.execute("SELECT * FROM quarantine").fetchone()
        assert q_row["account_id"] == acc_id
        assert q_row["platform"] == "SWIGGY"
        assert q_row["platform_order_id"] == "order_bad"
        assert q_row["reason"]
        assert q_row["error_details"]
        assert "invalid" in q_row["raw_payload"]
        assert q_row["quarantined_at"]


def test_incremental_ingest_bounds_reparse_cost(tmp_path, monkeypatch):
    storage = Storage(tmp_path / "storage")
    acc_id = str(uuid.uuid4())
    directory = storage.account_path(acc_id)
    save_json(directory / "account.json", {"phone": "9999999999"})

    initial_orders = {
        f"order_{i}": {
            "history": {"orderStatus": "Delivered", "orderTotal": 50},
            "details": {
                "orders": [
                    {
                        "order_id": f"order_{i}",
                        "order_status": "Delivered",
                        "order_total": 50,
                        "item_total": 50,
                    }
                ]
            },
        }
        for i in range(1, 11)
    }

    archive = {
        "version": 1,
        "provider": "swiggy",
        "provider_id": "sw1",
        "orders": initial_orders,
        "history_complete": True,
        "details_complete": True,
        "complete": True,
        "lifetime_complete": True,
        "pages": 1,
        "errors": [],
        "counts": {"orders": 10},
    }
    save_json(directory / "swiggy-history.json", archive)

    db = AnalyticsDB(tmp_path / "analytics.db")
    c1 = db.ingest_account(storage, acc_id)
    assert c1["total"] == 10

    with db.connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 10

    # Now 5 new orders arrive
    for i in range(11, 16):
        archive["orders"][f"order_{i}"] = {
            "history": {"orderStatus": "Delivered", "orderTotal": 60},
            "details": {
                "orders": [
                    {
                        "order_id": f"order_{i}",
                        "order_status": "Delivered",
                        "order_total": 60,
                        "item_total": 60,
                    }
                ]
            },
        }
    archive["counts"]["orders"] = 15
    save_json(directory / "swiggy-history.json", archive)

    parse_call_count = [0]
    original_ingest = db.ingest_swiggy_order

    def tracked_ingest(cursor, account_id, order_id, order_data):
        parse_call_count[0] += 1
        return original_ingest(cursor, account_id, order_id, order_data)

    monkeypatch.setattr(db, "ingest_swiggy_order", tracked_ingest)

    c2 = db.ingest_account(storage, acc_id)
    # Only the 5 new orders were parsed and inserted!
    assert parse_call_count[0] == 5
    assert c2["total"] == 5
    assert c2["swiggy"] == 5

    with db.connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 15


def test_readonly_reader_opens_wal_database_with_wal_and_shm(tmp_path):
    db_path = tmp_path / "test_wal.db"
    db = AnalyticsDB(db_path)

    # Insert data and leave uncheckpointed transactions so WAL files (-wal, -shm) exist
    with db.connection() as conn:
        order = {
            "details": {
                "orders": [
                    {
                        "order_id": "wal_order_1",
                        "order_status": "DELIVERED",
                        "order_total": 120,
                        "item_total": 120,
                    }
                ]
            }
        }
        db.ingest_swiggy_order(conn.cursor(), "acc-wal", "wal_order_1", order)
        conn.commit()

    # Ensure WAL mode is active
    with db.connection() as conn:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"

    # Open another writer connection and write more data without closing so WAL files stay active on disk
    writer_conn = db.connect()
    try:
        order2 = {
            "details": {
                "orders": [
                    {
                        "order_id": "wal_order_2",
                        "order_status": "DELIVERED",
                        "order_total": 240,
                        "item_total": 240,
                    }
                ]
            }
        }
        db.ingest_swiggy_order(writer_conn.cursor(), "acc-wal", "wal_order_2", order2)
        writer_conn.commit()

        wal_file = tmp_path / "test_wal.db-wal"
        shm_file = tmp_path / "test_wal.db-shm"
        assert wal_file.exists()
        assert shm_file.exists()

        # Read-only connection opens database using mode=ro (or uri=True mode=ro)
        ro_conn = connect_readonly(db_path)
        try:
            assert ro_conn.execute("PRAGMA query_only").fetchone()[0] == 1
            rows = ro_conn.execute(
                "SELECT id, final_amount_paid FROM orders ORDER BY id"
            ).fetchall()
            assert len(rows) == 2
            assert rows[0]["id"] == "SWIGGY_wal_order_1"
            assert rows[1]["id"] == "SWIGGY_wal_order_2"
        finally:
            ro_conn.close()
    finally:
        writer_conn.close()


def test_concurrency_no_locked_database(tmp_path):
    """Scenario: no locked database.

    Given a sync importing while the dashboard reads / When run together for 30 s /
    Then no request fails with 'database is locked' (WAL mode and busy timeout enabled
    on write and read connections).
    """
    db_path = tmp_path / "concurrency.db"
    db = AnalyticsDB(db_path)

    duration = float(os.getenv("CONCURRENCY_TEST_DURATION", "30"))
    stop_event = threading.Event()
    locked_errors = []
    other_errors = []
    writes_completed = [0]
    reads_completed = [0]

    def writer_worker():
        counter = 0
        while not stop_event.is_set():
            counter += 1
            try:
                with db.connection() as conn:
                    order = {
                        "details": {
                            "orders": [
                                {
                                    "order_id": f"sync_order_{counter}",
                                    "order_status": "DELIVERED",
                                    "order_total": 100 + (counter % 50),
                                    "item_total": 100 + (counter % 50),
                                }
                            ]
                        }
                    }
                    db.ingest_swiggy_order(
                        conn.cursor(), "sync_acc", f"sync_order_{counter}", order
                    )
                    conn.commit()
                writes_completed[0] += 1
                time.sleep(0.005)
            except Exception as exc:
                if "database is locked" in str(exc).lower():
                    locked_errors.append(exc)
                else:
                    other_errors.append(exc)
                break

    def reader_worker():
        while not stop_event.is_set():
            try:
                conn = connect_readonly(db_path)
                try:
                    conn.execute("SELECT COUNT(*), SUM(final_amount_paid) FROM orders").fetchone()
                    conn.execute("SELECT * FROM restaurants LIMIT 5").fetchall()
                    conn.execute("SELECT * FROM delivery_addresses LIMIT 5").fetchall()
                finally:
                    conn.close()
                reads_completed[0] += 1
                time.sleep(0.002)
            except Exception as exc:
                if "database is locked" in str(exc).lower():
                    locked_errors.append(exc)
                else:
                    other_errors.append(exc)
                break

    writer_thread = threading.Thread(target=writer_worker, name="WriterThread")
    reader_threads = [
        threading.Thread(target=reader_worker, name=f"ReaderThread-{i}") for i in range(4)
    ]

    writer_thread.start()
    for t in reader_threads:
        t.start()

    time.sleep(duration)
    stop_event.set()

    writer_thread.join(timeout=5)
    for t in reader_threads:
        t.join(timeout=5)

    assert len(locked_errors) == 0, f"Found 'database is locked' errors: {locked_errors}"
    assert len(other_errors) == 0, f"Found unexpected errors: {other_errors}"
    assert writes_completed[0] > 0
    assert reads_completed[0] > 0

    with db.connection() as conn:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"
        busy_timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        assert busy_timeout >= 2000
