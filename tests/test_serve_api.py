from fastapi.testclient import TestClient

from food_khata.serve.app import authenticate_client, create_app

pytest_plugins = ["test_serve_filters"]


def make_client(path, *args, **kwargs):
    client = TestClient(create_app(path, *args, legacy_single_db=True, **kwargs), base_url="http://127.0.0.1")
    authenticate_client(client)
    return client


def test_endpoints(conn):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
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
    assert client.get("/api/orders", headers={"host": "evil.example"}).status_code in (400, 403)


def test_cache_invalidates(conn):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
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
    response = make_client(path).get("/api/orders")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert len(calls) == 3


def test_static_private_data(conn, tmp_path):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    dist = tmp_path / "dist"
    (dist / "data").mkdir(parents=True)
    (dist / "index.html").write_text("app")
    (dist / "data" / "secret.json").write_text("secret")
    client = TestClient(create_app(path, dist_path=dist, legacy_single_db=True), base_url="http://127.0.0.1")
    assert client.get("/some/page").text == "app"
    assert client.get("/data/secret.json").status_code == 404


def test_scope_options_health_and_all_statuses(conn):
    conn.execute("INSERT INTO archive_imports VALUES ('b','ZOMATO',0,1,0,0,'2025')")
    conn.execute("UPDATE orders SET reconciliation_difference=2, source_complete=1 WHERE id='1'")
    conn.commit()
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    health = client.get(
        "/api/meta/data-health",
        params={"account_ids": "b", "platforms": "ZOMATO", "date_from": "2030-01-01"},
    ).json()
    assert not health["history_complete"] and health["imports"][0]["platform"] == "ZOMATO"
    assert "lifetime" not in str(health)
    health = client.get("/api/meta/data-health", params={"account_ids": "a"}).json()
    assert health["reconciliation_anomalies"] == 1 and health["verified_percent"] == 100
    assert health["null_rates"]["user_rating"] == 0 and health["duplicate_orders"] == 0
    opts = client.get(
        "/api/meta/filters",
        params={"account_ids": "a", "date_from": "2030-01-01", "restaurant_ids": "none"},
    ).json()
    assert set(opts["statuses"]) == {"DELIVERED", "CANCELLED"}
    assert opts["restaurants"] == [{"id": "r1", "name": "Cafe 100%"}]
    assert [a["id"] for a in opts["all_accounts"]] == ["a", "b"]
    assert client.get("/api/orders/2/bill").status_code == 404
    assert client.get("/api/orders/2/bill?statuses=").status_code == 200
    assert (
        client.get(
            "/api/orders", params=[("statuses", "DELIVERED"), ("statuses", "CANCELLED")]
        ).json()["total"]
        == 3
    )
    assert client.post("/api/orders").json()["error"]["code"] == "request_error"
    assert client.get("/api/no-such-route").json()["error"]["code"] == "not_found"
    assert client.get("/api/orders/1/bill").json()["order"]["source_complete"] is True


def test_money_grouping_trend_and_json(conn):
    conn.execute(
        "INSERT INTO restaurants (id,platform,platform_restaurant_id,name,locality) VALUES ('r3','ZOMATO','3',' cafe 100% ','Center')"
    )
    conn.execute(
        "UPDATE orders SET restaurant_id='r3', source_bill_json='{bad', discount_breakdown_json='[1,2]' WHERE id='3'"
    )
    conn.execute(
        "UPDATE order_items SET quantity=2,total_price=10.255,unit_price=5.1275 WHERE item_name='Rice'"
    )
    conn.commit()
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    merged = client.get("/api/restaurants").json()["rows"]
    split = client.get("/api/restaurants?grouping=listing").json()["rows"]
    assert len(merged) == 1 and len(split) == 2 and merged[0]["quantity"] == 2
    assert merged[0]["amount"] == 150.12
    rice = next(r for r in client.get("/api/items").json()["rows"] if r["name"] == "Rice")
    assert rice["amount"] == 10.26 and rice["price_trend"][0]["unit_price"] == 5.13
    bill = client.get("/api/orders/3/bill").json()
    assert bill["source_bill"] is None and bill["discount_breakdown"] == [1, 2]
    assert client.get("/api/orders/1/bill").json()["items"][0]["total_price"] == 10.26


