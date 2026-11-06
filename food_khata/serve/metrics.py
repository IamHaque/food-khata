"""Order-level KPI and monthly aggregates for the shared filter scope."""

import sqlite3

from .filters import build_where
from .schemas import Filters

FEES_SQL = "COALESCE(o.delivery_fee,0)+COALESCE(o.packaging_fee,0)+COALESCE(o.platform_fee,0)"


def compute_metrics(conn: sqlite3.Connection, filters: Filters) -> dict:
    where, params = build_where(filters)
    row = conn.execute(
        f"""SELECT COUNT(*),
            COUNT(CASE WHEN o.order_status = 'DELIVERED' THEN 1 END),
            COALESCE(SUM(CASE WHEN o.order_status = 'DELIVERED' THEN o.final_amount_paid END), 0),
            COALESCE(SUM(CASE WHEN o.order_status = 'DELIVERED' THEN o.total_discount END), 0),
            COALESCE(SUM(CASE WHEN o.order_status = 'DELIVERED' THEN o.reported_savings END), 0),
            COALESCE(SUM(CASE WHEN o.order_status = 'DELIVERED' THEN
                {FEES_SQL} END), 0),
            COALESCE(SUM(CASE WHEN o.order_status = 'DELIVERED' THEN o.total_tax END), 0),
            COALESCE(SUM(CASE WHEN o.order_status = 'DELIVERED' THEN o.tip END), 0),
            COALESCE(SUM(o.refund_amount), 0),
            COUNT(DISTINCT CASE WHEN o.order_status = 'DELIVERED' THEN o.restaurant_id END),
            AVG(CASE WHEN o.order_status = 'DELIVERED' THEN o.user_rating END)
            FROM orders o WHERE {where}""",
        params,
    ).fetchone()
    dish_count = conn.execute(
        f"""SELECT COUNT(DISTINCT i.item_name) FROM order_items i
            WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = i.order_id
                AND o.order_status = 'DELIVERED' AND {where})""",
        params,
    ).fetchone()[0]
    orders, valid, spend, discount, savings, fees, tax, tips, refunds, restaurants, rating = row

    def ratio(numerator, denominator):
        return round(numerator / denominator * 100, 2) if denominator else None

    return {
        "orders": orders,
        "valid_order_count": valid,
        "spend": round(spend, 2),
        "aov": round(spend / valid, 2) if valid else None,
        "total_discount": round(discount, 2),
        "reported_savings": round(savings, 2),
        "discount_rate": ratio(discount, spend + discount),
        "reported_savings_rate": ratio(savings, spend + savings),
        "fees": round(fees, 2),
        "fee_percentage": ratio(fees, spend),
        "tax": round(tax, 2),
        "tips": round(tips, 2),
        "refunds": round(refunds, 2),
        "unique_restaurants": restaurants,
        "unique_dishes": dish_count,
        "average_rating": round(rating, 2) if rating is not None else None,
    }


def monthly_totals(conn: sqlite3.Connection, filters: Filters) -> list[dict]:
    where, params = build_where(filters)
    rows = conn.execute(
        f"""SELECT substr(o.order_date, 1, 7), COUNT(*),
            COALESCE(SUM(CASE WHEN o.order_status = 'DELIVERED'
                THEN o.final_amount_paid END), 0)
            FROM orders o WHERE {where} GROUP BY substr(o.order_date, 1, 7)
            ORDER BY 1""",
        params,
    )
    rows = list(rows)
    result = [
        {"month": month, "orders": count, "spend": round(spend, 2)} for month, count, spend in rows
    ]
    if result:
        # Assign rounding remainder to the final month so displayed totals reconcile.
        total = round(sum(row[2] for row in rows), 2)
        result[-1]["spend"] = round(total - sum(row["spend"] for row in result[:-1]), 2)
    return result
