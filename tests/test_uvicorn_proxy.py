import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx


def test_uvicorn_ignores_rotating_forwarded_for(tmp_path):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen(
        [sys.executable, str(Path(__file__).parent / "e2e_access" / "server.py"), str(tmp_path), str(port)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])},
    )
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=2) as client:
            for _ in range(100):
                try:
                    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
                    break
                except httpx.TransportError:
                    time.sleep(0.1)
            else:
                raise AssertionError("server did not start")
            client.headers["X-CSRF-Token"] = csrf
            assert client.post("/api/owner/setup", json={"username": "owner", "password": "password123", "adopt_data": False}).status_code == 200
            client.headers["X-CSRF-Token"] = client.cookies["csrf_token"]
            assert client.post("/api/auth/logout").status_code == 200
            client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]
            for i in range(6):
                response = client.post("/api/auth/login", json={"username": "owner", "password": "wrong"}, headers={"X-Forwarded-For": f"192.0.2.{i + 1}"})
                assert response.status_code == (401 if i < 5 else 429)
    finally:
        server.terminate()
        server.wait(timeout=10)
