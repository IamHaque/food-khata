"""Stress: concurrency matrix."""

import threading
import time

import pytest
from fastapi.testclient import TestClient

from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import authenticate_client, create_app

PW = "synthetic-pass-14"


def _app(tmp_path):
    app = create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data")
    app.state.provider_factory = lambda p, phone=None, **kw: FakeProvider(
        provider=p, account_id="shared-identity"
    )
    return app


@pytest.mark.stress
def test_owner_claim_matrix(tmp_path):
    app = _app(tmp_path)
    with TestClient(app, base_url="http://127.0.0.1:8765"):
        codes = []

        def claim(i):
            c = TestClient(app, base_url="http://127.0.0.1:8765")
            r = c.get("/api/auth/csrf")
            c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
            res = c.post("/api/owner/setup", json={"username": f"owner{i}", "password": PW})
            codes.append(res.status_code)

        ts = [threading.Thread(target=claim, args=(i,)) for i in range(20)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
    assert codes.count(200) == 1
    assert all(c in (404, 409) for c in codes if c != 200)


@pytest.mark.stress
def test_same_provider_account_matrix(tmp_path):
    app = _app(tmp_path)
    with TestClient(app, base_url="http://127.0.0.1:8765"):
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

        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(2) as pool:
            ress = list(pool.map(verify, users))
        codes = sorted(r.status_code for r in ress)
        assert codes == [200, 409]
        assert any(
            r.status_code == 409 and r.json().get("error", {}).get("code") == "PROVIDER_ACCOUNT_TAKEN"
            for r in ress
        )


class SlowProvider(FakeProvider):
    def __init__(self, *a, delay=0.5, **k):
        super().__init__(*a, **k)
        self.delay = delay

    def pages(self):
        for page in super().pages():
            time.sleep(self.delay)
            yield page


@pytest.mark.stress
def test_double_sync_submit_matrix(tmp_path):
    app = create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data")
    app.state.provider_factory = lambda p, phone=None, **kw: SlowProvider(
        provider=p, account_id=f"id-{phone}", total_orders=20, page_size=2, delay=0.5
    )
    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        authenticate_client(client, username="owner", is_owner=True)
        handle = client.post(
            "/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"}
        ).json()["handle"]
        account_id = client.post(
            "/api/accounts/link/verify", json={"handle": handle, "code": "123456"}
        ).json()["id"]
        r1 = client.post("/api/sync/jobs", json={"account_id": account_id, "provider": "zomato", "mode": "all"})
        assert r1.status_code in (200, 201)
        r2 = client.post("/api/sync/jobs", json={"account_id": account_id, "provider": "zomato", "mode": "all"})
        assert r2.status_code == 409
        assert r2.json().get("error", {}).get("code") == "ACCOUNT_BUSY"


@pytest.mark.stress
def test_login_storm_matrix(tmp_path):
    app = _app(tmp_path)
    with TestClient(app, base_url="http://127.0.0.1:8765"):
        # create owner
        c = TestClient(app, base_url="http://127.0.0.1:8765")
        r = c.get("/api/auth/csrf")
        c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
        c.post("/api/owner/setup", json={"username": "owner", "password": PW})
        codes = []
        health_times = []

        def login(i):
            cl = TestClient(app, base_url="http://127.0.0.1:8765")
            # get csrf
            rr = cl.get("/api/auth/csrf")
            cl.headers["X-CSRF-Token"] = rr.json()["csrf_token"]
            time.perf_counter()
            res = cl.post("/api/auth/login", json={"username": "owner", "password": PW})
            codes.append(res.status_code)
            # health
            ht = TestClient(app, base_url="http://127.0.0.1:8765")
            t1 = time.perf_counter()
            hr = ht.get("/health")
            health_times.append((time.perf_counter() - t1) * 1000)
            assert hr.status_code == 200

        ts = [threading.Thread(target=login, args=(i,)) for i in range(20)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        assert all(c == 200 for c in codes)
        assert all(t < 1000 for t in health_times)


@pytest.mark.stress
def test_wipe_during_sync_matrix(tmp_path):
    app = create_app(tmp_path / "o.db", app_db_path=tmp_path / "app.db", data_root=tmp_path / "data")
    app.state.provider_factory = lambda p, phone=None, **kw: SlowProvider(
        provider=p, account_id=f"id-{phone}", total_orders=20, page_size=2, delay=0.5
    )
    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        authenticate_client(client, username="owner", is_owner=True)
        handle = client.post(
            "/api/accounts/link/start", json={"provider": "zomato", "phone": "9876543210"}
        ).json()["handle"]
        account_id = client.post(
            "/api/accounts/link/verify", json={"handle": handle, "code": "123456"}
        ).json()["id"]
        r = client.post("/api/sync/jobs", json={"account_id": account_id, "provider": "zomato", "mode": "all"})
        assert r.status_code in (200, 201)
        time.sleep(0.3)
        res = client.post(f"/api/accounts/{account_id}/disconnect", json={"wipe_data": True})
        assert res.status_code == 409
        assert res.json().get("error", {}).get("code") == "ACCOUNT_BUSY"
