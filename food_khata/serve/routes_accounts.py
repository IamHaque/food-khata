"""Accounts and provider linking routes (AC-10)."""

from __future__ import annotations

import logging
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from food_khata.auth import connect_app_db
from food_khata.contracts import KhataError
from food_khata.db import delete_account_data
from food_khata.providers.base import provider_names
from food_khata.services.linking import LinkingService
from food_khata.storage import Storage, provider_identity, read_json
from food_khata.users.context import ensure_private_dir, user_database, user_root

from .deps import _cached_status
from .schemas_accounts import (
    AccountOut,
    DisconnectRequest,
    DisconnectResponse,
    LinkStartRequest,
    LinkStartResponse,
    LinkVerifyRequest,
    LinkVerifyResponse,
    VerifyAgainRequest,
    VerifyAgainResponse,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/accounts", tags=["accounts"])

DEC_010_MAX_ACCOUNTS = 5


def get_current_user_id(request: Request) -> str:
    """Retrieve authenticated user ID from request state."""
    session = getattr(request.state, "session", None) or getattr(request.state, "user", None)
    if not session or not session.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthorized", "message": "Authentication required."},
        )
    return str(session["user_id"])


def get_user_cipher(request: Request, user_id: str) -> Any | None:
    """Locate user encryption cipher in memory if unlocked."""
    session = getattr(request.state, "session", None)
    unlocked = request.app.state.unlocked_sessions.get(session["id"]) if session else None
    if unlocked and unlocked[0] == user_id:
        return unlocked[1]
    raise HTTPException(status_code=401, detail="User data is locked; log in again.")


def get_user_storage(request: Request, user_id: str) -> Storage:
    """Instantiate Storage bound to the authenticated user's private data folder."""
    data_root = getattr(request.app.state, "data_root", None)
    cipher = get_user_cipher(request, user_id)
    if data_root is not None:
        u_root = user_root(data_root, user_id)
        ensure_private_dir(u_root)
        return Storage(u_root, cipher=cipher)
    return Storage(cipher=cipher)


def get_linking_service(request: Request) -> LinkingService:
    """Shared LinkingService stored on app.state to retain handles across requests."""
    svc = getattr(request.app.state, "linking_service", None)
    if svc is None:
        svc = LinkingService()
        request.app.state.linking_service = svc
    if not hasattr(request.app.state, "reverify_handles"):
        request.app.state.reverify_handles = {}
    return svc


def pick_provider(acc: dict[str, Any], requested: str | None) -> str:
    """The provider an action targets: explicit, or the only one the account has (R-01)."""
    providers = list((acc.get("providers") or {}).keys())
    if requested:
        if requested not in providers:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "NOT_FOUND",
                    "message": f"Provider '{requested}' is not linked to this account.",
                },
            )
        return requested
    if len(providers) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "PROVIDER_REQUIRED",
                "message": "This account has several providers; name one.",
            },
        )
    return providers[0] if providers else "zomato"


def _user_accounts(user_storage: Storage) -> list[dict[str, Any]]:
    found = []
    if user_storage.accounts_dir.exists():
        for p in user_storage.accounts_dir.iterdir():
            if p.is_dir() and (p / "account.json").is_file():
                meta = _get_account_meta(user_storage, p.name)
                if meta:
                    found.append(meta)
    return found


def _release_link(request: Request, provider: str, identity: str) -> None:
    conn = connect_app_db(request.app.state.app_db_path)
    try:
        conn.execute(
            "DELETE FROM provider_links WHERE provider = ? AND identity_hash = ?",
            (provider, identity),
        )
        conn.commit()
    finally:
        conn.close()


def _quota_exceeded(existing: list[dict[str, Any]], phone: str) -> bool:
    return len(existing) >= DEC_010_MAX_ACCOUNTS and not any(
        a.get("phone") == phone for a in existing
    )


def _count_orders(account_path: Path, provider: str) -> int:
    """Count orders from stored provider history archive if present."""
    history_file = account_path / f"{provider}-history.json"
    if history_file.is_file():
        try:
            data = read_json(history_file)
            if isinstance(data, list):
                return len(data)
            if isinstance(data, dict):
                orders = data.get("orders") or data.get("items") or []
                if isinstance(orders, list):
                    return len(orders)
        except Exception:
            pass
    return 0


