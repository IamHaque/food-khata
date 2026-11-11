"""PR-09: complete wipe, remove user, hourly maintenance."""

import sqlite3
import time

import pytest
from fastapi.testclient import TestClient

from food_khata import maintenance
from food_khata.auth import connect_app_db, create_test_user_session, init_app_db
from food_khata.auth.passwords import hash_password
from food_khata.db import AnalyticsDB, delete_account_data
from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import authenticate_client, create_app


def _analytics(path):
    AnalyticsDB(path).init_db()
    c = sqlite3.connect(path)
    c.execute("INSERT INTO accounts (id, phone, local_id) VALUES ('a1', 'x', 'a1'), ('a2', 'x', 'a2')")
    c.execute("INSERT INTO restaurants (id, platform, platform_restaurant_id, name) VALUES ('r1', 'ZOMATO', '1', 'R1'), ('r2', 'ZOMATO', '2', 'R2')")
    c.execute("INSERT INTO delivery_addresses (id, full_address) VALUES ('d1', 'addr1'), ('d2', 'addr2')")
    for i, (acc, rest, addr) in enumerate((("a1", "r1", "d1"), ("a2", "r2", "d2"))):
        c.execute(
            "INSERT INTO orders (id, account_id, platform, platform_order_id, order_timestamp, order_date, order_time,"
            " order_status, restaurant_id, delivery_address_id, final_amount_paid) VALUES (?, ?, 'ZOMATO', ?, 't', 'd', 't', 'DELIVERED', ?, ?, 10)",
            (f"o{i}", acc, f"p{i}", rest, addr),
        )
        c.execute("INSERT INTO order_items (order_id, item_name) VALUES (?, 'x')", (f"o{i}",))
        c.execute("INSERT INTO quarantine (account_id, platform, reason, quarantined_at) VALUES (?, 'ZOMATO', 'r', 't')", (acc,))
        c.execute("INSERT INTO archive_imports VALUES (?, 'ZOMATO', 1, 1, 1, 1, 't')", (acc,))
    c.execute("INSERT INTO partial_import_receipts VALUES ('job1')")
    c.commit()
    return c


def _count(c, table):
    return c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_wipe_is_complete_and_rolls_back_on_failure(tmp_path):
    db = tmp_path / "u.db"
    c = _analytics(db)
    c.execute("ALTER TABLE quarantine RENAME TO quarantine_x")  # a failing step in the middle
    c.commit()
    with pytest.raises(sqlite3.OperationalError):
        delete_account_data(db, "a1", job_ids=["job1"])
    assert _count(c, "orders") == 2 and _count(c, "restaurants") == 2  # nothing half deleted
    c.execute("ALTER TABLE quarantine_x RENAME TO quarantine")
    c.commit()
    delete_account_data(db, "a1", job_ids=["job1"])
    for table, left in (("orders", 1), ("order_items", 1), ("quarantine", 1), ("archive_imports", 1),
                        ("restaurants", 1), ("delivery_addresses", 1), ("accounts", 1), ("partial_import_receipts", 0)):
        assert _count(c, table) == left, table


def _client(tmp_path):
    app = create_app(tmp_path / "d.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data")
    app.state.provider_factory = lambda p, phone=None, **kw: FakeProvider(provider=p, account_id=f"id-{phone}")
    return TestClient(app, base_url="http://127.0.0.1:8765"), app


def test_wipe_blocked_by_running_job_and_removes_folder(tmp_path):
    from food_khata.jobs.db import create_job
    from food_khata.users.context import user_database

    client, app = _client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    handle = client.post("/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"}).json()["handle"]
    account_id = client.post("/api/accounts/link/verify", json={"handle": handle, "code": "123456"}).json()["id"]
    user_dir = next((tmp_path / "data" / "users").iterdir())
    db = user_database(tmp_path / "data", user_dir.name)
    analytics = _analytics(db)
    analytics.execute("UPDATE accounts SET id = ?, local_id = ? WHERE id = 'a1'", (account_id, account_id))
    analytics.commit()
    analytics.close()
    create_job(tmp_path / "app.db", job_id="busy", user_id=user_dir.name, account_id=account_id, provider="zomato", status="running")
    res = client.post(f"/api/accounts/{account_id}/disconnect", json={"wipe_data": True})
    assert (res.status_code, res.json()["error"]["code"]) == (409, "ACCOUNT_BUSY")
    assert (user_dir / "accounts" / account_id).exists()
    jobs = sqlite3.connect(tmp_path / "app.db")
    jobs.execute("DELETE FROM jobs WHERE id = 'busy'")
    jobs.commit()
    jobs.close()
    assert client.post(f"/api/accounts/{account_id}/disconnect", json={"wipe_data": True}).status_code == 200
    assert not (user_dir / "accounts" / account_id).exists()
    assert not list(user_dir.glob(".deleting-*"))


