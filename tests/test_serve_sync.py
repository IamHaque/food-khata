"""Tests for Background Sync Control API (AC-10)."""

import time
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from food_khata.jobs.states import (
    CANCELLED,
    DONE,
    QUEUED,
    RUNNING,
)
from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import authenticate_client, create_app


def _make_client(tmp_path: Path):
    dummy_db = tmp_path / "dummy.db"
    dummy_db.touch()
    app_db = tmp_path / "app.db"
    data_root = tmp_path / "data"
    data_root.mkdir(parents=True, exist_ok=True)

    app = create_app(dummy_db, app_db_path=app_db, data_root=data_root)
    app.state.provider_factory = lambda p, phone=None, **kwargs: FakeProvider(
        provider=p if p in ("zomato", "swiggy") else "zomato",
        account_id=f"fake-acc-{phone}" if phone else f"fake-acc-{uuid.uuid4().hex[:8]}",
        total_orders=10,
        page_size=2,
        **kwargs,
    )
    client = TestClient(app, base_url="http://127.0.0.1:8765")
    return client, data_root, app_db


def _link_account(client: TestClient, phone: str = "9876543210", provider: str = "zomato") -> str:
    st = client.post("/api/accounts/link/start", json={"provider": provider, "phone": phone}).json()
    ver = client.post("/api/accounts/link/verify", json={"handle": st["handle"], "code": "123456"}).json()
    return ver["id"]


def test_sync_unauthenticated(tmp_path):
    client, _, _ = _make_client(tmp_path)
    assert client.get("/api/sync/jobs").status_code == 401
    assert client.post("/api/sync/jobs", json={"account_id": "acc-1"}).status_code == 401


def test_start_sync_job_and_get_status(tmp_path):
    """Scenario: endpoints - start sync with mode and get job status."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")

    # Start sync job
    res = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "new"})
    assert res.status_code == 200
    job = res.json()
    assert "id" in job
    job_id = job["id"]
    assert job["account_id"] == acc_id
    assert job["mode"] == "incremental"
    assert job["status"] in (QUEUED, RUNNING, DONE)

    # Fetch status
    status_res = client.get(f"/api/sync/jobs/{job_id}")
    assert status_res.status_code == 200
    st_data = status_res.json()
    assert st_data["id"] == job_id
    assert st_data["user_id"] == job["user_id"]

    # List jobs
    list_res = client.get("/api/sync/jobs")
    assert list_res.status_code == 200
    assert any(j["id"] == job_id for j in list_res.json())


def test_sync_events_polling(tmp_path):
    """Scenario: progress history. Events stored for polling."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")

    job = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "new"}).json()
    job_id = job["id"]

    # Poll events
    events_res = client.get(f"/api/sync/jobs/{job_id}/events")
    assert events_res.status_code == 200
    events = events_res.json()
    assert isinstance(events, list)
    assert len(events) >= 1
    assert events[0]["job_id"] == job_id


def test_cancel_job(tmp_path):
    """Scenario: cancel. Cancels job within one request."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")

    job = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "all"}).json()
    job_id = job["id"]

    # Cancel job
    cancel_res = client.post(f"/api/sync/jobs/{job_id}/cancel")
    assert cancel_res.status_code == 200
    cancelled_job = cancel_res.json()
    assert cancelled_job["status"] in (CANCELLED, DONE)


def test_pause_and_resume_job(tmp_path):
    """Scenario: pause and resume job lifecycle."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")

    job = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "new"}).json()
    job_id = job["id"]

    pause_res = client.post(f"/api/sync/jobs/{job_id}/pause")
    assert pause_res.status_code == 200

    resume_res = client.post(f"/api/sync/jobs/{job_id}/resume")
    assert resume_res.status_code == 200


def test_code_route_is_gone(tmp_path):
    """PR-07: a code cannot repair an expired provider session; the route returns 404."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    assert client.post("/api/sync/jobs/any/code", json={"code": "123456"}).status_code in (404, 405)


def test_use_partial_ingest(tmp_path):
    """Scenario: use partial. Failed or cancelled partials are imported on request."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")

    job = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "all"}).json()
    job_id = job["id"]

    # Cancel to ensure it's in a terminal non-running state
    client.post(f"/api/sync/jobs/{job_id}/cancel")

    use_res = client.post(f"/api/sync/jobs/{job_id}/use-partial")
    assert use_res.status_code == 200
    res_data = use_res.json()
    assert res_data["status"] == "ok"
    assert "imported" in res_data
    assert client.get(f"/api/sync/jobs/{job_id}").json()["partial_decision"] == "imported"
    assert client.post(f"/api/sync/jobs/{job_id}/discard-partial").json()["partial_decision"] == "imported"
    assert client.post(f"/api/sync/jobs/{job_id}/use-partial").json()["imported"] == 0


