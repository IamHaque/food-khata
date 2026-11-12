"""PR-11: fair queue, provider concurrency, cheap progress, prompt cancel, graceful shutdown."""

import sqlite3
import threading
import time

from food_khata.auth import init_app_db
from food_khata.jobs.db import create_job, fair_order, get_job, get_job_events
from food_khata.jobs.runner import JobControl, JobRunner
from food_khata.providers import http
from food_khata.providers.fake import FakeProvider
from food_khata.users.context import UserContext


class SlowProvider(FakeProvider):
    def __init__(self, *a, delay=0.3, **k):
        super().__init__(*a, **k)
        self.delay = delay

    def pages(self):
        for page in super().pages():
            time.sleep(self.delay)
            yield page


def _env(tmp_path, users=3, **runner_args):
    app_db, root = tmp_path / "app.db", tmp_path / "data"
    init_app_db(app_db)
    c = sqlite3.connect(app_db)
    accounts = []
    for i in range(users):
        c.execute("INSERT INTO users VALUES (?, ?, 'x', 0, 0, 'now')", (f"u{i}", f"u{i}"))
    c.commit()
    c.close()
    for i in range(users):
        ctx = UserContext(root, f"u{i}").initialize("password-12345")
        acc = ctx.storage.bind(f"98765432{i:02d}", "zomato", f"id-{i}")["local_id"]
        ctx.storage.save_session(acc, "zomato", {"token": "t"})
        accounts.append((ctx, acc))
    runner = JobRunner(app_db, data_root=root, swiggy_pacing_seconds=0.0, **runner_args)
    runner.start()
    return app_db, runner, JobControl(app_db, data_root=root, runner=runner), accounts


def _submit(control, accounts, i, provider=None, **kw):
    ctx, acc = accounts[i]
    return control.submit_sync(
        user_id=f"u{i}", account_id=acc, provider="zomato", session={"token": "t"}, cipher=ctx.cipher,
        provider_instance=provider or FakeProvider(total_orders=20, page_size=10, account_id=f"id-{i}"), mode="all", **kw,
    )["id"]


def _wait(app_db, job_ids, states=("done", "failed", "interrupted"), timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        if all(get_job(app_db, j)["status"] in states for j in job_ids):
            return True
        time.sleep(0.05)
    return False


def test_fair_order_is_round_robin_by_user():
    jobs = [{"id": n, "user_id": u, "created_at": t} for n, u, t in
            (("a1", "A", 1), ("a2", "A", 2), ("b1", "B", 3), ("c1", "C", 4))]
    assert [j["id"] for j in fair_order(jobs)] == ["a1", "b1", "c1", "a2"]


def test_provider_concurrency_is_configuration(tmp_path):
    app_db, runner, control, accounts = _env(tmp_path, users=2, provider_concurrency={"zomato": 2})
    ids = [_submit(control, accounts, i, SlowProvider(total_orders=20, page_size=10, account_id=f"id-{i}", delay=0.4)) for i in range(2)]
    time.sleep(0.3)
    assert [get_job(app_db, j)["status"] for j in ids] == ["running", "running"]  # default of 1 would queue the second
    assert _wait(app_db, ids)
    runner.stop()


def test_progress_writes_are_coalesced_and_one_connection_per_job(tmp_path, monkeypatch):
    app_db, runner, control, accounts = _env(tmp_path, users=1)
    opened = []
    real = sqlite3.connect
    monkeypatch.setattr(sqlite3, "connect", lambda *a, **k: (opened.append(1), real(*a, **k))[1])
    job = _submit(control, accounts, 0, FakeProvider(total_orders=1000, page_size=10, account_id="id-0"))
    assert _wait(app_db, [job]) and get_job(app_db, job)["status"] == "done"
    assert len(get_job_events(app_db, job, limit=500)) < 30  # about 100 pages and 1000 details used to write one row each
    assert len(opened) < 300, len(opened)  # was one connection per event
    runner.stop()


def test_pacing_waits_outside_the_lock_and_cancel_is_prompt(tmp_path):
    app_db, runner, _, _ = _env(tmp_path, users=1)
    runner.pacing_interval["zomato"] = 0.6

    class Token:
        cancelled = False
        def is_cancelled(self):
            return self.cancelled

    token = Token()
    runner._pace_provider("zomato")  # takes the first slot
    t = threading.Thread(target=runner._pace_provider, args=("zomato", token))
    t.start()
    time.sleep(0.1)
    assert runner.pacing_lock.acquire(timeout=0.2)  # not held while the second caller waits
    runner.pacing_lock.release()
    started = time.monotonic()
    token.cancelled = True
    t.join(2)
    assert not t.is_alive() and time.monotonic() - started < 0.5

    flag = {"cancelled": False}
    http.set_cancel_check(lambda: flag["cancelled"])
    waiter = threading.Thread(target=lambda: (http.set_cancel_check(lambda: flag["cancelled"]), http.wait(30)))
    waiter.start()
    time.sleep(0.3)
    flag["cancelled"] = True
    started = time.monotonic()
    waiter.join(2)
    http.set_cancel_check(None)
    assert not waiter.is_alive() and time.monotonic() - started < 2  # a retry sleep never blinds cancel
    runner.stop()


def test_graceful_shutdown_checkpoints_and_marks_shutdown(tmp_path):
    app_db, runner, control, accounts = _env(tmp_path, users=1)
    job = _submit(control, accounts, 0, SlowProvider(total_orders=200, page_size=10, account_id="id-0", delay=0.3))
    time.sleep(0.5)
    started = time.monotonic()
    runner.stop()
    assert time.monotonic() - started < 10
    done = get_job(app_db, job)
    assert (done["status"], done["error_code"], bool(done["resumable"])) == ("interrupted", "SHUTDOWN", True)


def test_queue_position_and_eta(tmp_path):
    app_db, runner, control, accounts = _env(tmp_path, users=3)
    first = _submit(control, accounts, 0, SlowProvider(total_orders=20, page_size=10, account_id="id-0", delay=0.3))
    queued = [_submit(control, accounts, i) for i in (1, 2)]
    info = [control.get_job(j) for j in queued]
    assert [i["queue_position"] for i in info] == [1, 2] and all(i["eta_seconds"] is None for i in info)  # no history yet
    assert _wait(app_db, [first, *queued])
    runner.stop()
    create_job(app_db, job_id="q", user_id="u0", account_id="other", provider="zomato", mode="all", status="queued")
    assert control.get_job("q")["eta_seconds"] is not None  # history now exists
