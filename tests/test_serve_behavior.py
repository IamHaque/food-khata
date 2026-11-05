import sqlite3

from food_khata.serve.behavior import behavior
from food_khata.serve.schemas import Filters


def test_behavior_boundaries_and_missing():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE orders (order_date, order_time, order_status, final_amount_paid, account_id)"
    )
    conn.executemany(
        "INSERT INTO orders VALUES (?, ?, ?, ?, ?)",
        [
            ("2024-01-06", "05:00:00", "DELIVERED", 100, "a"),
            ("2024-01-07", "22:00:00", "CANCELLED", 200, "a"),
            ("bad", None, "DELIVERED", 50, "b"),
        ],
    )
    result = behavior(conn, Filters(statuses=[], account_ids=["a"]))
    assert sum(row["orders"] for row in result["meals"]) == 2
    assert sum(row["spend"] for row in result["day_type"]) == 100
    assert result["longest_streak"] == 2
    assert result["longest_gap"] == 1
    assert behavior(conn, Filters(account_ids=["b"]))["timing_unavailable_reason"]
    assert behavior(conn, Filters(account_ids=["none"]))["longest_streak"] is None


pytest_plugins = ["test_serve_filters"]


def test_behavior_item_filter_and_fractional_rounding(conn):
    conn.execute("UPDATE orders SET final_amount_paid=0.006 WHERE order_status='DELIVERED'")
    result = behavior(conn, Filters(cuisines=["Indian"], veg="veg"))
    assert sum(row["orders"] for row in result["meals"]) == 1
    assert round(sum(row["spend"] for row in result["hour_weekday"]), 2) == 0.01
    result = behavior(conn, Filters())
    for field in ("hour_weekday", "meals", "day_type"):
        assert sum(row["orders"] for row in result[field]) == 2
        assert round(sum(row["spend"] for row in result[field]), 2) == 0.01


def test_dashboard_malformed_dates_and_unavailable_timing(conn):
    from fastapi.testclient import TestClient

    from food_khata.serve.app import create_app

    conn.execute("UPDATE orders SET order_date='invalid', order_time='invalid'")
    conn.commit()
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    result = TestClient(create_app(path), base_url="http://127.0.0.1").post(
        "/api/dashboard", json={"compare": "previous_year"}
    )
    assert result.status_code == 200
    data = result.json()
    assert data["comparison"] is None
    assert data["charts"]["behavior"]["timing_unavailable_reason"]
    assert data["charts"]["behavior"]["hour_weekday"] == []
