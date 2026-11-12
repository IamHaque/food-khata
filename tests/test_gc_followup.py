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


# --- item 2 -----------------------------------------------------------------
def test_use_partial_does_not_hold_write_lock_and_imports_once(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    from food_khata.auth import init_app_db
    from food_khata.db import AnalyticsDB
    from food_khata.jobs import JobControl
    from food_khata.jobs.db import create_job

    init_app_db(tmp_path / "app.db")
    conn = connect_app_db(tmp_path / "app.db")
    conn.execute("INSERT INTO users VALUES ('u', 'bob', 'x', 0, 0, 'now')")
    conn.commit()
    create_job(tmp_path / "app.db", job_id="j", user_id="u", account_id="a", provider="zomato", status="failed")
    control = JobControl(tmp_path / "app.db", data_root=tmp_path / "data")

    def slow(self, *a, **k):
        time.sleep(2)
        return {"total": 1, "imported": 1}

    monkeypatch.setattr(AnalyticsDB, "ingest_account", slow)
    with ThreadPoolExecutor(3) as pool:
        first = pool.submit(control.use_partial, "j")
        second = pool.submit(control.use_partial, "j")
        time.sleep(0.5)
        t0 = time.time()
        other = connect_app_db(tmp_path / "app.db")
        other.execute("INSERT INTO sessions VALUES ('s', 'u', 'c', 1, 1, 9e9)")
        other.commit()
        assert time.time() - t0 < 1
        results = sorted([first.result()["total"], second.result()["total"]])
    assert results == [0, 1]
    assert conn.execute("SELECT COUNT(*) FROM job_events WHERE code = 'IMPORTED_PARTIAL'").fetchone()[0] == 1
