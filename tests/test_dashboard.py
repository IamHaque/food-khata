"""Unit tests for the Food Khata visual dashboard generator."""

from pathlib import Path

from food_khata.dashboard import fetch_analytics, generate_dashboard, render_dashboard_html
from food_khata.db import AnalyticsDB


def test_fetch_analytics_and_render_dashboard(tmp_path: Path):
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
    assert analytics["macro"]["delivered_orders"] == 2
    assert analytics["macro"]["delivered_spend"] == 450.0
    assert "SWIGGY" in analytics["platforms"]
    assert "ZOMATO" in analytics["platforms"]
    assert len(analytics["top_restaurants"]) == 2
    assert len(analytics["top_dishes"]) == 2

    html = render_dashboard_html(analytics)
    assert "<!DOCTYPE html>" in html
    assert '<div id="root">' in html
    assert 'src="https://' not in html
    assert 'href="https://' not in html
    assert "Food Khata Analytics" in html
    assert "Burger Spot" in html
    assert "Pizza Spot" in html

    out_file = tmp_path / "dashboard.html"
    result_path = generate_dashboard(db_file, out_file)
    assert result_path.exists()
    assert result_path.stat().st_size > 0


def test_complete_history_and_safe_embedded_data(tmp_path: Path):
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

    analytics = fetch_analytics(db_file, account_id="first")
    assert len(analytics["orders"]) == 55
    assert len(analytics["recent_orders"]) == 54
    other = next(order for order in analytics["orders"] if order["account_id"] == "other")
    assert other["items"][0]["item_name"].startswith("</script>")
    html = render_dashboard_html(analytics)
    assert "</script><script>alert(1)</script>" not in html
    assert r"\u003c/script>" in html
    assert "textContent" in html


def test_embedded_assets_and_data_are_standalone():
    import json
    import re

    data = {"accounts": [], "orders": [], "selected_account": None}
    html = render_dashboard_html(data)
    match = re.search(
        r'<script id="analytics-data" type="application/json">(.*?)</script>', html, re.S
    )
    assert json.loads(match.group(1)) == data
    assert "<script src=" not in html
    assert "@font-face" in html
    assert "data:font/woff2;base64," in html
    assert "cdn.tailwindcss.com" not in html
    assert "cdn.jsdelivr.net" not in html
