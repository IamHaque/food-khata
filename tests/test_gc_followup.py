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


# --- item 3 -----------------------------------------------------------------
def test_remove_user_crash_is_recovered_at_startup(tmp_path):
    import pytest

    from food_khata.auth import init_app_db
    from food_khata.auth.owner import remove_user
    from food_khata.auth.passwords import hash_password
    from food_khata.users.context import UserContext

    init_app_db(tmp_path / "app.db")
    conn = connect_app_db(tmp_path / "app.db")
    conn.execute("INSERT INTO users VALUES ('o', 'owner1', ?, 1, 0, 'now')", (hash_password(PW),))
    conn.execute("INSERT INTO users VALUES ('u', 'bob', ?, 0, 0, 'now')", (hash_password(PW),))
    conn.commit()
    UserContext(tmp_path / "data", "u").unlock(PW)

    class Crashing:
        def __init__(self, inner):
            self.inner = inner

        def execute(self, sql, *a):
            if sql.startswith("DELETE FROM users"):
                raise SystemExit
            return self.inner.execute(sql, *a)

        def __getattr__(self, name):
            return getattr(self.inner, name)

    with pytest.raises(SystemExit):
        remove_user(Crashing(conn), "u", "o", PW, tmp_path / "data")
    users = (tmp_path / "data" / "users").resolve()
    assert not (users / "u").exists() and list(users.glob(".deleting-*"))
    c = _client(_app(tmp_path))
    assert (users / "u" / "vault.json").is_file() and not list(users.glob(".deleting-*"))
    assert c.post("/api/auth/login", json={"username": "bob", "password": PW}).status_code == 200


def test_wipe_crash_is_recovered_and_stray_trash_removed(tmp_path, monkeypatch):
    import pytest

    from food_khata.providers.fake import FakeProvider
    from food_khata.serve.app import authenticate_client

    app = _app(tmp_path)
    app.state.provider_factory = lambda p, phone=None: FakeProvider(provider="zomato", account_id="fake-1")
    c = TestClient(app, base_url="http://127.0.0.1:8765")
    authenticate_client(c, username="alice", is_owner=True)
    st = c.post("/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"}).json()
    acc_id = c.post("/api/accounts/link/verify", json={"handle": st["handle"], "code": "123456"}).json()["id"]
    monkeypatch.setattr("food_khata.serve.routes_accounts.delete_account_data", lambda *a, **k: (_ for _ in ()).throw(SystemExit()))
    # force the database step to run even if no analytics db exists yet
    user_dir = next((tmp_path / "data" / "users").resolve().iterdir())
    (user_dir / "food_analytics.db").touch()
    from types import SimpleNamespace

    from food_khata.serve.routes_accounts import _wipe

    user_id = user_dir.name
    with pytest.raises(SystemExit):
        _wipe(SimpleNamespace(app=app), user_id, None, None, acc_id, user_dir / "accounts" / acc_id, "zomato", [])
    assert not (user_dir / "accounts" / acc_id).exists() and list(user_dir.glob(".deleting-*"))
    _app(tmp_path)
    assert (user_dir / "accounts" / acc_id / "account.json").is_file() and not list(user_dir.glob(".deleting-*"))

    stray = (tmp_path / "data" / "users").resolve() / ".deleting-abc"
    stray.mkdir()
    (stray / ".deleted-user").write_text("gone-user")
    (stray / "x.txt").write_text("x")
    _app(tmp_path)
    assert not stray.exists()


def test_unlock_or_create_refuses_when_encrypted_data_exists(tmp_path):
    import json

    import pytest

    from food_khata.contracts import KhataError
    from food_khata.users.crypto import UserVault

    empty = tmp_path / "empty"
    empty.mkdir()
    assert UserVault.unlock_or_create(empty, PW) is not None
    for name, rel, body in (
        ("a", "accounts/x/account.json", {"phone_encrypted": {"v": 1}}),
        ("b", "accounts/x/sessions/zomato.json", {"__encrypted__": "abc"}),
        ("c", ".credential-generation", "gen"),
    ):
        folder = tmp_path / name
        (folder / rel).parent.mkdir(parents=True)
        (folder / rel).write_text(json.dumps(body))
        with pytest.raises(KhataError, match="Vault missing"):
            UserVault.unlock_or_create(folder, PW)
        assert not (folder / "vault.json").exists()
