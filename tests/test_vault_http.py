import pytest
from fastapi.testclient import TestClient

from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import create_app


def test_http_vault_restart_and_throttle(tmp_path):
    def client():
        app = create_app(tmp_path, data_root=tmp_path)
        app.state.provider_factory = lambda *args, **kwargs: FakeProvider(name="fake")
        return TestClient(app, base_url="http://127.0.0.1")

    c = client()
    csrf = c.get("/api/auth/csrf").json()["csrf_token"]
    c.headers["X-CSRF-Token"] = csrf
    setup = c.post(
        "/api/owner/setup",
        json={"username": "owner", "password": "synthetic-pass-1", "adopt_data": False},
    )
    assert setup.status_code == 200
    user_id = setup.json()["id"]
    c.headers["X-CSRF-Token"] = c.cookies["csrf_token"]
    start = c.post("/api/accounts/link/start", json={"provider": "fake", "phone": "9876543210"})
    assert start.status_code == 200
    linked = c.post(
        "/api/accounts/link/verify", json={"handle": start.json()["handle"], "code": "123456"}
    )
    assert linked.status_code == 200
    root = tmp_path / "users" / user_id
    account = root / "accounts" / linked.json()["id"]
    assert (root / "vault.json").is_file()
    assert "9876543210" not in (account / "account.json").read_text()
    assert "fake-token" not in (account / "sessions" / "fake.json").read_text()
    from types import SimpleNamespace

    import pytest
    from fastapi import HTTPException

    from food_khata.serve.routes_accounts import get_user_cipher

    request = SimpleNamespace(app=c.app, state=SimpleNamespace(session={"id": c.cookies["session_id"]}))
    with pytest.raises(HTTPException):
        get_user_cipher(request, "another-user")
    restarted = client()
    restarted.cookies.update(c.cookies)
    # PR-02: a restart deletes every session, so the old cookie gets one clean SESSION_EXPIRED.
    gone = restarted.get("/api/accounts")
    assert (gone.status_code, gone.json()["error"]["code"]) == (401, "SESSION_EXPIRED")
    assert restarted.get("/api/auth/me").status_code == 401

    c = client()
    csrf = c.get("/api/auth/csrf").json()["csrf_token"]
    c.headers["X-CSRF-Token"] = csrf
    login = c.post("/api/auth/login", json={"username": "owner", "password": "synthetic-pass-1"})
    assert login.status_code == 200
    c.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    assert c.get("/api/accounts").json()[0]["phone"] == "9876543210"
    reset = c.post(f"/api/owner/users/{user_id}/reset-password", json={"owner_password": "synthetic-pass-1", "new_password": "synthetic-pass-1"})
    assert reset.status_code == 200
    assert not c.app.state.unlocked_sessions
    assert c.get("/api/accounts").status_code == 401
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    login = c.post("/api/auth/login", json={"username": "owner", "password": "synthetic-pass-1"})
    assert login.status_code == 200
    c.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    recovered = c.get("/api/accounts").json()[0]
    assert recovered["id"] == linked.json()["id"]
    assert recovered["phone"] == ""
    assert not list((account / "sessions").glob("*.json"))
    assert c.post("/api/auth/logout").status_code == 200
    csrf = c.get("/api/auth/csrf").json()["csrf_token"]
    c.headers["X-CSRF-Token"] = csrf
    for i in range(5):
        response = c.post(
            "/api/auth/login",
            json={"username": "owner", "password": "wrong"},
            headers={"X-Forwarded-For": f"192.0.2.{i}"},
        )
        assert response.status_code == 401
    response = c.post(
        "/api/auth/login",
        json={"username": "owner", "password": "synthetic-pass-1"},
        headers={"X-Forwarded-For": "192.0.2.99"},
    )
    assert response.status_code == 429


def test_reset_preserves_identity_and_orders_and_revokes_secrets(tmp_path):
    import pytest

    from food_khata.contracts import KhataError
    from food_khata.users.context import UserContext
    from food_khata.users.crypto import WrongPassword

    context = UserContext(tmp_path, "alice").unlock("old-password")
    account = context.storage.bind("9876543210", "fake", "9876543210")
    context.storage.save_session(account["local_id"], "fake", {"token": "SECRET"})
    metadata = context.root / "accounts" / account["local_id"] / "account.json"
    assert "9876543210" not in metadata.read_text()
    context.database.write_bytes(b"order-data")
    UserContext(tmp_path, "alice").reset_password("new-password")
    with pytest.raises(WrongPassword):
        UserContext(tmp_path, "alice").unlock("old-password")
    recovered = UserContext(tmp_path, "alice").unlock("new-password")
    assert recovered.database.read_bytes() == b"order-data"
    assert recovered.storage.accounts("fake", True)[0]["phone"] == ""
    assert recovered.storage.session(account["local_id"], "fake") is None
    assert (
        recovered.storage.bind("9876543210", "fake", "9876543210")["local_id"]
        == account["local_id"]
    )
    other = UserContext(tmp_path, "bob").unlock("other-password")
    with pytest.raises(KhataError):
        other.cipher.decrypt_text(__import__("json").loads(metadata.read_text())["phone_encrypted"])