def test_authorization_user_isolation_sync(tmp_path):
    """Scenario: authorization. User B requesting User A's job returns 404."""
    client, _, _ = _make_client(tmp_path)

    # Alice creates a job
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")
    job = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "new"}).json()
    alice_job_id = job["id"]

    # Bob tries to access Alice's job
    authenticate_client(client, username="bob", is_owner=False)

    get_res = client.get(f"/api/sync/jobs/{alice_job_id}")
    assert get_res.status_code == 404
    assert get_res.json()["error"]["code"] == "NOT_FOUND"

    events_res = client.get(f"/api/sync/jobs/{alice_job_id}/events")
    assert events_res.status_code == 404
    assert events_res.json()["error"]["code"] == "NOT_FOUND"

    cancel_res = client.post(f"/api/sync/jobs/{alice_job_id}/cancel")
    assert cancel_res.status_code == 404
    assert cancel_res.json()["error"]["code"] == "NOT_FOUND"

    for action in ("use-partial", "discard-partial"):
        response = client.post(f"/api/sync/jobs/{alice_job_id}/{action}")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"


def test_discard_partial_api_persists_across_restart(tmp_path):
    from food_khata.jobs.db import create_job

    client, data_root, app_db = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    account_id = _link_account(client)
    job = client.post("/api/sync/jobs", json={"account_id": account_id}).json()
    for _ in range(100):  # let the real job thread finish: it holds app.db and caused "database_unavailable"
        if client.get(f"/api/sync/jobs/{job['id']}").json()["status"] in ("done", "failed", "interrupted", "cancelled"):
            break
        time.sleep(0.1)
    create_job(app_db, job_id="discard-api", user_id=job["user_id"], account_id=account_id,
               provider="zomato", status="failed")
    first = client.post("/api/sync/jobs/discard-api/discard-partial")
    assert first.json().get("partial_decision") == "discarded", first.text
    restarted = TestClient(create_app(tmp_path / "dummy.db", app_db_path=app_db, data_root=data_root), base_url="http://127.0.0.1:8765")
    authenticate_client(restarted, username="alice", is_owner=True)
    assert restarted.get("/api/sync/jobs/discard-api").json()["partial_decision"] == "discarded"
    again = restarted.post("/api/sync/jobs/discard-api/discard-partial")
    assert again.json().get("partial_decision") == "discarded", again.text
    assert restarted.post("/api/sync/jobs/discard-api/use-partial").status_code == 400


