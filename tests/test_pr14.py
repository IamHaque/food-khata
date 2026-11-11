"""PR-14: claim path and throttle, setup code, own password change, password rule, session lifetime."""

import time

import pytest
from fastapi.testclient import TestClient

from food_khata.auth import SESSION_COOKIE_NAME, connect_app_db, get_session
from food_khata.auth.owner import SETUP_CODE_ALPHABET, rotate_setup_code, verify_setup_code
from food_khata.auth.passwords import check_password_rules
from food_khata.serve.app import create_app

PW = "synthetic-pass-14"


def _lan_client(tmp_path):
    app = create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data", lan=True)
    client = TestClient(app, base_url="http://192.168.1.100:8765", client=("192.168.1.100", 5000))
    client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]
    return client, app


def test_setup_code_format_expiry_and_throttle(tmp_path):
    client, app = _lan_client(tmp_path)
    conn = connect_app_db(app.state.app_db_path)
    code = rotate_setup_code(conn)
    chars = code.replace("-", "")
    assert len(chars) == 10 and set(chars) <= set(SETUP_CODE_ALPHABET) and len(SETUP_CODE_ALPHABET) == 32
    assert verify_setup_code(conn, code.lower())
    conn.execute("UPDATE server_settings SET value = ? WHERE key = 'setup_code_at'", (str(time.time() - 31 * 60),))
    conn.commit()
    assert not verify_setup_code(conn, code)  # expires after 30 minutes
    assert rotate_setup_code(conn) != code
    body = {"username": "network_owner", "password": PW, "setup_code": "WRONG-CODE1"}
    assert [client.post("/api/owner/setup", json=body).status_code for _ in range(5)] == [403] * 5
    sixth = client.post("/api/owner/setup", json=body)
    assert sixth.status_code == 429 and int(sixth.headers["Retry-After"]) > 0


def test_register_never_claims_the_server(tmp_path):
    client, app = _lan_client(tmp_path)
    code = rotate_setup_code(connect_app_db(app.state.app_db_path))
    res = client.post("/api/auth/register", json={"username": "sneaky", "password": PW, "join_code": code})
    assert res.status_code == 403 and "owner" in res.json()["error"]["message"]
    assert connect_app_db(app.state.app_db_path).execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


@pytest.mark.parametrize(
    ("password", "username", "ok"),
    [("short", "u", False), ("alice-alice", "alice-alice", False), ("password123", "u", False),
     ("PassWord123", "u", False), ("correct-horse-battery", "u", True)],
)
def test_password_rule(password, username, ok):
    assert (check_password_rules(password, username) is None) is ok


def _owner(tmp_path):
    app = create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data")
    c = TestClient(app, base_url="http://127.0.0.1:8765")
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    assert c.post("/api/owner/setup", json={"username": "owner1", "password": PW}).status_code == 200
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    return c, app


def test_change_password_rewraps_vault_and_ends_other_sessions(tmp_path):
    from food_khata.users.context import UserContext

    c, app = _owner(tmp_path)
    other = TestClient(app, base_url="http://127.0.0.1:8765")  # a second device
    other.headers["X-CSRF-Token"] = other.get("/api/auth/csrf").json()["csrf_token"]
    assert other.post("/api/auth/login", json={"username": "owner1", "password": PW}).status_code == 200
    uid = other.get("/api/auth/me").json()["id"]
    ctx = UserContext(tmp_path / "data", uid).unlock(PW)
    acc = ctx.storage.bind("9876543210", "zomato", "id-1")["local_id"]
    ctx.storage.save_session(acc, "zomato", {"token": "secret-token"})

    wrong = c.post("/api/auth/password", json={"current_password": "wrong-password-1", "new_password": "new-secret-pass-2"})
    assert (wrong.status_code, wrong.json()["error"]["code"]) == (403, "WRONG_PASSWORD")
    failed = connect_app_db(app.state.app_db_path).execute("SELECT COUNT(*) FROM failed_logins").fetchone()[0]
    assert failed == 1  # counts as a failed login
    assert c.post("/api/auth/password", json={"current_password": PW, "new_password": "short"}).status_code == 422

    res = c.post("/api/auth/password", json={"current_password": PW, "new_password": "new-secret-pass-2"})
    assert res.status_code == 200
    assert other.get("/api/auth/me").status_code == 401  # other sessions ended
    c.headers["X-CSRF-Token"] = res.json()["csrf_token"]
    assert c.get("/api/auth/me").status_code == 200 and c.get("/api/accounts").status_code == 200  # new session works
    again = UserContext(tmp_path / "data", uid).unlock("new-secret-pass-2")
    assert again.storage.session(acc, "zomato") == {"token": "secret-token"}  # provider sessions stay readable
    fresh = TestClient(app, base_url="http://127.0.0.1:8765")
    fresh.headers["X-CSRF-Token"] = fresh.get("/api/auth/csrf").json()["csrf_token"]
    assert fresh.post("/api/auth/login", json={"username": "owner1", "password": PW}).status_code == 401
    assert fresh.post("/api/auth/login", json={"username": "owner1", "password": "new-secret-pass-2"}).status_code == 200


def test_log_out_everywhere_and_absolute_lifetime(tmp_path):
    c, app = _owner(tmp_path)
    d = TestClient(app, base_url="http://127.0.0.1:8765")
    d.headers["X-CSRF-Token"] = d.get("/api/auth/csrf").json()["csrf_token"]
    d.post("/api/auth/login", json={"username": "owner1", "password": PW})
    assert c.post("/api/auth/logout-all").status_code == 200
    assert d.get("/api/auth/me").status_code == 401 and not app.state.unlocked_sessions

    d.headers["X-CSRF-Token"] = d.get("/api/auth/csrf").json()["csrf_token"]
    d.post("/api/auth/login", json={"username": "owner1", "password": PW})
    conn = connect_app_db(app.state.app_db_path)
    sid = d.cookies[SESSION_COOKIE_NAME]
    conn.execute("UPDATE sessions SET created_at = ? WHERE id = ?", (time.time() - 8 * 86400, sid))
    conn.commit()
    assert get_session(conn, sid) is None  # active, but older than 7 days
    assert d.get("/api/auth/me").status_code == 401
