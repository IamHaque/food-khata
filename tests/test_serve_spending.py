from food_khata.serve.schemas import Filters
from food_khata.serve.spending import spending

pytest_plugins = ["test_serve_filters"]


def test_spending_rolling_scope_and_zero(conn):
    conn.execute("UPDATE orders SET order_date='2025-01-01',final_amount_paid=10 WHERE id='1'")
    conn.execute(
        "UPDATE orders SET account_id='a',order_date='2025-01-30',final_amount_paid=20 WHERE id='3'"
    )
    result = spending(conn, Filters(account_ids=["a"]))
    assert result["daily"][-1]["rolling_30"] == 30
    assert result["daily"][-1]["cumulative"] == 30
    conn.execute("UPDATE orders SET order_date='2025-01-31',final_amount_paid=0 WHERE id='3'")
    result = spending(conn, Filters(account_ids=["a"]))
    assert result["daily"][-1]["rolling_30"] == 0
    assert result["fee_scatter"][-1]["fee_percent"] is None
    assert spending(conn, Filters(account_ids=["missing"]))["daily"] == []


def test_spending_unallocated_and_item_filter(conn):
    conn.execute("UPDATE orders SET order_date='invalid',final_amount_paid=0.006 WHERE id='1'")
    result = spending(conn, Filters(veg="veg"))
    assert result["daily"] == []
    assert result["unallocated_spend"] == 0.01
    assert len(result["fee_scatter"]) == 1
