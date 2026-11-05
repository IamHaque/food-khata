from datetime import date, timedelta

from .filters import build_where
from .metrics import compute_metrics


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
