from fastapi.testclient import TestClient

from food_khata.serve.app import create_app

pytest_plugins = ["test_serve_filters"]


def test_endpoints(conn):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = TestClient(create_app(path), base_url="http://127.0.0.1")
    dashboard = client.post("/api/dashboard", json={"account_ids": ["a"], "statuses": []})
    assert dashboard.status_code == 200
    assert dashboard.json()["kpis"]["orders"] == 2
    assert sum(x["spend"] for x in dashboard.json()["charts"]["monthly"]) == 100.12
    options = client.get("/api/meta/filters", params={"account_ids": "a"}).json()
    assert [a["id"] for a in options["accounts"]] == ["a"]
    assert options["accounts"][0]["label"].startswith("••••")
    health = client.get("/api/meta/data-health").json()
    assert "lifetime" not in str(health)
    ledger = client.get(
        "/api/orders",
        params={"account_ids": "a", "statuses": ["DELIVERED", "CANCELLED"], "page_size": 1},
    ).json()
    assert ledger["total"] == 2 and ledger["filtered_total_amount"] == 170.12
    assert len(ledger["rows"]) == 1
    assert client.get("/api/orders", params={"sort": "id; DROP TABLE orders"}).status_code == 422
    assert client.get("/api/orders", params={"page_size": 201}).status_code == 422
    assert client.get("/api/orders/slim").status_code == 200
    assert client.get("/api/orders/1/bill").json()["items"][0]["item_name"] == "Rice"
    assert client.get("/api/orders/1/bill", params={"account_ids": "b"}).status_code == 404
    assert client.get("/api/orders/missing/bill").status_code == 404
    assert client.get("/api/restaurants", params={"min_orders": 2}).json()["rows"] == []
    assert client.get("/api/items", params={"min_qty": 2}).json()["rows"] == []
    assert client.post("/api/orders").status_code == 405
    assert client.get("/api/orders", headers={"host": "evil.example"}).status_code == 403


def test_cache_invalidates(conn):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = TestClient(create_app(path), base_url="http://127.0.0.1")
    assert client.post("/api/dashboard", json={}).json()["kpis"]["orders"] == 2
    conn.execute("UPDATE orders SET order_status='CANCELLED' WHERE id='1'")
    conn.commit()
    assert client.post("/api/dashboard", json={}).json()["kpis"]["orders"] == 1


def test_busy_retries_then_503(conn, monkeypatch):
    import sqlite3

    import food_khata.serve.app as app_module

    calls = []
    original = app_module.connect_readonly

    class Busy:
        def __init__(self, wrapped):
            self.wrapped = wrapped

        def execute(self, sql, params=()):
            if sql == "BEGIN":
                return self.wrapped.execute(sql, params)
            calls.append(sql)
            raise sqlite3.OperationalError("database is locked")

        def close(self):
            self.wrapped.close()

    monkeypatch.setattr(app_module, "connect_readonly", lambda path: Busy(original(path)))
    monkeypatch.setattr(app_module.time, "sleep", lambda _: None)
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    response = TestClient(create_app(path), base_url="http://127.0.0.1").get("/api/orders")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert len(calls) == 3


def test_static_private_data(conn, tmp_path):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    dist = tmp_path / "dist"
    (dist / "data").mkdir(parents=True)
    (dist / "index.html").write_text("app")
    (dist / "data" / "secret.json").write_text("secret")
    client = TestClient(create_app(path, dist_path=dist), base_url="http://127.0.0.1")
    assert client.get("/some/page").text == "app"
    assert client.get("/data/secret.json").status_code == 404
