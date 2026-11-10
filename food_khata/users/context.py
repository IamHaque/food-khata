"""Per-user data folders and unlocked user contexts (AC-08)."""

from __future__ import annotations

import os
import re
import shutil
from pathlib import Path
from typing import Any

from ..contracts import KhataError
from ..storage import Storage
from .crypto import DataCipher, UserVault

USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def validate_user_id(user_id: Any) -> str:
    """Accept only a single safe path component as a user identifier."""
    if (
        not isinstance(user_id, str)
        or not USER_ID_PATTERN.fullmatch(user_id)
        or user_id in {".", ".."}
    ):
        raise KhataError("Invalid user ID")
    return user_id


def user_id_of(user: Any) -> str:
    """Read an id from a session-like mapping or object, for adoption helpers."""
    if isinstance(user, str):
        return validate_user_id(user)
    if isinstance(user, dict):
        value = user.get("user_id") or user.get("id")
    else:
        value = getattr(user, "user_id", None) or getattr(user, "id", None)
    return validate_user_id(value)


def ensure_private_dir(path: Path | str) -> Path:
    """Create a directory with 0700 permissions (best effort on Windows)."""
    directory = Path(path)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        os.chmod(directory, 0o700)
    except OSError:
        pass
    return directory


def users_root(data_root: Path | str) -> Path:
    return Path(data_root).expanduser().resolve() / "users"


def user_root(data_root: Path | str, user_id: Any) -> Path:
    """Return ``<data-root>/users/<id>`` after rejecting traversal and symlinks."""
    identifier = validate_user_id(user_id)
    path = users_root(data_root) / identifier
    if path.is_symlink():
        raise KhataError("User data directories must not be symbolic links.")
    return path


def user_database(data_root: Path | str, user_id: Any) -> Path:
    return user_root(data_root, user_id) / "food_analytics.db"


def adopt_legacy_root(root_or_storage: Path | str | Storage, user: Any) -> dict[str, Any]:
    """Adopt an existing legacy data root into one user's folder.

    Accepts a data root, an existing :class:`Storage`, or a user-like object.
    """
    storage = (
        root_or_storage if isinstance(root_or_storage, Storage) else Storage(Path(root_or_storage))
    )
    return storage.adopt_legacy_root(user_id_of(user))


class UserContext:
    """The filesystem and encryption context for one authenticated user."""

    def __init__(
        self,
        data_root: Path | str,
        user_id: Any,
        cipher: DataCipher | None = None,
    ) -> None:
        self.data_root = Path(data_root).expanduser().resolve()
        self.user_id = validate_user_id(user_id)
        self.root = user_root(self.data_root, self.user_id)
        self.cipher = cipher
        self.storage = Storage(self.root, cipher=cipher)

    @property
    def data_dir(self) -> Path:
        return self.root

    @property
    def database(self) -> Path:
        return self.root / "food_analytics.db"

    @property
    def db_path(self) -> Path:
        return self.database

    def ensure(self) -> UserContext:
        ensure_private_dir(users_root(self.data_root))
        ensure_private_dir(self.root)
        return self

    def initialize(self, password: str) -> UserContext:
        """Create the vault on first use or unlock an existing one."""
        return self.unlock(password)

    def unlock(self, password: str) -> UserContext:
        """Unlock the data key, then migrate any plaintext sessions/phones."""
        self.ensure()
        vault = UserVault.unlock_or_create(self.root, password)
        self.cipher = vault.cipher
        self.storage = Storage(self.root, cipher=self.cipher)
        self.storage.migrate_plaintext()
        # A failed adoption keeps its intent so login resumes using the same user and key.
        if (self.root / ".adoption-pending.json").exists():
            self.adopt_legacy_root()
            (self.root / ".adoption-pending.json").unlink(missing_ok=True)
        for backup in self.data_root.glob("legacy-backup*"):
            if backup.is_dir() and not backup.is_symlink():
                Storage(backup, cipher=self.cipher).migrate_plaintext()
        return self

    def change_password(self, old_password: str, new_password: str) -> None:
        """Re-wrap the existing data key; provider sessions stay readable."""
        vault = UserVault.unlock(self.root, old_password)
        vault.rewrap(new_password)
        self.cipher = vault.cipher
        self.storage = Storage(self.root, cipher=self.cipher)

    def wipe_provider_sessions(self) -> int:
        """Delete every encrypted provider session for this user."""
        accounts = self.storage.accounts_dir
        removed = 0
        if not accounts.is_dir():
            return removed
        for account in accounts.iterdir():
            session_dir = account / "sessions"
            if not session_dir.is_dir():
                continue
            for path in session_dir.glob("*.json"):
                path.unlink(missing_ok=True)
                removed += 1
        return removed

    def reset_password(self, new_password: str | None = None) -> int:
        """Owner-driven reset: sessions cannot be decrypted, so wipe them.

        When a new password is supplied a fresh data key is created.  The old
        key is unrecoverable by design (DEC-P2), so phone metadata is cleared while account IDs and provider identity digests
        remain available for re-linking providers.
        """
        removed = self.wipe_provider_sessions()
        if new_password is not None:
            from ..storage import PHONE_ENCRYPTED_KEY, read_json, save_json

            for path in self.storage.accounts_dir.glob("*/account.json"):
                metadata = read_json(path)
                if "provider_identities" in metadata:
                    metadata["providers"] = metadata["provider_identities"]
                metadata.pop(PHONE_ENCRYPTED_KEY, None)
                metadata["phone"] = ""
                save_json(path, metadata)
            vault = UserVault.create(self.root, new_password)
            self.cipher = vault.cipher
            self.storage = Storage(self.root, cipher=self.cipher)
        return removed

    def adopt_legacy_root(self) -> dict[str, Any]:
        """Adopt the shared legacy data root into this user's folder."""
        result = Storage(self.data_root, cipher=self.cipher).adopt_legacy_root(self.user_id)
        if self.cipher is not None:
            self.storage.migrate_plaintext()
        return result

    def remove(self) -> None:
        """Delete this user's data folder (used by owner account removal)."""
        if self.root.exists():
            shutil.rmtree(self.root)


def unlock_user(data_root: Path | str, user: Any, password: str) -> UserContext:
    """Unlock one user's context (convenience used by CLI and owner flows)."""
    return UserContext(data_root, user_id_of(user)).unlock(password)


def change_password(data_root: Path | str, user: Any, old_password: str, new_password: str) -> None:
    """Re-wrap a user's data key after their own password change."""
    UserContext(data_root, user_id_of(user)).change_password(old_password, new_password)


def reset_password(data_root: Path | str, user: Any, new_password: str | None = None) -> int:
    """Owner reset: wipe unreadable provider sessions (and optionally rotate key)."""
    return UserContext(data_root, user_id_of(user)).reset_password(new_password)


def wipe_provider_sessions(data_root: Path | str, user: Any) -> int:
    """Delete all provider sessions for one user."""
    return UserContext(data_root, user_id_of(user)).wipe_provider_sessions()
