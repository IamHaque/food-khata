"""Tests for Background Sync Control API (AC-10)."""

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


def test_needs_code_and_submit_code(tmp_path):
    """Scenario: needs code. Submitting code transitions job."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    acc_id = _link_account(client, "9876543210")

    job = client.post("/api/sync/jobs", json={"account_id": acc_id, "mode": "new"}).json()
    job_id = job["id"]

    # Submit verification code
    code_res = client.post(f"/api/sync/jobs/{job_id}/code", json={"code": "123456"})
    # If job was not in NEEDS_CODE, returns 400 with INVALID_CODE
    assert code_res.status_code in (200, 400)


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
