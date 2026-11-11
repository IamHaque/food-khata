"""PR-08: incremental import re-reads changed orders; import is a visible stage; retry is idempotent."""

import copy
import time

import pytest

from food_khata.db import AnalyticsDB
from food_khata.storage import Storage, read_json, save_json

ACC = "00000000-0000-0000-0000-000000000001"


def _swiggy_order(status="Delivered", items=("Coffee",), day="2026-10-10"):
    return {
        "history": {"orderStatus": status, "orderTotal": 100},
        "details": {"orders": [{
            "order_id": "ord1", "order_status": status, "order_total": 100, "order_time": f"{day} 12:00:00",
            "restaurant_name": "Test Cafe",
            "order_items": [{"name": n, "quantity": 1, "final_price": 100} for n in items],
        }]},
    }


def _setup(tmp_path, order):
    storage = Storage(tmp_path / "storage")
    acc = storage.account_path(ACC)
    acc.mkdir(parents=True)
    save_json(acc / "account.json", {"version": 1, "local_id": ACC, "phone": "9876543210", "providers": {"swiggy": "sw1"}})
    archive = {"version": 1, "provider": "swiggy", "provider_id": "sw1", "orders": {"ord1": order},
               "history_complete": True, "details_complete": True, "complete": True, "lifetime_complete": True,
               "pages": 1, "errors": [], "counts": {"orders": 1}}
    save_json(acc / "swiggy-history.json", archive)
    return storage, acc, archive


def _items(db):
    with db.connection() as conn:
        return [r[0] for r in conn.execute("SELECT item_name FROM order_items ORDER BY item_name")]


def test_changed_orders_are_updated_unchanged_are_skipped(tmp_path):
    history_only = {"history": {"orderStatus": "Delivered", "orderTotal": 100}}
    storage, acc, archive = _setup(tmp_path, history_only)
    db = AnalyticsDB(tmp_path / "a.db")
    assert db.ingest_account(storage, ACC)["total"] == 1 and _items(db) == []
    assert db.ingest_account(storage, ACC)["total"] == 0  # unchanged: skipped, second run reports 0 changes
    archive["orders"]["ord1"] = _swiggy_order()  # a later sync adds the details
    save_json(acc / "swiggy-history.json", archive)
    assert db.ingest_account(storage, ACC)["total"] == 1 and _items(db) == ["Coffee"]  # was ignored before PR-08
    archive["orders"]["ord1"] = _swiggy_order(items=("Coffee", "Tea"))
    save_json(acc / "swiggy-history.json", archive)
    db.ingest_account(storage, ACC)
    assert _items(db) == ["Coffee", "Tea"]
    with db.connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 1  # never duplicated


def test_open_orders_are_listed_for_refresh(tmp_path):
    today = time.strftime("%Y-%m-%d")
    storage, acc, archive = _setup(tmp_path, _swiggy_order(status="Preparing", day=today))
    db = AnalyticsDB(tmp_path / "a.db")
    db.ingest_account(storage, ACC)
    assert db.open_order_ids(ACC, "swiggy") == ["ord1"]
    archive["orders"]["ord1"] = _swiggy_order(status="Delivered", day=today)
    save_json(acc / "swiggy-history.json", archive)
    db.ingest_account(storage, ACC)
    assert db.open_order_ids(ACC, "swiggy") == []


def test_sync_refetches_listed_orders_once(tmp_path):
    from food_khata.providers.fake import FakeProvider
    from food_khata.services.sync import sync

    path = tmp_path / "fake-history.json"
    provider = FakeProvider(provider="zomato", account_id="x")
    sync(provider=provider, path=path, provider_id=provider.profile(), mode="all")
    archive = read_json(path)
    first = next(iter(archive["orders"]))
    archive["refresh_ids"] = [first]
    save_json(path, archive)
    calls = []
    original = provider.details
    provider.details = lambda oid: (calls.append(oid), original(oid))[1]
    sync(provider=provider, path=path, provider_id=provider.profile(), mode="new")
    assert calls == [first] and read_json(path)["refresh_ids"] == []


def test_import_failure_is_visible_and_retry_is_idempotent(tmp_path, monkeypatch):
    from food_khata.auth import init_app_db
    from food_khata.jobs.db import create_job, get_job
    from food_khata.jobs.runner import JobControl, JobRunner
    from food_khata.serve.schemas_sync import SyncJobResponse
    from food_khata.users.context import UserContext

    app_db, root = tmp_path / "app.db", tmp_path / "data"
    init_app_db(app_db)
    import sqlite3

    c = sqlite3.connect(app_db)
    c.execute("INSERT INTO users VALUES ('u1', 'u1', 'x', 1, 0, 'now')")
    c.commit()
    ctx = UserContext(root, "u1").initialize("password-12345")
    acc = ctx.storage.bind("9876543210", "swiggy", "sw1")["local_id"]
    save_json(ctx.storage.account_path(acc) / "swiggy-history.json", {
        "version": 1, "orders": {"ord1": _swiggy_order()}, "history_complete": True, "details_complete": True,
        "complete": True, "lifetime_complete": True, "pages": 1, "errors": [], "counts": {}})
    create_job(app_db, job_id="j1", user_id="u1", account_id=acc, provider="swiggy", status="failed")
    c.execute("UPDATE jobs SET error_code = 'IMPORT_FAILED' WHERE id = 'j1'")
    c.commit()
    control = JobControl(app_db, data_root=root, runner=JobRunner(app_db, data_root=root))
    assert SyncJobResponse(**get_job(app_db, "j1")).import_pending

    real = AnalyticsDB.ingest_account
    monkeypatch.setattr(AnalyticsDB, "ingest_account", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("disk")))
    with pytest.raises(Exception, match="Import failed again"):
        control.retry_import("j1", user_id="u1")
    assert get_job(app_db, "j1")["status"] == "failed"  # still failed, never "complete"
    monkeypatch.setattr(AnalyticsDB, "ingest_account", real)
    assert control.retry_import("j1", user_id="u1")["status"] == "done"
    db = AnalyticsDB(root / "users" / "u1" / "food_analytics.db")
    again = copy.deepcopy(db.ingest_account(ctx.storage, acc))
    assert again["total"] == 0
    with db.connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 1
