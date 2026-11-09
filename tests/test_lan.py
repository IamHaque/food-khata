"""Tests for LAN mode and transport security (AC-11)."""

import socket
from pathlib import Path

from fastapi.testclient import TestClient

from food_khata.auth import (
    CSRF_HEADER_NAME,
    connect_app_db,
    create_test_user_session,
    get_or_create_setup_code,
)
from food_khata.cli import main as cli_main
from food_khata.serve import cli as serve_cli
from food_khata.serve.app import create_app


def test_loopback_by_default_cli(monkeypatch, tmp_path):
    """Scenario: loopback by default.

    When `food-khata serve` runs without `--lan`, binds loopback only (127.0.0.1).
    Attempting to bind non-loopback address without `--lan` is rejected.
    """
    calls = []
    monkeypatch.setattr(serve_cli, "serve", lambda *args, **kwargs: calls.append((args, kwargs)) or 0)

    # 1. Default CLI invocation without --lan binds 127.0.0.1
    res = cli_main(["serve", "--data-dir", str(tmp_path)])
    assert res == 0
    assert len(calls) == 1
    args, kwargs = calls[0]
    assert args[0] == "127.0.0.1"

    # Undo monkeypatch to test direct serve() rejection
    monkeypatch.undo()

    # 2. Direct serve() call rejecting non-loopback without lan flag
    assert serve_cli.serve("192.168.1.50", 8765, tmp_path / "food_analytics.db", lan=False) == 1
    assert serve_cli.serve("0.0.0.0", 8765, tmp_path / "food_analytics.db", lan=False) == 1


