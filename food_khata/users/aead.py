"""Authenticated encryption for user data (AC-08).

ChaCha20-Poly1305 (RFC 8439) is used so this module works with the standard
library alone.  When the optional ``cryptography`` package is installed its
audited implementation is preferred; the pure-Python fallback produces the
same wire format and is verified against the RFC test vector in the tests.
"""

from __future__ import annotations

import base64
import hmac
import json
import os
import struct
from typing import Any

from ..contracts import KhataError

try:  # pragma: no cover - exercised on hosts that install cryptography
    from cryptography.hazmat.primitives.ciphers.aead import (
        ChaCha20Poly1305 as _CryptographyChaCha,
    )
except ImportError:  # pragma: no cover - the normal repository environment
    _CryptographyChaCha = None

ALGORITHM = "chacha20poly1305"
KEY_BYTES = 32
NONCE_BYTES = 12
_TAG_BYTES = 16


def _quarter_round(state: list[int], a: int, b: int, c: int, d: int) -> None:
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF
    state[d] ^= state[a]
    state[d] = ((state[d] << 16) | (state[d] >> 16)) & 0xFFFFFFFF
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF
    state[b] ^= state[c]
    state[b] = ((state[b] << 12) | (state[b] >> 20)) & 0xFFFFFFFF
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF
    state[d] ^= state[a]
    state[d] = ((state[d] << 8) | (state[d] >> 24)) & 0xFFFFFFFF
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF
    state[b] ^= state[c]
    state[b] = ((state[b] << 7) | (state[b] >> 25)) & 0xFFFFFFFF


def _chacha20_block(key: bytes, counter: int, nonce: bytes) -> bytes:
    if len(key) != KEY_BYTES or len(nonce) != NONCE_BYTES:
        raise KhataError("Invalid encryption key or nonce")
    constants = struct.unpack("<4I", b"expand 32-byte k")
    state = [
        *constants,
        *struct.unpack("<8I", key),
        counter & 0xFFFFFFFF,
        *struct.unpack("<3I", nonce),
    ]
    working = list(state)
    for _ in range(10):
        _quarter_round(working, 0, 4, 8, 12)
        _quarter_round(working, 1, 5, 9, 13)
        _quarter_round(working, 2, 6, 10, 14)
        _quarter_round(working, 3, 7, 11, 15)
        _quarter_round(working, 0, 5, 10, 15)
        _quarter_round(working, 1, 6, 11, 12)
        _quarter_round(working, 2, 7, 8, 13)
        _quarter_round(working, 3, 4, 9, 14)
    return struct.pack(
        "<16I", *[(working[i] + state[i]) & 0xFFFFFFFF for i in range(16)]
    )


