"""PR-16: one server per folder, readiness, env config, JSON logs, backup and restore, purge-fake."""

import argparse
import json
import logging
import socket
import subprocess
import sys
import tarfile
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from food_khata import logging as fk_logging
from food_khata.backup import backup, restore
from food_khata.cli import main as cli_main
from food_khata.config import apply_env_defaults, describe
from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import create_app

ROOT = Path(__file__).resolve().parents[1]
PW = "synthetic-pass-14"


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_second_server_on_the_same_folder_exits_with_code_2(tmp_path):
    port = _free_port()
    cmd = [sys.executable, "-m", "food_khata", "serve", "--data-dir", str(tmp_path)]
    first = subprocess.Popen([*cmd, "--port", str(port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                if httpx.get(f"http://127.0.0.1:{port}/health").status_code == 200:
                    break
            except httpx.TransportError:
                time.sleep(0.1)
        second = subprocess.run([*cmd, "--port", str(_free_port())], cwd=ROOT, capture_output=True, text=True, timeout=30)
        assert second.returncode == 2 and "already using this data folder" in second.stdout
        assert httpx.get(f"http://127.0.0.1:{port}/health/ready").status_code == 200  # ready, with no counts or names
        assert httpx.get(f"http://127.0.0.1:{port}/health/ready").json() == {"status": "ready"}
    finally:
        first.terminate()
        first.wait(timeout=15)
    again = subprocess.Popen([*cmd, "--port", str(_free_port())], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    assert again.poll() is None  # the lock was released when the first process died
    again.terminate()
    again.wait(timeout=15)


def test_readiness_needs_the_maintenance_thread(tmp_path):
    app = create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "d")
    assert TestClient(app, base_url="http://127.0.0.1").get("/health/ready").status_code == 503  # not started
    with TestClient(app, base_url="http://127.0.0.1") as client:
        assert client.get("/health/ready").json() == {"status": "ready"}


def test_environment_variables_and_print_config(monkeypatch, capsys):
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--lan", action="store_true")
    parser.add_argument("--allow-host", dest="allow_hosts", action="append", default=[])
    parser.add_argument("--tls-key", default=None)
    monkeypatch.setenv("FOOD_KHATA_PORT", "9000")
    monkeypatch.setenv("FOOD_KHATA_LAN", "yes")
    monkeypatch.setenv("FOOD_KHATA_ALLOW_HOSTS", "a.lan,b.lan")
    monkeypatch.setenv("FOOD_KHATA_TLS_KEY", "/secret/key.pem")
    apply_env_defaults(parser)
    args = parser.parse_args([])
    assert (args.port, args.lan, args.allow_hosts) == (9000, True, ["a.lan", "b.lan"])
    assert parser.parse_args(["--port", "9100"]).port == 9100  # a flag wins over the environment
    assert "/secret/key.pem" not in describe(args) and "tls_key = (hidden)" in describe(args)
    assert cli_main(["serve", "--print-config", "--port", "9200"]) == 0
    assert "port = 9200" in capsys.readouterr().out


def test_json_logs_are_redacted_and_rotate(tmp_path):
    path = fk_logging.setup_logging(tmp_path)
    handler = logging.getLogger().handlers[-1]
    try:
        assert (handler.maxBytes, handler.backupCount) == (10 * 1024 * 1024, 5)
        token = fk_logging.request_id.set("abc123")
        logging.getLogger("t").error("login failed password=hunter2 phone 9876543210 token: abcdef")
        fk_logging.request_id.reset(token)
        handler.flush()
        line = json.loads(path.read_text().splitlines()[-1])
        assert line["level"] == "ERROR" and line["request_id"] == "abc123" and "user_id" in line
        assert "hunter2" not in line["message"] and "9876543210" not in line["message"] and "abcdef" not in line["message"]
    finally:
        logging.getLogger().removeHandler(handler)
        handler.close()


def _data_with_account(tmp_path, fake=False):
    app = create_app(tmp_path / "o.db", data_root=tmp_path / "data")
    app.state.provider_factory = lambda p, phone=None, **k: FakeProvider(provider=p, account_id="id-1")
    c = TestClient(app, base_url="http://127.0.0.1:8765")
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    assert c.post("/api/owner/setup", json={"username": "owner1", "password": PW}).status_code == 200
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    handle = c.post("/api/accounts/link/start", json={"provider": "fake" if fake else "zomato", "phone": "9876543210"}).json()["handle"]
    account = c.post("/api/accounts/link/verify", json={"handle": handle, "code": "123456"}).json()["id"]
    return app, c, account


def test_backup_then_restore_reproduces_the_data_and_login(tmp_path):
    app, c, account = _data_with_account(tmp_path)
    out = tmp_path / "b.tar.gz"
    manifest = backup(tmp_path / "data", out)  # the server is still running
    assert "NOT encrypted" in manifest["note"] and any(f.endswith("app.db") for f in manifest["files"])
    target = tmp_path / "restored"
    assert restore(out, target) == len(manifest["files"])
    app2 = create_app(tmp_path / "o2.db", data_root=target)
    c2 = TestClient(app2, base_url="http://127.0.0.1:8765")
    c2.headers["X-CSRF-Token"] = c2.get("/api/auth/csrf").json()["csrf_token"]
    assert c2.post("/api/auth/login", json={"username": "owner1", "password": PW}).status_code == 200
    c2.headers["X-CSRF-Token"] = c2.get("/api/auth/csrf").json()["csrf_token"]
    assert [a["local_id"] for a in c2.get("/api/accounts").json()] == [account]  # the encrypted account is readable again
    with pytest.raises(ValueError, match="not empty"):
        restore(out, target)  # a non-empty folder is refused


def test_damaged_backup_is_refused(tmp_path):
    _data_with_account(tmp_path)
    out = tmp_path / "b.tar.gz"
    backup(tmp_path / "data", out)
    bad = tmp_path / "bad.tar.gz"
    with tarfile.open(out) as src, tarfile.open(bad, "w:gz") as dst:
        for member in src.getmembers():
            data = src.extractfile(member) if member.isfile() else None
            if member.name.endswith("app.db"):
                member.size += 1
                import io
                data = io.BytesIO(data.read() + b"x")
            dst.addfile(member, data)
    with pytest.raises(ValueError, match="damaged"):
        restore(bad, tmp_path / "r2")


def test_purge_fake_removes_only_fake_accounts(tmp_path, monkeypatch):
    monkeypatch.setenv("FOOD_KHATA_ENABLE_FAKE_PROVIDER", "1")
    app, c, account = _data_with_account(tmp_path, fake=True)
    folder = next((tmp_path / "data").glob(f"users/*/accounts/{account}"))
    assert cli_main(["purge-fake", "--data-dir", str(tmp_path / "data"), "--yes"]) == 0
    assert not folder.exists()
    assert cli_main(["purge-fake", "--data-dir", str(tmp_path / "data"), "--yes"]) == 0  # nothing left to remove
