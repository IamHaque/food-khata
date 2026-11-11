"""Stress: failure injection."""

import sqlite3
import threading
import time

import pytest

from food_khata.auth import init_app_db
from food_khata.jobs.db import get_job
from food_khata.jobs.runner import JobControl, JobRunner
from food_khata.providers.fake import FakeProvider
from food_khata.users.context import UserContext

PW = "synthetic-pass-14"


def _env(tmp_path, **runner_args):
    app_db, root = tmp_path / "app.db", tmp_path / "data"
    init_app_db(app_db)
    c = sqlite3.connect(app_db)
    c.execute("INSERT INTO users VALUES (?, ?, 'x', 0, 0, 'now')", ("u0", "u0"))
    c.commit()
    c.close()
    ctx = UserContext(root, "u0").initialize("password-12345")
    acc = ctx.storage.bind("9876543200", "zomato", "id-0")["local_id"]
    ctx.storage.save_session(acc, "zomato", {"token": "t"})
    runner = JobRunner(app_db, data_root=root, swiggy_pacing_seconds=0.0, **runner_args)
    runner.start()
    control = JobControl(app_db, data_root=root, runner=runner)
    return app_db, runner, control, "u0", acc, ctx


def _wait(app_db, job_id, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        j = get_job(app_db, job_id)
        if j and j["status"] in ("done", "failed", "interrupted", "cancelled", "needs_code"):
            return j
        time.sleep(0.05)
    return get_job(app_db, job_id)


@pytest.mark.stress
def test_disk_full_during_checkpoint(tmp_path, monkeypatch):
    app_db, runner, control, uid, acc, ctx = _env(tmp_path)

    class NoSpaceProvider(FakeProvider):
        def dump_session(self):
            raise OSError(28, "No space left on device")

    job = control.submit_sync(
        user_id=uid, account_id=acc, provider="zomato", session={"token": "t"},
        cipher=ctx.cipher, provider_instance=NoSpaceProvider(total_orders=20, page_size=2, account_id="id-0"),
        mode="all",
    )["id"]
    j = _wait(app_db, job, timeout=10)
    assert j is not None
    assert j["status"] in ("failed", "interrupted")
    assert j.get("error_code")
    runner.stop()


@pytest.mark.stress
def test_locked_app_db(tmp_path, monkeypatch):
    import food_khata.jobs.db as jobs_db
    import food_khata.jobs.runner as runner_mod

    app_db, runner, control, uid, acc, ctx = _env(tmp_path)

    class SlowProvider(FakeProvider):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self.delay = 0.2

        def pages(self):
            for page in super().pages():
                time.sleep(self.delay)
                yield page

    orig = jobs_db.connect_job_db

    def short(path):
        conn = orig(path)
        conn.execute("PRAGMA busy_timeout = 200;")
        return conn

    monkeypatch.setattr(jobs_db, "connect_job_db", short)
    monkeypatch.setattr(runner_mod, "connect_job_db", short)

    job = control.submit_sync(
        user_id=uid, account_id=acc, provider="zomato", session={"token": "t"},
        cipher=ctx.cipher, provider_instance=SlowProvider(total_orders=20, page_size=2, account_id="id-0"),
        mode="all",
    )["id"]

    def hold():
        h = sqlite3.connect(app_db, timeout=30.0, check_same_thread=False)
        h.execute("PRAGMA busy_timeout = 30000;")
        h.execute("BEGIN IMMEDIATE")
        time.sleep(1.0)
        h.rollback()
        h.close()

    threading.Thread(target=hold, daemon=True).start()
    time.sleep(0.1)

    j = _wait(app_db, job, timeout=20)
    assert j is not None
    assert j["status"] in ("failed", "interrupted", "done")
    assert j.get("error_code") or j["status"] == "done"
    runner.stop()


@pytest.mark.stress
def test_garbage_provider_pages(tmp_path):
    app_db, runner, control, uid, acc, ctx = _env(tmp_path)

    for garbage in ("not-a-list", None, {"foo": "bar"}):
        class GarbageProvider(FakeProvider):
            def pages(self, garbage=garbage):
                yield garbage

        job = control.submit_sync(
            user_id=uid, account_id=acc, provider="zomato", session={"token": "t"},
            cipher=ctx.cipher, provider_instance=GarbageProvider(total_orders=0, account_id="id-0"),
            mode="all",
        )["id"]
        j = _wait(app_db, job, timeout=10)
        assert j is not None
        assert j["status"] in ("failed", "interrupted")
        assert j.get("error_code")

    runner.stop()
