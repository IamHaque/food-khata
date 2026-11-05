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

    with db.connect() as conn:
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
    assert "Chart.js" in html or "chart.js" in html
    assert "Food Khata Analytics" in html
    assert "Burger Spot" in html
    assert "Pizza Spot" in html

    out_file = tmp_path / "dashboard.html"
    result_path = generate_dashboard(db_file, out_file)
    assert result_path.exists()
    assert result_path.stat().st_size > 0