def _get_account_meta(storage: Storage, account_id: str) -> dict[str, Any] | None:
    """Look up an account by ID from the given storage."""
    try:
        acc_path = storage.account_path(account_id)  # refuses anything that is not a plain account id
    except KhataError:
        return None
    acc_file = acc_path / "account.json"
    if not acc_file.is_file():
        return None
    data = read_json(acc_file)
    if not isinstance(data, dict):
        raise KhataError("Invalid account metadata")
    return storage._decrypt_phone(data, rewrite=False)


@router.get("", response_model=list[AccountOut])
def list_accounts(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
):
    """List linked accounts for the current user with status, last sync, and order count."""
    storage = get_user_storage(request, user_id)
    if not storage.accounts_dir.exists():
        return []

    accounts_out: list[AccountOut] = []
    for acc_path in sorted(storage.accounts_dir.iterdir()):
        if not acc_path.is_dir():
            continue
        account_id = acc_path.name
        acc = _get_account_meta(storage, account_id)
        if not acc:
            continue

        providers = acc.get("providers", {})
        for provider in providers or {"zomato": None}:
            provider_id = providers.get(provider)
            session = storage.session(account_id, provider)
            orders = (acc.get("order_count") if len(providers) <= 1 else None) or _count_orders(
                acc_path, provider
            )
            accounts_out.append(
                AccountOut(
                    id=account_id,
                    local_id=account_id,
                    provider=provider,
                    phone=acc.get("phone"),
                    provider_id=provider_id,
                    status=_cached_status(session),
                    last_sync=acc.get("last_sync"),
                    order_count=orders,
                    name=acc.get("name") or acc.get("account_name"),
                    has_session=session is not None,
                )
            )
    return accounts_out


@router.get("/providers")
def providers(_: Annotated[str, Depends(get_current_user_id)]):
    return {"providers": list(provider_names())}


@router.post("/link/start", response_model=LinkStartResponse)
def link_start(
    data: LinkStartRequest,
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
):
    """Start provider linking: delegates to LinkingService and returns opaque handle. Never returns OTP code."""
    get_user_cipher(request, user_id)
    provider_name = data.provider.strip().lower()
    if provider_name not in provider_names():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_PROVIDER",
                "message": f"Unsupported provider: {data.provider}",
            },
        )

    phone = data.phone.strip()
    if not re.fullmatch(r"[6-9][0-9]{9}", phone):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_PHONE",
                "message": "Enter a valid 10-digit Indian phone number.",
            },
        )

    if _quota_exceeded(_user_accounts(get_user_storage(request, user_id)), phone):
        raise HTTPException(  # before any SMS is requested
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "QUOTA",
                "message": f"Account quota exceeded (maximum {DEC_010_MAX_ACCOUNTS} accounts allowed).",
            },
        )

    svc = get_linking_service(request)
    # Check if a custom fake provider instance was attached to app.state
    factory = getattr(request.app.state, "provider_factory", None)
    provider_inst = None
    if factory:
        try:
            provider_inst = factory(provider_name, phone=phone)
        except TypeError:
            provider_inst = factory(provider_name)

    try:
        handle = svc.start_login(provider_inst or provider_name, phone, user=user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "LINK_START_FAILED", "message": str(exc)},
        ) from exc

    entry = svc._handles[handle]
    return LinkStartResponse(handle=handle, expires_at=entry.expires_at)


