"""Tests for owner, setup, registration management, quotas, admin actions, and CLI recovery (AC-07)."""

import time

from fastapi.testclient import TestClient

from food_khata.auth import (
    CSRF_HEADER_NAME,
    connect_app_db,
    get_or_create_setup_code,
    init_app_db,
    verify_password,
)
from food_khata.cli import main as cli_main
from food_khata.cli_owner import main as cli_owner_main
from food_khata.serve.app import authenticate_client, create_app


def test_first_claim_loopback_and_setup_code(tmp_path):
    """Scenario: first claim.

    Given no owner exists /
    When the claim comes from loopback or carries the one-time setup code printed at --lan start /
    Then the owner is created and the existing data adopted (via AC-08 adopt_legacy_root).
    Any other claim gets 403, and after a claim the setup endpoint returns 404.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    # Create legacy file to verify adoption
    (data_dir / "legacy_test.txt").write_text("legacy data", encoding="utf-8")

    app = create_app(dummy_db, app_db_path=app_db, data_root=data_dir, lan=True)

    # 1. Non-loopback client (e.g. from LAN)
    lan_client = TestClient(
        app,
        base_url="http://192.168.1.100:8765",
        client=("192.168.1.100", 54321),
    )
    csrf_token = lan_client.get("/api/auth/csrf").json()["csrf_token"]
    lan_headers = {CSRF_HEADER_NAME: csrf_token}

    # First claim from LAN without setup code gets 403
    forbidden_res = lan_client.post(
        "/api/owner/setup",
        json={"username": "network_owner", "password": "password1234"},
        headers=lan_headers,
    )
    assert forbidden_res.status_code == 403

    # First claim from LAN with wrong setup code gets 403
    wrong_code_res = lan_client.post(
        "/api/owner/setup",
        json={
            "username": "network_owner",
            "password": "password1234",
            "setup_code": "WRONG-CODE",
        },
        headers=lan_headers,
    )
    assert wrong_code_res.status_code == 403

    # Now get the valid setup code generated for LAN
    init_app_db(app_db)
    conn = connect_app_db(app_db)
    setup_code = get_or_create_setup_code(conn)
    conn.close()

    # Claim from LAN with valid setup code succeeds
    claim_res = lan_client.post(
        "/api/owner/setup",
        json={
            "username": "network_owner",
            "password": "password1234",
            "setup_code": setup_code,
        },
        headers=lan_headers,
    )
    assert claim_res.status_code == 200
    owner_info = claim_res.json()
    assert owner_info["is_owner"] is True
    assert owner_info["username"] == "network_owner"

    # Refresh CSRF token after session creation on claim
    lan_headers[CSRF_HEADER_NAME] = lan_client.cookies.get("csrf_token")

    # After a claim, the setup endpoint returns 404
    post_claim_res = lan_client.post(
        "/api/owner/setup",
        json={"username": "another_owner", "password": "password1234"},
        headers=lan_headers,
    )
    assert post_claim_res.status_code == 404

    get_setup_res = lan_client.get("/api/owner/setup")
    assert get_setup_res.status_code == 404

    # 2. Test loopback claim on a fresh DB
    app_db2 = tmp_path / "app2.db"
    app2 = create_app(dummy_db, app_db_path=app_db2, data_root=data_dir)
    loop_client = TestClient(app2, base_url="http://127.0.0.1:8765")
    csrf2 = loop_client.get("/api/auth/csrf").json()["csrf_token"]
    loop_headers = {CSRF_HEADER_NAME: csrf2}

    # Loopback claim requires no setup code
    loop_claim = loop_client.post(
        "/api/owner/setup",
        json={"username": "local_owner", "password": "password1234"},
        headers=loop_headers,
    )
    assert loop_claim.status_code == 200
    assert loop_claim.json()["is_owner"] is True

    # Setup endpoint returns 404 after claim on loopback too
    loop_headers[CSRF_HEADER_NAME] = loop_client.cookies.get("csrf_token")
    assert (
        loop_client.post(
            "/api/owner/setup",
            json={"username": "local_owner2", "password": "password1234"},
            headers=loop_headers,
        ).status_code
        == 404
    )


def test_registration_closed_by_default(tmp_path):
    """Scenario: registration closed by default.

    Given an owner exists /
    When someone registers with no window and no code /
    Then it is refused.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    client = TestClient(app, base_url="http://127.0.0.1")

    # 1. Claim owner first
    csrf_token = client.get("/api/auth/csrf").json()["csrf_token"]
    headers = {CSRF_HEADER_NAME: csrf_token}
    reg_owner = client.post(
        "/api/auth/register",
        json={"username": "owner_user", "password": "password1234"},
        headers=headers,
    )
    assert reg_owner.status_code == 200
    assert reg_owner.json()["is_owner"] is True

    # Check setup status: owner exists, registration is closed
    status_res = client.get("/api/auth/setup-status")
    assert status_res.status_code == 200
    assert status_res.json()["has_owner"] is True
    assert status_res.json()["registration_open"] is False

    # 2. Someone registers with no window and no code -> Refused (403)
    reg_refused = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "password1234"},
        headers=headers,
    )
    assert reg_refused.status_code == 403
    assert reg_refused.json()["error"]["message"] == "Registration is closed."

    # User was not created
    conn = connect_app_db(app_db)
    assert conn.execute("SELECT COUNT(*) FROM users WHERE username = 'alice'").fetchone()[0] == 0
    conn.close()


