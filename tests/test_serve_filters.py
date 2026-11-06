import sqlite3

import pytest
from pydantic import ValidationError

from food_khata.db import AnalyticsDB
from food_khata.serve.filters import build_where
from food_khata.serve.schemas import Filters


@pytest.fixture
def conn(tmp_path):
    db = AnalyticsDB(tmp_path / "synthetic.db")
    db.init_db()
    connection = sqlite3.connect(tmp_path / "synthetic.db")
    connection.executemany(
        "INSERT INTO accounts (id, phone, local_id) VALUES (?, ?, ?)",
        [("a", "x", "a"), ("b", "x", "b")],
    )
    connection.executemany(
        "INSERT INTO restaurants (id, platform, platform_restaurant_id, name, city, locality) "
        "VALUES (?, 'SWIGGY', ?, ?, ?, ?)",
        [("r1", "1", "Cafe 100%", "Pune", "Center"), ("r2", "2", "Other", "Delhi", "North")],
    )
    connection.executemany(
        """INSERT INTO orders (id, account_id, platform, platform_order_id, order_timestamp,
        order_date, order_time, order_status, restaurant_id, final_amount_paid, total_discount,
        reported_savings, delivery_fee, delivery_fee_discount, packaging_fee, platform_fee,
        total_tax, tip, refund_amount, user_rating, financial_verified, payment_method)
        VALUES (?, ?, 'SWIGGY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (
                "1",
                "a",
                "1",
                "2025-01-04T10:00:00",
                "2025-01-04",
                "10:00:00",
                "DELIVERED",
                "r1",
                100.125,
                10,
                20,
                5,
                4,
                2,
                1,
                3,
                2,
                0,
                4,
                1,
                "UPI",
            ),
            (
                "2",
                "a",
                "2",
                "2025-02-03T23:00:00",
                "2025-02-03",
                "23:00:00",
                "CANCELLED",
                "r1",
                70,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                7,
                None,
                0,
                "CASH",
            ),
            (
                "3",
                "b",
                "3",
                "2025-02-04T12:00:00",
                "2025-02-04",
                "12:00:00",
                "DELIVERED",
                "r2",
                50,
                5,
                8,
                1,
                0,
                0,
                1,
                2,
                0,
                0,
                None,
                1,
                "UPI",
            ),
        ],
    )
    connection.executemany(
        "INSERT INTO order_items (order_id, item_name, is_veg, category) VALUES (?, ?, ?, ?)",
        [
            ("1", "Rice", 1, "Indian"),
            ("1", "Bread", 1, "Indian"),
            ("2", "Meat", 0, "Indian"),
            ("3", "Mystery", None, "Other"),
        ],
    )
    connection.execute("UPDATE restaurants SET cuisine = 'Indian' WHERE id = 'r1'")
    connection.commit()
    yield connection
    connection.close()


def ids(conn, **kwargs):
    where, params = build_where(Filters(**kwargs))
    return [
        r[0] for r in conn.execute(f"SELECT o.id FROM orders o WHERE {where} ORDER BY o.id", params)
    ]


def test_defaults_and_combined_filters(conn):
    assert ids(conn) == ["1", "3"]
    assert ids(
        conn,
        statuses=[],
        account_ids=["a"],
        date_from="2025-01-01",
        date_to="2025-02-03",
        platforms=["SWIGGY"],
        cities=["Pune"],
        localities=["Center"],
        restaurant_ids=["r1"],
        cuisines=["Indian"],
    ) == ["1", "2"]
    assert ids(
        conn,
        veg="veg",
        verified_only=True,
        payment_methods=["UPI"],
        meal_slots=["breakfast"],
        day_type="weekend",
        amount_min=100,
        amount_max=101,
    ) == ["1"]
    assert ids(conn, statuses=[], veg="nonveg", meal_slots=["late_night"], day_type="weekday") == [
        "2"
    ]
    assert ids(conn, veg="unknown") == ["3"]


def test_literal_search_and_validation(conn):
    assert ids(conn, search="100%") == ["1"]
    assert ids(conn, search="%") == ["1"]
    assert ids(conn, statuses=[], search="' OR 1=1 --") == []
    for args in (
        {"amount_min": float("nan")},
        {"amount_max": float("inf")},
        {"amount_min": 2, "amount_max": 1},
        {"date_from": "2025-02-01", "date_to": "2025-01-01"},
        {"date_from": "2025-02-30"},
        {"meal_slots": ["brunch"]},
    ):
        with pytest.raises(ValidationError):
            Filters(**args)


def test_cuisine_is_restaurant_cuisine_not_item_category(conn):
    conn.execute("UPDATE order_items SET category = 'Dessert'")
    assert ids(conn, cuisines=["Indian"]) == ["1"]
    assert ids(conn, cuisines=["Dessert"]) == []


def test_anomaly_scope_uses_shared_filter(conn):
    conn.execute("UPDATE orders SET reconciliation_difference=0")
    conn.execute("UPDATE orders SET reconciliation_difference=2 WHERE id='3'")
    assert ids(conn, anomaly="review") == ["3"]
    assert ids(conn, statuses=[], anomaly="review", account_ids=["a"]) == ["2"]
    with pytest.raises(ValidationError):
        Filters(anomaly="unsafe")
