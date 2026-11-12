"""Gate GC follow-up: regression tests for the six follow-up findings."""

import time

from fastapi.testclient import TestClient

from food_khata.auth import connect_app_db
from food_khata.serve.app import create_app

PW = "synthetic-pass-14"


def _app(tmp_path, **kw):
    return create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data", **kw)


def _client(app):
    c = TestClient(app, base_url="http://127.0.0.1:8765")
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    return c


# --- item 1 -----------------------------------------------------------------
def test_login_oversize_and_per_ip_limit_bound_disk(tmp_path):
    c = _client(_app(tmp_path))
    for i in range(200):
        big = f"{i}-" + "x" * 60_000
        assert c.post("/api/auth/login", json={"username": big, "password": "p"}).status_code == 422
    assert c.post("/api/auth/login", json={"username": "a", "password": "p" * 257}).status_code == 422
    codes = [c.post("/api/auth/login", json={"username": f"user-{i:045d}", "password": "p"}).status_code for i in range(200)]
    assert codes[:30] == [401] * 30
    assert set(codes[30:]) == {429}
    res = c.post("/api/auth/login", json={"username": "another", "password": "p"})
    assert res.status_code == 429 and int(res.headers["Retry-After"]) > 0
    conn = connect_app_db(tmp_path / "app.db")
    assert conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0] <= 31
    assert conn.execute("SELECT MAX(LENGTH(username)) FROM failed_logins").fetchone()[0] <= 50


def test_prune_audit_removes_only_old_rows(tmp_path):
    from food_khata.maintenance import prune_audit

    _app(tmp_path)
    conn = connect_app_db(tmp_path / "app.db")
    now = time.time()
    for at in (now - 91 * 86400, now - 100 * 86400, now - 86400):
        conn.execute("INSERT INTO audit_log (at, actor, action) VALUES (?, NULL, 'x')", (at,))
    conn.commit()
    assert prune_audit(conn) == 2
    assert conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0] == 1
    from food_khata.maintenance import TASKS

    assert prune_audit in TASKS
