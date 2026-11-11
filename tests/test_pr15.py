"""PR-15: cookie-only sessions, Secure from config, trusted proxy, headers, body limit, audit trail, quiet logs."""

import logging

from fastapi.testclient import TestClient

from food_khata.auth import SESSION_COOKIE_NAME
from food_khata.serve.app import create_app

PW = "synthetic-pass-14"


def _app(tmp_path, **kw):
    return create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data", **kw)


def _client(app, host="127.0.0.1", peer=None, scheme="http"):
    c = TestClient(app, base_url=f"{scheme}://{host}:8765", client=(peer or host, 5000))
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    return c


def _claim(client):
    assert client.post("/api/owner/setup", json={"username": "owner1", "password": PW}).status_code == 200
    client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]


def test_headers_on_every_response_and_hsts_only_over_https(tmp_path):
    c = _client(_app(tmp_path))
    for res in (c.get("/health"), c.get("/api/accounts")):  # a 200 and a 401
        assert res.headers["X-Content-Type-Options"] == "nosniff"
        assert res.headers["X-Frame-Options"] == "DENY" and res.headers["Referrer-Policy"] == "no-referrer"
        csp = res.headers["Content-Security-Policy"]
        assert "script-src 'self'" in csp and "'unsafe-inline'" not in csp.split("style-src")[0]
        assert "Strict-Transport-Security" not in res.headers
    https = _client(_app(tmp_path / "h", behind_https_proxy=True))
    assert "Strict-Transport-Security" in https.get("/health").headers


def test_session_header_is_ignored_and_secure_flag_comes_from_config(tmp_path):
    app = _app(tmp_path)
    c = _client(app)
    _claim(c)
    sid = c.cookies[SESSION_COOKIE_NAME]
    bare = TestClient(app, base_url="http://127.0.0.1:8765")
    assert bare.get("/api/auth/me", headers={"x-session-id": sid}).status_code == 401  # only the cookie counts
    spoofed = c.post("/api/auth/login", json={"username": "owner1", "password": PW}, headers={"x-forwarded-proto": "https"})
    assert "secure" not in spoofed.headers["set-cookie"].lower()  # a client header never sets Secure
    behind = _app(tmp_path / "b", behind_https_proxy=True)
    c2 = _client(behind, scheme="https")  # the proxy terminates TLS, so the client really uses https
    _claim(c2)
    assert "secure" in c2.post("/api/auth/login", json={"username": "owner1", "password": PW}).headers["set-cookie"].lower()


def test_trusted_proxy_is_opt_in_for_throttling(tmp_path):
    def attempts(app, peer):
        c = _client(app, host="192.168.1.50", peer=peer)
        return [
            c.post("/api/auth/login", json={"username": "nobody", "password": "x"}, headers={"x-forwarded-for": f"10.0.0.{i}"}).status_code
            for i in range(7)
        ]

    # A header is ignored without --trusted-proxy: rotating it does not reset the per-address throttle.
    assert attempts(_app(tmp_path / "a", lan=True), "192.168.1.50")[-1] == 429
    # With the proxy trusted, the header from that peer names the client, so rotating clients each get their own count.
    assert 429 not in attempts(_app(tmp_path / "t", lan=True, trusted_proxy="192.168.1.1"), "192.168.1.1")
    # The same header from any other peer is still ignored.
    assert attempts(_app(tmp_path / "u", lan=True, trusted_proxy="192.168.1.1"), "192.168.1.77")[-1] == 429


def test_body_limit(tmp_path):
    c = _client(_app(tmp_path))
    big = c.post("/api/owner/setup", json={"username": "x" * 70000, "password": PW})
    assert (big.status_code, big.json()["error"]["code"]) == (413, "payload_too_large")
    assert "X-Frame-Options" in big.headers


def test_audit_trail_and_no_secrets_in_logs(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    app = _app(tmp_path)
    c = _client(app)
    _claim(c)
    c.post("/api/auth/login", json={"username": "owner1", "password": "wrong-password-9"})
    assert c.post("/api/auth/login", json={"username": "owner1", "password": PW}).status_code == 200
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    c.post("/api/owner/window", json={"action": "open"})
    join = c.post("/api/owner/join-code/rotate").json()["join_code"]
    c.post("/api/owner/window", json={"action": "close"})
    c.post("/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"})
    rows = c.get("/api/owner/audit").json()["rows"]
    actions = [r["action"] for r in rows]
    for expected in ("owner_claim", "login_failed", "login", "window_open", "join_code_rotate", "window_close"):
        assert expected in actions, expected
    text = " ".join(str(v) for r in rows for v in r.values()) + caplog.text
    for secret in (PW, "wrong-password-9", join, "9876543210", c.headers["X-CSRF-Token"], c.cookies[SESSION_COOKIE_NAME]):
        assert secret not in text, secret
    assert len(rows) >= 6
