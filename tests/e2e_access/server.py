"""Local synthetic-only server for the browser acceptance journey."""

import sys
from pathlib import Path

import uvicorn

from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import create_app

root = Path(sys.argv[1])
app = create_app(root / "orders.db", data_root=root)


class SyntheticProvider(FakeProvider):
    def dump_session(self):
        return {"access_token": "synthetic-token-canary", "provider": self.name}

    def details(self, order_id):
        return {
            "id": str(order_id),
            "created_at_str": "2026-10-05 20:00:00",
            "current_status": "DELIVERED",
            "restaurant": {"id": 999, "name": "Synthetic restaurant"},
            "order": {"total_cost": 100, "items": [{"item": {
                "type": "dish", "item_name": "Synthetic meal", "quantity": 1, "total_cost": 100,
            }}]},
        }


app.state.provider_factory = lambda provider, phone=None, **kwargs: SyntheticProvider(
    provider=provider, account_id="synthetic-" + (phone or "account"), **kwargs
)
uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[2]), access_log=False)
