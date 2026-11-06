"""Food/restaurant aggregates. Item line totals are distinct from provider-paid spend."""

from collections import defaultdict
from datetime import date

from .filters import build_where


def food(conn, filters):
    where, params = build_where(filters)
    rows = conn.execute(
        f"""SELECT o.id,o.order_date,r.id,r.name,r.locality,r.cuisine,o.final_amount_paid
        FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id
        WHERE {where} AND o.order_status='DELIVERED'""",
        params,
    ).fetchall()
    cuisines = defaultdict(lambda: {"orders": 0, "spend": 0.0})
    loyalty = defaultdict(lambda: {"orders": 0, "spend": 0.0})
    for _order_id, _day, rid, name, locality, cuisine, amount in rows:
        cuisine = (cuisine or "").strip() or "Unknown"
        cuisines[cuisine]["orders"] += 1
        cuisines[cuisine]["spend"] += amount
        if rid:
            key = ((name or "").strip().lower(), (locality or "").strip().lower())
            loyalty[key]["name"] = name
            loyalty[key]["orders"] += 1
            loyalty[key]["spend"] += amount
    item_rows = conn.execute(
        f"SELECT i.is_veg,COUNT(*),SUM(i.quantity),COALESCE(SUM(i.total_price),0) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE {where} AND o.order_status='DELIVERED' GROUP BY i.is_veg",
        params,
    ).fetchall()
    dietary = [
        {
            "diet": "Veg" if veg == 1 else "Non-veg" if veg == 0 else "Unknown",
            "item_lines": count,
            "quantity": quantity,
            "line_total": round(amount, 2),
        }
        for veg, count, quantity, amount in item_rows
    ]
    all_dates = filters.model_copy(update={"date_from": None, "date_to": None})
    first_where, first_params = build_where(all_dates)
    first_rows = conn.execute(
        f"SELECT r.name,r.locality,o.id,o.order_date,o.order_timestamp FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE {first_where} AND o.order_status='DELIVERED' AND o.order_date<>''",
        first_params,
    ).fetchall()
    first = {}
    for name, locality, order_id, day, timestamp in first_rows:
        try:
            parsed = date.fromisoformat(day)
            if parsed.isoformat() != day:
                continue
        except (TypeError, ValueError):
            continue
        key = ((name or "").strip().lower(), (locality or "").strip().lower())
        candidate = (day, timestamp or "", order_id)
        first[key] = min(first.get(key, candidate), candidate)
    visits = defaultdict(lambda: {"new_orders": 0, "repeat_orders": 0})
    missing_dates = 0
    for order_id, day, rid, name, locality, _cuisine, _amount in rows:
        try:
            parsed = date.fromisoformat(day)
            if parsed.isoformat() != day:
                raise ValueError
        except (ValueError, TypeError):
            missing_dates += 1
            continue
        if not rid:
            continue
        key = ((name or "").strip().lower(), (locality or "").strip().lower())
        visits[day[:7]][
            "new_orders" if first.get(key, (None, None, None))[2] == order_id else "repeat_orders"
        ] += 1
    cuisine_reason = (
        "More than 80% of orders lack cuisine data."
        if rows and cuisines["Unknown"]["orders"] / len(rows) > 0.8
        else None
    )
    unknown = sum(row["item_lines"] for row in dietary if row["diet"] == "Unknown")
    line_count = sum(row["item_lines"] for row in dietary)
    diet_reason = (
        "More than 80% of item lines lack dietary classification."
        if line_count and unknown / line_count > 0.8
        else None
    )
    return {
        "cuisines": []
        if cuisine_reason
        else [
            {"name": name, "orders": value["orders"], "spend": round(value["spend"], 2)}
            for name, value in sorted(cuisines.items())
            if value["orders"]
        ],
        "diet": [] if diet_reason else dietary,
        "loyalty": [
            {
                "key": str(key),
                "name": value["name"],
                "orders": value["orders"],
                "spend": round(value["spend"], 2),
                "aov": round(value["spend"] / value["orders"], 2),
            }
            for key, value in sorted(loyalty.items())
        ],
        "new_repeat": [{"month": month, **counts} for month, counts in sorted(visits.items())],
        "cuisine_unavailable_reason": cuisine_reason,
        "diet_unavailable_reason": diet_reason,
        "orders_without_dates": missing_dates,
    }
