"""Tests for the database-to-React JSON export boundary."""

import json
from pathlib import Path

import pytest

from food_khata.dashboard import export_dashboard_data, fetch_analytics
from food_khata.db import AnalyticsDB


def test_fetch_records_and_export_dashboard(tmp_path: Path):
    db_file = tmp_path / "test_analytics.db"
    db = AnalyticsDB(db_file)

    # Ingest mock orders
    swiggy_order = {
        "history": {"orderStatus": "Delivered", "orderTotal": 150},
        "details": {
            "orders": [
                {
                    "order_id": "sw_101",
                    "order_time": "2026-10-01 13:00:00",
                    "order_status": "Delivered",
                    "order_total": 150,
                    "item_total": 200,
                    "order_discount": 50,
                    "order_delivery_charge": 10,
                    "restaurant_name": "Burger Spot",
                    "order_items": [{"name": "Classic Burger", "quantity": 1, "final_price": 150}],
                }
            ]
        },
    }

    zomato_order = {
        "history": {"top_container": {"title": "Pizza Spot"}},
        "details": {
            "id": "zm_202",
            "created_at_str": "2026-10-05 20:00:00",
            "current_status": "DELIVERED",
            "restaurant": {"id": 999, "name": "Pizza Spot"},
            "order": {
                "total_cost": 300,
                "items": [
                    {
                        "item": {
                            "type": "dish",
                            "item_name": "Veggie Pizza",
                            "quantity": 1,
                            "total_cost": 280,
                            "tag_slugs": ["veg"],
                        }
                    },
                    {
                        "item": {
                            "type": "charge",
                            "item_name": "Delivery Charge",
                            "total_cost": 20,
                        }
                    },
                ],
            },
        },
    }

    with db.connection() as conn:
        cursor = conn.cursor()
        db.ingest_swiggy_order(cursor, "acc-1", "sw_101", swiggy_order)
        db.ingest_zomato_order(cursor, "acc-1", "zm_202", zomato_order)
        conn.commit()

    analytics = fetch_analytics(db_file)
    assert len(analytics["orders"]) == 2
    assert sum(o["final_amount_paid"] for o in analytics["orders"]) == 450
    assert {o["restaurant"]["name"] for o in analytics["orders"]} == {"Burger Spot", "Pizza Spot"}
    assert sum(len(o["items"]) for o in analytics["orders"]) == 2

    out_file = tmp_path / "dashboard.json"
    assert export_dashboard_data(db_file, out_file) == out_file
    exported = json.loads(out_file.read_text(encoding="utf-8"))
    assert exported["schema_version"] == 1
    assert len(exported["orders"]) == 2
    assert sum(o["final_amount_paid"] for o in exported["orders"]) == 450
    assert len([i for o in exported["orders"] for i in o["items"]]) == 2
    assert "source_bill_json" not in exported["orders"][0]
    assert exported["generated_at"].endswith("+05:30")


def test_complete_history_and_selected_account_export(tmp_path: Path):
    db_file = tmp_path / "history.db"
    db = AnalyticsDB(db_file)
    with db.connection() as conn:
        conn.executemany(
            "INSERT INTO accounts VALUES (?, ?, ?)", [("first", "1", "1"), ("other", "2", "2")]
        )
        for i in range(55):
            conn.execute(
                "INSERT INTO orders (id, account_id, platform, platform_order_id, "
                "order_timestamp, order_date, order_time, order_status, final_amount_paid) "
                "VALUES (?, ?, 'SWIGGY', ?, '2026-01-01T12:00:00', '2026-01-01', "
                "'12:00:00', 'DELIVERED', 10)",
                (str(i), "other" if i == 54 else "first", str(i)),
            )
        conn.execute(
            "INSERT INTO order_items (order_id, item_name, quantity) VALUES (?, ?, 1)",
            ("54", "</script><script>alert(1)</script>"),
        )
        conn.commit()

    analytics = fetch_analytics(db_file)
    assert len(analytics["orders"]) == 55
    other = next(order for order in analytics["orders"] if order["account_id"] == "other")
    assert other["items"][0]["item_name"].startswith("</script>")
    out = export_dashboard_data(db_file, account_id="first")
    assert out == db_file.parent / "dashboard.json"
    exported = json.loads(out.read_text(encoding="utf-8"))
    assert len(exported["orders"]) == 55
    assert exported["selected_account"] == "first"
    other = next(o for o in exported["orders"] if o["account_id"] == "other")
    assert other["items"][0]["item_name"] == "</script><script>alert(1)</script>"


def test_export_does_not_create_a_missing_database(tmp_path):
    import sqlite3

    missing = tmp_path / "missing.db"
    with pytest.raises(sqlite3.OperationalError):
        export_dashboard_data(missing)
    assert not missing.exists()


def test_failed_export_preserves_existing_data(tmp_path):
    from unittest.mock import patch

    out = tmp_path / "dashboard.json"
    out.write_text("previous data", encoding="utf-8")
    data = {"orders": [{"final_amount_paid": float("nan")}], "accounts": [], "archive_imports": []}
    with patch("food_khata.dashboard.fetch_analytics", return_value=data):
        with pytest.raises(ValueError):
            export_dashboard_data(tmp_path / "unused.db", out)
    assert out.read_text(encoding="utf-8") == "previous data"