def test_adoption_backup_migrates_secrets(tmp_path):
    from food_khata.storage import Storage
    from food_khata.users.context import UserContext

    legacy = Storage(tmp_path)
    account = legacy.bind("9876543210", "fake", "9876543210")
    legacy.save_session(account["local_id"], "fake", {"token": "SECRET"})
    import sqlite3

    with sqlite3.connect(tmp_path / "food_analytics.db") as conn:
        conn.execute("CREATE TABLE orders (id TEXT)")
        conn.execute("INSERT INTO orders VALUES ('order-data')")
    context = UserContext(tmp_path, "alice").unlock("password")
    result = context.adopt_legacy_root()
    for root in (tmp_path / "users" / "alice", __import__("pathlib").Path(result["backup"])):
        with sqlite3.connect(root / "food_analytics.db") as conn:
            assert conn.execute("SELECT id FROM orders").fetchone()[0] == "order-data"
        for path in (root / "accounts").rglob("*.json"):
            assert "9876543210" not in path.read_text()
            assert "SECRET" not in path.read_text()


def test_analytics_stores_only_phone_suffix(tmp_path):
    from food_khata.db import AnalyticsDB
    from food_khata.users.context import UserContext

    context = UserContext(tmp_path, "alice").unlock("synthetic-pass-1")
    account = context.storage.bind("9876543210", "fake", "9876543210")
    metadata = context.storage.account_path(account["local_id"]) / "account.json"
    assert "9876543210" not in metadata.read_text()
    assert '"phone_suffix": "3210"' in metadata.read_text()
    db = AnalyticsDB(context.database)
    db.ingest_account(context.storage, account["local_id"])
    with db.connection() as conn:
        assert conn.execute("SELECT phone FROM accounts").fetchone()[0] == "3210"


@pytest.mark.parametrize("endpoint", ["/api/owner/setup"])
def test_adoption_failure_is_visible_and_owner_login_resumes(tmp_path, monkeypatch, endpoint):
    from contextlib import closing

    import food_khata.storage as storage_module
    from food_khata.auth import connect_app_db
    from food_khata.storage import Storage

    legacy = Storage(tmp_path)
    account = legacy.bind("9876543210", "fake", "synthetic-provider")
    legacy.save_session(account["local_id"], "fake", {"token": "SYNTHETIC-TOKEN"})
    app = create_app(tmp_path, data_root=tmp_path)
    client = TestClient(app, base_url="http://127.0.0.1", raise_server_exceptions=False)
    client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]
    original_save = storage_module.save_json

    def interrupted(path, value):
        if path.name == ".adopted.json":
            raise OSError("injected adoption interruption")
        return original_save(path, value)

    with monkeypatch.context() as patch:
        patch.setattr(storage_module, "save_json", interrupted)
        response = client.post(endpoint, json={"username": "owner", "password": "synthetic-pass-1"})
    assert response.status_code == 500
    with closing(connect_app_db(app.state.app_db_path)) as conn:
        users = conn.execute("SELECT id, is_owner FROM users").fetchall()
        assert len(users) == 1 and users[0]["is_owner"]
        user_id = users[0]["id"]
        assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
    login = client.post("/api/auth/login", json={"username": "owner", "password": "synthetic-pass-1"})
    assert login.status_code == 200
    assert login.json()["user"]["id"] == user_id
    client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    assert client.get("/api/accounts").json()[0]["id"] == account["local_id"]
    assert (tmp_path / "users" / user_id / ".adopted.json").exists()
    for path in tmp_path.rglob("*"):
        if path.is_file():
            assert b"9876543210" not in path.read_bytes()
            assert b"SYNTHETIC-TOKEN" not in path.read_bytes()

