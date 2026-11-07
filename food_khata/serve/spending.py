"""Observed-date spending trends; rolling windows stay inside the selected scope."""

import math
from collections import defaultdict, deque
from datetime import date, timedelta

from .filters import build_where
from .metrics import FEES_SQL


def spending(conn, filters):
    where, params = build_where(filters)
    rows = conn.execute(
        f"SELECT o.order_date,o.final_amount_paid,({FEES_SQL}) FROM orders o WHERE {where} AND o.order_status='DELIVERED'",
        params,
    ).fetchall()
    daily = defaultdict(float)
    scatter = []
    unallocated = 0.0
    for day, amount, fees in rows:
        if not math.isfinite(amount) or not math.isfinite(fees):
            raise ValueError("Invalid numeric spending data")
        scatter.append(
            {
                "amount": round(amount, 2),
                "fees": round(fees, 2),
                "fee_percent": round(fees / amount * 100, 2) if amount else None,
            }
        )
        try:
            parsed = date.fromisoformat(day)
            if parsed.isoformat() != day:
                raise ValueError
        except (ValueError, TypeError):
            unallocated += amount
            continue
        daily[parsed] += amount
    cumulative = 0.0
    window = deque()
    rolling = 0.0
    points = []
    years = defaultdict(float)
    for day, amount in sorted(daily.items()):
        cumulative += amount
        window.append((day, amount))
        rolling += amount
        while window and window[0][0] < day - timedelta(days=29):
            rolling -= window.popleft()[1]
        points.append(
            {
                "date": day.isoformat(),
                "spend": round(amount, 2),
                "cumulative": round(cumulative, 2),
                "rolling_30": round(rolling, 2),
            }
        )
        years[(day.year, day.month)] += amount
    discounts = conn.execute(
        f"SELECT COALESCE(SUM(o.food_discount),0),COALESCE(SUM(o.delivery_fee_discount),0),COALESCE(SUM(o.total_discount),0) FROM orders o WHERE {where} AND o.order_status='DELIVERED'",
        params,
    ).fetchone()
    return {
        "discount_breakdown": [
            {"label": "Food discount", "amount": round(discounts[0], 2)},
            {"label": "Delivery discount", "amount": round(discounts[1], 2)},
            {
                "label": "Other / unallocated discount",
                "amount": round(discounts[2] - discounts[0] - discounts[1], 2),
            },
        ],
        "daily": points,
        "years": [
            {"year": year, "month": month, "spend": round(amount, 2)}
            for (year, month), amount in sorted(years.items())
        ],
        "fee_scatter": scatter,
        "unallocated_spend": round(unallocated, 2),
    }