@router.post("/link/verify", response_model=LinkVerifyResponse)
def link_verify(
    data: LinkVerifyRequest,
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
):
    """Verify linking OTP, enforce quota and exclusivity across users, and bind account."""
    svc = get_linking_service(request)
    handle = data.handle.strip()
    entry = svc._handles.get(handle)

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_HANDLE", "message": "Invalid or expired linking handle."},
        )
    if entry.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "HANDLE_USED", "message": "Login handle already used."},
        )
    if time.time() > entry.expires_at:
        svc._handles.pop(handle, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "HANDLE_EXPIRED", "message": "Login handle has expired."},
        )
    if entry.user is not None and entry.user != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Linking handle belongs to another user."},
        )

    user_storage = get_user_storage(request, user_id)

    # 1. Quota Check: DEC-010 limit is 5 accounts per user
    existing_accounts = _user_accounts(user_storage)

    # 2. Verify OTP with provider
    try:
        provider_id = entry.provider_instance.verify_otp(data.code.strip())
        if not provider_id or not str(provider_id).strip():
            provider_id = entry.provider_instance.profile()
        provider_id = str(provider_id).strip()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_OTP", "message": str(exc)},
        ) from exc

    # Allow re-linking if matching phone already exists among user's accounts
    is_existing = any(
        (
            a.get("phone") == entry.phone
            or (
                not a.get("phone")
                and a.get("providers", {}).get(entry.provider) == provider_identity(provider_id)
            )
        )
        for a in existing_accounts
    )
    if len(existing_accounts) >= DEC_010_MAX_ACCOUNTS and not is_existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "QUOTA",
                "message": f"Account quota exceeded (maximum {DEC_010_MAX_ACCOUNTS} accounts allowed).",
            },
        )

    # 3. Check reverify mismatch if this handle was initiated via verify-again
    reverify_info = getattr(request.app.state, "reverify_handles", {}).get(handle)
    if reverify_info:
        expected_id = reverify_info.get("expected_provider_id")
        if expected_id and provider_id != str(expected_id).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "PROVIDER_MISMATCH",
                    "message": "Provider account identity mismatch; link failed.",
                },
            )
        request.app.state.reverify_handles.pop(handle, None)  # only after the identity check passed

    # 4. Exclusivity: the provider_links primary key decides, so two simultaneous links cannot both win.
    identity = provider_identity(provider_id)
    links = connect_app_db(request.app.state.app_db_path)
    try:
        claimed = (
            links.execute(
                "INSERT OR IGNORE INTO provider_links (provider, identity_hash, user_id) VALUES (?, ?, ?)",
                (entry.provider, identity, user_id),
            ).rowcount
            == 1
        )
        links.commit()
        owner = links.execute(
            "SELECT user_id FROM provider_links WHERE provider = ? AND identity_hash = ?",
            (entry.provider, identity),
        ).fetchone()
    finally:
        links.close()
    if owner is None or owner["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "PROVIDER_ACCOUNT_TAKEN",
                "message": "This provider account is already linked to another user.",
            },
        )

    # 5. Bind account and save encrypted session
    try:
        account = user_storage.bind(entry.phone, entry.provider, provider_id)
        session_value = entry.provider_instance.dump_session()
        user_storage.save_session(account["local_id"], entry.provider, session_value)

        # Set friendly account name if provided
        if data.account_name:
            account["name"] = data.account_name.strip()
            user_storage._write_account(account)

        links = connect_app_db(request.app.state.app_db_path)
        try:
            links.execute(
                "UPDATE provider_links SET account_id = ? WHERE provider = ? AND identity_hash = ?",
                (account["local_id"], entry.provider, identity),
            )
            links.commit()
        finally:
            links.close()

        entry.used = True
        svc._handles.pop(handle, None)

        if reverify_info:  # a sync that stopped on the expired session continues with the fresh one
            control = request.app.state.job_control
            for job in control.list_jobs(user_id=user_id, status="needs_code"):
                if job["account_id"] == account["local_id"] and job["provider"] == entry.provider:
                    control.resume_job(
                        job["id"],
                        user_id=user_id,
                        session=session_value,
                        cipher=get_user_cipher(request, user_id),
                        provider_instance=entry.provider_instance,
                        provider_id=provider_id,
                    )

        return LinkVerifyResponse(
            id=account["local_id"],
            local_id=account["local_id"],
            provider=entry.provider,
            provider_id=provider_id,
            phone=entry.phone,
            status="ok",
            name=account.get("name"),
            added_to_existing=any(a.get("phone") == entry.phone for a in existing_accounts),
        )
    except KhataError as exc:
        if claimed:
            _release_link(request, entry.provider, identity)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BIND_FAILED", "message": str(exc)},
        ) from exc


