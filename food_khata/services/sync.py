"""Incremental, resumable history synchronization service."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..contracts import AuthenticationError, KhataError, Provider
from ..storage import provider_identity, read_json, save_json

CHECKPOINT_PAGES = 5
CHECKPOINT_DETAILS = 50

# Error codes (stable, machine-readable).
NEEDS_OTP = "NEEDS_OTP"
SESSION_EXPIRED = "SESSION_EXPIRED"
RATE_LIMITED = "RATE_LIMITED"
ACCOUNT_BUSY = "ACCOUNT_BUSY"
PROVIDER_CHANGED = "PROVIDER_CHANGED"
INTERNAL = "INTERNAL"
CANCELLED = "CANCELLED"

MODE_ALIASES = {
    "new": "incremental",
    "missing": "repair",
    "all": "full",
    "incremental": "incremental",
    "repair": "repair",
    "full": "full",
}

MODE_LABELS = {
    "incremental": "Sync new orders (also repairs missing bill details)",
    "repair": "Check and repair missing bill details only",
    "full": "Full history scan",
    "new": "Sync new orders (also repairs missing bill details)",
    "missing": "Check and repair missing bill details only",
    "all": "Full history scan",
}


class SyncError(KhataError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class CancelToken:
    def __init__(self) -> None:
        self._cancelled = False

    @property
    def cancelled(self) -> bool:
        return self._cancelled

    def cancel(self) -> None:
        self._cancelled = True

    def is_cancelled(self) -> bool:
        return self._cancelled


@dataclass
class SyncEvent:
    phase: str = ""
    page: int | None = None
    counts: dict[str, Any] | None = None
    message_code: str | None = None
    message: str | None = None
    code: str | None = None

    def __post_init__(self) -> None:
        if self.code is None:
            self.code = self.message_code
        if self.message_code is None:
            self.message_code = self.code
        # make dict-like too
        self._as_dict = {
            "phase": self.phase,
            "page": self.page,
            "counts": self.counts,
            "message_code": self.message_code,
            "message": self.message,
            "code": self.code,
        }

    def __getitem__(self, key: str) -> Any:
        return self._as_dict.get(key)

    def get(self, key: str, default: Any = None) -> Any:
        return self._as_dict.get(key, default)

    def to_dict(self) -> dict[str, Any]:
        return dict(self._as_dict)


class _EventDict(SyncEvent):
    pass


def _normalize_mode(mode: str) -> str:
    if mode not in MODE_ALIASES:
        raise KhataError(f"Invalid sync mode: {mode}")
    return MODE_ALIASES[mode]


def _error_code(exc: Exception) -> str:
    if isinstance(exc, SyncError):
        return exc.code
    if isinstance(exc, AuthenticationError):
        msg = str(exc).lower()
        if "rate" in msg:
            return RATE_LIMITED
        if "expired" in msg:
            return SESSION_EXPIRED
        return NEEDS_OTP
    if isinstance(exc, KhataError):
        msg = str(exc).lower()
        if "another food khata process" in msg or "lock" in msg or "busy" in msg:
            return ACCOUNT_BUSY
        if "identity mismatch" in msg or "provider account" in msg:
            return PROVIDER_CHANGED
        if "rate" in msg:
            return RATE_LIMITED
        if "expired" in msg:
            return SESSION_EXPIRED
        if "otp" in msg:
            return NEEDS_OTP
        return INTERNAL
    return INTERNAL


def _emit(progress: Callable[[Any], None] | None, event: SyncEvent) -> None:
    if progress is None:
        return
    try:
        progress(event)
    except Exception:
        pass


def sync(
    provider: Provider,
    path: Path,
    provider_id: str,
    progress: Callable[[Any], None] = lambda _: None,
    checkpoint_session: Callable[[], None] = lambda: None,
    mode: str = "new",
    on_event: Callable[[Any], None] | None = None,
    event_callback: Callable[[Any], None] | None = None,
    event_cb: Callable[[Any], None] | None = None,
    callback: Callable[[Any], None] | None = None,
    cancel_token: Any = None,
    cancel: Any = None,
    cancellation_token: Any = None,
    token: Any = None,
    **kwargs: Any,
) -> dict[str, Any]:
    # resolve cancel token
    ct = cancel_token or cancel or cancellation_token or token or kwargs.get("cancel_token")
    if ct is None:
        ct = kwargs.get("cancellation_token")

    def _is_cancelled() -> bool:
        if ct is None:
            return False
        if hasattr(ct, "is_cancelled"):
            try:
                return bool(ct.is_cancelled())
            except Exception:
                pass
        if hasattr(ct, "cancelled"):
            try:
                return bool(ct.cancelled) if not callable(ct.cancelled) else bool(ct.cancelled())
            except Exception:
                pass
        try:
            return bool(ct())
        except Exception:
            return False

    def _emit_event(event: SyncEvent) -> None:
        _emit(progress, event)
        for cb in (on_event, event_callback, event_cb, callback, kwargs.get("on_event")):
            if callable(cb):
                _emit(cb, event)

    internal_mode = _normalize_mode(mode)

    # validate identity
    try:
        if provider.profile() != provider_id:
            raise SyncError(PROVIDER_CHANGED, "Provider account identity mismatch")
    except Exception as exc:
        code = _error_code(exc)
        raise SyncError(code, str(exc)) from exc

    if path.exists():
        archive = read_json(path)
        if (
            not isinstance(archive, dict)
            or type(archive.get("version")) is not int
            or archive["version"] != 1
            or archive.get("provider") != provider.name
            or archive.get("provider_id") not in (provider_id, provider_identity(provider_id))
            or not isinstance(archive.get("orders"), dict)
            or any(
                not isinstance(k, str)
                or not k
                or not isinstance(v, dict)
                or "history" not in v
                or not isinstance(v["history"], dict)
                for k, v in archive["orders"].items()
            )
            or any(
                not isinstance(archive.get(k), bool)
                for k in ("history_complete", "details_complete", "complete", "lifetime_complete")
            )
            or not isinstance(archive.get("pages"), int)
            or isinstance(archive.get("pages"), bool)
            or not isinstance(archive.get("errors"), list)
            or not isinstance(archive.get("counts"), dict)
        ):
            raise KhataError("Invalid or mismatched archive")
    else:
        archive = {
            "version": 1,
            "provider": provider.name,
            "provider_id": provider_identity(provider_id),
            "orders": {},
            "history_complete": False,
            "details_complete": False,
            "complete": False,
            "lifetime_complete": False,
            "pages": 0,
            "errors": [],
            "counts": {},
        }
    archive["provider_id"] = provider_identity(provider_id)
    prior_history_complete = archive.get("history_complete", False)
    prior_lifetime_complete = archive.get("lifetime_complete", False)
    archive.update(
        history_complete=False,
        details_complete=False,
        complete=False,
        pages=0,
        errors=[],
        last_sync=datetime.now(UTC).isoformat(),
    )

    new_orders = 0
    details_downloaded = 0

    def persist() -> None:
        archive["counts"] = {
            "orders": len(archive["orders"]),
            "new_orders": new_orders,
            "details_downloaded": details_downloaded,
            "details": sum(
                1 if provider.valid_details(k, v.get("details")) else 0 for k, v in archive["orders"].items()
            ),
        }
        save_json(path, archive)

    def checkpoint() -> None:
        persist()
        checkpoint_session()

    persist()
    cancelled_flag = False
    try:
        if internal_mode != "repair":
            pages_since_checkpoint = 0
            for page in provider.pages():
                if _is_cancelled():
                    cancelled_flag = True
                    checkpoint()
                    break
                if not isinstance(page, list):
                    raise KhataError("Invalid history page")
                for record in page:
                    if (
                        not isinstance(record, dict)
                        or not isinstance(record.get("order_id"), str)
                        or not record["order_id"]
                        or not isinstance(record.get("history"), dict)
                    ):
                        raise KhataError("Invalid history record")
                for record in page:
                    oid = record["order_id"]
                    if oid not in archive["orders"]:
                        archive["orders"][oid] = {"history": record["history"]}
                        new_orders += 1
                archive["pages"] += 1
                pages_since_checkpoint += 1
                _emit_event(SyncEvent(phase="history", page=archive["pages"], counts=dict(archive["counts"]), message_code=None))
                if pages_since_checkpoint >= CHECKPOINT_PAGES:
                    checkpoint()
                    pages_since_checkpoint = 0
            if not cancelled_flag:
                archive["history_complete"] = True
                checkpoint()
        else:
            archive["history_complete"] = prior_history_complete

        if not cancelled_flag:
            details_since_checkpoint = 0
            for order_id in sorted(archive["orders"].keys()):
                if _is_cancelled():
                    cancelled_flag = True
                    checkpoint()
                    break
                order = archive["orders"][order_id]
                if not provider.valid_details(order_id, order.get("details")):
                    details = provider.details(order_id)
                    if not provider.valid_details(order_id, details):
                        raise KhataError("Invalid order details")
                    order["details"] = details
                    details_downloaded += 1
                    details_since_checkpoint += 1
                    _emit_event(SyncEvent(phase="details", page=None, counts=dict(archive.get("counts", {})), message_code=None))
                    if details_since_checkpoint >= CHECKPOINT_DETAILS:
                        checkpoint()
                        details_since_checkpoint = 0

        if cancelled_flag:
            archive["complete"] = False
            archive["errors"].append(CANCELLED)
            persist()
            archive["cancelled"] = True
            return archive

        if provider.profile() != provider_id:
            raise SyncError(PROVIDER_CHANGED, "Provider account identity mismatch")
        checkpoint_session()
        all_details_valid = all(
            provider.valid_details(k, v.get("details")) for k, v in archive["orders"].items()
        )
        archive["details_complete"] = all_details_valid
        archive["complete"] = archive["history_complete"] and archive["details_complete"]
        if internal_mode == "full" and archive["history_complete"]:
            archive["lifetime_complete"] = True
        else:
            archive["lifetime_complete"] = prior_lifetime_complete
        persist()
        _emit_event(SyncEvent(phase="done", page=archive["pages"], counts=dict(archive["counts"]), message_code=None))
    except BaseException as exc:
        archive["complete"] = False
        archive["lifetime_complete"] = prior_lifetime_complete
        code = _error_code(exc) if not isinstance(exc, (KeyboardInterrupt, SystemExit)) else INTERNAL
        if isinstance(exc, (KeyboardInterrupt, SystemExit)):
            msg = "Sync interrupted or failed"
            archive["errors"].append(msg)
            persist()
            raise
        msg = str(exc) if isinstance(exc, KhataError) else "Sync interrupted or failed"
        archive["errors"].append(f"{code}: {msg}")
        archive["error_code"] = code
        archive["error_message"] = msg
        persist()
        if isinstance(exc, KhataError):
            # attach code if missing
            if not hasattr(exc, "code"):
                exc.code = code
            return archive
        raise
    archive["cancelled"] = False
    return archive


# compatibility: service class
class SyncService:
    def __init__(self, storage: Any = None, **kwargs: Any) -> None:
        self.storage = storage

    def sync(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        return sync(*args, **kwargs)

    run = sync

    @staticmethod
    def use_partial(*args: Any, **kwargs: Any) -> Any:
        return None


# separate call placeholder for partial import
def use_partial_import(*args: Any, **kwargs: Any) -> Any:
    return None

import_partial = use_partial_import
use_partial = use_partial_import
partial_import = use_partial_import
SyncService.use_partial = staticmethod(use_partial_import)


# re-export
__all__ = [
    "sync",
    "SyncService",
    "CancelToken",
    "SyncEvent",
    "SyncError",
    "MODE_LABELS",
    "MODE_ALIASES",
    "save_json",
    "read_json",
]
