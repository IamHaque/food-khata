"""Tests for AC-08 per-user folders, adoption, and encryption at rest."""

import json
import os
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from food_khata.auth import connect_app_db
from food_khata.contracts import KhataError
from food_khata.db import AnalyticsDB
from food_khata.serve.app import authenticate_client, create_app
from food_khata.storage import Storage
from food_khata.users import (
    UserContext,
    UserVault,
    WrongPassword,
    user_database,
    user_root,
)
from food_khata.users.aead import decrypt, encrypt

# RFC 8439 section 2.8.2 test vector.
RFC_KEY = bytes.fromhex(
    "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f"
)
RFC_NONCE = bytes.fromhex("070000004041424344454647")
RFC_AAD = bytes.fromhex("50515253c0c1c2c3c4c5c6c7")
RFC_PLAINTEXT = (
    b"Ladies and Gentlemen of the class of '99: If I could offer you only one "
    b"tip for the future, sunscreen would be it."
)
RFC_SEALED = bytes.fromhex(
    "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6"
    "3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36"
    "92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc"
    "3ff4def08e4b7a9de576d26586cec64b6116"
    "1ae10b594f09e26a7e902ecbd0600691"
)


def test_chacha20poly1305_matches_rfc_vector():
    assert encrypt(RFC_KEY, RFC_NONCE, RFC_PLAINTEXT, RFC_AAD) == RFC_SEALED
    assert decrypt(RFC_KEY, RFC_NONCE, RFC_SEALED, RFC_AAD) == RFC_PLAINTEXT
    tampered = RFC_SEALED[:-1] + bytes([RFC_SEALED[-1] ^ 1])
    with pytest.raises(KhataError):
        decrypt(RFC_KEY, RFC_NONCE, tampered, RFC_AAD)


def test_user_context_paths_and_folder_mode(tmp_path):
    context = UserContext(tmp_path, "user-a")
    assert context.root == tmp_path / "users" / "user-a"
    assert context.db_path == context.root / "food_analytics.db"
    assert user_root(tmp_path, "user-a") == context.root
    assert user_database(tmp_path, "user-a") == context.db_path

    context.unlock("correct horse battery staple")
    assert context.root.is_dir()
    if os.name != "nt":
        assert context.root.stat().st_mode & 0o777 == 0o700

    for bad in ("../escape", "a/b", "..", ".", "", None):
        with pytest.raises(KhataError):
            UserContext(tmp_path, bad)


def test_plaintext_sessions_and_phones_encrypt_on_first_unlock(tmp_path):
    root = user_root(tmp_path, "user-a")
    plaintext = Storage(root)
    account = plaintext.bind("9876543210", "zomato", "zid")
    plaintext.save_session(
        account["local_id"], "zomato", {"access_token": "TOKEN-SENTINEL"}
    )
    account_file = root / "accounts" / account["local_id"] / "account.json"
    session_file = root / "accounts" / account["local_id"] / "sessions" / "zomato.json"
    assert "9876543210" in account_file.read_text(encoding="utf-8")
    assert "TOKEN-SENTINEL" in session_file.read_text(encoding="utf-8")

    context = UserContext(tmp_path, "user-a").unlock("hunter2")
    assert "9876543210" not in account_file.read_text(encoding="utf-8")
    assert "TOKEN-SENTINEL" not in session_file.read_text(encoding="utf-8")
    assert context.storage.session(account["local_id"], "zomato") == {
        "access_token": "TOKEN-SENTINEL"
    }
    listed = context.storage.accounts("zomato", include_unauthenticated=True)
    assert listed[0]["phone"] == "9876543210"

    # Wrong password fails closed and never falls back to plaintext.
    with pytest.raises(WrongPassword):
        UserContext(tmp_path, "user-a").unlock("wrong password")
    assert isinstance(UserVault.load(root).metadata, dict)


def test_password_change_rewraps_but_reset_wipes_sessions(tmp_path):
    context = UserContext(tmp_path, "user-a").unlock("old-password")
    account = context.storage.bind("9876543210", "zomato", "zid")
    context.storage.save_session(
        account["local_id"], "zomato", {"access_token": "KEEP-ME"}
    )

    context.change_password("old-password", "new-password")
    with pytest.raises(WrongPassword):
        UserContext(tmp_path, "user-a").unlock("old-password")

    unlocked = UserContext(tmp_path, "user-a").unlock("new-password")
    assert unlocked.storage.session(account["local_id"], "zomato") == {
        "access_token": "KEEP-ME"
    }

    unlocked.reset_password()
    assert unlocked.storage.session(account["local_id"], "zomato") is None
    assert unlocked.storage.accounts("zomato") == []

    # A reset that also rotates the key cannot decrypt old sessions.
    unlocked.storage.save_session(
        account["local_id"], "zomato", {"access_token": "GONE"}
    )
    unlocked.reset_password("reset-password")
    assert not (
        context.root / "accounts" / account["local_id"] / "sessions" / "zomato.json"
    ).exists()
    with pytest.raises(WrongPassword):
        UserContext(tmp_path, "user-a").unlock("new-password")
    UserContext(tmp_path, "user-a").unlock("reset-password")