@router.post("/{account_id}/verify-again", response_model=VerifyAgainResponse)
def verify_again(
    account_id: str,
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
    data: VerifyAgainRequest | None = None,
):
    """Start re-verification linking session for an existing account."""
    user_storage = get_user_storage(request, user_id)
    acc = _get_account_meta(user_storage, account_id)
    if not acc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Account not found."},
        )

    phone = acc.get("phone")
    provider = pick_provider(acc, data.provider if data else None)
    expected_id = acc.get("providers", {}).get(provider)

    if not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_PHONE", "message": "Account has no stored phone number."},
        )

    svc = get_linking_service(request)
    factory = getattr(request.app.state, "provider_factory", None)
    provider_inst = None
    if factory:
        try:
            provider_inst = factory(provider, phone=phone)
        except TypeError:
            provider_inst = factory(provider)

    try:
        handle = svc.start_login(provider_inst or provider, phone, user=user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "VERIFY_AGAIN_FAILED", "message": str(exc)},
        ) from exc

    # Track expected provider account id for re-verification matching
    if not hasattr(request.app.state, "reverify_handles"):
        request.app.state.reverify_handles = {}
    request.app.state.reverify_handles[handle] = {
        "account_id": account_id,
        "expected_provider_id": expected_id,
    }

    entry = svc._handles[handle]

    # If code was supplied inline, verify immediately
    if data and data.code:
        try:
            ver_id = entry.provider_instance.verify_otp(data.code.strip())
            if not ver_id:
                ver_id = entry.provider_instance.profile()
            if str(ver_id).strip() != str(expected_id).strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "PROVIDER_MISMATCH",
                        "message": "Provider account identity mismatch; link failed.",
                    },
                )
            user_storage.save_session(account_id, provider, entry.provider_instance.dump_session())
            entry.used = True
            svc._handles.pop(handle, None)
            request.app.state.reverify_handles.pop(handle, None)
            return VerifyAgainResponse(
                handle=handle,
                expires_at=entry.expires_at,
                status="ok",
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_OTP", "message": str(exc)},
            ) from exc

    return VerifyAgainResponse(
        handle=handle,
        expires_at=entry.expires_at,
        status="pending",
    )


def _wipe(request, user_id, storage, acc, account_id, acc_path, provider, others) -> None:
    """Wipe an account, or only one provider of it when others remain. Nothing is half deleted: the database
    step is one transaction, and the folder is renamed first so it can be put back if that step fails."""
    jobs = [j for j in request.app.state.job_control.list_jobs(user_id=user_id, limit=1000) if j["account_id"] == account_id]
    if any(j["status"] in ("queued", "running") and (not others or j["provider"] == provider) for j in jobs):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ACCOUNT_BUSY", "message": "A sync is running for this account; cancel it first."},
        )
    data_root = getattr(request.app.state, "data_root", None)
    user_db = user_database(data_root, user_id) if data_root else None
    trash = None
    try:
        if not others and acc_path.exists():
            trash = acc_path.parent.parent / f".deleting-{uuid.uuid4().hex}"
            acc_path.rename(trash)
        if user_db and user_db.is_file():
            delete_account_data(user_db, account_id, provider if others else None, [j["id"] for j in jobs])
        if others:
            storage.remove_session(account_id, provider)
            for f in acc_path.glob(f"{provider}-*.json"):
                f.unlink(missing_ok=True)
            for key in ("providers", "provider_identities"):
                (acc.get(key) or {}).pop(provider, None)
            storage._write_account(acc)
    except Exception as exc:
        if trash is not None and trash.exists() and not acc_path.exists():
            trash.rename(acc_path)
        log.error("wipe failed for account %s: %s", account_id, type(exc).__name__)  # no personal data
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "WIPE_FAILED", "message": "Wipe failed; nothing was deleted."},
        ) from exc
    if trash is not None:
        shutil.rmtree(trash, ignore_errors=True)


@router.delete("/{account_id}", response_model=DisconnectResponse)
@router.post("/{account_id}/disconnect", response_model=DisconnectResponse)
def disconnect_account(
    account_id: str,
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
    wipe_data: bool = False,
    provider: str | None = None,
    body: DisconnectRequest | None = None,
):
    """Disconnect account. Wipes or preserves data according to wipe_data flag."""
    effective_wipe = wipe_data or (body.wipe_data if body else False)
    user_storage = get_user_storage(request, user_id)
    acc = _get_account_meta(user_storage, account_id)
    if not acc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Account not found."},
        )

    acc_path = user_storage.accounts_dir / account_id
    provider = pick_provider(acc, provider or (body.provider if body else None))
    others = [p for p in acc.get("providers", {}) if p != provider]
    if effective_wipe:
        _wipe(request, user_id, user_storage, acc, account_id, acc_path, provider, others)
    else:
        # Preserves data: remove this provider's session only
        user_storage.remove_session(account_id, provider)
        acc["has_session"] = bool(others)
        user_storage._write_account(acc)

    links = connect_app_db(request.app.state.app_db_path)
    try:  # the provider account is free for any user to link again
        links.execute(
            "DELETE FROM provider_links WHERE user_id = ? AND account_id = ? AND provider = ?",
            (user_id, account_id, provider),
        )
        links.commit()
    finally:
        links.close()

    return DisconnectResponse(
        status="ok",
        account_id=account_id,
        wiped=effective_wipe,
    )
