import math
from collections import Counter
from datetime import date, time

from .filters import MEAL_SLOTS, build_where


def behavior(conn, filters):
    where, params = build_where(filters)
    rows = conn.execute(
        f"SELECT o.order_date, o.order_time, o.order_status, o.final_amount_paid FROM orders o WHERE {where}",
        params,
    ).fetchall()
    dated, timed = [], []
    for day, clock, status, amount in rows:
        try:
            d = date.fromisoformat(day)
        except (TypeError, ValueError):
            d = None
        try:
            t = time.fromisoformat(clock)
        except (TypeError, ValueError):
            t = None
        amount = float(amount or 0)
        spend = amount if status == "DELIVERED" and math.isfinite(amount) else 0
        if d:
            dated.append((d, spend))
        if d and t:
            timed.append((d, t.hour, spend))

    def aggregate(keys, values):
        result = []
        for key in keys:
            matches = [spend for k, spend in values if k == key]
            result.append(
                {"key": str(key), "orders": len(matches), "spend": round(sum(matches), 2)}
            )
        if result and values:
            result[-1]["spend"] = round(
                result[-1]["spend"]
                + round(sum(v for _, v in values), 2)
                - sum(r["spend"] for r in result),
                2,
            )
        return result

    timing_unavailable = bool(rows) and len(timed) / len(rows) < 0.2
    date_unavailable = bool(rows) and len(dated) / len(rows) < 0.2
    if timing_unavailable:
        timed = []
    if date_unavailable:
        dated = []
    dates = sorted(d for d, _ in dated)
    gaps = [(b - a).days for a, b in zip(dates, dates[1:], strict=False)]
    unique = sorted(set(dates))
    streak = longest = 0
    previous = None
    for d in unique:
        streak = streak + 1 if previous and (d - previous).days == 1 else 1
        longest = max(longest, streak)
        previous = d
    bins = [0, 100, 250, 500, 1000]
    amounts = [
        float(r[3])
        for r in rows
        if r[2] == "DELIVERED" and r[3] is not None and math.isfinite(float(r[3]))
    ]
    return {
        "timing_unavailable_reason": "more than 80% of dates or times are missing or invalid"
        if timing_unavailable
        else None,
        "date_unavailable_reason": "more than 80% of dates are missing or invalid"
        if date_unavailable
        else None,
        "hour_weekday": []
        if timing_unavailable
        else aggregate(range(168), [(d.weekday() * 24 + h, s) for d, h, s in timed]),
        "meals": []
        if timing_unavailable
        else aggregate(
            MEAL_SLOTS,
            [
                (
                    next(
                        k
                        for k, (a, b) in MEAL_SLOTS.items()
                        if (a <= h < b if a < b else h >= a or h < b)
                    ),
                    s,
                )
                for _, h, s in timed
            ],
        ),
        "day_type": []
        if date_unavailable
        else aggregate(
            ["weekday", "weekend"],
            [("weekend" if d.weekday() >= 5 else "weekday", s) for d, s in dated],
        ),
        "aov_histogram": [
            {
                "key": str(b),
                "orders": sum(
                    1
                    for a in amounts
                    if (a < bins[i + 1] if i + 1 < len(bins) else True) and (i == 0 or a >= b)
                ),
            }
            for i, b in enumerate(bins)
        ],
        "gaps": [{"days": k, "orders": v} for k, v in sorted(Counter(gaps).items())],
        "longest_streak": longest if dates else None,
        "longest_gap": max(gaps) if gaps else None,
        "orders_per_week": round(len(dates) * 7 / ((dates[-1] - dates[0]).days + 1), 2)
        if len(dates) > 1
        else None,
    }
