import sqlite3
from datetime import date

from food_khata.serve.charts import overview
from food_khata.serve.schemas import Filters


def test_calendar_and_comparison_scope():
    conn = sqlite3.connect(":memory:")
    conn.execute("""CREATE TABLE orders (id TEXT, account_id TEXT, order_date TEXT, order_status TEXT,
        final_amount_paid REAL, total_discount REAL, reported_savings REAL, delivery_fee REAL,
        packaging_fee REAL, platform_fee REAL, total_tax REAL, tip REAL, refund_amount REAL,
        restaurant_id TEXT, user_rating REAL)""")
    conn.execute("CREATE TABLE order_items (order_id TEXT, item_name TEXT)")
    conn.executemany(
        "INSERT INTO orders (id, account_id, order_date, order_status, final_amount_paid) VALUES (?,?,?,?,?)",
        [
            ("a", "one", "2024-02-29", "DELIVERED", 100),
            ("b", "one", "2023-02-28", "DELIVERED", 50),
            ("c", "two", "2023-02-28", "DELIVERED", 500),
        ],
    )
    conn.executemany("INSERT INTO order_items VALUES (?,?)", [("a", "x"), ("a", "y")])
    filters = Filters(
        account_ids=["one"],
        date_from=date(2024, 2, 29),
        date_to=date(2024, 2, 29),
        compare="previous_year",
    )
    calendar, comparison = overview(conn, filters)
    assert calendar == [{"date": "2024-02-29", "orders": 1, "spend": 100}]
    assert comparison["date_from"] == date(2023, 2, 28)
    assert comparison["kpis"]["spend"] == 50
    assert comparison["percent_change"]["spend"] == 100
    assert comparison["percent_change"]["fees"] is None
    _, previous = overview(conn, filters.model_copy(update={"compare": "previous_period"}))
    assert previous["date_from"] == date(2024, 2, 28)
    assert previous["percent_change"]["spend"] is None


pytest_plugins = ["test_serve_filters"]


def test_calendar_rounding_and_minimum_date(conn):
    conn.execute("UPDATE orders SET final_amount_paid=0.006 WHERE order_status='DELIVERED'")
    calendar, _ = overview(conn, Filters())
    assert round(sum(day["spend"] for day in calendar), 2) == 0.01
    calendar, comparison = overview(
        conn, Filters(date_from="0001-01-01", date_to="0001-01-01", compare="previous_period")
    )
    assert calendar == [] and comparison is None


def test_unknown_dates_do_not_crash_comparison(conn):
    conn.execute("UPDATE orders SET order_date='' WHERE id='1'")
    _, comparison = overview(conn, Filters(compare="previous_year"))
    assert comparison is None
