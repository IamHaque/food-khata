import os
import socket
import sqlite3
import subprocess
import sys
import time
from contextlib import closing
from pathlib import Path

import httpx
import pytest


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
            assert client.post("/api/owner/setup", json={"username": "owner", "password": "synthetic-pass-1", "adopt_data": False}).status_code == 200
            client.headers["X-CSRF-Token"] = client.cookies["csrf_token"]
            assert client.post("/api/auth/logout").status_code == 200
            client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]
            for i in range(6):
                response = client.post("/api/auth/login", json={"username": "owner", "password": "wrong"}, headers={"X-Forwarded-For": f"192.0.2.{i + 1}"})
                assert response.status_code == (401 if i < 5 else 429)
    finally:
        server.terminate()
        server.wait(timeout=10)


def test_uvicorn_logout_running_job_continues(tmp_path):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen(
        [sys.executable, str(Path(__file__).parent / "e2e_access" / "lifecycle_server.py"), str(tmp_path), str(port)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])},
    )
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as client:
            for _ in range(100):
                try:
                    client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]
                    break
                except httpx.TransportError:
                    time.sleep(0.1)
            else:
                raise AssertionError("server did not start")
            assert client.post("/api/owner/setup", json={"username": "owner", "password": "synthetic-pass-1", "adopt_data": False}).status_code == 200
            client.headers["X-CSRF-Token"] = client.cookies["csrf_token"]
            start = client.post("/api/accounts/link/start", json={"provider": "fake", "phone": "9876543210"})
            assert start.status_code == 200
            account = client.post("/api/accounts/link/verify", json={"handle": start.json()["handle"], "code": "123456"})
            assert account.status_code == 200
            job = client.post("/api/sync/jobs", json={"account_id": account.json()["id"], "mode": "all"})
            assert job.status_code == 200
            job_id = job.json()["id"]
            assert client.post("/api/auth/logout").status_code == 200
            client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]
            login = client.post("/api/auth/login", json={"username": "owner", "password": "synthetic-pass-1"})
            assert login.status_code == 200
            client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
            for _ in range(100):
                job = client.get(f"/api/sync/jobs/{job_id}").json()
                if job["status"] in ("done", "failed", "cancelled"):
                    break
                time.sleep(0.1)
            assert job["status"] == "done", job
    finally:
        server.terminate()
        server.wait(timeout=10)


@pytest.mark.parametrize("action", ["reset-password", "disable"])
def test_uvicorn_owner_revokes_active_user_job(tmp_path, action):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen(
        [sys.executable, str(Path(__file__).parent / "e2e_access" / "lifecycle_server.py"), str(tmp_path), str(port)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])},
    )
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as owner, httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as member:
            for _ in range(100):
                try:
                    owner.headers["X-CSRF-Token"] = owner.get("/api/auth/csrf").json()["csrf_token"]
                    break
                except httpx.TransportError:
                    time.sleep(0.1)
            else:
                raise AssertionError("server did not start")
            assert owner.post("/api/owner/setup", json={"username": "owner", "password": "synthetic-pass-1", "adopt_data": False}).status_code == 200
            owner.headers["X-CSRF-Token"] = owner.cookies["csrf_token"]
            assert owner.post("/api/owner/window", json={"action": "open"}).status_code == 200
            member.headers["X-CSRF-Token"] = member.get("/api/auth/csrf").json()["csrf_token"]
            registered = member.post("/api/auth/register", json={"username": "member", "password": "synthetic-pass-1"})
            assert registered.status_code == 200, registered.text
            user_id = registered.json()["id"]
            login = member.post("/api/auth/login", json={"username": "member", "password": "synthetic-pass-1"})
            assert login.status_code == 200
            member.headers["X-CSRF-Token"] = login.json()["csrf_token"]
            assert member.get("/api/owner/users").status_code == 403
            link = member.post("/api/accounts/link/start", json={"provider": "fake", "phone": "9876543210"})
            account = member.post("/api/accounts/link/verify", json={"handle": link.json()["handle"], "code": "123456"})
            assert account.status_code == 200
            account_id = account.json()["id"]
            job = member.post("/api/sync/jobs", json={"account_id": account_id, "mode": "all"})
            assert job.status_code == 200
            job_id = job.json()["id"]
            assert owner.get(f"/api/sync/jobs/{job_id}").status_code == 404
            assert owner.post("/api/sync/jobs", json={"account_id": account_id}).status_code == 404
            owner_link = owner.post("/api/accounts/link/start", json={"provider": "fake", "phone": "9876543212"})
            owner_account = owner.post("/api/accounts/link/verify", json={"handle": owner_link.json()["handle"], "code": "123456"}).json()
            owner_job = owner.post("/api/sync/jobs", json={"account_id": owner_account["id"]}).json()
            assert member.get(f"/api/sync/jobs/{owner_job['id']}").status_code == 404
            assert member.post("/api/sync/jobs", json={"account_id": owner_account["id"]}).status_code == 404
            assert member.post(f"/api/owner/users/{user_id}/disable", json={"disabled": True}).status_code == 403
            body = {"owner_password": "synthetic-pass-1", "new_password": "password456"} if action == "reset-password" else {"disabled": True}
            response = owner.post(f"/api/owner/users/{user_id}/{action}", json=body)
            assert response.status_code == 200, response.text
            assert member.get("/api/accounts").status_code == 401
            with sqlite3.connect(tmp_path / "app.db") as conn:
                assert conn.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)).fetchone()[0] == "cancelled"
            time.sleep(0.6)
            assert not list((tmp_path / "users" / user_id / "accounts" / account_id / "sessions").glob("*.json"))
    finally:
        server.terminate()
        server.wait(timeout=10)