@pytest.mark.parametrize("action", ["reset-password", "disable"])
@pytest.mark.parametrize("inside_write", [False, True])
def test_revocation_serializes_delayed_checkpoint(tmp_path, monkeypatch, action, inside_write):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    import food_khata.auth.owner as owner_module
    import food_khata.storage as storage_module
    from food_khata.jobs import CANCELLED
    from food_khata.storage import Storage
    from food_khata.users.context import UserContext

    app = create_app(tmp_path, data_root=tmp_path)
    app.state.provider_factory = lambda *args, **kwargs: FakeProvider(name="fake")
    owner = TestClient(app, base_url="http://127.0.0.1")
    owner.headers["X-CSRF-Token"] = owner.get("/api/auth/csrf").json()["csrf_token"]
    assert owner.post("/api/owner/setup", json={"username": "owner", "password": "synthetic-pass-1", "adopt_data": False}).status_code == 200
    owner.headers["X-CSRF-Token"] = owner.cookies["csrf_token"]
    assert owner.post("/api/owner/window", json={"action": "open"}).status_code == 200
    member = TestClient(app, base_url="http://127.0.0.1")
    member.headers["X-CSRF-Token"] = member.get("/api/auth/csrf").json()["csrf_token"]
    registration = member.post("/api/auth/register", json={"username": "alice", "password": "synthetic-pass-1"})
    assert registration.status_code == 200
    user_id = registration.json()["id"]
    login = member.post("/api/auth/login", json={"username": "alice", "password": "synthetic-pass-1"})
    assert login.status_code == 200
    member.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    start = member.post("/api/accounts/link/start", json={"provider": "fake", "phone": "9876543210"})
    linked = member.post("/api/accounts/link/verify", json={"handle": start.json()["handle"], "code": "123456"})
    account_id = linked.json()["id"]
    context = UserContext(tmp_path, user_id).unlock("synthetic-pass-1")
    other = UserContext(tmp_path, "other").unlock("other-password")
    other_account = other.storage.bind("9876543211", "fake", "other")
    entered, release, cancellation_finished = Event(), Event(), Event()
    original_save = Storage.save_session
    original_json = storage_module.save_json
    original_cancel = owner_module.JobControl.cancel_user

    def delayed_save(self, local_id, provider, value):
        if self.root == context.root and not inside_write:
            entered.set()
            assert release.wait(20)
        return original_save(self, local_id, provider, value)

    def delayed_json(path, value):
        if inside_write and path == context.root / "accounts" / account_id / "sessions" / "fake.json":
            entered.set()
            assert release.wait(20)
        return original_json(path, value)

    def cancel(*args):
        result = original_cancel(*args)
        cancellation_finished.set()
        return result

    monkeypatch.setattr(Storage, "save_session", delayed_save)
    monkeypatch.setattr(storage_module, "save_json", delayed_json)
    monkeypatch.setattr(owner_module.JobControl, "cancel_user", cancel)
    control = app.state.job_control
    job = control.submit_sync(user_id=user_id, account_id=account_id, provider="fake", session={"token": "old"}, cipher=context.cipher, provider_instance=FakeProvider(name="fake"))
    assert entered.wait(10)
    queued = control.submit_sync(user_id=user_id, account_id=account_id + "-queued", provider="fake", session={"token": "old"}, cipher=context.cipher, provider_instance=FakeProvider(name="fake"))
    body = {"owner_password": "synthetic-pass-1", "new_password": "new-password"} if action == "reset-password" else {"disabled": True}
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            response = pool.submit(owner.post, f"/api/owner/users/{user_id}/{action}", json=body)
            assert cancellation_finished.wait(15)
            other.storage.save_session(other_account["local_id"], "fake", {"token": "other"})
            if inside_write:
                assert not response.done()
                release.set()
                assert response.result(timeout=10).status_code == 200
            else:
                assert response.result(timeout=10).status_code == 200
                release.set()
            active = app.state.job_runner.active_jobs.get(job["id"])
            if active:
                assert active.finished_event.wait(10)
    finally:
        release.set()
    assert control.get_job(job["id"])["status"] == CANCELLED
    assert control.get_job(queued["id"])["status"] == CANCELLED
    assert not list((context.root / "accounts" / account_id / "sessions").glob("*.json"))
    if action == "disable":
        assert owner.post(f"/api/owner/users/{user_id}/disable", json={"disabled": False}).status_code == 200
    password = "new-password" if action == "reset-password" else "synthetic-pass-1"
    restarted_app = create_app(tmp_path, data_root=tmp_path)
    restarted_client = TestClient(restarted_app, base_url="http://127.0.0.1")
    restarted_client.headers["X-CSRF-Token"] = restarted_client.get("/api/auth/csrf").json()["csrf_token"]
    assert restarted_client.post("/api/auth/login", json={"username": "alice", "password": password}).status_code == 200
    assert not list((context.root / "accounts" / account_id / "sessions").glob("*.json"))
    restarted = UserContext(tmp_path, user_id).unlock(password)
    assert restarted.storage.session(account_id, "fake") is None
    rebound = restarted.storage.bind("9876543210", "fake", "fake-account-1")
    restarted.storage.save_session(rebound["local_id"], "fake", {"token": "new"})
    assert restarted.storage.session(rebound["local_id"], "fake") == {"token": "new"}
    assert other.storage.session(other_account["local_id"], "fake") == {"token": "other"}
