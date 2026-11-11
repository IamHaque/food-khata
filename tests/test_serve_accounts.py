"""Tests for accounts and provider linking API (AC-10)."""

import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import authenticate_client, create_app


def _make_client(tmp_path: Path, monkeypatch=None):
    dummy_db = tmp_path / "dummy.db"
    dummy_db.touch()
    app_db = tmp_path / "app.db"
    data_root = tmp_path / "data"
    data_root.mkdir(parents=True, exist_ok=True)

    app = create_app(dummy_db, app_db_path=app_db, data_root=data_root)
    # Use FakeProvider factory to avoid all real network requests
    app.state.provider_factory = lambda p, phone=None: FakeProvider(
        provider=p if p in ("zomato", "swiggy") else "zomato",
        account_id=f"fake-acc-{phone}" if phone else f"fake-acc-{uuid.uuid4().hex[:8]}",
    )
    client = TestClient(app, base_url="http://127.0.0.1:8765")
    return client, data_root, app_db


def test_list_accounts_unauthenticated(tmp_path):
    client, _, _ = _make_client(tmp_path)
    res = client.get("/api/accounts")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_link_flow_and_list_accounts(tmp_path):
    """Scenario: endpoints - link start, verify, list accounts, and alternative account."""
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)

    # 1. Initially empty
    list_res = client.get("/api/accounts")
    assert list_res.status_code == 200
    assert list_res.json() == []

    # 2. Start linking (valid phone)
    start_res = client.post(
        "/api/accounts/link/start",
        json={"provider": "zomato", "phone": "9876543210"},
    )
    assert start_res.status_code == 200
    data = start_res.json()
    assert "handle" in data
    assert "expires_at" in data
    assert "code" not in data
    assert "123456" not in str(data)  # Never returns OTP in response

    # 3. Verify OTP
    verify_res = client.post(
        "/api/accounts/link/verify",
        json={"handle": data["handle"], "code": "123456", "account_name": "Personal Zomato"},
    )
    assert verify_res.status_code == 200
    bound = verify_res.json()
    assert bound["provider"] == "zomato"
    assert bound["name"] == "Personal Zomato"
    account_id = bound["id"]

    # 4. List accounts returns the newly linked account
    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 1
    assert accounts[0]["id"] == account_id
    assert accounts[0]["status"] == "ok"
    assert accounts[0]["has_session"] is True

    # 5. Add alternative account with different phone
    start2 = client.post(
        "/api/accounts/link/start",
        json={"provider": "swiggy", "phone": "9123456789"},
    ).json()
    verify2 = client.post(
        "/api/accounts/link/verify",
        json={"handle": start2["handle"], "code": "123456", "account_name": "Work Swiggy"},
    ).json()
    assert verify2["provider"] == "swiggy"

    accounts2 = client.get("/api/accounts").json()
    assert len(accounts2) == 2


def test_one_owner_per_provider_account_409(tmp_path):
    """Scenario: one owner per provider account.

    Given a provider account already linked to another user
    When a second user links it
    Then it returns 409 PROVIDER_ACCOUNT_TAKEN.
    """
    client, _, _ = _make_client(tmp_path)
    # Both users connect to a provider account with the exact same provider account ID
    client.app.state.provider_factory = lambda p: FakeProvider(
        provider=p if p in ("zomato", "swiggy") else "zomato",
        account_id="shared-zomato-acc-123",
    )

    # User 1 links provider account
    authenticate_client(client, username="alice", is_owner=True)
    start_res = client.post(
        "/api/accounts/link/start",
        json={"provider": "zomato", "phone": "9876543210"},
    ).json()
    client.post(
        "/api/accounts/link/verify",
        json={"handle": start_res["handle"], "code": "123456"},
    )

    # User 2 tries to link the same phone/provider
    authenticate_client(client, username="bob", is_owner=False)
    start_bob = client.post(
        "/api/accounts/link/start",
        json={"provider": "zomato", "phone": "9876543210"},
    ).json()
    verify_bob = client.post(
        "/api/accounts/link/verify",
        json={"handle": start_bob["handle"], "code": "123456"},
    )

    assert verify_bob.status_code == 409
    body = verify_bob.json()
    assert body["error"]["code"] == "PROVIDER_ACCOUNT_TAKEN"


def test_quota_max_5_accounts_409(tmp_path):
    """Scenario: quota.

    Given 5 linked logins (DEC-010 limit)
    When a sixth is added
    Then it returns 409 QUOTA.
    """
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)

    phones = [f"987654321{i}" for i in range(5)]
    for phone in phones:
        st = client.post(
            "/api/accounts/link/start",
            json={"provider": "zomato", "phone": phone},
        ).json()
        ver = client.post(
            "/api/accounts/link/verify",
            json={"handle": st["handle"], "code": "123456"},
        )
        assert ver.status_code == 200

    # 6th account exceeds quota
    st_sixth = client.post(
        "/api/accounts/link/start",
        json={"provider": "zomato", "phone": "9999999999"},
    ).json()
    ver_sixth = client.post(
        "/api/accounts/link/verify",
        json={"handle": st_sixth["handle"], "code": "123456"},
    )
    assert ver_sixth.status_code == 409
    assert ver_sixth.json()["error"]["code"] == "QUOTA"


