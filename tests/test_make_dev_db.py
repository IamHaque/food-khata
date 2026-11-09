"""Tests for the synthetic development database harness (S-008)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from food_khata.db import AnalyticsDB
from food_khata.serve.app import authenticate_client, create_app
from scripts.make_dev_db import DB_FILENAME, generate, self_check

TABLES = ("orders", "accounts", "restaurants", "delivery_addresses", "order_items")


def counts(db_path: Path) -> dict[str, int]:
    with AnalyticsDB(db_path).connection() as conn:
        return {
            table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in TABLES
        }


def test_generate_creates_rich_database(tmp_path):
    db_path = generate(tmp_path, seed=42)
    assert db_path == tmp_path / DB_FILENAME
    assert db_path.is_file()

    with AnalyticsDB(db_path).connection() as conn:
        statuses = {row[0] for row in conn.execute("SELECT DISTINCT order_status FROM orders")}
        platforms = {row[0] for row in conn.execute("SELECT DISTINCT platform FROM orders")}

    rows = counts(db_path)
    assert rows["orders"] >= 1500
    assert rows["accounts"] >= 3
    assert rows["restaurants"] >= 20
    assert rows["order_items"] > 0
    assert statuses >= {"DELIVERED", "CANCELLED"}
    assert platforms == {"SWIGGY", "ZOMATO"}

    self_check(db_path)


def test_generated_database_serves_health_endpoint(tmp_path):
    db_path = generate(tmp_path, seed=42)
    client = TestClient(create_app(db_path), base_url="http://127.0.0.1")
    authenticate_client(client)

    response = client.get("/api/meta/data-health")

    assert response.status_code == 200
    body = response.json()
    assert body["note"].startswith("Food orders only")
    assert body["duplicate_orders"] == 0


def test_generate_is_deterministic_for_a_seed(tmp_path):
    first = generate(tmp_path / "first", seed=42)
    second = generate(tmp_path / "second", seed=42)
    assert counts(first) == counts(second)


def test_refuses_to_write_into_real_data_directory():
    with pytest.raises(SystemExit):
        generate(Path.home() / ".food-khata" / "dev-data", seed=42)
