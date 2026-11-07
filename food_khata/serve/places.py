"""Privacy-preserving location aggregates and distance observations."""

import math

from .filters import build_where


def places(conn, filters):
    where, params = build_where(filters)
    rows = conn.execute(
        f"""SELECT d.normalized_label, d.city, o.order_status, o.final_amount_paid,
            o.delivery_fee, r.latitude, r.longitude, d.latitude, d.longitude
            FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id
            LEFT JOIN delivery_addresses d ON d.id=o.delivery_address_id WHERE {where}""",
        params,
    )
    groups, distances = {}, []
    total = invalid = 0
    for label, city, status, spend, fee, rlat, rlon, dlat, dlon in rows:
        key = ((label or "").strip() or "Unknown", (city or "").strip() or "Unknown")
        group = groups.setdefault(
            key, {"label": key[0], "city": key[1], "orders": 0, "spend": 0, "fee": 0}
        )
        group["orders"] += 1
        if status != "DELIVERED":
            continue
        group["spend"] += spend or 0
        group["fee"] += fee or 0
        total += 1
        try:
            coords = [float(v) for v in (rlat, rlon, dlat, dlon)]
            if not all(
                math.isfinite(v) and abs(v) <= limit
                for v, limit in zip(coords, (90, 180, 90, 180), strict=True)
            ):
                raise ValueError
        except (TypeError, ValueError):
            invalid += 1
            continue
        lat1, lon1, lat2, lon2 = map(math.radians, coords)
        a = (
            math.sin((lat2 - lat1) / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
        )
        distances.append(
            {
                "distance_km": round(6371 * 2 * math.asin(math.sqrt(min(1, a))), 2),
                "fee": round(fee or 0, 2),
            }
        )
    reason = (
        "More than 80% of delivered orders lack valid coordinates."
        if total and invalid / total > 0.8
        else None
    )
    for group in groups.values():
        group["spend"] = round(group["spend"], 2)
        group["fee"] = round(group["fee"], 2)
    return {
        "labels": sorted(groups.values(), key=lambda g: (g["label"], g["city"])),
        "distances": [] if reason else distances,
        "distance_unavailable_reason": reason,
        "unsupported_reason": "Maps are not supported.",
    }