def test_window_and_join_code(tmp_path):
    """Scenario: window and join code.

    When the owner opens a window (15 min, 1 hour or until closed) /
    Then registration works until it ends, enforced on the server.
    A rotatable household join code is stored hashed, and rotating it invalidates the old one.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    owner_client = TestClient(app, base_url="http://127.0.0.1")

    # Authenticate as owner
    authenticate_client(owner_client, username="the_owner", is_owner=True)

    # 1. Owner opens 15-minute window
    win_res = owner_client.post(
        "/api/owner/window",
        json={"duration_minutes": 15},
    )
    assert win_res.status_code == 200
    assert win_res.json()["is_open"] is True
    assert 800 <= win_res.json()["remaining_seconds"] <= 900

    # Status shows registration open
    status_res = owner_client.get("/api/auth/setup-status").json()
    assert status_res["registration_open"] is True

    # Registration works during window without join code
    visitor_client = TestClient(app, base_url="http://127.0.0.1")
    csrf_visitor = visitor_client.get("/api/auth/csrf").json()["csrf_token"]
    v_headers = {CSRF_HEADER_NAME: csrf_visitor}

    reg_win = visitor_client.post(
        "/api/auth/register",
        json={"username": "window_user", "password": "password1234"},
        headers=v_headers,
    )
    assert reg_win.status_code == 200
    assert reg_win.json()["username"] == "window_user"

    # Owner closes window
    close_res = owner_client.post(
        "/api/owner/window",
        json={"action": "close"},
    )
    assert close_res.status_code == 200
    assert close_res.json()["is_open"] is False

    # Registration now refused
    reg_after_close = visitor_client.post(
        "/api/auth/register",
        json={"username": "blocked_user", "password": "password1234"},
        headers=v_headers,
    )
    assert reg_after_close.status_code == 403

    # 2. Window expiration simulation
    conn = connect_app_db(app_db)
    conn.execute(
        "INSERT INTO server_settings (key, value) VALUES ('window_open_until', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (str(time.time() - 10),),
    )
    conn.commit()
    conn.close()

    reg_expired = visitor_client.post(
        "/api/auth/register",
        json={"username": "expired_win_user", "password": "password1234"},
        headers=v_headers,
    )
    assert reg_expired.status_code == 403

    # 3. Window until closed
    owner_client.post("/api/owner/window", json={"action": "open"})
    assert owner_client.get("/api/auth/setup-status").json()["registration_open"] is True
    owner_client.post("/api/owner/window", json={"action": "close"})

    # 4. Household join code rotation and hashing
    rotate_res1 = owner_client.post("/api/owner/join-code/rotate")
    assert rotate_res1.status_code == 200
    code1 = rotate_res1.json()["join_code"]
    assert code1 and len(code1) >= 8

    # Verify code is stored HASHED in the database (never plaintext)
    conn = connect_app_db(app_db)
    stored_hash = conn.execute(
        "SELECT value FROM server_settings WHERE key = 'join_code_hash'"
    ).fetchone()[0]
    conn.close()
    assert code1 not in stored_hash
    assert stored_hash.startswith("scrypt$")

    # Registration with valid join code succeeds even when window is closed
    reg_jc1 = visitor_client.post(
        "/api/auth/register",
        json={"username": "join_code_user1", "password": "password1234", "join_code": code1},
        headers=v_headers,
    )
    assert reg_jc1.status_code == 200

    # Rotating join code invalidates the old code
    rotate_res2 = owner_client.post("/api/owner/join-code/rotate")
    assert rotate_res2.status_code == 200
    code2 = rotate_res2.json()["join_code"]
    assert code2 != code1

    # Old code is now refused (403)
    reg_old_code = visitor_client.post(
        "/api/auth/register",
        json={"username": "join_code_user2", "password": "password1234", "join_code": code1},
        headers=v_headers,
    )
    assert reg_old_code.status_code == 403
    assert reg_old_code.json()["error"]["message"] == "Invalid join code."

    # New code succeeds
    reg_new_code = visitor_client.post(
        "/api/auth/register",
        json={"username": "join_code_user2", "password": "password1234", "join_code": code2},
        headers=v_headers,
    )
    assert reg_new_code.status_code == 200


def test_limits_rate_limit_and_user_cap(tmp_path):
    """Scenario: limits.

    Then registration is rate-limited and a cap of 8 users applies (DEC-010).
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    client = TestClient(app, base_url="http://127.0.0.1")

    # 1. Seed owner and open window
    authenticate_client(client, username="owner", is_owner=True)
    client.post("/api/owner/window", json={"action": "open"})

    # 2. Register users up to cap of 8 users (1 owner + 7 users)
    visitor = TestClient(app, base_url="http://127.0.0.1")
    csrf = visitor.get("/api/auth/csrf").json()["csrf_token"]
    headers = {CSRF_HEADER_NAME: csrf}

    for i in range(1, 8):
        res = visitor.post(
            "/api/auth/register",
            json={"username": f"user_{i}", "password": "password1234"},
            headers=headers,
        )
        assert res.status_code == 200

    conn = connect_app_db(app_db)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 8
    conn.close()

    # 9th user attempt is rejected by 8-user cap (DEC-010)
    cap_res = visitor.post(
        "/api/auth/register",
        json={"username": "user_overflow", "password": "password1234"},
        headers=headers,
    )
    assert cap_res.status_code == 403
    assert "maximum 8 users" in cap_res.json()["error"]["message"].lower()

    # 3. Rate limiting test: 5 attempts per 10 minutes per IP
    app_db2 = tmp_path / "app_throttle.db"
    app2 = create_app(dummy_db, app_db_path=app_db2)
    throttled_client = TestClient(app2, base_url="http://127.0.0.1")
    csrf2 = throttled_client.get("/api/auth/csrf").json()["csrf_token"]
    t_headers = {CSRF_HEADER_NAME: csrf2}

    # Setup owner first so registration is closed by default
    throttled_client.post(
        "/api/owner/setup",
        json={"username": "throttle_owner", "password": "password1234"},
        headers=t_headers,
    )
    t_headers[CSRF_HEADER_NAME] = throttled_client.cookies.get("csrf_token")

    # 5 failed registrations from same IP (registration closed, invalid join code)
    for i in range(5):
        throttled_client.post(
            "/api/auth/register",
            json={"username": f"bad_user_{i}", "password": "password1234", "join_code": "WRONG_CODE"},
            headers=t_headers,
        )

    # 6th attempt is throttled (429) with Retry-After header
    throttled_res = throttled_client.post(
        "/api/auth/register",
        json={"username": "good_user", "password": "password1234"},
        headers=t_headers,
    )
    assert throttled_res.status_code == 429
    assert "Retry-After" in throttled_res.headers


