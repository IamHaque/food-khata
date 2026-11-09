"""Tests for authentication core, sessions, CSRF, throttling, and route enforcement (AC-06)."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from food_khata.auth import (
    CSRF_HEADER_NAME,
    IDLE_TIMEOUT_SECONDS,
    INVALID_CREDENTIALS_MESSAGE,
    SESSION_COOKIE_NAME,
    THROTTLE_ERROR_MESSAGE,
    connect_app_db,
    dummy_verify,
    hash_password,
    verify_password,
)
from food_khata.serve.app import authenticate_client, create_app

ALLOW_LIST = {
    "/health",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/setup-status",
    "/api/auth/csrf",
    "/api/owner/setup",
}


def test_password_storage_scrypt():
    """Scenario: password storage.

    Given a password / Then only a salted slow hash is stored (hashlib.scrypt, DEC-P1).
    """
    pw = "superSecretPassword123"
    hashed1 = hash_password(pw)
    hashed2 = hash_password(pw)

    # 1. Must use scrypt prefix
    assert hashed1.startswith("scrypt$16384$8$1$")
    assert hashed2.startswith("scrypt$16384$8$1$")

    # 2. Must be salted (two hashes of the same password differ)
    assert hashed1 != hashed2

    # 3. Verification works
    assert verify_password(pw, hashed1) is True
    assert verify_password(pw, hashed2) is True
    assert verify_password("wrongPassword", hashed1) is False
    assert verify_password("", hashed1) is False

    # 4. Dummy verify runs constant time scrypt without error
    assert dummy_verify() is False


def test_sessions_lifecycle_and_cookies(tmp_path):
    """Scenario: sessions.

    Then sessions live on the server, the cookie is HttpOnly and SameSite=Lax
    (Secure when on HTTPS), the id rotates on login, there is an idle timeout (8 h, DEC-010),
    and logout deletes the session.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    client = TestClient(app, base_url="http://127.0.0.1")

    # Get CSRF token for registration
    csrf_res = client.get("/api/auth/csrf")
    csrf_token = csrf_res.json()["csrf_token"]

    # Register first user (becomes owner)
    reg_res = client.post(
        "/api/auth/register",
        json={"username": "owner_user", "password": "password1234"},
        headers={CSRF_HEADER_NAME: csrf_token},
    )
    assert reg_res.status_code == 200
    assert reg_res.json()["is_owner"] is True

    # First login: check session cookie attributes
    login_res = client.post(
        "/api/auth/login",
        json={"username": "owner_user", "password": "password1234"},
        headers={CSRF_HEADER_NAME: csrf_token},
    )
    assert login_res.status_code == 200
    session_cookie = login_res.cookies.get(SESSION_COOKIE_NAME)
    assert session_cookie is not None

    # Verify cookie attributes
    raw_header = login_res.headers.get("set-cookie", "")
    assert "HttpOnly" in raw_header or "httponly" in raw_header
    assert "SameSite=lax" in raw_header or "samesite=lax" in raw_header.lower()

    # Session lives on the server in app.db
    conn = connect_app_db(app_db)
    session_row = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_cookie,)
    ).fetchone()
    assert session_row is not None
    assert session_row["user_id"] == reg_res.json()["id"]
    conn.close()

    # ID rotates on login: logging in again generates a new session id
    new_csrf = login_res.json()["csrf_token"]
    login_res2 = client.post(
        "/api/auth/login",
        json={"username": "owner_user", "password": "password1234"},
        headers={CSRF_HEADER_NAME: new_csrf},
    )
    assert login_res2.status_code == 200
    session_cookie2 = login_res2.cookies.get(SESSION_COOKIE_NAME)
    assert session_cookie2 != session_cookie

    # Old session is deleted from server on rotation
    conn = connect_app_db(app_db)
    old_row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_cookie,)).fetchone()
    assert old_row is None
    new_row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_cookie2,)).fetchone()
    assert new_row is not None
    conn.close()

    # Logout deletes the session from server and clears cookies
    logout_res = client.post(
        "/api/auth/logout",
        headers={CSRF_HEADER_NAME: login_res2.json()["csrf_token"]},
    )
    assert logout_res.status_code == 200
    conn = connect_app_db(app_db)
    after_logout_row = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_cookie2,)
    ).fetchone()
    assert after_logout_row is None
    conn.close()


def test_session_idle_timeout(tmp_path):
    """Scenario: sessions idle timeout (8 h, DEC-010)."""
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    client = TestClient(app, base_url="http://127.0.0.1")

    session_id, csrf_token = authenticate_client(client)
    # Check that me endpoint works when active
    assert client.get("/api/auth/me").status_code == 200

    # Advance time beyond 8 hours idle timeout (DEC-010)
    conn = connect_app_db(app_db)
    conn.execute(
        "UPDATE sessions SET last_active = last_active - ?",
        (IDLE_TIMEOUT_SECONDS + 5,),
    )
    conn.commit()
    conn.close()

    # Now session has timed out -> 401
    expired_res = client.get("/api/auth/me")
    assert expired_res.status_code == 401

    # Session is cleaned up from database
    conn = connect_app_db(app_db)
    assert (
        conn.execute("SELECT COUNT(*) FROM sessions WHERE id = ?", (session_id,)).fetchone()[0]
        == 0
    )
    conn.close()


