from food_khata.serve.metrics import compute_metrics, monthly_totals
from food_khata.serve.schemas import Filters

pytest_plugins = ["test_serve_filters"]


def test_metrics_and_monthly_scope(conn):
    filters = Filters(statuses=[], account_ids=["a"], cuisines=["Indian"])
    result = compute_metrics(conn, filters)
    assert result["orders"] == 2
    assert result["valid_order_count"] == 1
    assert result["spend"] == 100.12
    assert result["aov"] == 100.12
    assert result["fees"] == 8
    assert result["tax"] == 3
    assert result["tips"] == 2
    assert result["refunds"] == 7
    assert result["total_discount"] == 10
    assert result["reported_savings"] == 20
    assert result["discount_rate"] != result["reported_savings_rate"]
    assert result["unique_restaurants"] == 1
    assert result["unique_dishes"] == 2
    assert result["average_rating"] == 4
    months = monthly_totals(conn, filters)
    assert months == [
        {"month": "2025-01", "orders": 1, "spend": 100.12},
        {"month": "2025-02", "orders": 1, "spend": 0},
    ]
    assert sum(m["spend"] for m in months) == result["spend"]


def test_empty_and_cancelled_scope(conn):
    for filters in (Filters(account_ids=["absent"]), Filters(statuses=["CANCELLED"])):
        result = compute_metrics(conn, filters)
        assert result["spend"] == 0
        assert result["aov"] is None
        assert result["fee_percentage"] is None
        assert result["discount_rate"] is None
        assert result["reported_savings_rate"] is None
        assert result["average_rating"] is None
    assert monthly_totals(conn, Filters(account_ids=["absent"])) == []
    assert compute_metrics(conn, Filters(account_ids=["b"]))["spend"] == 50


def test_monthly_rounding_reconciles(conn):
    conn.execute("UPDATE orders SET final_amount_paid = 0.006 WHERE id IN ('1', '3')")
    result = compute_metrics(conn, Filters())
    months = monthly_totals(conn, Filters())
    assert round(sum(month["spend"] for month in months), 2) == result["spend"] == 0.01


def test_empty_database(conn):
    conn.execute("DELETE FROM order_items")
    conn.execute("DELETE FROM orders")
    assert compute_metrics(conn, Filters())["orders"] == 0
    assert monthly_totals(conn, Filters()) == []
