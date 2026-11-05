"""Create a deterministic, fictional dashboard export for browser baselines."""

import argparse
import json
from pathlib import Path


def make_data():
    accounts = [
        {"id": f"fake-{i}", "phone": f"••••000{i}", "name": f"Fictional Person {i}"}
        for i in range(1, 4)
    ]
    orders = []
    for i in range(36):
        month = i % 12 + 1
        date = f"{2024 + i // 12}-{month:02d}-15"
        amount = 1234567.89 if i == 2 else 250 + i
        difference = 20 if i in (3, 4, 5) else 0
        subtotal = amount + 50 - difference
        orders.append(
            {
                "id": f"fake-order-{i}",
                "account_id": accounts[i % 3]["id"],
                "platform": "SWIGGY" if i % 2 else "ZOMATO",
                "platform_order_id": f"fictional-{i}",
                "order_date": date,
                "order_time": "12:30:00",
                "order_timestamp": f"{date}T12:30:00+05:30",
                "order_status": "CANCELLED" if i in (1, 7, 13) else "DELIVERED",
                "payment_method": "UPI",
                "final_amount_paid": amount,
                "item_subtotal": subtotal,
                "total_discount": 50,
                "food_discount": 50,
                "delivery_fee": 0,
                "delivery_fee_discount": 0,
                "packaging_fee": 0,
                "platform_fee": 0,
                "total_tax": 0,
                "tip": 0,
                "other_charges": 0,
                "refund_amount": 0,
                "reported_savings": 65,
                "financial_verified": int(difference == 0 and i not in (1, 7, 13)),
                "source_complete": 1,
                "reconciliation_difference": difference,
                "restaurant": {
                    "id": f"fake-r-{i}",
                    "name": "Fictional Restaurant " + ("Very Long Name " * 8 if i == 0 else str(i)),
                    "locality": "Imaginary Quarter",
                },
                "address": {
                    "normalized_label": "Imaginary Place",
                    "label": "Other",
                    "full_address": "Fictional address",
                },
                "items": [
                    {
                        "item_name": "Fictional meal",
                        "quantity": 1,
                        "total_price": subtotal,
                        "is_veg": 1,
                        "category": "Meals",
                    }
                ],
            }
        )
    return {
        "schema_version": 1,
        "generated_at": "2026-11-06T00:00:00+05:30",
        "accounts": accounts,
        "orders": orders,
        "archive_imports": [],
    }


def self_check(data):
    orders = data["orders"]
    assert len(data["accounts"]) == 3 and len({o["order_date"][:7] for o in orders}) >= 12
    assert all(a["phone"].startswith("••••") and len(a["phone"]) == 8 for a in data["accounts"])
    assert len({o["platform"] for o in orders if o["account_id"] == "fake-1"}) == 2
    assert sum(o["order_status"] == "CANCELLED" for o in orders) >= 3
    assert sum(o["financial_verified"] == 0 for o in orders) >= 3
    for o in orders:
        difference = o["final_amount_paid"] - (o["item_subtotal"] - o["total_discount"])
        assert abs(difference - o["reconciliation_difference"]) < 0.001
        assert o["financial_verified"] == int(
            abs(difference) <= 1 and o["order_status"] == "DELIVERED"
        )
        assert o["items"][0]["total_price"] == o["item_subtotal"]
    assert max(o["final_amount_paid"] for o in orders) >= 999999
    assert max(len(o["restaurant"]["name"]) for o in orders) > 100
    assert json.loads(json.dumps(data, ensure_ascii=False)) == data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    data = make_data()
    self_check(data)
    if args.self_check:
        print("Synthetic export self-check passed")
        return
    output = Path(__file__).resolve().parents[1] / ".test-tmp" / "synthetic" / "dashboard.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote synthetic export: {output}")


if __name__ == "__main__":
    main()