@pytest.mark.parametrize("phone, paused", [("9876543210", True), ("9876543211", False)])
def test_uvicorn_scheduled_expiry(tmp_path, phone, paused):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen(
        [sys.executable, str(Path(__file__).parent / "e2e_access" / "lifecycle_server.py"), str(tmp_path), str(port)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])},
    )
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as client:
            for _ in range(100):
                try:
                    client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]
                    break
                except httpx.TransportError:
                    time.sleep(0.1)
            else:
                raise AssertionError("server did not start")
            assert client.post("/api/owner/setup", json={"username": "owner", "password": "synthetic-pass-1", "adopt_data": False}).status_code == 200
            client.headers["X-CSRF-Token"] = client.cookies["csrf_token"]
            link = client.post("/api/accounts/link/start", json={"provider": "fake", "phone": phone})
            account = client.post("/api/accounts/link/verify", json={"handle": link.json()["handle"], "code": "123456"})
            assert account.status_code == 200
            job = client.post("/api/sync/jobs", json={"account_id": account.json()["id"], "mode": "all"}).json()
            url = f"/api/sync/jobs/{job['id']}"
            if paused:
                assert client.post(url + "/pause").json()["status"] == "paused"
            else:
                for _ in range(30):
                    state = client.get(url).json()["status"]
                    if state == "needs_code":
                        break
                    time.sleep(0.05)
                assert state == "needs_code"
                assert client.get(f"/api/test/key/{job['id']}").json()["held"]
            for _ in range(60):
                state = client.get(url).json()["status"]
                if state == "interrupted":
                    break
                time.sleep(0.05)
            assert state == "interrupted"
            assert not client.get(f"/api/test/key/{job['id']}").json()["held"]
    finally:
        server.terminate()
        server.wait(timeout=10)


def test_uvicorn_cancel_partial_import_and_resume_after_restart(tmp_path):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    def start_server():
        return subprocess.Popen(
            [sys.executable, str(Path(__file__).parent / "e2e_access" / "lifecycle_server.py"), str(tmp_path), str(port), "--shutdown-stdin"],
            stdin=subprocess.PIPE, text=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])},
        )
    def csrf(client):
        for _ in range(100):
            try:
                client.headers["X-CSRF-Token"] = client.get("/api/auth/csrf").json()["csrf_token"]
                return
            except httpx.TransportError:
                time.sleep(0.1)
        raise AssertionError("server did not start")
    server = start_server()
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as client:
            csrf(client)
            assert client.post("/api/owner/setup", json={"username": "owner", "password": "synthetic-pass-1", "adopt_data": False}).status_code == 200
            client.headers["X-CSRF-Token"] = client.cookies["csrf_token"]
            link = client.post("/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"})
            account = client.post("/api/accounts/link/verify", json={"handle": link.json()["handle"], "code": "123456"}).json()
            job = client.post("/api/sync/jobs", json={"account_id": account["id"], "mode": "all"}).json()
            url = f"/api/sync/jobs/{job['id']}"
            for _ in range(100):
                state = client.get(url).json()
                if state.get("page"):
                    break
                time.sleep(0.03)
            assert state.get("page")
            assert client.post(url + "/cancel").json()["status"] == "cancelled"
            # Windows terminate() hard-kills SQLite during WAL cleanup; drain before editing the upgrade fixture.
            server.communicate("shutdown\n", timeout=10)
            assert server.returncode == 0
            from food_khata.storage import read_json, save_json

            with closing(sqlite3.connect(tmp_path / "app.db")) as conn, conn:
                conn.execute("UPDATE jobs SET provider_id = ? WHERE id = ?", ("9876543210", job["id"]))
            archive_path = next(tmp_path.glob("users/*/accounts/*/zomato-history.json"))
            archive = read_json(archive_path)
            archive["provider_id"] = "9876543210"
            save_json(archive_path, archive)
            server = start_server()
            client.cookies.clear()
            csrf(client)
            login = client.post("/api/auth/login", json={"username": "owner", "password": "synthetic-pass-1"})
            assert login.status_code == 200
            client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
            from food_khata.storage import provider_identity

            assert read_json(archive_path)["provider_id"] == provider_identity("9876543210")
            with closing(sqlite3.connect(tmp_path / "app.db")) as conn, conn:
                assert conn.execute("SELECT provider_id FROM jobs WHERE id = ?", (job["id"],)).fetchone()[0] == provider_identity("9876543210")
            imported = client.post(url + "/use-partial")
            assert imported.status_code == 200, imported.text
            assert imported.json()["total"] > 0
            assert client.post(url + "/resume").status_code == 200
            for _ in range(100):
                state = client.get(url).json()
                if state["status"] in ("done", "failed"):
                    break
                time.sleep(0.05)
            assert state["status"] == "done", state
    finally:
        server.terminate()
        server.wait(timeout=10)
        server.stdin.close()