def _chacha20_xor(key: bytes, nonce: bytes, data: bytes, counter: int = 0) -> bytes:
    out = bytearray()
    for offset in range(0, len(data), 64):
        block = _chacha20_block(key, counter + offset // 64, nonce)
        chunk = data[offset : offset + 64]
        out.extend(
            bytes(left ^ right for left, right in zip(chunk, block, strict=False))
        )
    return bytes(out)


def _pad16(data: bytes) -> bytes:
    remainder = len(data) % 16
    return b"" if remainder == 0 else b"\x00" * (16 - remainder)


def _poly1305(message: bytes, key: bytes) -> bytes:
    if len(key) != 32:
        raise KhataError("Invalid Poly1305 key")
    r = int.from_bytes(key[:16], "little") & 0x0FFFFFFC0FFFFFFC0FFFFFFC0FFFFFFF
    s = int.from_bytes(key[16:], "little")
    modulus = (1 << 130) - 5
    accumulator = 0
    for offset in range(0, len(message), 16):
        chunk = message[offset : offset + 16]
        value = int.from_bytes(chunk + b"\x01", "little")
        accumulator = ((accumulator + value) * r) % modulus
    return ((accumulator + s) % (1 << 128)).to_bytes(16, "little")


def _encrypt_stdlib(key: bytes, nonce: bytes, plaintext: bytes, aad: bytes) -> bytes:
    one_time_key = _chacha20_block(key, 0, nonce)[:32]
    ciphertext = _chacha20_xor(key, nonce, plaintext, counter=1)
    mac_data = (
        aad
        + _pad16(aad)
        + ciphertext
        + _pad16(ciphertext)
        + len(aad).to_bytes(8, "little")
        + len(ciphertext).to_bytes(8, "little")
    )
    return ciphertext + _poly1305(mac_data, one_time_key)


def _decrypt_stdlib(key: bytes, nonce: bytes, sealed: bytes, aad: bytes) -> bytes:
    if len(sealed) < _TAG_BYTES:
        raise KhataError("Ciphertext is truncated")
    ciphertext, tag = sealed[:-_TAG_BYTES], sealed[-_TAG_BYTES:]
    one_time_key = _chacha20_block(key, 0, nonce)[:32]
    mac_data = (
        aad
        + _pad16(aad)
        + ciphertext
        + _pad16(ciphertext)
        + len(aad).to_bytes(8, "little")
        + len(ciphertext).to_bytes(8, "little")
    )
    if not hmac.compare_digest(_poly1305(mac_data, one_time_key), tag):
        raise KhataError("Decryption failed: wrong password or corrupted data")
    return _chacha20_xor(key, nonce, ciphertext, counter=1)


def _use_cryptography() -> bool:
    return _CryptographyChaCha is not None


def encrypt(key: bytes, nonce: bytes, plaintext: bytes, aad: bytes = b"") -> bytes:
    """Encrypt and authenticate ``plaintext``, returning ciphertext plus tag."""
    if _use_cryptography():
        return _CryptographyChaCha(key).encrypt(nonce, plaintext, aad)
    return _encrypt_stdlib(key, nonce, plaintext, aad)


def decrypt(key: bytes, nonce: bytes, sealed: bytes, aad: bytes = b"") -> bytes:
    """Verify and decrypt ``sealed``; raise KhataError on any failure."""
    try:
        if _use_cryptography():
            return _CryptographyChaCha(key).decrypt(nonce, sealed, aad)
        return _decrypt_stdlib(key, nonce, sealed, aad)
    except KhataError:
        raise
    except Exception as exc:  # cryptography raises InvalidTag
        raise KhataError("Decryption failed: wrong password or corrupted data") from exc


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _unb64(value: Any) -> bytes:
    if not isinstance(value, str):
        raise KhataError("Invalid encrypted value")
    try:
        return base64.b64decode(value.encode("ascii"), validate=True)
    except (ValueError, UnicodeError) as exc:
        raise KhataError("Invalid encrypted value") from exc


def seal(key: bytes, value: Any, aad: bytes = b"") -> dict[str, str]:
    """Encode ``value`` as a self-describing encrypted envelope."""
    nonce = os.urandom(NONCE_BYTES)
    plaintext = json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")
    ciphertext = encrypt(key, nonce, plaintext, aad)
    return {
        "alg": ALGORITHM,
        "nonce": _b64(nonce),
        "ciphertext": _b64(ciphertext),
    }


def open_sealed(key: bytes, envelope: Any, aad: bytes = b"") -> Any:
    """Decode an envelope produced by :func:`seal`."""
    if not isinstance(envelope, dict) or envelope.get("alg") != ALGORITHM:
        raise KhataError("Unsupported encrypted value")
    nonce = _unb64(envelope.get("nonce"))
    ciphertext = _unb64(envelope.get("ciphertext"))
    if len(nonce) != NONCE_BYTES:
        raise KhataError("Invalid encrypted value")
    plaintext = decrypt(key, nonce, ciphertext, aad)
    try:
        return json.loads(plaintext.decode("utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise KhataError("Invalid encrypted value") from exc
