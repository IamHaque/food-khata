"""Per-user filesystem context and encryption-at-rest (AC-08)."""

from .aead import ALGORITHM, decrypt, encrypt, open_sealed, seal
from .context import (
    UserContext,
    adopt_legacy_root,
    change_password,
    ensure_private_dir,
    reset_password,
    unlock_user,
    user_database,
    user_id_of,
    user_root,
    users_root,
    validate_user_id,
    wipe_provider_sessions,
)
from .crypto import DataCipher, UserVault, WrongPassword, derive_key

__all__ = [
    "ALGORITHM",
    "DataCipher",
    "UserContext",
    "UserVault",
    "WrongPassword",
    "adopt_legacy_root",
    "change_password",
    "decrypt",
    "derive_key",
    "encrypt",
    "ensure_private_dir",
    "open_sealed",
    "reset_password",
    "seal",
    "unlock_user",
    "user_database",
    "user_id_of",
    "user_root",
    "users_root",
    "validate_user_id",
    "wipe_provider_sessions",
]
