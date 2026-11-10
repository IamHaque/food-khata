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
        json={"username": "owner", "password": "password123", "adopt_data": False},
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
    assert restarted.get("/api/accounts").status_code == 401
    assert c.post("/api/auth/logout").status_code == 200
    assert not c.app.state.unlocked_sessions

    c = client()
    csrf = c.get("/api/auth/csrf").json()["csrf_token"]
    c.headers["X-CSRF-Token"] = csrf
    login = c.post("/api/auth/login", json={"username": "owner", "password": "password123"})
    assert login.status_code == 200
    c.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    assert c.get("/api/accounts").json()[0]["phone"] == "9876543210"
    reset = c.post(f"/api/owner/users/{user_id}/reset-password", json={"owner_password": "password123", "new_password": "password123"})
    assert reset.status_code == 200
    assert not c.app.state.unlocked_sessions
    assert c.get("/api/accounts").status_code == 401
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    login = c.post("/api/auth/login", json={"username": "owner", "password": "password123"})
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
        json={"username": "owner", "password": "password123"},
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
    (tmp_path / "food_analytics.db").write_bytes(b"order-data")
    result = legacy.adopt_legacy_root("alice")
    UserContext(tmp_path, "alice").unlock("password")
    for root in (tmp_path / "users" / "alice", __import__("pathlib").Path(result["backup"])):
        assert (root / "food_analytics.db").read_bytes() == b"order-data"
        for path in (root / "accounts").rglob("*.json"):
            assert "9876543210" not in path.read_text()
            assert "SECRET" not in path.read_text()