def test_adopt_legacy_root_moves_data_and_is_idempotent(tmp_path):
    legacy = Storage(tmp_path)
    account = legacy.bind("9876543210", "swiggy", "sid")
    legacy.save_session(account["local_id"], "swiggy", {"cookie": "value"})
    (tmp_path / "food_analytics.db").write_bytes(b"legacy database")
    (tmp_path / "dashboard.json").write_text('{"accounts": []}', encoding="utf-8")

    result = legacy.adopt_legacy_root("user-a")
    assert result["adopted"] is True
    destination = tmp_path / "users" / "user-a"
    assert (
        destination / "accounts" / account["local_id"] / "account.json"
    ).is_file()
    assert (destination / "food_analytics.db").read_bytes() == b"legacy database"
    backup = Path(result["backup"])
    assert backup.is_dir()
    assert (backup / "food_analytics.db").read_bytes() == b"legacy database"
    assert not (tmp_path / "food_analytics.db").exists()
    marker = destination / ".adopted.json"
    assert json.loads(marker.read_text(encoding="utf-8"))["user_id"] == "user-a"

    before = {str(path): path.stat().st_mtime_ns for path in tmp_path.rglob("*")}
    second = legacy.adopt_legacy_root("user-a")
    after = {str(path): path.stat().st_mtime_ns for path in tmp_path.rglob("*")}
    assert second["adopted"] is False
    assert before == after


def _seed_database(path: Path, account_id: str, phone: str, orders: int) -> None:
    AnalyticsDB(path).init_db()
    with sqlite3.connect(path) as conn:
        conn.execute(
            "INSERT INTO accounts (id, phone, local_id) VALUES (?, ?, ?)",
            (account_id, phone, account_id),
        )
        for index in range(orders):
            conn.execute(
                """INSERT INTO orders (
                    id, account_id, platform, platform_order_id, order_timestamp,
                    order_date, order_time, order_status, final_amount_paid
                ) VALUES (?, ?, 'SWIGGY', ?, ?, ?, ?, 'DELIVERED', ?)""",
                (
                    f"{account_id}-{index}",
                    account_id,
                    str(index),
                    "2025-01-04T10:00:00+05:30",
                    "2025-01-04",
                    "10:00:00",
                    100.0 + index,
                ),
            )
        conn.commit()


def _session_user_id(app, session_id: str) -> str:
    conn = connect_app_db(app.state.app_db_path)
    try:
        row = conn.execute(
            "SELECT user_id FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        assert row is not None
        return row["user_id"]
    finally:
        conn.close()


def test_dashboard_is_isolated_and_cache_is_keyed_by_user(tmp_path):
    data_root = tmp_path / "data"
    data_root.mkdir()
    app = create_app(tmp_path / "unused.db", data_root=data_root)

    alice = TestClient(app, base_url="http://127.0.0.1")
    alice_session, _ = authenticate_client(alice, username="alice")
    alice_id = _session_user_id(app, alice_session)
    alice_db = user_database(data_root, alice_id)
    alice_db.parent.mkdir(parents=True, exist_ok=True)
    _seed_database(alice_db, "acct-a", "9000000001", 1)

    bob = TestClient(app, base_url="http://127.0.0.1")
    bob_session, _ = authenticate_client(bob, username="bob")
    bob_id = _session_user_id(app, bob_session)
    bob_db = user_database(data_root, bob_id)
    bob_db.parent.mkdir(parents=True, exist_ok=True)
    _seed_database(bob_db, "acct-b", "9000000002", 2)
    assert alice_id != bob_id

    alice_options = alice.get("/api/meta/filters").json()
    assert [account["id"] for account in alice_options["all_accounts"]] == ["acct-a"]
    assert alice.post("/api/dashboard", json={}).json()["kpis"]["orders"] == 1

    bob_options = bob.get("/api/meta/filters").json()
    assert [account["id"] for account in bob_options["all_accounts"]] == ["acct-b"]
    assert bob.post("/api/dashboard", json={}).json()["kpis"]["orders"] == 2

    # The cache entry for Alice is untouched by Bob's request.
    assert alice.post("/api/dashboard", json={}).json()["kpis"]["orders"] == 1

    # Client-supplied ids or paths never change which database is selected.
    injected = alice.get(
        "/api/meta/filters", params={"user_id": bob_id, "db_path": str(bob_db)}
    ).json()
    assert [account["id"] for account in injected["all_accounts"]] == ["acct-a"]

    # A user without their own database gets 503, never another user's data.
    charlie = TestClient(app, base_url="http://127.0.0.1")
    authenticate_client(charlie, username="charlie")
    missing = charlie.get("/api/meta/filters")
    assert missing.status_code == 503
    assert missing.json()["error"]["code"] == "database_not_found"