def test_job_limits_enforced_409(tmp_path, monkeypatch):
    """Scenario: queue rules / DEC-010 limits. 1 running, 2 queued per user."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")

    # Mock count_user_active_jobs on runner.py db to simulate limits
    from food_khata.jobs import runner

    monkeypatch.setattr(runner, "count_user_active_jobs", lambda db, uid: (1, 2))

    res = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "new"})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "LIMIT_EXCEEDED"


def test_restart_recovery_account_busy_and_auto_resume(tmp_path):
    """PR-07: open jobs become interrupted/RESTART; one active job per account and provider; verify-again resumes needs_code."""
    from food_khata.auth import connect_app_db
    from food_khata.jobs.db import create_job, update_job

    client, data_root, app_db = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    account_id = _link_account(client)
    uid = client.get("/api/sync/jobs").json()  # no jobs yet
    assert uid == []
    conn = connect_app_db(app_db)
    user_id = conn.execute("SELECT id FROM users").fetchone()["id"]

    # Orphans from before a restart: queued and needs_code, plus one running
    for job_id, state in (("q1", "queued"), ("n1", "needs_code"), ("r1", "running")):
        create_job(app_db, job_id=job_id, user_id=user_id, account_id=f"{account_id}-{job_id}", provider="zomato", status=state)
    restarted = TestClient(create_app(tmp_path / "dummy.db", app_db_path=app_db, data_root=data_root), base_url="http://127.0.0.1:8765")
    restarted.app.state.job_runner.mark_interrupted_on_startup()
    rows = {r["id"]: r for r in conn.execute("SELECT id, status, error_code FROM jobs")}
    assert all(rows[j]["status"] == "interrupted" and rows[j]["error_code"] == "RESTART" for j in ("q1", "n1", "r1"))

    # A needs_code job on this account, then a second submit is refused
    authenticate_client(restarted, username="alice", is_owner=True)
    create_job(app_db, job_id="busy", user_id=user_id, account_id=account_id, provider="zomato", status="queued")
    res = restarted.post("/api/sync/jobs", json={"account_id": account_id})
    assert (res.status_code, res.json()["error"]["code"]) == (409, "ACCOUNT_BUSY")
    update_job(app_db, "busy", status="needs_code")
    assert restarted.post("/api/sync/jobs/busy/code", json={"code": "1"}).status_code in (404, 405)


def test_verify_again_resumes_needs_code_job_and_expiry_is_db_driven(tmp_path):
    from food_khata.auth import connect_app_db
    from food_khata.jobs.db import create_job, get_job

    client, _, app_db = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    account_id = _link_account(client)
    user_id = connect_app_db(app_db).execute("SELECT id FROM users").fetchone()["id"]
    create_job(app_db, job_id="nc", user_id=user_id, account_id=account_id, provider="zomato", status="needs_code")
    handle = client.post(f"/api/accounts/{account_id}/verify-again", json={}).json()["handle"]
    assert client.post("/api/accounts/link/verify", json={"handle": handle, "code": "123456"}).status_code == 200
    for _ in range(50):
        if get_job(app_db, "nc")["status"] in ("done", "failed"):
            break
        time.sleep(0.1)
    assert get_job(app_db, "nc")["status"] != "needs_code"

    # No in-memory payload at all: a stale needs_code job still expires
    create_job(app_db, job_id="old", user_id=user_id, account_id="other-account", provider="zomato", status="needs_code")
    client.app.state.job_runner.registered_payloads.clear()
    assert "old" in client.app.state.job_runner.drop_expired_keys(max_age_seconds=-1)
    assert get_job(app_db, "old")["status"] == "interrupted"


def _finish(client, job_id):
    for _ in range(100):
        if client.get(f"/api/sync/jobs/{job_id}").json()["status"] in ("done", "failed", "interrupted", "cancelled"):
            return
        time.sleep(0.1)


def test_accounts_show_real_count_last_sync_active_job_and_masked_phone(tmp_path):
    from food_khata.jobs.db import create_job

    client, _, app_db = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")
    job = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "all"}).json()
    _finish(client, job["id"])
    row = client.get("/api/accounts").json()[0]
    assert row["order_count"] == 10 and row["last_sync"] and row["phone"] == "••••3210"
    assert row["active_job_id"] is None and row["active_status"] is None  # latest job is done
    create_job(app_db, job_id="bad", user_id=job["user_id"], account_id=acc_id, provider="zomato", status="failed")
    row = client.get("/api/accounts").json()[0]
    assert (row["active_job_id"], row["active_status"]) == ("bad", "failed")


def test_account_busy_is_plain_and_names_the_running_job(tmp_path):
    from food_khata.jobs.db import create_job

    client, _, app_db = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client)
    jobs = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "all"}).json()
    _finish(client, jobs["id"])
    create_job(app_db, job_id="busy", user_id=jobs["user_id"], account_id=acc_id, provider="zomato", status="running")
    res = client.post("/api/sync/jobs", json={"account_id": acc_id})
    err = res.json()["error"]
    assert res.status_code == 409 and err["code"] == "ACCOUNT_BUSY" and err["job_id"] == "busy"
    assert not err["message"].startswith("409")


def test_job_list_filters_by_account_and_pages(tmp_path):
    from food_khata.jobs.db import create_job

    client, _, app_db = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client)
    job = client.post("/api/sync/jobs", json={"account_id": acc_id}).json()
    _finish(client, job["id"])
    create_job(app_db, job_id="other", user_id=job["user_id"], account_id="other-acc", provider="zomato", status="failed")
    assert [j["id"] for j in client.get(f"/api/sync/jobs?account_id={acc_id}").json()] == [job["id"]]
    assert [j["id"] for j in client.get("/api/sync/jobs?status=failed").json()] == ["other"]
    assert [j["id"] for j in client.get("/api/sync/jobs?limit=1&offset=1").json()] == [job["id"]]


def test_running_job_reports_progress_and_eta(tmp_path):
    from food_khata.jobs.db import create_job, update_job

    client, _, app_db = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client)
    uid = client.post("/api/sync/jobs", json={"account_id": acc_id}).json()["user_id"]
    now = time.time()
    create_job(app_db, job_id="old", user_id=uid, account_id="a2", provider="zomato", mode="full", status="done")
    update_job(app_db, "old", started_at=now - 1000, finished_at=now - 900)  # a 100 s run to base the ETA on
    create_job(app_db, job_id="run", user_id=uid, account_id="a3", provider="zomato", mode="full", status="running")
    update_job(app_db, "run", started_at=now - 40, phase="details", page=5, counts={"orders": 200, "details": 50, "details_downloaded": 50})
    job = client.get("/api/sync/jobs/run").json()
    assert job["progress"]["percent"] == 25 and job["progress"]["page"] == 5
    assert 55 <= job["eta_seconds"] <= 61
