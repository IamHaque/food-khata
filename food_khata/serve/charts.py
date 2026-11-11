from datetime import date, timedelta

from .filters import build_where
from .metrics import FEES_SQL, compute_metrics, compute_metrics_by_month


def overview(conn, filters):
    where, params = build_where(filters)
    rows = list(
        conn.execute(
            f"""SELECT o.order_date, COUNT(*),
        COALESCE(SUM(CASE WHEN o.order_status='DELIVERED' THEN o.final_amount_paid END),0)
        FROM orders o WHERE {where} GROUP BY o.order_date ORDER BY o.order_date""",
            params,
        )
    )
    calendar = [
        {"date": day, "orders": count, "spend": round(spend, 2)} for day, count, spend in rows
    ]
    if calendar:
        calendar[-1]["spend"] = round(
            round(sum(row[2] for row in rows), 2) - sum(day["spend"] for day in calendar[:-1]), 2
        )
    comparison = None
    if filters.compare != "none":
        bounds = conn.execute(
            f"SELECT MIN(o.order_date), MAX(o.order_date) FROM orders o WHERE {where}", params
        ).fetchone()

        def parse(value):
            try:
                return date.fromisoformat(value) if value else None
            except (ValueError, TypeError):
                return None

        start = filters.date_from or parse(bounds[0])
        end = filters.date_to or parse(bounds[1])
        if start and end and start <= end:
            # No representable comparison exists before the minimum supported date.
            if start.year == 1 or (
                filters.compare == "previous_period" and start.toordinal() <= (end - start).days + 1
            ):
                return calendar, None
            if filters.compare == "previous_period":
                previous_end = start - timedelta(days=1)
                previous_start = previous_end - (end - start)
            else:

                def prior(day):
                    try:
                        return day.replace(year=day.year - 1)
                    except ValueError:
                        return day.replace(year=day.year - 1, day=28)

                previous_start, previous_end = prior(start), prior(end)
            previous = filters.model_copy(
                update={"date_from": previous_start, "date_to": previous_end, "compare": "none"}
            )
            current = compute_metrics(conn, filters)
            baseline = compute_metrics(conn, previous)
            deltas = {}
            for key, value in current.items():
                base = baseline[key]
                deltas[key] = (
                    None
                    if value is None or base is None or base == 0
                    else round((value - base) / base * 100, 2)
                )
            comparison = {
                "date_from": previous_start,
                "date_to": previous_end,
                "kpis": baseline,
                "percent_change": deltas,
            }
    return calendar, comparison


