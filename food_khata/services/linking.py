"""Provider linking: two-step login handles, cached status, disconnect."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..contracts import KhataError
from ..providers.base import get_provider
from ..storage import Storage

HANDLE_TTL_SECONDS = 600


class LinkExpiredError(KhataError):
    pass


class HandleInUseError(KhataError):
    pass


@dataclass
class LoginHandle:
    handle: str
    provider: str
    phone: str
    user: Any
    created_at: float
    expires_at: float
    provider_instance: Any
    used: bool = False


@dataclass
class LinkingService:
    storage: Storage
    _handles: dict[str, LoginHandle] = field(default_factory=dict)

    def __init__(self, storage: Any = None, *, root: Any = None, data_dir: Any = None, storage_root: Any = None) -> None:
        if isinstance(storage, Storage):
            self.storage = storage
        elif storage is not None and not isinstance(storage, (str, Path)):
            # maybe a root path passed positionally
            try:
                self.storage = Storage(storage)
            except Exception:
                self.storage = Storage(root or data_dir or storage_root)
        else:
            root = storage if isinstance(storage, (str, Path)) else (root or data_dir or storage_root)
            self.storage = Storage(root) if root is not None else Storage()
        self._handles = {}

    # ---------- login ----------
    def _provider_name(self, provider: Any) -> str:
        if hasattr(provider, "name") and isinstance(provider.name, str):
            return provider.name
        if isinstance(provider, str):
            return provider
        raise KhataError("Invalid provider")

    def _make_provider(self, provider: Any, session: dict[str, Any] | None = None) -> Any:
        name = self._provider_name(provider)
        if hasattr(provider, "start_login"):
            # already an instance
            return provider
        return get_provider(name, session)

    def start_login(self, provider: Any, phone: str, *, user: Any = None) -> str:
        name = self._provider_name(provider)
        if name not in ("zomato", "swiggy", "fake"):
            raise KhataError("Invalid provider")
        if not isinstance(phone, str) or not phone.strip():
            raise KhataError("Invalid phone number")
        phone = phone.strip()
        # basic phone validation delegated to provider
        instance = provider if hasattr(provider, "start_login") else get_provider(name)
        try:
            instance.start_login(phone)
        except Exception as exc:
            raise KhataError(str(exc)) from exc
        handle = secrets.token_urlsafe(32)
        now = time.time()
        self._handles[handle] = LoginHandle(
            handle=handle,
            provider=name,
            phone=phone,
            user=user,
            created_at=now,
            expires_at=now + HANDLE_TTL_SECONDS,
            provider_instance=instance,
        )
        return handle

    def verify_otp(self, handle: str, code: str, *, user: Any = None) -> dict[str, Any]:
        entry = self._handles.get(handle)
        if entry is None:
            raise KhataError("Invalid or unknown login handle.")
        if entry.used:
            raise HandleInUseError("Login handle already used.")
        if time.time() > entry.expires_at:
            del self._handles[handle]
            raise LinkExpiredError("Login handle expired.")
        if entry.user is not None and user is not None and entry.user != user:
            raise HandleInUseError("Login handle belongs to another user.")
        if entry.user is not None and user is None:
            # allow if no user context given? keep safe: require match only when provided
            pass
        try:
            provider_id = entry.provider_instance.verify_otp(code)
        except Exception as exc:
            raise KhataError(str(exc)) from exc
        if not isinstance(provider_id, str) or not provider_id.strip():
            # try profile()
            try:
                provider_id = entry.provider_instance.profile()
            except Exception as exc:
                raise KhataError(str(exc)) from exc
        provider_id = str(provider_id).strip()
        # single-use
        entry.used = True
        del self._handles[handle]

        account = self.storage.bind(entry.phone, entry.provider, provider_id)
        session_value = entry.provider_instance.dump_session()
        self.storage.save_session(account["local_id"], entry.provider, session_value)
        return {
            "local_id": account["local_id"],
            "provider": entry.provider,
            "provider_id": provider_id,
            "account": account,
            "phone": entry.phone,
        }

    # ---------- status / listing ----------
    def _cached_status(self, session: dict[str, Any] | None) -> str:
        if not isinstance(session, dict):
            return "expired"
        now = time.time()
        expires = session.get("expires_at") or session.get("expiry") or session.get("exp")
        if isinstance(expires, (int, float)):
            if now > float(expires):
                return "expired"
            if now > float(expires) - 86400:
                return "expiring"
            return "ok"
        # heuristic: session present -> ok
        return "ok"

    def list_accounts(self, provider: str | None = None, *, user: Any = None) -> list[dict[str, Any]]:
        providers = [provider] if provider else ["zomato", "swiggy"]
        result: list[dict[str, Any]] = []
        for prov in providers:
            try:
                accounts = self.storage.accounts(prov, include_unauthenticated=True)
            except Exception:
                accounts = []
            for acc in accounts:
                session = self.storage.session(acc["local_id"], prov)
                status = self._cached_status(session)
                result.append(
                    {
                        "local_id": acc["local_id"],
                        "provider": prov,
                        "phone": acc.get("phone"),
                        "provider_id": acc.get("providers", {}).get(prov),
                        "has_session": session is not None,
                        "status": status,
                        "last_sync": acc.get("last_sync"),
                    }
                )
        return result

    accounts = list_accounts

    # ---------- refresh / identity re-check ----------
    def refresh(self, local_id: str, provider: str, *, user: Any = None) -> bool:
        session = self.storage.session(local_id, provider)
        if session is None:
            return False
        # find linked provider id
        try:
            meta = None
            for acc in self.storage.accounts(provider, include_unauthenticated=True):
                if acc["local_id"] == local_id:
                    meta = acc
                    break
        except Exception:
            meta = None
        linked_id = meta.get("providers", {}).get(provider) if meta else None
        instance = get_provider(provider, session)
        ok = instance.refresh_session()
        if not ok:
            return False
        try:
            current_id = instance.profile()
        except Exception:
            return False
        if linked_id is not None and str(current_id).strip() != str(linked_id).strip():
            raise KhataError("Provider account identity mismatch; link failed.")
        # persist refreshed session
        try:
            self.storage.save_session(local_id, provider, instance.dump_session())
        except Exception:
            pass
        return True

    refresh_account = refresh
    verify_again = refresh

    # ---------- disconnect ----------
    def disconnect(self, local_id: str, provider: str, *, wipe: bool = False, keep_data: bool | None = None, user: Any = None) -> None:
        if keep_data is not None:
            wipe = not keep_data
        self.storage.remove_session(local_id, provider)
        if wipe:
            try:
                path = self.storage.account_path(local_id)
                # remove account directory entirely
                import shutil

                if path.exists():
                    shutil.rmtree(path)
            except Exception:
                raise

    disconnect_account = disconnect
    unlink = disconnect

    # ---------- handle inspection ----------
    def handle_status(self, handle: str) -> str:
        entry = self._handles.get(handle)
        if entry is None:
            return "unknown"
        if entry.used:
            return "used"
        if time.time() > entry.expires_at:
            return "expired"
        return "pending"


ProviderLinkingService = LinkingService
Linking = LinkingService