def test_csrf_protection(tmp_path):
    """Scenario: CSRF.

    When a state-changing request lacks the token / Then it gets 403.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    client = TestClient(app, base_url="http://127.0.0.1")

    # 1. Unauthenticated state-changing request lacking CSRF gets 403
    login_missing_csrf = client.post(
        "/api/auth/login", json={"username": "user", "password": "pass"}
    )
    assert login_missing_csrf.status_code == 403
    assert login_missing_csrf.json()["error"]["code"] == "forbidden"

    # 2. Authenticated state-changing request lacking CSRF gets 403
    authenticate_client(client)
    # Temporarily remove header
    del client.headers[CSRF_HEADER_NAME]

    post_without_csrf = client.post("/api/dashboard", json={})
    assert post_without_csrf.status_code == 403
    assert post_without_csrf.json()["error"]["code"] == "forbidden"

    # With invalid CSRF token gets 403
    client.headers[CSRF_HEADER_NAME] = "invalid_token_value"
    post_invalid_csrf = client.post("/api/dashboard", json={})
    assert post_invalid_csrf.status_code == 403


def test_throttle_scenario(tmp_path):
    """Scenario: throttle.

    Given 5 failed logins for one username and IP within 10 min / Then the next
    gets 429 with Retry-After, and error text never reveals whether the username exists.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    client = TestClient(app, base_url="http://127.0.0.1")

    # Get CSRF token
    csrf_token = client.get("/api/auth/csrf").json()["csrf_token"]
    headers = {CSRF_HEADER_NAME: csrf_token}

    # 1. Try with non-existent user 5 times
    for _ in range(5):
        res = client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "wrongpassword"},
            headers=headers,
        )
        assert res.status_code == 401
        assert res.json()["error"]["message"] == INVALID_CREDENTIALS_MESSAGE

    # 2. 6th attempt (the next attempt) gets 429 with Retry-After
    throttled_res = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrongpassword"},
        headers=headers,
    )
    assert throttled_res.status_code == 429
    assert throttled_res.json()["error"]["message"] == THROTTLE_ERROR_MESSAGE
    assert "Retry-After" in throttled_res.headers
    retry_after = int(throttled_res.headers["Retry-After"])
    assert 1 <= retry_after <= 600

    # Error text never reveals whether username exists
    assert "alice" not in throttled_res.text.lower()
    assert "exist" not in throttled_res.text.lower()

    # Another user is not throttled
    other_user_res = client.post(
        "/api/auth/login",
        json={"username": "bob", "password": "wrongpassword"},
        headers=headers,
    )
    assert other_user_res.status_code == 401
    assert other_user_res.json()["error"]["message"] == INVALID_CREDENTIALS_MESSAGE


def test_every_route_needs_login_sweep(tmp_path):
    """Scenario: every route needs login.

    Given a test that lists the full route table / When each route is called without a session /
    Then it returns 401, except an explicit allow-list (setup status, login, register, health, static assets).
    This includes today's unauthenticated read APIs.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    client = TestClient(app, base_url="http://127.0.0.1")

    api_routes = []
    for route in app.routes:
        methods = getattr(route, "methods", set())
        path = getattr(route, "path", "")
        if path and methods and path.startswith("/api/"):
            for method in methods:
                if method not in {"HEAD", "OPTIONS"}:
                    api_routes.append((method, path))

    assert len(api_routes) > 5

    for method, path in api_routes:
        # Normalize path parameter {order_id} to '1' for test call
        call_path = path.replace("{order_id}", "1").replace("{path:path}", "index.html")
        if call_path in ALLOW_LIST:
            continue

        if method == "GET":
            res = client.get(call_path)
        elif method == "POST":
            res = client.post(call_path, json={})
        elif method == "PUT":
            res = client.put(call_path, json={})
        elif method == "DELETE":
            res = client.delete(call_path)
        else:
            continue

        assert res.status_code == 401, f"Route {method} {call_path} did not return 401 without auth"
        assert res.json()["error"]["code"] == "unauthorized"

    # Allow-list routes do NOT return 401
    assert client.get("/health").status_code == 200
    assert client.get("/api/auth/setup-status").status_code == 200
    assert client.get("/api/auth/csrf").status_code == 200


def test_contract_c0_committed(tmp_path):
    """Scenario: contract C-0.

    Then the OpenAPI schema is generated and committed to docs/contracts/c0-auth.json
    (or docs/contracts/openapi.json).
    """
    c0_path = Path("docs/contracts/c0-auth.json")
    openapi_path = Path("docs/contracts/openapi.json")
    assert c0_path.is_file(), "docs/contracts/c0-auth.json missing"
    assert openapi_path.is_file(), "docs/contracts/openapi.json missing"

    c0_data = json.loads(c0_path.read_text(encoding="utf-8"))
    assert c0_data["info"]["title"] == "Food Khata API"
    assert "/api/auth/login" in c0_data["paths"]
    assert "/api/auth/register" in c0_data["paths"]
    assert "/health" in c0_data["paths"]