def test_connect_and_begin_retries(conn, monkeypatch):
    import sqlite3

    import food_khata.serve.app as app_module

    path = conn.execute("PRAGMA database_list").fetchone()[2]
    original = app_module.connect_readonly
    monkeypatch.setattr(app_module.time, "sleep", lambda _: None)
    attempts = []

    def connect(path):
        attempts.append(1)
        if len(attempts) < 3:
            raise sqlite3.OperationalError("busy")
        return original(path)

    monkeypatch.setattr(app_module, "connect_readonly", connect)
    client = make_client(path)
    assert client.get("/api/orders").status_code == 200 and len(attempts) == 3
    closed = []

    class BeginBusy:
        def __init__(self, wrapped):
            self.wrapped = wrapped

        def execute(self, sql, params=()):
            if sql == "BEGIN" and len(closed) < 2:
                raise sqlite3.OperationalError("locked")
            return self.wrapped.execute(sql, params)

        def close(self):
            closed.append(1)
            self.wrapped.close()

    monkeypatch.setattr(app_module, "connect_readonly", lambda path: BeginBusy(original(path)))
    assert client.get("/api/orders").status_code == 200 and len(closed) == 3
    closed.clear()

    class AlwaysBusy(BeginBusy):
        def execute(self, sql, params=()):
            if sql == "BEGIN":
                raise sqlite3.OperationalError("busy")
            return super().execute(sql, params)

    monkeypatch.setattr(app_module, "connect_readonly", lambda path: AlwaysBusy(original(path)))
    assert client.get("/api/orders").status_code == 503 and len(closed) == 3
    monkeypatch.setattr(
        app_module,
        "connect_readonly",
        lambda path: (_ for _ in ()).throw(sqlite3.OperationalError("busy secret")),
    )
    response = client.get("/api/orders")
    assert response.status_code == 503 and "secret" not in response.text
    monkeypatch.setattr(app_module, "connect_readonly", original)
    assert (
        make_client(str(path) + ".missing")
        .get("/api/orders")
        .status_code
        == 503
    )