def test_lan_opt_in_binds_all_and_prints_setup_code(monkeypatch, tmp_path, capsys):
    """Scenario: LAN opt-in.

    When `--lan` is passed, binds 0.0.0.0.
    On startup, if no owner exists in app.db, prints one-time setup code to console.
    If owner exists, does not print setup code.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    calls = []

    def mock_run(app, **kwargs):
        calls.append(kwargs)

    import uvicorn

    monkeypatch.setattr(uvicorn, "run", mock_run)

    # 1. Startup with --lan and NO owner
    code = serve_cli.serve(
        host="127.0.0.1",
        port=8765,
        db_path=dummy_db,
        lan=True,
        data_root=data_dir,
        app_db_path=app_db,
    )
    assert code == 0
    assert len(calls) == 1
    assert calls[0]["host"] == "0.0.0.0"

    out = capsys.readouterr().out
    assert "One-time setup code:" in out

    # Verify the printed code matches what is in app.db
    conn = connect_app_db(app_db)
    active_code = get_or_create_setup_code(conn)
    conn.close()
    assert active_code in out

    # 2. Startup with --lan when owner DOES exist
    create_test_user_session(app_db, username="existing_owner", is_owner=True)
    calls.clear()

    code2 = serve_cli.serve(
        host="127.0.0.1",
        port=8765,
        db_path=dummy_db,
        lan=True,
        data_root=data_dir,
        app_db_path=app_db,
    )
    assert code2 == 0
    assert calls[0]["host"] == "0.0.0.0"
    out2 = capsys.readouterr().out
    assert "One-time setup code:" not in out2


def test_cli_lan_and_host_dispatch(monkeypatch, tmp_path):
    """Verify CLI argument parsing for --lan, --allow-host, and --host."""
    calls = []
    monkeypatch.setattr(serve_cli, "serve", lambda *args, **kwargs: calls.append((args, kwargs)) or 0)

    # CLI with --lan flag
    res = cli_main(["serve", "--lan", "--data-dir", str(tmp_path)])
    assert res == 0
    assert len(calls) == 1
    args, kwargs = calls[0]
    assert args[0] == "0.0.0.0"
    assert kwargs.get("lan") is True

    # CLI with --lan and custom --allow-host
    calls.clear()
    res2 = cli_main([
        "serve",
        "--lan",
        "--allow-host",
        "custom.box",
        "--allow-host",
        "nas.local",
        "--data-dir",
        str(tmp_path),
    ])
    assert res2 == 0
    args2, kwargs2 = calls[0]
    assert kwargs2.get("allow_hosts") == ["custom.box", "nas.local"]


def test_host_allow_list_rejections_and_allowances(tmp_path):
    """Scenario: host allow-list.

    Request with unknown Host header returns HTTP 400 Bad Request.
    Allowed hosts (localhost, 127.0.0.1, server IP/hostname, --allow-host) succeed.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()

    # 1. Loopback mode app (lan=False)
    app = create_app(dummy_db, app_db_path=app_db, lan=False, allow_hosts=["custom-home.lan"])
    client = TestClient(app, base_url="http://127.0.0.1:8765")

    # Valid loopback hosts succeed
    assert client.get("/health", headers={"host": "127.0.0.1:8765"}).status_code == 200
    assert client.get("/health", headers={"host": "localhost:8765"}).status_code == 200

    # Custom allowed host succeeds
    assert client.get("/health", headers={"host": "custom-home.lan:8765"}).status_code == 200

    # Unknown host header returns 400 Bad Request
    bad_host_res = client.get("/health", headers={"host": "evil.com"})
    assert bad_host_res.status_code == 400
    assert bad_host_res.json()["error"]["code"] == "bad_request"

    # Random external IP returns 400 Bad Request
    bad_ip_res = client.get("/health", headers={"host": "198.51.100.1"})
    assert bad_ip_res.status_code == 400

    # Missing/empty host header returns 400
    empty_host_res = client.get("/health", headers={"host": ""})
    assert empty_host_res.status_code == 400

    # 2. LAN mode app (lan=True)
    lan_app = create_app(dummy_db, app_db_path=app_db, lan=True, allow_hosts=["myhub.internal"])
    lan_client = TestClient(lan_app, base_url="http://192.168.1.100:8765")

    # In LAN mode, private network IP addresses and server hostname are allowed
    assert lan_client.get("/health", headers={"host": "192.168.1.100:8765"}).status_code == 200
    assert lan_client.get("/health", headers={"host": "10.0.0.15:8765"}).status_code == 200
    assert lan_client.get("/health", headers={"host": "myhub.internal:8765"}).status_code == 200

    hostname = socket.gethostname()
    assert lan_client.get("/health", headers={"host": f"{hostname}:8765"}).status_code == 200

    # Unknown domain in LAN mode returns 400
    assert lan_client.get("/health", headers={"host": "attacker.xyz"}).status_code == 400


def test_safety_middleware_origin_check(tmp_path):
    """Maintain safety middleware origin check."""
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()

    app = create_app(dummy_db, app_db_path=app_db, lan=False)
    client = TestClient(app, base_url="http://127.0.0.1:8765")

    # Matching Origin succeeds
    valid_res = client.get(
        "/health",
        headers={"host": "127.0.0.1:8765", "origin": "http://127.0.0.1:8765"},
    )
    assert valid_res.status_code == 200

    # Cross-site / malicious Origin returns 403 Forbidden
    forbidden_res = client.get(
        "/health",
        headers={"host": "127.0.0.1:8765", "origin": "http://evil.com"},
    )
    assert forbidden_res.status_code == 403
    assert forbidden_res.json()["error"]["code"] == "forbidden"


