import shutil
import sqlite3

import pytest

from food_khata.auth.sessions import create_test_user_session, init_app_db
from food_khata.jobs.db import create_job, get_job
from food_khata.storage import Storage, provider_identity, read_json, save_json
from food_khata.users.context import UserContext


def test_existing_identifiers_retry_and_disk_scan(tmp_path, monkeypatch):
    import food_khata.storage as storage_module

    phone = "9876543210"
    token = "synthetic-credential-token"
    legacy = Storage(tmp_path)
    account = legacy.bind(phone, "fake", phone)
    legacy.save_session(account["local_id"], "fake", {"token": token})
    archive_path = legacy.account_path(account["local_id"]) / "fake-history.json"
    archive = {"version": 1, "provider": "fake", "provider_id": phone,
               "orders": {"1": {"history": {"id": "1", "phone": phone}}}}
    save_json(archive_path, archive)
    app_db = tmp_path / "app.db"
    init_app_db(app_db)
    create_test_user_session(app_db, username="owner", is_owner=True)
    with sqlite3.connect(app_db) as conn:
        user_id = conn.execute("SELECT id FROM users").fetchone()[0]
    create_job(app_db, job_id="old", user_id=user_id, account_id=account["local_id"],
               provider="fake", provider_id=phone, status="cancelled")
    backup = tmp_path / "legacy-backup"
    shutil.copytree(legacy.accounts_dir, backup / "accounts")
    with sqlite3.connect(app_db) as source, sqlite3.connect(backup / "app.db") as dest:
        source.backup(dest)
    init_app_db(app_db)
    init_app_db(app_db)
    assert get_job(app_db, "old")["provider_id"] == provider_identity(phone)

    context = UserContext(tmp_path, user_id).unlock("synthetic-pass-1")
    original = storage_module.save_json
    def fail_header(path, value):
        if path.name == "fake-history.json":
            raise OSError("interrupted migration")
        original(path, value)
    with monkeypatch.context() as patch:
        patch.setattr(storage_module, "save_json", fail_header)
        with pytest.raises(OSError, match="interrupted"):
            context.adopt_legacy_root()
    context = UserContext(tmp_path, user_id).unlock("synthetic-pass-1")
    context = UserContext(tmp_path, user_id).unlock("synthetic-pass-1")
    assert get_job(backup / "app.db", "old")["provider_id"] == provider_identity(phone)
    assert context.storage.accounts("fake")[0]["providers"]["fake"] == phone
    assert context.storage.session(account["local_id"], "fake")["token"] == token
    for path in tmp_path.rglob("*"):
        if not path.is_file():
            continue
        raw = path.read_bytes()
        if path.name == "fake-history.json":
            result = read_json(path)
            assert result["provider_id"] == provider_identity(phone)
            assert result["orders"] == archive["orders"]
            assert token.encode() not in raw
        else:
            assert phone.encode() not in raw, str(path)
            assert token.encode() not in raw, str(path)
