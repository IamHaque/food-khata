"""Gate GC independent review: regression tests for the findings that were fixed."""

import os

import pytest
from fastapi.testclient import TestClient

from food_khata.auth import connect_app_db
from food_khata.serve.app import create_app
from food_khata.storage import Storage

PW = "synthetic-pass-14"


def _app(tmp_path, **kw):
    return create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data", **kw)


def test_adoption_never_moves_runtime_files(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    for name in (".server.lock", ".deleting-abc", "app.db.pre-v1.bak", "logs"):
        (root / name).mkdir() if name in (".deleting-abc", "logs") else (root / name).write_text("x")
    (root / "accounts").mkdir()
    assert [p.name for p in Storage(root)._legacy_entries()] == ["accounts"]


def test_loopback_does_not_count_when_it_is_the_trusted_proxy(tmp_path):
    body = {"username": "owner1", "password": PW}
    behind = TestClient(_app(tmp_path / "a", trusted_proxy="127.0.0.1"), base_url="http://127.0.0.1:8765", client=("127.0.0.1", 5000))
    behind.headers["X-CSRF-Token"] = behind.get("/api/auth/csrf").json()["csrf_token"]
    assert behind.post("/api/owner/setup", json=body).status_code == 403  # a remote caller via the proxy needs the setup code
    direct = TestClient(_app(tmp_path / "b"), base_url="http://127.0.0.1:8765", client=("127.0.0.1", 5000))
    direct.headers["X-CSRF-Token"] = direct.get("/api/auth/csrf").json()["csrf_token"]
    assert direct.post("/api/owner/setup", json=body).status_code == 200  # a real local caller still can


def test_body_of_unknown_size_is_refused(tmp_path):
    c = TestClient(_app(tmp_path), base_url="http://127.0.0.1:8765")
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    res = c.post("/api/auth/login", content=iter([b'{"username":"a",', b'"password":"b"}']), headers={"content-type": "application/json"})
    assert res.status_code == 411


def test_remove_user_waits_for_running_job_and_keeps_the_folder(tmp_path, monkeypatch):
    from food_khata.auth import init_app_db
    from food_khata.auth.owner import remove_user
    from food_khata.auth.passwords import hash_password
    from food_khata.jobs.runner import JobControl

    init_app_db(tmp_path / "app.db")
    conn = connect_app_db(tmp_path / "app.db")
    conn.execute("INSERT INTO users VALUES ('o', 'owner1', ?, 1, 0, 'now')", (hash_password(PW),))
    conn.execute("INSERT INTO users VALUES ('u', 'bob', 'x', 0, 0, 'now')")
    conn.execute("INSERT INTO jobs (id, user_id, account_id, provider, status, created_at, updated_at) VALUES ('j', 'u', 'a', 'zomato', 'running', 1, 1)")
    conn.commit()
    (tmp_path / "data" / "users" / "u").mkdir(parents=True)
    monkeypatch.setattr(JobControl, "cancel_user", staticmethod(lambda *a, **k: 0))
    monkeypatch.setattr("food_khata.auth.owner.time.sleep", lambda s: None)
    with pytest.raises(ValueError, match="has not stopped"):
        remove_user(conn, "u", "o", PW, tmp_path / "data")
    assert (tmp_path / "data" / "users" / "u").exists()  # nothing was moved or deleted


def test_account_id_from_a_request_cannot_walk_paths(tmp_path):
    from food_khata.serve.routes_accounts import _get_account_meta

    assert _get_account_meta(Storage(tmp_path), "../../etc") is None


def test_backup_file_is_private(tmp_path):
    from food_khata.backup import backup

    (tmp_path / "d").mkdir()
    (tmp_path / "d" / "x.json").write_text("{}")
    backup(tmp_path / "d", tmp_path / "b.tar.gz")
    assert oct(os.stat(tmp_path / "b.tar.gz").st_mode & 0o777) == "0o600"
