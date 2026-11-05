"""Crash-safe local account and session storage."""

import json
import os
import re
import tempfile
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .contracts import KhataError


def read_json(path: Path) -> Any:
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as exc:
        raise KhataError(f"Cannot read valid JSON: {path}") from exc


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as f:
            name = f.name
            json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


@contextmanager
def lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with os.fdopen(os.open(path, os.O_RDWR | os.O_CREAT, 0o600), "r+b") as f:
        if os.name == "nt":
            import msvcrt

            f.seek(0, 2)
            if not f.tell():
                f.write(b"0")
                f.flush()
            f.seek(0)
            try:
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise KhataError(
                    "Another Food Khata process is using this account; retry when it finishes."
                ) from None
        else:
            import fcntl

            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise KhataError(
                    "Another Food Khata process is using this account; retry when it finishes."
                ) from None
        try:
            yield
        finally:
            if os.name == "nt":
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def _provider(value: str) -> str:
    if value not in ("zomato", "swiggy"):
        raise KhataError("Invalid provider")
    return value


class Storage:
    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(root) if root is not None else Path.home() / ".food-khata"
        self.accounts_dir = self.root / "accounts"

    def account_path(self, local_id: str) -> Path:
        try:
            if str(uuid.UUID(local_id)) != local_id:
                raise ValueError
        except (ValueError, TypeError, AttributeError) as exc:
            raise KhataError("Invalid account ID") from exc
        path = self.accounts_dir / local_id
        if path.is_symlink():
            raise KhataError("Account directories must not be symbolic links.")
        return path

    def _metadata(self) -> list[dict[str, Any]]:
        result = []
        if not self.accounts_dir.exists():
            return result
        for path in self.accounts_dir.iterdir():
            if not path.is_dir():
                continue
            self.account_path(path.name)
            data = read_json(path / "account.json")
            if (
                not isinstance(data, dict)
                or type(data.get("version")) is not int
                or data["version"] != 1
                or data.get("local_id") != path.name
                or not isinstance(data.get("phone"), str)
                or not re.fullmatch(r"[6-9][0-9]{9}", data["phone"])
                or not isinstance(data.get("providers"), dict)
                or any(
                    k not in ("zomato", "swiggy") or not isinstance(v, str) or not v
                    for k, v in data["providers"].items()
                )
            ):
                raise KhataError("Invalid account metadata")
            result.append(data)
        return result

    def accounts(self, provider: str) -> list[dict[str, Any]]:
        _provider(provider)
        return [
            a
            for a in self._metadata()
            if provider in a["providers"] and self.session(a["local_id"], provider) is not None
        ]

    def bind(self, phone: str, provider: str, provider_id: str) -> dict[str, Any]:
        _provider(provider)
        if (
            not isinstance(phone, str)
            or not re.fullmatch(r"[6-9][0-9]{9}", phone)
            or not isinstance(provider_id, str)
            or not provider_id
        ):
            raise KhataError("Invalid account identity")
        with lock(self.root / ".root.lock"):
            accounts = self._metadata()
            matches = [a for a in accounts if a["phone"] == phone]
            if len(matches) > 1 or any(
                a["providers"].get(provider) == provider_id and a["phone"] != phone
                for a in accounts
            ):
                raise KhataError("Account identity mismatch")
            account = (
                matches[0]
                if matches
                else {"version": 1, "local_id": str(uuid.uuid4()), "phone": phone, "providers": {}}
            )
            if provider in account["providers"] and account["providers"][provider] != provider_id:
                raise KhataError("Account identity mismatch")
            account["providers"][provider] = provider_id
            save_json(self.account_path(account["local_id"]) / "account.json", account)
            return account

    def session(self, local_id: str, provider: str) -> dict[str, Any] | None:
        path = self.account_path(local_id) / "sessions" / (_provider(provider) + ".json")
        if not path.exists():
            return None
        value = read_json(path)
        if not isinstance(value, dict):
            raise KhataError("Invalid session")
        return value

    def save_session(self, local_id: str, provider: str, value: dict[str, Any]) -> None:
        if not isinstance(value, dict):
            raise KhataError("Invalid session")
        path = self.account_path(local_id) / "sessions" / (_provider(provider) + ".json")
        if path.exists():
            self.session(local_id, provider)
        save_json(path, value)

    def remove_session(self, local_id: str, provider: str) -> None:
        (self.account_path(local_id) / "sessions" / (_provider(provider) + ".json")).unlink(
            missing_ok=True
        )
