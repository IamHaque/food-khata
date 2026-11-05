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


def test_remaining_scoped_financials(conn):
    from food_khata.serve.charts import remaining
    from food_khata.serve.metrics import compute_metrics

    filters = Filters(account_ids=["a"], statuses=[])
    charts = remaining(conn, filters)
    kpis = compute_metrics(conn, filters)
    waterfall = charts["cost_waterfall"]
    assert (
        round(
            sum(
                waterfall[k]
                for k in (
                    "subtotal",
                    "food_discount",
                    "net_delivery",
                    "packaging",
                    "platform",
                    "tax",
                    "tip",
                    "other",
                    "residual",
                )
            ),
            2,
        )
        == kpis["spend"]
    )
    assert waterfall["refunds"] == 7
    assert sum(m["total_fees"] for m in charts["monthly_fee_components"]) == kpis["fees"]
    assert charts["top_restaurants"][0]["amount"] == kpis["spend"]
    assert charts["insights"] == []
    assert remaining(conn, Filters(account_ids=["missing"]))["top_dishes"] == []


def test_fee_rounding_keeps_components(conn):
    from food_khata.serve.charts import remaining
    from food_khata.serve.metrics import compute_metrics

    conn.execute("UPDATE orders SET delivery_fee=0.006, packaging_fee=0.006, platform_fee=0.006")
    charts = remaining(conn, Filters())
    months = charts["monthly_fee_components"]
    assert all(m["platform"] == 0.01 for m in months)
    assert (
        round(sum(m["total_fees"] for m in months), 2) == compute_metrics(conn, Filters())["fees"]
    )
    assert any(m["rounding_adjustment"] for m in months)


def test_insight_threshold(conn):
    from food_khata.serve.charts import remaining

    conn.execute("UPDATE orders SET order_status='DELIVERED'")
    for n in range(4, 6):
        conn.execute(
            "INSERT INTO orders (id, account_id, platform, platform_order_id, order_timestamp, order_date, order_time, order_status, restaurant_id, final_amount_paid) VALUES (?, 'a', 'SWIGGY', ?, '2025-01-01', '2025-01-01', '12:00', 'DELIVERED', 'r1', 10)",
            (str(n), str(n)),
        )
        insights = remaining(conn, Filters())["insights"]
        assert len(insights) == (0 if n == 4 else 3)
        for insight in insights:
            Filters(**insight["filter_patch"])


def test_chart_scope_multi_item_and_nulls(conn):
    from food_khata.serve.charts import remaining
    from food_khata.serve.metrics import compute_metrics

    conn.execute(
        "INSERT INTO order_items (order_id,item_name,quantity,total_price) VALUES ('1','Extra',2,25)"
    )
    conn.execute("UPDATE orders SET tip=NULL, total_tax=NULL, packaging_fee=NULL WHERE id='3'")
    for account in ("a", "b", "missing"):
        filters = Filters(account_ids=[account], statuses=[])
        charts = remaining(conn, filters)
        kpis = compute_metrics(conn, filters)
        assert round(sum(p["spend"] for p in charts["platforms"]), 2) == kpis["spend"]
        assert sum(p["orders"] for p in charts["platforms"]) == kpis["valid_order_count"]
        assert sum(r["quantity"] for r in charts["top_restaurants"]) == kpis["valid_order_count"]
        assert (
            round(sum(m["total_fees"] for m in charts["monthly_fee_components"]), 2) == kpis["fees"]
        )
        assert charts["cost_waterfall"]["provider_paid"] == kpis["spend"]
        if account == "a":
            assert {dish["name"] for dish in charts["top_dishes"]} == {"Rice", "Bread", "Extra"}
        if account == "b":
            assert {dish["name"] for dish in charts["top_dishes"]} == {"Mystery"}
        if account == "missing":
            assert charts["top_restaurants"] == charts["top_dishes"] == charts["platforms"] == []