def test_tls_options_and_secure_cookies(tmp_path, monkeypatch):
    """Scenario: HTTPS transport, CLI flags, and secure cookies.

    - Support --tls-cert and --tls-key options.
    - Secure cookies flag activated when running over HTTPS.
    - When running on plain HTTP, /api/auth/setup-status reports insecure_transport: true.
    - When running over HTTPS, reports insecure_transport: false.
    """
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()

    # 1. CLI option validation for TLS
    cert_file = tmp_path / "cert.pem"
    cert_file.write_text("dummy-cert", encoding="utf-8")
    key_file = tmp_path / "key.pem"
    key_file.write_text("dummy-key", encoding="utf-8")

    # Missing key with cert returns 1
    assert serve_cli.serve("127.0.0.1", 8765, dummy_db, tls_cert=cert_file) == 1
    # Missing cert with key returns 1
    assert serve_cli.serve("127.0.0.1", 8765, dummy_db, tls_key=key_file) == 1
    # Non-existent file returns 1
    assert serve_cli.serve("127.0.0.1", 8765, dummy_db, tls_cert=tmp_path / "nope.pem", tls_key=key_file) == 1

    calls = []
    import uvicorn

    monkeypatch.setattr(uvicorn, "run", lambda app, **kwargs: calls.append(kwargs))

    code = serve_cli.serve(
        "127.0.0.1",
        8765,
        dummy_db,
        tls_cert=cert_file,
        tls_key=key_file,
        app_db_path=app_db,
    )
    assert code == 0
    assert len(calls) == 1
    assert calls[0]["ssl_certfile"] == str(cert_file)
    assert calls[0]["ssl_keyfile"] == str(key_file)

    # 2. Plain HTTP setup-status and cookie check
    http_app = create_app(dummy_db, app_db_path=app_db, is_https=False)
    http_client = TestClient(http_app, base_url="http://127.0.0.1:8765")

    setup_status_http = http_client.get("/api/auth/setup-status").json()
    assert setup_status_http["insecure_transport"] is True

    # Register user over HTTP
    csrf_token = http_client.get("/api/auth/csrf").json()["csrf_token"]
    reg_res = http_client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "password1234"},
        headers={CSRF_HEADER_NAME: csrf_token},
    )
    assert reg_res.status_code == 200

    login_res_http = http_client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "password1234"},
        headers={CSRF_HEADER_NAME: csrf_token},
    )
    assert login_res_http.status_code == 200
    set_cookie_http = login_res_http.headers.get("set-cookie", "")
    assert "secure" not in set_cookie_http.lower()

    # 3. HTTPS app setup-status and cookie check
    https_app = create_app(dummy_db, app_db_path=app_db, is_https=True)
    https_client = TestClient(https_app, base_url="https://127.0.0.1:8765")

    setup_status_https = https_client.get("/api/auth/setup-status").json()
    assert setup_status_https["insecure_transport"] is False

    https_csrf = https_client.get("/api/auth/csrf").json()["csrf_token"]
    login_res_https = https_client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "password1234"},
        headers={CSRF_HEADER_NAME: https_csrf},
    )
    assert login_res_https.status_code == 200
    set_cookie_https = login_res_https.headers.get("set-cookie", "")
    assert "secure" in set_cookie_https.lower()


def test_provider_traffic_stays_on_host(tmp_path):
    """Scenario: provider traffic stays on host.

    Test verifies that frontend bundle/source files never direct browser traffic
    to raw Swiggy/Zomato domains; all provider requests are proxied/executed host-side.
    """
    repo_root = Path(__file__).resolve().parents[1]
    dashboard_ui_src = repo_root / "dashboard-ui" / "src"

    forbidden_domains = ["swiggy.com", "zomato.com"]

    if dashboard_ui_src.is_dir():
        for file in dashboard_ui_src.rglob("*"):
            if file.is_file() and file.suffix in {".ts", ".tsx", ".js", ".jsx", ".html"}:
                content = file.read_text(encoding="utf-8")
                for domain in forbidden_domains:
                    # Frontend code must not contain direct provider API host calls
                    assert f"https://{domain}" not in content
                    assert f"http://{domain}" not in content
                    assert f"api.{domain}" not in content

    # Verify that API responses from the local server don't return redirect URLs
    # pointing to external provider endpoints
    app_db = tmp_path / "app.db"
    dummy_db = tmp_path / "orders.db"
    dummy_db.touch()
    app = create_app(dummy_db, app_db_path=app_db)
    client = TestClient(app, base_url="http://127.0.0.1:8765")

    # Endpoints return host-local data only
    health_res = client.get("/health")
    assert health_res.status_code == 200
    for domain in forbidden_domains:
        assert domain not in health_res.text