def test_wal_cache_concurrent_and_commit_during_build(conn, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    import food_khata.serve.app as app_module

    conn.execute("PRAGMA journal_mode=WAL")
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    original = app_module.compute_metrics
    calls = []
    # TestClient runs requests in another thread; use a separate WAL writer.
    import sqlite3

    writer = sqlite3.connect(path, check_same_thread=False)

    def commit_in_thread(reader, filters):
        result = original(reader, filters)
        if not calls:
            calls.append(1)
            writer.execute("UPDATE orders SET order_status='CANCELLED' WHERE id='1'")
            writer.commit()
        return result

    monkeypatch.setattr(app_module, "compute_metrics", commit_in_thread)
    assert client.post("/api/dashboard", json={}).json()["kpis"]["orders"] == 1
    monkeypatch.setattr(app_module, "compute_metrics", original)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(
            pool.map(
                lambda _: client.post("/api/dashboard", json={}).json()["kpis"]["orders"], range(20)
            )
        )
    assert results == [1] * 20
    writer.execute("UPDATE orders SET order_status='DELIVERED' WHERE id='1'")
    writer.commit()
    assert client.post("/api/dashboard", json={}).json()["kpis"]["orders"] == 2
    writer.close()


def test_dashboard_failures_are_not_cached(conn, monkeypatch):
    import sqlite3

    import food_khata.serve.app as app_module

    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    original = app_module.compute_metrics

    def fail(*args):
        raise sqlite3.OperationalError("private database detail")

    monkeypatch.setattr(app_module, "compute_metrics", fail)
    response = client.post("/api/dashboard", json={})
    assert response.status_code == 503 and "private" not in response.text
    monkeypatch.setattr(app_module, "compute_metrics", original)
    assert client.post("/api/dashboard", json={}).status_code == 200


def test_health_duplicate_counts_follow_order_scope(conn):
    conn.execute("UPDATE orders SET account_id='a', platform_order_id='1' WHERE id='3'")
    conn.commit()
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    assert client.get("/api/meta/data-health").json()["duplicate_orders"] == 1
    assert (
        client.get("/api/meta/data-health", params={"date_to": "2025-01-31"}).json()[
            "duplicate_orders"
        ]
        == 0
    )


def test_nonfinite_dashboard_recovers(conn):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    conn.execute("UPDATE orders SET final_amount_paid=? WHERE id='1'", (float("inf"),))
    conn.commit()
    response = client.post("/api/dashboard", json={})
    assert response.status_code == 422
    assert "Infinity" not in response.text and "NaN" not in response.text
    conn.execute("UPDATE orders SET final_amount_paid=100 WHERE id='1'")
    conn.commit()
    assert client.post("/api/dashboard", json={}).status_code == 200


def test_finite_error_envelopes_and_row_fees(conn, caplog):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    assert client.get("/api/orders/1/bill").json()["order"]["fees"] == 8
    conn.execute("UPDATE orders SET final_amount_paid=? WHERE id='1'", (float("inf"),))
    conn.commit()
    for endpoint in ("/api/orders", "/api/orders/slim", "/api/orders/1/bill", "/api/restaurants"):
        response = client.get(endpoint)
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "internal_error"
        assert "Infinity" not in response.text
    assert "final_amount_paid" not in caplog.text


def test_bill_discount_items_and_balance_label(conn):
    conn.execute(
        "UPDATE orders SET discount_breakdown_json=?, reconciliation_difference=2 WHERE id='1'",
        ('{"food":10,"delivery":4,"unexpected":"not a number"}',),
    )
    conn.commit()
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    result = (
        make_client(path).get("/api/orders/1/bill").json()
    )
    assert result["discount_items"] == [
        {"label": "food", "amount": 10},
        {"label": "delivery", "amount": 4},
    ]
    assert result["reconciliation_status"] == "off"
    assert result["reconciliation_label"] == "Off by INR 2.00"


def test_legacy_single_db_off_by_default(tmp_path):
    """PR-05: without legacy_single_db=True a bare database path is never served to a user."""
    from food_khata.serve.app import authenticate_client, create_app

    db = tmp_path / "shared.db"
    db.touch()
    client = TestClient(create_app(db), base_url="http://127.0.0.1")
    authenticate_client(client)
    assert client.get("/api/orders/slim").status_code == 503


def _statements(path, fn):
    """Count SQL statements run on read connections while fn() runs."""
    import food_khata.serve.app as app_module

    seen = []
    original = app_module.connect_readonly

    def traced(database):
        connection = original(database)
        connection.set_trace_callback(lambda sql: seen.append(sql) if sql.startswith("SELECT") else None)
        return connection

    app_module.connect_readonly = traced
    try:
        fn()
    finally:
        app_module.connect_readonly = original
    return len(seen)


def test_read_path_budgets_and_sections(conn):
    """PR-12: statement counts per endpoint must not grow; sections only compute what a page asks for."""
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    full = client.post("/api/dashboard", json={"account_ids": ["a"]})
    spending_only = client.post("/api/dashboard", json={"account_ids": ["a"], "sections": ["spending"]})
    assert spending_only.status_code == 200 and spending_only.json()["kpis"] == full.json()["kpis"]
    assert spending_only.json()["charts"]["spending"] == full.json()["charts"]["spending"]
    assert spending_only.json()["charts"]["food"] != full.json()["charts"]["food"]  # not requested: empty shape
    assert client.post("/api/dashboard", json={"sections": ["nope"]}).status_code == 422
    budgets = {
        "dashboard": (lambda: client.post("/api/dashboard", json={"statuses": ["x"]}), 40),
        "data-health": (lambda: client.get("/api/meta/data-health"), 4),
        "items": (lambda: client.get("/api/items"), 6),  # price trends are one grouped query, not one per item
    }
    for name, (call, limit) in budgets.items():
        assert _statements(path, call) <= limit, name


def test_slim_is_capped_and_dashboard_cache_is_bounded(conn):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    client = make_client(path)
    assert client.get("/api/orders/slim").json()["truncated"] is False
    for n in range(12):  # one user, more distinct filters than the per-user bound
        assert client.post("/api/dashboard", json={"amount_min": n}).status_code == 200
    cache = client.app.state.dashboard_cache
    assert len(cache) <= 8
