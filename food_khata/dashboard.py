"""Query SQLite analytics and export data for the independent React dashboard."""

import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path
from typing import Any

from .db import DEFAULT_DB_PATH, IST
from .storage import save_json


def fetch_analytics(db_path: Path | str) -> dict[str, Any]:
    """Read complete records consumed by the React dashboard export."""
    with closing(sqlite3.connect(Path(db_path).resolve().as_uri() + "?mode=ro", uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        accounts = [dict(row) for row in conn.execute("SELECT * FROM accounts ORDER BY phone")]
        orders = [
            dict(row) for row in conn.execute("SELECT * FROM orders ORDER BY order_timestamp DESC")
        ]
        restaurants = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM restaurants")}
        addresses = {
            row["id"]: dict(row) for row in conn.execute("SELECT * FROM delivery_addresses")
        }
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
    return {"accounts": accounts, "orders": orders, "archive_imports": archive_imports}


def export_dashboard_data(
    db_path: Path | str | None = None,
    output_path: Path | str | None = None,
    account_id: str | None = None,
) -> Path:
    """Atomically export complete business records for the React app's JSON input."""
    path = Path(db_path) if db_path is not None else DEFAULT_DB_PATH
    out = Path(output_path) if output_path is not None else path.parent / "dashboard.json"
    data = fetch_analytics(path)
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
