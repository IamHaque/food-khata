"""Salted slow password hashing with standard library hashlib.scrypt (DEC-P1)."""

import hashlib
import hmac
import os

SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 64
SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Hash password using scrypt with a unique 16-byte random salt."""
    if not isinstance(password, str) or not password:
        raise ValueError("Password must be a non-empty string.")
    salt = os.urandom(SALT_BYTES)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against a stored scrypt hash using constant-time comparison."""
    if not isinstance(password, str) or not isinstance(hashed, str):
        return False
    parts = hashed.split("$")
    if len(parts) != 6 or parts[0] != "scrypt":
        return False
    try:
        n = int(parts[1])
        r = int(parts[2])
        p = int(parts[3])
        salt = bytes.fromhex(parts[4])
        expected_derived = bytes.fromhex(parts[5])
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=len(expected_derived),
        )
        return hmac.compare_digest(derived, expected_derived)
    except Exception:
        return False


_DUMMY_SALT = b"\x00" * SALT_BYTES
_DUMMY_HASH = hashlib.scrypt(
    b"dummy_password",
    salt=_DUMMY_SALT,
    n=SCRYPT_N,
    r=SCRYPT_R,
    p=SCRYPT_P,
    dklen=SCRYPT_DKLEN,
)


def dummy_verify() -> bool:
    """Run a dummy scrypt computation to prevent user-enumeration timing side-channels."""
    derived = hashlib.scrypt(
        b"dummy_password",
        salt=_DUMMY_SALT,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return hmac.compare_digest(derived, _DUMMY_HASH) and False
