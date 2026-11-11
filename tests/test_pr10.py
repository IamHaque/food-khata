"""PR-10: migrations, atomic owner claim, provider exclusivity, bounded login handles, lock order."""

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from food_khata.auth import connect_app_db, init_app_db
from food_khata.auth.owner import OwnerAlreadyExistsError, claim_owner, transfer_ownership
from food_khata.migrations import MIGRATIONS, run_migrations
from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import authenticate_client, create_app
from food_khata.services.linking import MAX_PENDING_PER_USER, LinkingService
from food_khata.storage import Storage


def test_migrations_run_once_back_up_and_roll_back(tmp_path, monkeypatch):
    db = tmp_path / "app.db"
    init_app_db(db)
    conn = connect_app_db(db)
    conn.execute("INSERT INTO users VALUES ('u1', 'alice', 'x', 1, 0, 'now')")
    conn.execute("DELETE FROM schema_migrations")
    conn.execute("DROP INDEX idx_one_owner")
    conn.execute("DROP TABLE provider_links")
    conn.commit()
    run_migrations(db)
    assert [r[0] for r in conn.execute("SELECT version FROM schema_migrations ORDER BY 1")] == [1, 2, 4]
    assert (tmp_path / "app.db.pre-v1.bak").is_file()  # existing data is backed up first
    run_migrations(db)  # idempotent
    assert conn.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0] == 3

    def boom(c, root):
        c.execute("CREATE TABLE half_done (x)")
        raise RuntimeError("boom")

    monkeypatch.setattr("food_khata.migrations.MIGRATIONS", [*MIGRATIONS, (9, boom, False)])
    with pytest.raises(RuntimeError):
        run_migrations(db)
    assert conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'half_done'").fetchone() is None
    assert conn.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0] == 3


def test_twenty_simultaneous_claims_make_one_owner(tmp_path):
    db = tmp_path / "app.db"
    init_app_db(db)
    results = []

    def claim(i):
        conn = connect_app_db(db)
        try:
            claim_owner(conn, f"user{i:02d}", "synthetic-pass-1", True)
            return "won"
        except OwnerAlreadyExistsError:
            return "lost"
        finally:
            conn.close()

    with ThreadPoolExecutor(20) as pool:
        results = list(pool.map(claim, range(20)))
    assert results.count("won") == 1 and results.count("lost") == 19
    assert (
        connect_app_db(db).execute("SELECT COUNT(*) FROM users WHERE is_owner = 1").fetchone()[0]
        == 1
    )


def test_transfer_swaps_in_one_step_and_refuses_disabled(tmp_path):
    db = tmp_path / "app.db"
    init_app_db(db)
    conn = connect_app_db(db)
    conn.executemany(
        "INSERT INTO users VALUES (?, ?, 'x', ?, ?, 'now')",
        [("o", "owner1", 1, 0), ("a", "active1", 0, 0), ("d", "disabled1", 0, 1)],
    )
    conn.commit()
    with pytest.raises(ValueError, match="disabled"):
        transfer_ownership(conn, "o", "disabled1")
    assert transfer_ownership(conn, "o", "active1")["new_owner_id"] == "a"
    assert [r[0] for r in conn.execute("SELECT id FROM users WHERE is_owner = 1")] == ["a"]


def _client(tmp_path):
    app = create_app(
        tmp_path / "d.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data"
    )
    # one shared provider identity for every phone, so two users can race for the same provider account
    app.state.provider_factory = lambda p, phone=None: FakeProvider(
        provider=p, account_id="shared-identity"
    )
    return TestClient(app, base_url="http://127.0.0.1:8765"), app


def test_same_provider_account_gives_one_success_and_one_409(tmp_path):
    _, app = _client(tmp_path)
    users = []
    for name, owner in (("alice", True), ("bob", False)):
        c = TestClient(app, base_url="http://127.0.0.1:8765")
        authenticate_client(c, username=name, is_owner=owner)
        handle = c.post(
            "/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"}
        ).json()["handle"]
        users.append((c, handle))
    barrier = threading.Barrier(2)

    def verify(pair):
        c, handle = pair
        barrier.wait()
        return c.post("/api/accounts/link/verify", json={"handle": handle, "code": "123456"})

    with ThreadPoolExecutor(2) as pool:
        codes = sorted(r.status_code for r in pool.map(verify, users))
    assert codes == [200, 409]


def test_provider_link_freed_on_disconnect_and_backfilled(tmp_path):
    c, app = _client(tmp_path)
    authenticate_client(c, username="alice", is_owner=True)
    handle = c.post(
        "/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"}
    ).json()["handle"]
    local_id = c.post(
        "/api/accounts/link/verify", json={"handle": handle, "code": "123456"}
    ).json()["id"]
    conn = connect_app_db(tmp_path / "app.db")
    assert conn.execute("SELECT account_id FROM provider_links").fetchone()[0] == local_id
    assert c.post(f"/api/accounts/{local_id}/disconnect", json={}).status_code == 200
    assert conn.execute("SELECT COUNT(*) FROM provider_links").fetchone()[0] == 0
    # startup backfill rebuilds a missing row from the account folders
    handle = c.post(
        "/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"}
    ).json()["handle"]
    c.post("/api/accounts/link/verify", json={"handle": handle, "code": "123456"})
    conn.execute("DELETE FROM provider_links")
    conn.execute("DELETE FROM schema_migrations WHERE version = 3")
    conn.commit()
    create_app(tmp_path / "d.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data")
    assert conn.execute("SELECT COUNT(*) FROM provider_links").fetchone()[0] == 1


def test_login_handles_are_bounded_and_swept(tmp_path):
    svc = LinkingService(Storage(tmp_path))
    fake = lambda: FakeProvider(provider="zomato", account_id=str(uuid.uuid4()))  # noqa: E731
    for _ in range(MAX_PENDING_PER_USER):
        svc.start_login(fake(), "9876543210", user="u1")
    with pytest.raises(Exception, match="Too many"):
        svc.start_login(fake(), "9876543210", user="u1")
    svc.start_login(fake(), "9876543210", user="u2")  # another user is unaffected
    for entry in svc._handles.values():
        entry.expires_at = 0
    svc.sweep()
    assert svc._handles == {}


def test_storage_locks_have_one_order(tmp_path):
    """bind (account lock) and save_session (credential lock) from two threads never deadlock."""
    storage = Storage(tmp_path)
    errors = []

    def bind():
        for _ in range(30):
            storage.bind("9876543210", "zomato", "id-1")

    def sessions():
        local = storage.bind("9876543211", "swiggy", "id-2")["local_id"]
        for i in range(30):
            storage.save_session(local, "swiggy", {"i": i})

    threads = [threading.Thread(target=f) for f in (bind, sessions)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=20)
    assert not any(t.is_alive() for t in threads) and not errors
