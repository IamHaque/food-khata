"""Query SQLite analytics and export data for the independent React dashboard."""

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from .db import DEFAULT_DB_PATH, IST
from .storage import save_json

DEFAULT_DASHBOARD_PATH = DEFAULT_DB_PATH.parent / "dashboard.json"


def fetch_analytics(db_path: Path | str, account_id: str | None = None) -> dict[str, Any]:
    """Execute aggregation queries across orders, restaurants, addresses, and line items."""
    conn = sqlite3.connect(Path(db_path).resolve().as_uri() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    acc_filter = "WHERE account_id = ?" if account_id else ""
    acc_params = (account_id,) if account_id else ()

    # 1. Accounts summary
    c.execute("SELECT id, phone, local_id FROM accounts ORDER BY phone ASC;")
    accounts = [dict(r) for r in c.fetchall()]

    # 2. Macro KPIs
    where_clause = (
        f"{acc_filter} AND order_status = 'DELIVERED'"
        if acc_filter
        else "WHERE order_status = 'DELIVERED'"
    )
    c.execute(
        f"""
        SELECT 
            COUNT(*) as total_orders,
            COUNT(CASE WHEN order_status = 'DELIVERED' THEN 1 END) as delivered_orders,
            COUNT(CASE WHEN order_status = 'CANCELLED' THEN 1 END) as cancelled_orders,
            COUNT(CASE WHEN order_status = 'PAYMENT_INCOMPLETE' THEN 1 END) as incomplete_orders,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid ELSE 0 END), 2) as delivered_spend,
            ROUND(SUM(final_amount_paid), 2) as total_attempted_spend,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN total_discount ELSE 0 END), 2) as total_savings,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN delivery_fee_discount ELSE 0 END), 2) as total_delivery_saved,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN delivery_fee ELSE 0 END), 2) as total_delivery_paid,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN platform_fee ELSE 0 END), 2) as total_platform_fees,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN packaging_fee ELSE 0 END), 2) as total_packaging_fees,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN total_tax ELSE 0 END), 2) as total_taxes_paid,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN item_subtotal ELSE 0 END), 2) as gross_food_cost,
            MIN(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid END) as min_spend,
            MAX(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid END) as max_spend
        FROM orders
        {acc_filter}
        """,
        acc_params,
    )
    macro = dict(c.fetchone() or {})
    deliv_orders = macro.get("delivered_orders") or 0
    deliv_spend = macro.get("delivered_spend") or 0.0
    tot_savings = macro.get("total_savings") or 0.0
    macro["aov"] = round(deliv_spend / deliv_orders, 2) if deliv_orders else 0.0
    macro["effective_discount_pct"] = (
        round((tot_savings / (deliv_spend + tot_savings)) * 100, 1)
        if (deliv_spend + tot_savings) > 0
        else 0.0
    )

    # 3. Platform Breakdown (Head-to-Head)
    c.execute(
        f"""
        SELECT 
            platform,
            COUNT(*) as total_orders,
            COUNT(CASE WHEN order_status = 'DELIVERED' THEN 1 END) as delivered_orders,
            COUNT(CASE WHEN order_status != 'DELIVERED' THEN 1 END) as failed_orders,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid ELSE 0 END), 2) as spend,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN total_discount ELSE 0 END), 2) as savings,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN delivery_fee ELSE 0 END), 2) as delivery_paid,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN delivery_fee_discount ELSE 0 END), 2) as delivery_saved,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN platform_fee ELSE 0 END), 2) as platform_fees,
            ROUND(AVG(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid END), 2) as aov,
            ROUND(AVG(CASE WHEN order_status = 'DELIVERED' THEN discount_percentage END), 1) as avg_discount_pct
        FROM orders
        {acc_filter}
        GROUP BY platform
        """,
        acc_params,
    )
    platforms = {r["platform"]: dict(r) for r in c.fetchall()}

    # 4. Monthly Timeline
    c.execute(
        f"""
        SELECT 
            SUBSTR(order_date, 1, 7) as month,
            COUNT(*) as orders,
            ROUND(SUM(final_amount_paid), 2) as spend,
            ROUND(AVG(final_amount_paid), 2) as aov,
            ROUND(SUM(total_discount), 2) as savings,
            ROUND(SUM(CASE WHEN platform = 'SWIGGY' THEN final_amount_paid ELSE 0 END), 2) as swiggy_spend,
            ROUND(SUM(CASE WHEN platform = 'ZOMATO' THEN final_amount_paid ELSE 0 END), 2) as zomato_spend
        FROM orders
        {where_clause}
        GROUP BY month
        ORDER BY month ASC
        """,
        acc_params,
    )
    monthly_timeline = [dict(r) for r in c.fetchall()]

    # 5. Yearly Timeline
    c.execute(
        f"""
        SELECT 
            SUBSTR(order_date, 1, 4) as year,
            COUNT(*) as orders,
            ROUND(SUM(final_amount_paid), 2) as spend,
            ROUND(AVG(final_amount_paid), 2) as aov,
            ROUND(SUM(total_discount), 2) as savings,
            COUNT(CASE WHEN platform = 'SWIGGY' THEN 1 END) as swiggy_orders,
            COUNT(CASE WHEN platform = 'ZOMATO' THEN 1 END) as zomato_orders
        FROM orders
        {where_clause}
        GROUP BY year
        ORDER BY year ASC
        """,
        acc_params,
    )
    yearly_timeline = [dict(r) for r in c.fetchall()]

    # 6. 7x24 Ordering Density Matrix (Day of week x Hour)
    c.execute(
        f"""
        SELECT 
            CAST(STRFTIME('%w', order_date) AS INT) as dow,
            CAST(SUBSTR(order_time, 1, 2) AS INT) as hour,
            COUNT(*) as count,
            ROUND(SUM(final_amount_paid), 2) as spend
        FROM orders
        {where_clause}
        GROUP BY dow, hour
        ORDER BY dow ASC, hour ASC
        """,
        acc_params,
    )
    heatmap_raw = [dict(r) for r in c.fetchall()]

    # 7. Meal Slot Habits
    c.execute(
        f"""
        SELECT 
            CASE
                WHEN CAST(SUBSTR(order_time, 1, 2) AS INT) BETWEEN 6 AND 10 THEN 'Breakfast (6am-11am)'
                WHEN CAST(SUBSTR(order_time, 1, 2) AS INT) BETWEEN 11 AND 15 THEN 'Lunch (11am-4pm)'
                WHEN CAST(SUBSTR(order_time, 1, 2) AS INT) BETWEEN 16 AND 18 THEN 'Snacks (4pm-7pm)'
                WHEN CAST(SUBSTR(order_time, 1, 2) AS INT) BETWEEN 19 AND 23 THEN 'Dinner (7pm-12am)'
                ELSE 'Late Night (12am-6am)'
            END AS meal_slot,
            COUNT(*) as orders,
            ROUND(SUM(final_amount_paid), 2) as spend,
            ROUND(AVG(final_amount_paid), 2) as aov
        FROM orders
        {where_clause}
        GROUP BY meal_slot
        ORDER BY orders DESC
        """,
        acc_params,
    )
    meal_slots = [dict(r) for r in c.fetchall()]

    # 8. Veg vs Non-Veg Consumption
    c.execute(
        f"""
        SELECT 
            CASE oi.is_veg
                WHEN 1 THEN 'Vegetarian'
                WHEN 0 THEN 'Non-Vegetarian'
                ELSE 'Bakery / Other'
            END AS category,
            COUNT(DISTINCT oi.item_name) as unique_dishes,
            SUM(oi.quantity) as total_qty,
            ROUND(SUM(oi.total_price), 2) as total_spent
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        {where_clause}
        GROUP BY oi.is_veg
        ORDER BY total_spent DESC
        """,
        acc_params,
    )
    veg_split = [dict(r) for r in c.fetchall()]

    # 9. Cuisine Breakdown
    c.execute(
        f"""
        SELECT 
            COALESCE(oi.category, 'Other Delicacies') as cuisine,
            COUNT(DISTINCT oi.item_name) as unique_dishes,
            SUM(oi.quantity) as total_qty,
            ROUND(SUM(oi.total_price), 2) as total_spent
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        {where_clause}
        GROUP BY cuisine
        ORDER BY total_spent DESC
        LIMIT 10
        """,
        acc_params,
    )
    cuisines = [dict(r) for r in c.fetchall()]

    # 10. Top 10 Favorite Restaurants
    c.execute(
        f"""
        SELECT 
            r.name,
            r.platform,
            r.locality,
            COUNT(o.id) as visits,
            ROUND(SUM(o.final_amount_paid), 2) as total_spent,
            ROUND(AVG(o.final_amount_paid), 2) as aov
        FROM orders o
        JOIN restaurants r ON o.restaurant_id = r.id
        {where_clause}
        GROUP BY r.name, r.platform
        ORDER BY visits DESC, total_spent DESC
        LIMIT 10
        """,
        acc_params,
    )
    top_restaurants = [dict(r) for r in c.fetchall()]

    # 11. Top 10 Most Ordered Dishes
    c.execute(
        f"""
        SELECT 
            LOWER(TRIM(oi.item_name)) as dish,
            oi.is_veg,
            SUM(oi.quantity) as times_ordered,
            ROUND(SUM(oi.total_price), 2) as total_spent,
            ROUND(AVG(oi.unit_price), 2) as avg_price
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        {where_clause}
        GROUP BY LOWER(TRIM(oi.item_name)), oi.is_veg
        ORDER BY times_ordered DESC, total_spent DESC
        LIMIT 10
        """,
        acc_params,
    )
    top_dishes = [dict(r) for r in c.fetchall()]

    # 12. Delivery Locations
    c.execute(
        f"""
        SELECT 
            da.normalized_label as label,
            COUNT(o.id) as orders,
            ROUND(SUM(o.final_amount_paid), 2) as spend,
            ROUND(AVG(o.final_amount_paid), 2) as aov,
            ROUND(SUM(o.total_discount), 2) as savings
        FROM orders o
        JOIN delivery_addresses da ON o.delivery_address_id = da.id
        {where_clause}
        GROUP BY da.normalized_label
        ORDER BY spend DESC
        """,
        acc_params,
    )
    delivery_locations = [dict(r) for r in c.fetchall()]

    # 13. Platform Fee Evolution Timeline
    c.execute(
        f"""
        SELECT 
            SUBSTR(order_date, 1, 4) as year,
            platform,
            COUNT(*) as orders,
            ROUND(AVG(platform_fee), 2) as avg_platform_fee,
            ROUND(MAX(platform_fee), 2) as max_platform_fee,
            ROUND(AVG(delivery_fee), 2) as avg_deliv_paid,
            ROUND(AVG(delivery_fee_discount), 2) as avg_deliv_saved
        FROM orders
        {where_clause}
        GROUP BY year, platform
        ORDER BY year ASC, platform ASC
        """,
        acc_params,
    )
    platform_fees_creep = [dict(r) for r in c.fetchall()]

    # 14. Orders table
    c.execute(
        f"""
        SELECT 
            o.id,
            o.platform,
            o.order_date,
            o.order_time,
            o.order_status,
            o.payment_method,
            o.final_amount_paid,
            o.total_discount,
            r.name as restaurant_name,
            da.normalized_label as location_label,
            (
                SELECT GROUP_CONCAT(oi.quantity || 'x ' || oi.item_name, ', ')
                FROM order_items oi WHERE oi.order_id = o.id
            ) as items_summary
        FROM orders o
        LEFT JOIN restaurants r ON o.restaurant_id = r.id
        LEFT JOIN delivery_addresses da ON o.delivery_address_id = da.id
        {acc_filter}
        ORDER BY o.order_timestamp DESC
        """,
        acc_params,
    )
    recent_orders = [dict(r) for r in c.fetchall()]
    # Keep the complete dataset in the generated file so account switching works offline.
    orders = [
        dict(row) for row in conn.execute("SELECT * FROM orders ORDER BY order_timestamp DESC")
    ]
    restaurants = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM restaurants")}
    addresses = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM delivery_addresses")}
    items = {}
    for row in conn.execute("SELECT * FROM order_items ORDER BY id"):
        item = dict(row)
        items.setdefault(item["order_id"], []).append(item)
    for order in orders:
        order["restaurant"] = restaurants.get(order.get("restaurant_id"))
        order["address"] = addresses.get(order.get("delivery_address_id"))
        order["items"] = items.get(order["id"], [])
    archive_imports = []
    if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='archive_imports'"
    ).fetchone():
        archive_imports = [dict(row) for row in conn.execute("SELECT * FROM archive_imports")]
    conn.close()

    return {
        "archive_imports": archive_imports,
        "orders": orders,
        "accounts": accounts,
        "selected_account": account_id,
        "macro": macro,
        "platforms": platforms,
        "monthly_timeline": monthly_timeline,
        "yearly_timeline": yearly_timeline,
        "heatmap": heatmap_raw,
        "meal_slots": meal_slots,
        "veg_split": veg_split,
        "cuisines": cuisines,
        "top_restaurants": top_restaurants,
        "top_dishes": top_dishes,
        "locations": delivery_locations,
        "platform_fees": platform_fees_creep,
        "recent_orders": recent_orders,
    }


def export_dashboard_data(
    db_path: Path | str | None = None,
    output_path: Path | str | None = None,
    account_id: str | None = None,
) -> Path:
    """Atomically export complete business records for the React app's JSON input."""
    path = Path(db_path) if db_path is not None else DEFAULT_DB_PATH
    out = Path(output_path) if output_path is not None else path.parent / "dashboard.json"
    data = fetch_analytics(path, account_id=account_id)
    orders = [
        {
            key: value
            for key, value in order.items()
            if key not in {"source_bill_json", "discount_breakdown_json"}
        }
        for order in data["orders"]
    ]
    save_json(
        out,
        {
            "schema_version": 1,
            "generated_at": datetime.now(IST).isoformat(),
            "accounts": data["accounts"],
            "selected_account": account_id,
            "orders": orders,
            "archive_imports": data["archive_imports"],
        },
    )
    return out
