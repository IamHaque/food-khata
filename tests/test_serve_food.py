from food_khata.serve.food import food
from food_khata.serve.schemas import Filters

pytest_plugins = ["test_serve_filters"]


def test_food_scope_and_new_repeat_history(conn):
    conn.execute("UPDATE restaurants SET cuisine='Indian' WHERE id='r1'")
    conn.execute("UPDATE order_items SET quantity=1,total_price=10")
    result = food(conn, Filters(account_ids=["a"]))
    assert result["cuisines"] == [{"name": "Indian", "orders": 1, "spend": 100.12}]
    assert result["diet"][0]["quantity"] == 2
    assert sum(result["diet_monthly"][0][k] for k in ["veg", "non_veg", "unknown"]) == 2
    assert result["loyalty"][0]["orders"] == 1
    conn.execute("UPDATE orders SET order_status='DELIVERED' WHERE id='2'")
    result = food(conn, Filters(account_ids=["a"], date_from="2025-02-01"))
    assert result["new_repeat"] == [{"month": "2025-02", "new_orders": 0, "repeat_orders": 1}]
    assert food(conn, Filters(account_ids=["missing"]))["loyalty"] == []


def test_food_unknown_support_and_bad_dates(conn):
    conn.execute("UPDATE restaurants SET cuisine=NULL")
    conn.execute("UPDATE order_items SET is_veg=NULL")
    conn.execute("UPDATE orders SET order_date='invalid'")
    result = food(conn, Filters())
    assert result["cuisines"] == [] and result["cuisine_unavailable_reason"]
    assert result["diet"] == [] and result["diet_unavailable_reason"]
    assert result["orders_without_dates"] == 2
