"""Compare export-path calculations with the API; keep all results local and private."""

import argparse
import math
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from food_khata.dashboard import fetch_analytics  # noqa: E402
from food_khata.serve.app import create_app  # noqa: E402
from food_khata.serve.db import database_version  # noqa: E402


def legacy_metrics(orders):
    delivered = [o for o in orders if o["order_status"] == "DELIVERED"]

    def total(rows, key):
        return sum(float(o.get(key) or 0) for o in rows)

    spend = total(delivered, "final_amount_paid")
    return {
        "orders": len(orders),
        "spend": spend,
        "aov": spend / len(delivered) if delivered else None,
        "fees": sum(
            total(delivered, key) for key in ("delivery_fee", "packaging_fee", "platform_fee")
        ),
        "total_discount": total(delivered, "total_discount"),
        "reported_savings": total(delivered, "reported_savings"),
        "refunds": total(orders, "refund_amount"),
    }


def compare(db_path):
    version = database_version(db_path)
    data = fetch_analytics(db_path)
    rows = []

    def add(label, old, new):
        if old is None or new is None:
            match = old is new
            difference = None
        else:
            if not math.isfinite(old) or not math.isfinite(new):
                raise ValueError("Invalid numeric data")
            difference = round(new - old, 6)
            match = abs(new - old) <= 0.01000001
        rows.append((label, old, new, difference, match))

    with TestClient(create_app(db_path), base_url="http://127.0.0.1") as client:
        scopes = [("All", {}, data["orders"])]
        for field, filter_key, label in (
            ("account_id", "account_ids", "Account"),
            ("platform", "platforms", "Platform"),
        ):
            for index, value in enumerate(sorted({o[field] for o in data["orders"]}), 1):
                scopes.append(
                    (
                        f"{label} {index}",
                        {filter_key: [value]},
                        [o for o in data["orders"] if o[field] == value],
                    )
                )
        for label, filters, orders in scopes:
            response = client.post("/api/dashboard", json={**filters, "statuses": []})
            if response.status_code != 200:
                raise ValueError("API request failed")
            result = response.json()
            for key, old in legacy_metrics(orders).items():
                add(f"{label} / {key}", old, result["kpis"][key])
            monthly = defaultdict(float)
            for order in orders:
                monthly[(order.get("order_date") or "")[:7]] += (
                    float(order.get("final_amount_paid") or 0)
                    if order["order_status"] == "DELIVERED"
                    else 0
                )
            actual = {m["month"] or "": m["spend"] for m in result["charts"]["monthly"]}
            for index, month in enumerate(sorted(set(monthly) | set(actual)), 1):
                add(f"{label} / Month {index}", monthly.get(month, 0), actual.get(month, 0))
        # Compare listing totals first; rank is deliberately by spend, not the old count leaderboard.
        listing = defaultdict(float)
        for order in data["orders"]:
            if order["order_status"] == "DELIVERED" and order.get("restaurant_id"):
                listing[order["restaurant_id"]] += float(order.get("final_amount_paid") or 0)
        actual = {}
        page = 1
        while True:
            response = client.get(
                "/api/restaurants",
                params={"grouping": "listing", "page_size": 200, "page": page, "sort": "amount"},
            )
            if response.status_code != 200:
                raise ValueError("API request failed")
            result = response.json()
            actual.update({r["key"]: r["amount"] for r in result["rows"]})
            if page * 200 >= result["total"]:
                break
            page += 1
        top = sorted(listing, key=lambda key: (-listing[key], key))[:10]
        for index, key in enumerate(top, 1):
            add(f"Top listing by spend {index}", listing[key], actual.get(key))
        add("Restaurant listing count", len(listing), len(actual))
    if version != database_version(db_path):
        raise ValueError("Database changed during parity check; rerun")
    return rows


def render(rows):
    lines = [
        "# Local parity results",
        "",
        "Export-path calculations versus API on the same unchanged DB. Group identities withheld.",
        "INR tolerance 0.01; all-status counts, delivered financials, scoped refunds.",
        "Restaurant comparison uses listing identity and spend; legacy name/count ranking is a different view.",
        "",
        "Metric | Export | API | Difference | Match",
        "--- | ---: | ---: | ---: | ---",
    ]
    lines.extend(
        f"{label} | {old} | {new} | {delta} | {match}" for label, old, new, delta, match in rows
    )
    return "\n".join(lines) + "\n"


def validate_output(db, output):
    if output.exists() and output.samefile(db):
        raise ValueError("Report must not replace DB")
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", str(output)],
        cwd=Path(__file__).resolve().parents[1],
        check=False,
    )
    if ignored.returncode != 0:
        raise ValueError("Report must be ignored")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db", type=Path)
    args = parser.parse_args(argv)
    output = Path(__file__).resolve().parents[1] / "docs/agent/parity.local.md"
    try:
        validate_output(args.db, output)
        rows = compare(args.db)
        output.write_text(render(rows), encoding="utf-8")
        mismatches = sum(not row[-1] for row in rows)
        print(f"Parity report written locally; mismatches: {mismatches}")
        return int(bool(mismatches))
    except Exception:
        print("Parity check failed safely; no source data was printed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
