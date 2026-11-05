"""Shared order filters; all generated predicates use the orders alias ``o``."""

from .schemas import Filters

# Half-open local hour ranges; late night wraps across midnight.
MEAL_SLOTS = {
    "breakfast": (5, 11),
    "lunch": (11, 15),
    "snack": (15, 18),
    "dinner": (18, 22),
    "late_night": (22, 5),
}


def build_where(filters: Filters) -> tuple[str, list]:
    clauses, params = [], []

    def choices(column, values):
        if values:
            clauses.append(f"{column} IN ({', '.join('?' for _ in values)})")
            params.extend(values)

    for column, value, op in (
        ("o.order_date", filters.date_from, ">="),
        ("o.order_date", filters.date_to, "<="),
        ("o.final_amount_paid", filters.amount_min, ">="),
        ("o.final_amount_paid", filters.amount_max, "<="),
    ):
        if value is not None:
            clauses.append(f"{column} {op} ?")
            params.append(value.isoformat() if hasattr(value, "isoformat") else value)
    for column, values in (
        ("o.account_id", filters.account_ids),
        ("o.platform", filters.platforms),
        ("o.order_status", filters.statuses),
        ("o.restaurant_id", filters.restaurant_ids),
        ("o.payment_method", filters.payment_methods),
    ):
        choices(column, values)
    if filters.cities:
        placeholders = ", ".join("?" for _ in filters.cities)
        clauses.append(
            "(EXISTS (SELECT 1 FROM restaurants r WHERE r.id = o.restaurant_id "
            f"AND r.city IN ({placeholders})) OR EXISTS (SELECT 1 FROM delivery_addresses a "
            f"WHERE a.id = o.delivery_address_id AND a.city IN ({placeholders})))"
        )
        params.extend(filters.cities * 2)
    if filters.localities:
        placeholders = ", ".join("?" for _ in filters.localities)
        clauses.append(
            "EXISTS (SELECT 1 FROM restaurants r WHERE r.id = o.restaurant_id "
            f"AND r.locality IN ({placeholders}))"
        )
        params.extend(filters.localities)
    # Item predicates use EXISTS to avoid multiplying order-level sums.
    if filters.cuisines:
        placeholders = ", ".join("?" for _ in filters.cuisines)
        clauses.append(
            "EXISTS (SELECT 1 FROM restaurants r WHERE r.id = o.restaurant_id "
            f"AND r.cuisine IN ({placeholders}))"
        )
        params.extend(filters.cuisines)
    if filters.veg != "all":
        condition = {"veg": "= 1", "nonveg": "= 0", "unknown": "IS NULL"}[filters.veg]
        clauses.append(
            f"EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.is_veg {condition})"
        )
    if filters.meal_slots:
        slots = []
        for slot in filters.meal_slots:
            start, end = MEAL_SLOTS[slot]
            op = "AND" if start < end else "OR"
            slots.append(
                f"(CAST(strftime('%H', o.order_time) AS INTEGER) >= ? {op} "
                "CAST(strftime('%H', o.order_time) AS INTEGER) < ?)"
            )
            params.extend((start, end))
        clauses.append("(" + " OR ".join(slots) + ")")
    if filters.day_type != "all":
        op = "IN" if filters.day_type == "weekend" else "NOT IN"
        clauses.append(f"strftime('%w', o.order_date) {op} ('0', '6')")
    if filters.verified_only:
        clauses.append("o.financial_verified = 1")
    if filters.search:
        term = (
            "%" + filters.search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        )
        clauses.append(
            "(EXISTS (SELECT 1 FROM restaurants r WHERE r.id = o.restaurant_id "
            "AND r.name LIKE ? ESCAPE '\\') OR EXISTS (SELECT 1 FROM order_items i "
            "WHERE i.order_id = o.id AND i.item_name LIKE ? ESCAPE '\\'))"
        )
        params.extend((term, term))
    return (" AND ".join(clauses) if clauses else "1=1"), params