def remaining(conn, filters):
    where, params = build_where(filters)
    delivered = f"{where} AND o.order_status='DELIVERED'"
    columns = (
        "item_subtotal",
        "food_discount",
        "delivery_fee",
        "packaging_fee",
        "platform_fee",
        "total_tax",
        "tip",
        "other_charges",
    )
    sums = ", ".join(f"COALESCE(SUM(o.{c}),0)" for c in columns)
    row = conn.execute(
        f"SELECT {sums}, COALESCE(SUM(o.final_amount_paid),0) FROM orders o WHERE {delivered}",
        params,
    ).fetchone()
    values = [round(v, 2) for v in row[:-1]]
    values[1] = -values[1]
    waterfall = dict(
        zip(
            (
                "subtotal",
                "food_discount",
                "net_delivery",
                "packaging",
                "platform",
                "tax",
                "tip",
                "other",
            ),
            values,
            strict=False,
        )
    )
    waterfall["residual"] = round(round(row[-1], 2) - sum(values), 2)
    waterfall["provider_paid"] = round(row[-1], 2)
    waterfall["refunds"] = compute_metrics(conn, filters)["refunds"]
    restaurants = [
        dict(
            zip(
                ("key", "name", "quantity", "amount"),
                (r[0], r[1], r[2], round(r[3], 2)),
                strict=False,
            )
        )
        for r in conn.execute(
            f"SELECT r.id, r.name, COUNT(*), COALESCE(SUM(o.final_amount_paid),0) FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE {delivered} GROUP BY r.id, r.name ORDER BY 4 DESC, r.id LIMIT 5",
            params,
        )
    ]
    dishes = [
        dict(
            zip(
                ("key", "name", "quantity", "amount"),
                (r[0], r[0], r[1], round(r[2], 2)),
                strict=False,
            )
        )
        for r in conn.execute(
            f"SELECT i.item_name, SUM(i.quantity), COALESCE(SUM(i.total_price),0) FROM orders o JOIN order_items i ON i.order_id=o.id WHERE {delivered} GROUP BY i.item_name ORDER BY 3 DESC, i.item_name LIMIT 5",
            params,
        )
    ]
    platforms = [
        dict(
            zip(
                ("platform", "orders", "spend", "discounts", "advertised_savings", "fees"),
                (r[0], r[1], *(round(v, 2) for v in r[2:])),
                strict=False,
            )
        )
        for r in conn.execute(
            f"SELECT o.platform, COUNT(*), COALESCE(SUM(o.final_amount_paid),0), COALESCE(SUM(o.total_discount),0), COALESCE(SUM(o.reported_savings),0), COALESCE(SUM({FEES_SQL}),0) FROM orders o WHERE {delivered} GROUP BY o.platform ORDER BY o.platform",
            params,
        )
    ]
    months = [
        dict(
            zip(
                ("month", "order_count", "net_delivery", "packaging", "platform", "tax"),
                (r[0], r[1], *(round(v, 2) for v in r[2:])),
                strict=False,
            )
        )
        for r in conn.execute(
            f"SELECT substr(o.order_date,1,7), COUNT(*), COALESCE(SUM(o.delivery_fee),0), COALESCE(SUM(o.packaging_fee),0), COALESCE(SUM(o.platform_fee),0), COALESCE(SUM(o.total_tax),0) FROM orders o WHERE {delivered} GROUP BY 1 ORDER BY 1",
            params,
        )
    ]
    metrics = compute_metrics(conn, filters)
    for m in months:
        m["rounding_adjustment"] = 0.0
        m["total_fees"] = round(m["net_delivery"] + m["packaging"] + m["platform"], 2)
    if months:
        adjustment = round(metrics["fees"] - sum(m["total_fees"] for m in months), 2)
        months[-1]["rounding_adjustment"] = adjustment
        months[-1]["total_fees"] = round(months[-1]["total_fees"] + adjustment, 2)
    insights = []
    if metrics["valid_order_count"] >= 5 and platforms:
        best = max(platforms, key=lambda p: p["orders"])
        insights.append(
            {
                "key": "most_frequent_platform",
                "text": "Most frequent platform",
                "value": best["platform"],
                "filter_patch": {"platforms": [best["platform"]]},
            }
        )
        if restaurants:
            best_restaurant = restaurants[0]
            insights.append(
                {
                    "key": "top_restaurant",
                    "text": "Top restaurant by spend",
                    "value": best_restaurant["name"],
                    "filter_patch": {"restaurant_ids": [best_restaurant["key"]]},
                }
            )
        if metrics["fee_percentage"] is not None:
            insights.append(
                {
                    "key": "fee_percentage",
                    "text": "Fees as a percentage of spend",
                    "value": str(metrics["fee_percentage"]),
                    "filter_patch": {},
                }
            )
    steps = []
    running = 0.0
    for label, amount in waterfall.items():
        if label in {"provider_paid", "refunds"}:
            continue
        endpoint = round(running + amount, 2)
        steps.append(
            {
                "label": label.replace("_", " "),
                "amount": amount,
                "baseline": min(running, endpoint),
                "height": abs(amount),
                "direction": "up" if amount >= 0 else "down",
            }
        )
        running = endpoint
    steps.append(
        {
            "label": "Final paid",
            "amount": waterfall["provider_paid"],
            "baseline": min(0, waterfall["provider_paid"]),
            "height": abs(waterfall["provider_paid"]),
            "direction": "total",
        }
    )
    return {
        "waterfall_steps": steps,
        "cost_waterfall": waterfall,
        "top_restaurants": restaurants,
        "top_dishes": dishes,
        "platforms": platforms,
        "monthly_fee_components": months,
        "insights": insights,
    }


def kpi_history(conn, filters):
    result = []
    for row in compute_metrics_by_month(conn, filters):
        try:
            date.fromisoformat(row["month"] + "-01")
        except (TypeError, ValueError):
            continue  # malformed order dates never made a month before either
        result.append(row)
    return result