def test_owner_removes_user(tmp_path):
    client, app = _client(tmp_path)
    authenticate_client(client, username="owner1", is_owner=True)
    create_test_user_session(tmp_path / "app.db", "bob", False)
    conn = connect_app_db(tmp_path / "app.db")
    bob = conn.execute("SELECT id FROM users WHERE username = 'bob'").fetchone()["id"]
    owner = conn.execute("SELECT id FROM users WHERE username = 'owner1'").fetchone()["id"]
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password("password123"), owner))
    conn.commit()
    bob_dir = tmp_path / "data" / "users" / bob
    bob_dir.mkdir(parents=True)
    (bob_dir / "x").write_text("data")
    body = {"owner_password": "password123"}
    assert client.post(f"/api/owner/users/{bob}/remove", json={"owner_password": "wrong"}).status_code == 403
    assert client.post(f"/api/owner/users/{owner}/remove", json=body).status_code == 400  # not yourself
    assert client.post(f"/api/owner/users/{bob}/remove", json=body).status_code == 200
    assert conn.execute("SELECT COUNT(*) FROM users WHERE id = ?", (bob,)).fetchone()[0] == 0
    assert not bob_dir.exists() and not list(bob_dir.parent.glob(".deleting-*"))
    assert conn.execute("SELECT COUNT(*) FROM sessions WHERE user_id = ?", (bob,)).fetchone()[0] == 0
    create_test_user_session(tmp_path / "app.db", "bob", False)  # the username can be reused


def test_maintenance_tasks(tmp_path, monkeypatch):
    db = tmp_path / "app.db"
    init_app_db(db)
    conn = connect_app_db(db)
    now = time.time()
    conn.execute("INSERT INTO users VALUES ('u', 'u', 'x', 0, 0, 'now')")
    conn.execute("INSERT INTO sessions VALUES ('old', 'u', 'c', ?, ?, ?)", (now - 99999, now - 99999, now - 1))
    conn.execute("INSERT INTO sessions VALUES ('new', 'u', 'c', ?, ?, ?)", (now, now, now + 999))
    conn.execute("INSERT INTO failed_logins (username, ip, attempted_at) VALUES ('u', 'i', ?)", (now - 2 * 86400,))
    conn.execute("INSERT INTO registration_attempts (ip, attempted_at) VALUES ('i', ?)", (now - 2 * 86400,))
    conn.execute("INSERT INTO jobs (id, user_id, account_id, provider, status, created_at, updated_at) VALUES ('j', 'u', 'a', 'zomato', 'done', 1, 1)")
    conn.execute("INSERT INTO job_events (job_id, status, created_at) VALUES ('j', 'done', ?)", (now - 8 * 86400,))
    conn.commit()
    assert maintenance.delete_expired_sessions(conn) == 1
    assert maintenance.prune_attempts(conn) == 2
    assert maintenance.prune_job_events(conn) == 1
    assert maintenance.prune_old_jobs(conn) == 1
    assert [r[0] for r in conn.execute("SELECT id FROM sessions")] == ["new"]
    # deletes run in chunks, never one big transaction
    monkeypatch.setattr(maintenance, "CHUNK", 10)
    conn.executemany("INSERT INTO failed_logins (username, ip, attempted_at) VALUES ('u', 'i', 1)", [()] * 35)
    conn.commit()
    assert maintenance.prune_attempts(conn) == 35
    assert set(maintenance.run_once(db)) == {t.__name__ for t in maintenance.TASKS}
