"""Synthetic acceptance checks for the authentication boundary."""

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from food_khata.auth import CSRF_HEADER_NAME
from food_khata.serve.app import create_app

PUBLIC = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/setup-status",
    "/api/auth/csrf",
    "/api/owner/setup",
}


def test_logged_out_api_route_sweep(tmp_path):
    app = create_app(tmp_path / "orders.db", data_root=tmp_path)
    client = TestClient(app, base_url="http://127.0.0.1")
    checked = set()
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api/"):
            continue
        if route.path in PUBLIC:
            continue
        path = route.path_format
        for parameter in route.param_convertors:
            path = path.replace("{" + parameter + "}", "synthetic-id")
        for method in route.methods:
            response = client.request(method, path)
            assert response.status_code == 401, (method, path, response.status_code)
            checked.add((method, path))
    assert checked
    assert client.get("/health").status_code == 200
    assert client.get("/api/auth/setup-status").status_code == 200


def test_csrf_cookie_flags_and_host_allowlist(tmp_path):
    app = create_app(tmp_path / "orders.db", data_root=tmp_path, lan=True,
                     allow_hosts=["home.test"], is_https=True)
    client = TestClient(app, base_url="https://home.test", client=("127.0.0.1", 1234))
    assert client.get("/health", headers={"host": "bad.test"}).status_code == 400
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    assert client.post("/api/owner/setup", json={"username": "owner", "password": "synthetic-password"}).status_code == 403
    headers = {CSRF_HEADER_NAME: csrf}
    assert client.post("/api/owner/setup", headers=headers, json={"username": "owner", "password": "synthetic-password"}).status_code == 200
    headers = {CSRF_HEADER_NAME: client.get("/api/auth/csrf").json()["csrf_token"]}
    login = client.post("/api/auth/login", headers=headers, json={"username": "owner", "password": "synthetic-password"})
    assert login.status_code == 200
    cookies = login.headers.get_list("set-cookie")
    session = next(c for c in cookies if "httponly" in c.lower())
    assert "secure" in session.lower() and "samesite=lax" in session.lower()
    assert all("secure" in c.lower() and "samesite=lax" in c.lower() for c in cookies)
    assert client.post("/api/dashboard", json={}).status_code == 403


def test_http_transport_status(tmp_path):
    app = create_app(tmp_path / "orders.db", data_root=tmp_path, lan=True)
    client = TestClient(app, base_url="http://127.0.0.1")
    assert client.get("/api/auth/setup-status").json()["insecure_transport"] is True