def test_verify_again_reuses_stored_phone(tmp_path):
    """Scenario: verify again.

    Given an expired session
    Then verify-again reuses the stored phone number.
    """
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)

    # Link initial account
    st = client.post(
        "/api/accounts/link/start",
        json={"provider": "zomato", "phone": "9876543210"},
    ).json()
    acc = client.post(
        "/api/accounts/link/verify",
        json={"handle": st["handle"], "code": "123456"},
    ).json()
    acc_id = acc["id"]

    # Start verify-again (re-uses stored phone)
    va_res = client.post(f"/api/accounts/{acc_id}/verify-again")
    assert va_res.status_code == 200
    va_data = va_res.json()
    assert "handle" in va_data
    assert va_data["status"] == "pending"

    # Complete verify with OTP
    fin = client.post(
        "/api/accounts/link/verify",
        json={"handle": va_data["handle"], "code": "123456"},
    )
    assert fin.status_code == 200
    assert fin.json()["status"] == "ok"


def test_disconnect_keep_and_wipe_options(tmp_path):
    """Scenario: disconnect.

    Confirm dialog lets user keep or wipe that account's data.
    """
    client, data_root, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)

    # 1. Link account 1 (will be disconnected with wipe_data=False)
    st1 = client.post(
        "/api/accounts/link/start",
        json={"provider": "zomato", "phone": "9876543210"},
    ).json()
    acc1 = client.post(
        "/api/accounts/link/verify",
        json={"handle": st1["handle"], "code": "123456"},
    ).json()
    acc1_id = acc1["id"]

    disc1 = client.delete(f"/api/accounts/{acc1_id}?wipe_data=false")
    assert disc1.status_code == 200
    assert disc1.json()["wiped"] is False

    # Account remains in listing but has_session is False
    accounts = client.get("/api/accounts").json()
    match1 = next(a for a in accounts if a["id"] == acc1_id)
    assert match1["has_session"] is False

    # 2. Link account 2 (will be disconnected with wipe_data=True)
    st2 = client.post(
        "/api/accounts/link/start",
        json={"provider": "swiggy", "phone": "9876543211"},
    ).json()
    acc2 = client.post(
        "/api/accounts/link/verify",
        json={"handle": st2["handle"], "code": "123456"},
    ).json()
    acc2_id = acc2["id"]

    disc2 = client.delete(f"/api/accounts/{acc2_id}?wipe_data=true")
    assert disc2.status_code == 200
    assert disc2.json()["wiped"] is True

    # Account completely removed
    accounts_after = client.get("/api/accounts").json()
    assert not any(a["id"] == acc2_id for a in accounts_after)


def test_authorization_user_isolation(tmp_path):
    """Scenario: authorization.

    When user B requests user A's account, it returns 404 NOT_FOUND.
    """
    client, _, _ = _make_client(tmp_path)

    # Alice links account
    authenticate_client(client, username="alice", is_owner=True)
    st = client.post(
        "/api/accounts/link/start",
        json={"provider": "zomato", "phone": "9876543210"},
    ).json()
    acc = client.post(
        "/api/accounts/link/verify",
        json={"handle": st["handle"], "code": "123456"},
    ).json()
    alice_acc_id = acc["id"]

    # Bob tries to verify-again or disconnect Alice's account
    authenticate_client(client, username="bob", is_owner=False)

    va = client.post(f"/api/accounts/{alice_acc_id}/verify-again")
    assert va.status_code == 404
    assert va.json()["error"]["code"] == "NOT_FOUND"

    disc = client.delete(f"/api/accounts/{alice_acc_id}")
    assert disc.status_code == 404
    assert disc.json()["error"]["code"] == "NOT_FOUND"


import pytest  # noqa: E402


@pytest.mark.no_fake
def test_fake_provider_off_by_default(tmp_path):
    """PR-04: switch off -> `fake` is an unknown provider, absent from the list, no test hook on a normal app."""
    client, _, _ = _make_client(tmp_path)
    assert not hasattr(create_app(tmp_path / "d.db", data_root=tmp_path / "data").state, "provider_factory")
    authenticate_client(client, username="alice", is_owner=True)
    assert client.get("/api/accounts/providers").json() == {"providers": ["zomato", "swiggy"]}
    res = client.post("/api/accounts/link/start", json={"provider": "fake", "phone": "9876543210"})
    assert (res.status_code, res.json()["error"]["code"] if "error" in res.json() else res.json()["detail"]["code"]) == (400, "INVALID_PROVIDER")


def test_fake_provider_switch_on(tmp_path):
    client, _, _ = _make_client(tmp_path)
    authenticate_client(client, username="alice", is_owner=True)
    assert "fake" in client.get("/api/accounts/providers").json()["providers"]
