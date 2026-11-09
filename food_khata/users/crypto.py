"""Password-wrapped data keys for per-user encryption (AC-08, DEC-P2)."""

from __future__ import annotations

import base64
import hashlib
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..contracts import KhataError
from ..storage import read_json, save_json
from . import aead

VAULT_FILENAME = "vault.json"
VAULT_VERSION = 1
SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
_WRAP_AAD = b"food-khata-data-key-v1"
_DATA_AAD = b"food-khata-user-data-v1"


class WrongPassword(KhataError):
    """The password could not unwrap the user's data key."""


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _unb64(value: Any) -> bytes:
    if not isinstance(value, str):
        raise KhataError("Invalid key material")
    try:
        return base64.b64decode(value.encode("ascii"), validate=True)
    except (ValueError, UnicodeError) as exc:
        raise KhataError("Invalid key material") from exc


def derive_key(
    password: str,
    salt: bytes,
    n: int = SCRYPT_N,
    r: int = SCRYPT_R,
    p: int = SCRYPT_P,
    length: int = aead.KEY_BYTES,
) -> bytes:
    """Derive a wrapping key from the user's password with scrypt (DEC-P1)."""
    if not isinstance(password, str) or not password:
        raise WrongPassword("Password must be a non-empty string.")
    try:
        return hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=length,
        )
    except (ValueError, MemoryError) as exc:
        raise KhataError("Unable to derive the encryption key") from exc


class DataCipher:
    """AEAD operations for one user's random data key."""

    def __init__(self, key: bytes) -> None:
        if not isinstance(key, bytes) or len(key) != aead.KEY_BYTES:
            raise KhataError("Invalid data key")
        self._key = key

    def encrypt_json(self, value: Any) -> dict[str, str]:
        return aead.seal(self._key, value, _DATA_AAD)

    def decrypt_json(self, envelope: Any) -> Any:
        return aead.open_sealed(self._key, envelope, _DATA_AAD)

    def encrypt_text(self, value: str) -> dict[str, str]:
        if not isinstance(value, str):
            raise KhataError("Invalid text value")
        return aead.seal(self._key, value, _DATA_AAD)

    def decrypt_text(self, envelope: Any) -> str:
        value = aead.open_sealed(self._key, envelope, _DATA_AAD)
        if not isinstance(value, str):
            raise KhataError("Invalid encrypted text")
        return value


class UserVault:
    """A random data key wrapped by a scrypt key derived from the password."""

    def __init__(self, folder: Path, key: bytes, metadata: dict[str, Any]) -> None:
        self.folder = Path(folder)
        self._key = key
        self.metadata = metadata
        self.cipher = DataCipher(key)

    @property
    def path(self) -> Path:
        return self.folder / VAULT_FILENAME

    @classmethod
    def _write(cls, folder: Path, key: bytes, password: str) -> UserVault:
        salt = os.urandom(SALT_BYTES)
        wrapping_key = derive_key(password, salt)
        nonce = os.urandom(aead.NONCE_BYTES)
        wrapped = aead.encrypt(wrapping_key, nonce, key, _WRAP_AAD)
        metadata: dict[str, Any] = {
            "version": VAULT_VERSION,
            "kdf": {
                "alg": "scrypt",
                "n": SCRYPT_N,
                "r": SCRYPT_R,
                "p": SCRYPT_P,
                "salt": _b64(salt),
            },
            "wrap": {
                "alg": aead.ALGORITHM,
                "nonce": _b64(nonce),
                "ciphertext": _b64(wrapped),
            },
            "created_at": datetime.now(UTC).isoformat(),
        }
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        save_json(folder / VAULT_FILENAME, metadata)
        return cls(folder, key, metadata)

    @classmethod
    def create(cls, folder: Path | str, password: str) -> UserVault:
        """Create a fresh vault with a new random data key."""
        folder = Path(folder)
        if not isinstance(password, str) or not password:
            raise WrongPassword("Password must be a non-empty string.")
        return cls._write(folder, os.urandom(aead.KEY_BYTES), password)

    @classmethod
    def load(cls, folder: Path | str) -> UserVault:
        path = Path(folder) / VAULT_FILENAME
        if not path.is_file():
            raise KhataError("No user encryption key exists yet.")
        metadata = read_json(path)
        if (
            not isinstance(metadata, dict)
            or metadata.get("version") != VAULT_VERSION
            or not isinstance(metadata.get("kdf"), dict)
            or not isinstance(metadata.get("wrap"), dict)
        ):
            raise KhataError("Invalid user encryption key")
        return cls(
            Path(folder),
            b"\x00" * aead.KEY_BYTES,
            metadata,
        )

    @classmethod
    def unlock(cls, folder: Path | str, password: str) -> UserVault:
        """Unwrap the data key; raise WrongPassword on any authentication failure."""
        folder = Path(folder)
        vault = cls.load(folder)
        kdf = vault.metadata["kdf"]
        wrap = vault.metadata["wrap"]
        if kdf.get("alg") != "scrypt" or wrap.get("alg") != aead.ALGORITHM:
            raise KhataError("Unsupported user encryption key")
        try:
            n = int(kdf["n"])
            r = int(kdf["r"])
            p = int(kdf["p"])
            salt = _unb64(kdf["salt"])
            nonce = _unb64(wrap["nonce"])
            wrapped = _unb64(wrap["ciphertext"])
        except (KeyError, TypeError, ValueError) as exc:
            raise KhataError("Invalid user encryption key") from exc
        if n < 2 or r < 1 or p < 1 or len(salt) < 8 or len(nonce) != aead.NONCE_BYTES:
            raise KhataError("Invalid user encryption key")
        wrapping_key = derive_key(password, salt, n, r, p)
        try:
            key = aead.decrypt(wrapping_key, nonce, wrapped, _WRAP_AAD)
        except KhataError as exc:
            raise WrongPassword("Wrong password.") from exc
        vault._key = key
        vault.cipher = DataCipher(key)
        return vault

    @classmethod
    def unlock_or_create(cls, folder: Path | str, password: str) -> UserVault:
        folder = Path(folder)
        if (folder / VAULT_FILENAME).is_file():
            return cls.unlock(folder, password)
        return cls.create(folder, password)

    def rewrap(self, new_password: str) -> None:
        """Re-wrap the same data key under a new password."""
        if not isinstance(new_password, str) or not new_password:
            raise WrongPassword("Password must be a non-empty string.")
        replacement = self._write(self.folder, self._key, new_password)
        self.metadata = replacement.metadata

    def rotate(self, new_password: str) -> None:
        """Create a new random data key (used when a password reset loses the old key)."""
        replacement = self._write(
            self.folder, os.urandom(aead.KEY_BYTES), new_password
        )
        self._key = replacement._key
        self.cipher = replacement.cipher
        self.metadata = replacement.metadata
