"""Crash-safe local account and session storage."""

import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .contracts import KhataError

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / ".food-khata"
ENCRYPTED_KEY = "__encrypted__"
PHONE_ENCRYPTED_KEY = "phone_encrypted"


def provider_identity(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode()).hexdigest()


ADOPTION_MARKER = ".adopted.json"


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
    if value not in ("zomato", "swiggy", "fake"):
        raise KhataError("Invalid provider")
    return value


def _is_envelope(value: Any) -> bool:
    return isinstance(value, dict) and isinstance(value.get(ENCRYPTED_KEY), dict)


class Storage:
    """Account and session storage, optionally encrypted with a user data key."""

    def __init__(self, root: Path | None = None, cipher: Any | None = None) -> None:
        self.root = Path(root).expanduser().resolve() if root is not None else DEFAULT_DATA_DIR
        self.accounts_dir = self.root / "accounts"
        self.cipher = cipher

    @property
    def users_dir(self) -> Path:
        return self.root / "users"

    def user_storage(self, user_id: str, cipher: Any | None = None) -> "Storage":
        """Return storage scoped to ``users/<user_id>/``."""
        from .users.context import user_root

        return Storage(user_root(self.root, user_id), cipher=cipher)

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

    # -- encrypted serialization -------------------------------------------------

    def _seal(self, value: dict[str, Any]) -> dict[str, Any]:
        if self.cipher is None:
            raise KhataError("User data is locked.")
        return {ENCRYPTED_KEY: self.cipher.encrypt_json(value)}

    def _unseal(self, value: Any) -> dict[str, Any]:
        if _is_envelope(value):
            if self.cipher is None:
                raise KhataError("Session is encrypted; unlock the user data first.")
            return self.cipher.decrypt_json(value[ENCRYPTED_KEY])
        if not isinstance(value, dict):
            raise KhataError("Invalid session")
        return value

    def _stored_account(self, account: dict[str, Any]) -> dict[str, Any]:
        stored = {key: value for key, value in account.items() if key not in ("has_session",)}
        if self.cipher is not None:
            providers = stored.get("providers", {})
            stored["provider_identities"] = {
                k: (v if v.startswith("sha256:") else provider_identity(v))
                for k, v in providers.items()
            }
            stored["providers"] = {k: self.cipher.encrypt_text(v) for k, v in providers.items()}
            phone = stored.pop("phone", None)
            if phone is not None:
                stored[PHONE_ENCRYPTED_KEY] = self.cipher.encrypt_text(phone)
        return stored

    def _write_account(self, account: dict[str, Any]) -> None:
        save_json(
            self.account_path(account["local_id"]) / "account.json",
            self._stored_account(account),
        )

    def _decrypt_phone(self, data: dict[str, Any], rewrite: bool) -> dict[str, Any]:
        data = dict(data)
        providers = data.get("providers", {})
        if any(isinstance(v, dict) for v in providers.values()):
            if self.cipher is None:
                raise KhataError("Account metadata is encrypted; unlock the user data first.")
            data["providers"] = {
                k: self.cipher.decrypt_text(v) if isinstance(v, dict) else v
                for k, v in providers.items()
            }
        if PHONE_ENCRYPTED_KEY in data:
            if self.cipher is None:
                raise KhataError("Account metadata is encrypted; unlock the user data first.")
            data = dict(data)
            data["phone"] = self.cipher.decrypt_text(data[PHONE_ENCRYPTED_KEY])
        elif self.cipher is not None and rewrite and "phone" in data:
            self._write_account(data)
        return data

    # -- account metadata -------------------------------------------------------

    def _metadata(self) -> list[dict[str, Any]]:
        result = []
        if not self.accounts_dir.exists():
            return result
        for path in self.accounts_dir.iterdir():
            if not path.is_dir():
                continue
            self.account_path(path.name)
            data = read_json(path / "account.json")
            if not isinstance(data, dict):
                raise KhataError("Invalid account metadata")
            data = self._decrypt_phone(data, rewrite=True)
            if (
                data.get("version") != 1
                or data.get("local_id") != path.name
                or not isinstance(data.get("phone"), str)
                or (data["phone"] != "" and not re.fullmatch(r"[6-9][0-9]{9}", data["phone"]))
                or not isinstance(data.get("providers"), dict)
                or any(
                    k not in ("zomato", "swiggy", "fake") or not isinstance(v, str) or not v
                    for k, v in data["providers"].items()
                )
            ):
                raise KhataError("Invalid account metadata")
            result.append(data)
        return result

    def accounts(
        self, provider: str, include_unauthenticated: bool = False
    ) -> list[dict[str, Any]]:
        _provider(provider)
        accounts = [a for a in self._metadata() if provider in a["providers"]]
        for a in accounts:
            a["has_session"] = self.session(a["local_id"], provider) is not None
        if not include_unauthenticated:
            return [a for a in accounts if a["has_session"]]
        return accounts

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
            matches = [
                a
                for a in accounts
                if a["phone"] == phone
                or (
                    not a["phone"]
                    and a["providers"].get(provider)
                    in (provider_id, provider_identity(provider_id))
                )
            ]
            if len(matches) > 1 or any(
                a["providers"].get(provider) == provider_id and a["phone"] not in ("", phone)
                for a in accounts
            ):
                raise KhataError("Account identity mismatch")
            account = (
                matches[0]
                if matches
                else {"version": 1, "local_id": str(uuid.uuid4()), "phone": phone, "providers": {}}
            )
            if provider in account["providers"] and account["providers"][provider] not in (
                provider_id,
                provider_identity(provider_id),
            ):
                raise KhataError("Account identity mismatch")
            account["phone"] = phone
            account["providers"][provider] = provider_id
            self._write_account(account)
            return account

    # -- provider sessions ------------------------------------------------------

    def session(self, local_id: str, provider: str) -> dict[str, Any] | None:
        path = self.account_path(local_id) / "sessions" / (_provider(provider) + ".json")
        if not path.exists():
            return None
        value = read_json(path)
        if _is_envelope(value):
            value = self._unseal(value)
        elif not isinstance(value, dict):
            raise KhataError("Invalid session")
        elif self.cipher is not None:
            # Migrate a plaintext session on first unlock; the atomic replace
            # removes the plaintext bytes.
            save_json(path, self._seal(value))
        if not isinstance(value, dict):
            raise KhataError("Invalid session")
        return value

    def save_session(self, local_id: str, provider: str, value: dict[str, Any]) -> None:
        if not isinstance(value, dict):
            raise KhataError("Invalid session")
        path = self.account_path(local_id) / "sessions" / (_provider(provider) + ".json")
        if path.exists():
            self.session(local_id, provider)
        save_json(path, self._seal(value) if self.cipher is not None else value)

    def remove_session(self, local_id: str, provider: str) -> None:
        (self.account_path(local_id) / "sessions" / (_provider(provider) + ".json")).unlink(
            missing_ok=True
        )

    def migrate_plaintext(self) -> int:
        """Encrypt plaintext phones and sessions; return the number of rewrites.

        Called after a successful unlock.  Rewrites use atomic replacement, so
        the plaintext file is deleted once the encrypted file is in place.
        """
        if self.cipher is None or not self.accounts_dir.is_dir():
            return 0
        migrated = 0
        for account_dir in self.accounts_dir.iterdir():
            if not account_dir.is_dir():
                continue
            metadata_path = account_dir / "account.json"
            if not metadata_path.is_file():
                continue
            self.account_path(account_dir.name)
            metadata = read_json(metadata_path) if metadata_path.is_file() else None
            if (
                isinstance(metadata, dict)
                and (
                    PHONE_ENCRYPTED_KEY not in metadata
                    or any(isinstance(v, str) for v in metadata.get("providers", {}).values())
                )
                and (isinstance(metadata.get("phone"), str) or PHONE_ENCRYPTED_KEY in metadata)
            ):
                self._write_account(self._decrypt_phone(metadata, rewrite=False))
                migrated += 1
            sessions_dir = account_dir / "sessions"
            if not sessions_dir.is_dir():
                continue
            for session_path in sessions_dir.glob("*.json"):
                raw = read_json(session_path)
                if not isinstance(raw, dict) or _is_envelope(raw):
                    continue
                self.save_session(account_dir.name, session_path.stem, raw)
                migrated += 1
        return migrated

    # -- legacy adoption --------------------------------------------------------

    def _legacy_entries(self) -> list[Path]:
        skip = {"users", "legacy-backup", ".adopt.lock", ".root.lock"}
        entries = []
        if not self.root.is_dir():
            return entries
        for entry in self.root.iterdir():
            if entry.name in skip or entry.name.startswith("legacy-backup-"):
                continue
            if entry.is_symlink():
                continue
            entries.append(entry)
        return entries

    @staticmethod
    def _unique_path(path: Path) -> Path:
        if not path.exists():
            return path
        for index in range(2, 1000):
            candidate = path.with_name(f"{path.name}-{index}")
            if not candidate.exists():
                return candidate
        raise KhataError("Unable to choose a backup directory")

    def adopt_legacy_root(self, user: Any) -> dict[str, Any]:
        """Move a legacy shared data root into ``users/<id>/`` keeping a backup.

        The second call is a no-op thanks to an adoption marker.  The backup is
        a sibling ``legacy-backup`` folder inside the same data root.
        """
        from .users.context import user_id_of, validate_user_id

        user_id = validate_user_id(user_id_of(user))
        destination = self.users_dir / user_id
        marker = destination / ADOPTION_MARKER
        if marker.is_file():
            return {
                "adopted": False,
                "user_id": user_id,
                "user_dir": str(destination),
                "backup": None,
                "items": [],
            }
        with lock(self.root / ".adopt.lock"):
            if marker.is_file():
                return {
                    "adopted": False,
                    "user_id": user_id,
                    "user_dir": str(destination),
                    "backup": None,
                    "items": [],
                }
            entries = self._legacy_entries()
            if not entries:
                return {
                    "adopted": False,
                    "user_id": user_id,
                    "user_dir": str(destination),
                    "backup": None,
                    "items": [],
                }
            destination.mkdir(mode=0o700, parents=True, exist_ok=True)
            backup_base = self.root / "legacy-backup"
            backup = self._unique_path(backup_base)
            backup.mkdir(mode=0o700, parents=True, exist_ok=True)
            copied: list[str] = []
            for entry in entries:
                target = destination / entry.name
                if target.exists():
                    continue
                if entry.is_dir():
                    shutil.copytree(entry, target, symlinks=False)
                else:
                    shutil.copy2(entry, target)
                copied.append(entry.name)
            # Only remove originals once every item has a copy in the user folder.
            for entry in entries:
                target = backup / entry.name
                if entry.is_dir():
                    shutil.move(str(entry), str(self._unique_path(target)))
                else:
                    shutil.move(str(entry), str(self._unique_path(target)))
            save_json(
                marker,
                {
                    "version": 1,
                    "user_id": user_id,
                    "backup": backup.name,
                    "items": copied,
                },
            )
            return {
                "adopted": True,
                "user_id": user_id,
                "user_dir": str(destination),
                "backup": str(backup),
                "items": copied,
            }