def test_admin_actions(tmp_path):
    """Scenario: admin actions.

    Then the owner can list, disable and reset users.
    Reset wipes that user's provider sessions and calls JobControl.cancel_user (stub/graceful fallback until AC-09).
    Sensitive actions ask for the owner's password again.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    app = create_app(dummy_db, app_db_path=app_db, data_root=data_dir)

    owner_client = TestClient(app, base_url="http://127.0.0.1")
    owner_pw = "owner_secure_password"

    # Register owner
    csrf = owner_client.get("/api/auth/csrf").json()["csrf_token"]
    owner_client.post(
        "/api/auth/register",
        json={"username": "owner_admin", "password": owner_pw},
        headers={CSRF_HEADER_NAME: csrf},
    )
    owner_login = owner_client.post(
        "/api/auth/login",
        json={"username": "owner_admin", "password": owner_pw},
        headers={CSRF_HEADER_NAME: csrf},
    )
    owner_csrf = owner_login.json()["csrf_token"]
    owner_client.headers[CSRF_HEADER_NAME] = owner_csrf

    # Open window and register user 'alice'
    owner_client.post("/api/owner/window", json={"action": "open"})
    alice_client = TestClient(app, base_url="http://127.0.0.1")
    alice_csrf = alice_client.get("/api/auth/csrf").json()["csrf_token"]
    alice_reg = alice_client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "alice_old_password"},
        headers={CSRF_HEADER_NAME: alice_csrf},
    )
    alice_id = alice_reg.json()["id"]

    # Alice logs in and gets session
    alice_login = alice_client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "alice_old_password"},
        headers={CSRF_HEADER_NAME: alice_csrf},
    )
    alice_session = alice_login.cookies.get("session_id")
    assert alice_session is not None

    # Simulate provider session file for Alice in data_root
    alice_accounts_dir = data_dir / "users" / alice_id / "accounts" / "acc1" / "sessions"
    alice_accounts_dir.mkdir(parents=True, exist_ok=True)
    alice_session_file = alice_accounts_dir / "session.json"
    alice_session_file.write_text('{"token": "dummy"}', encoding="utf-8")
    assert alice_session_file.exists()

    # 1. Non-owner cannot access owner admin APIs (403)
    alice_client.headers[CSRF_HEADER_NAME] = alice_login.json()["csrf_token"]
    non_owner_res = alice_client.get("/api/owner/users")
    assert non_owner_res.status_code == 403

    # 2. Owner lists users
    users_res = owner_client.get("/api/owner/users")
    assert users_res.status_code == 200
    user_list = users_res.json()
    assert len(user_list) == 2
    usernames = {u["username"] for u in user_list}
    assert "owner_admin" in usernames and "alice" in usernames

    # 3. Owner disables user Alice
    disable_res = owner_client.post(
        f"/api/owner/users/{alice_id}/disable",
        json={"disabled": True},
    )
    assert disable_res.status_code == 200
    assert disable_res.json()["disabled"] is True

    # Alice's active web session is invalidated
    alice_me_res = alice_client.get("/api/auth/me")
    assert alice_me_res.status_code == 401

    # Alice cannot log in while disabled
    alice_csrf_fresh = alice_client.get("/api/auth/csrf").json()["csrf_token"]
    alice_login_again = alice_client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "alice_old_password"},
        headers={CSRF_HEADER_NAME: alice_csrf_fresh},
    )
    assert alice_login_again.status_code == 401

    # Owner re-enables Alice
    enable_res = owner_client.post(
        f"/api/owner/users/{alice_id}/disable",
        json={"disabled": False},
    )
    assert enable_res.status_code == 200
    assert enable_res.json()["disabled"] is False

    # Cannot disable owner
    owner_id = owner_login.json()["user"]["id"]
    disable_owner = owner_client.post(
        f"/api/owner/users/{owner_id}/disable",
        json={"disabled": True},
    )
    assert disable_owner.status_code == 400

    # 4. Sensitive action: Owner resets Alice's password
    # Wrong owner password -> 403
    wrong_pw_reset = owner_client.post(
        f"/api/owner/users/{alice_id}/reset-password",
        json={"owner_password": "wrong_password", "new_password": "alice_new_password"},
    )
    assert wrong_pw_reset.status_code == 403

    # Correct owner password -> Success
    valid_reset = owner_client.post(
        f"/api/owner/users/{alice_id}/reset-password",
        json={"owner_password": owner_pw, "new_password": "alice_new_password"},
    )
    assert valid_reset.status_code == 200

    # Provider sessions for Alice were wiped
    assert not alice_session_file.exists()

    # Alice can log in with new password
    alice_csrf_after_reset = alice_client.get("/api/auth/csrf").json()["csrf_token"]
    alice_login_new = alice_client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "alice_new_password"},
        headers={CSRF_HEADER_NAME: alice_csrf_after_reset},
    )
    assert alice_login_new.status_code == 200


def test_cli_recovery(tmp_path):
    """Scenario: CLI recovery.

    Given the server is stopped /
    Then `food-khata owner reset-password` and `owner transfer` work.
    """
    app_db = tmp_path / "app.db"
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    init_app_db(app_db)
    conn = connect_app_db(app_db)

    # Seed owner and user bob
    from food_khata.auth import hash_password

    conn.execute(
        "INSERT INTO users (id, username, password_hash, is_owner, disabled, created_at) "
        "VALUES ('u1', 'owner_cli', ?, 1, 0, '2026-01-01T00:00:00Z')",
        (hash_password("old_owner_pw"),),
    )
    conn.execute(
        "INSERT INTO users (id, username, password_hash, is_owner, disabled, created_at) "
        "VALUES ('u2', 'bob_cli', ?, 0, 0, '2026-01-01T00:00:00Z')",
        (hash_password("bob_pw"),),
    )
    conn.commit()
    conn.close()

    # 1. Reset password via food-khata owner reset-password
    code = cli_owner_main([
        "reset-password",
        "--username",
        "owner_cli",
        "--password",
        "recovered_pw_123",
        "--app-db",
        str(app_db),
        "--data-dir",
        str(data_dir),
    ])
    assert code == 0

    conn = connect_app_db(app_db)
    owner_row = conn.execute("SELECT password_hash FROM users WHERE username = 'owner_cli'").fetchone()
    assert verify_password("recovered_pw_123", owner_row["password_hash"])
    conn.close()

    # 2. Reset password with auto-generated password
    code_auto = cli_owner_main([
        "reset-password",
        "--username",
        "bob_cli",
        "--app-db",
        str(app_db),
        "--data-dir",
        str(data_dir),
    ])
    assert code_auto == 0

    # 3. Transfer ownership via food-khata owner transfer
    code_transfer = cli_owner_main([
        "transfer",
        "--to",
        "bob_cli",
        "--app-db",
        str(app_db),
        "--data-dir",
        str(data_dir),
    ])
    assert code_transfer == 0

    conn = connect_app_db(app_db)
    u1 = conn.execute("SELECT is_owner FROM users WHERE username = 'owner_cli'").fetchone()
    u2 = conn.execute("SELECT is_owner FROM users WHERE username = 'bob_cli'").fetchone()
    assert u1["is_owner"] == 0
    assert u2["is_owner"] == 1
    conn.close()

    # 4. Also test invocation through top-level food_khata.cli.main
    cli_dispatch_code = cli_main([
        "owner",
        "transfer",
        "--to",
        "owner_cli",
        "--app-db",
        str(app_db),
        "--data-dir",
        str(data_dir),
    ])
    assert cli_dispatch_code == 0

    conn = connect_app_db(app_db)
    u1_again = conn.execute("SELECT is_owner FROM users WHERE username = 'owner_cli'").fetchone()
    assert u1_again["is_owner"] == 1
    conn.close()
