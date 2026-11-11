"""Owner management, setup codes, registration windows, and admin actions (AC-07)."""

import re
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any

from food_khata.auth.passwords import hash_password, verify_password


class OwnerError(Exception):
    """Base exception for owner operations."""


class OwnerAlreadyExistsError(OwnerError):
    """Raised when an owner already exists and setup is attempted."""


class SetupForbiddenError(OwnerError):
    """Raised when setup claim is attempted without loopback or valid setup code."""


class JobControl:
    """Cancel jobs only in the application database being administered."""

    @classmethod
    def cancel_user(cls, user_id: str, conn: sqlite3.Connection) -> None:
        from food_khata.jobs import JobControl as RealJobControl

        database = Path(conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
        for control in list(RealJobControl._instances):
            if Path(control.app_db_path).resolve() == database:
                control.cancel_user(user_id)


def _get_setting(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM server_settings WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None


def _set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO server_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


def _delete_setting(conn: sqlite3.Connection, key: str) -> None:
    conn.execute("DELETE FROM server_settings WHERE key = ?", (key,))
    conn.commit()


def has_owner(conn: sqlite3.Connection) -> bool:
    """Return True if an owner user exists in the database."""
    row = conn.execute("SELECT COUNT(*) FROM users WHERE is_owner = 1").fetchone()
    return bool(row and row[0] > 0)


def get_owner(conn: sqlite3.Connection) -> dict[str, Any] | None:
    """Return the owner user record or None."""
    row = conn.execute(
        "SELECT id, username, password_hash, is_owner, disabled, created_at FROM users WHERE is_owner = 1"
    ).fetchone()
    if not row:
        return None
    return dict(row)


def generate_setup_code() -> str:
    """Generate an 8-character uppercase setup code formatted as XXXX-XXXX."""
    p1 = secrets.token_hex(2).upper()
    p2 = secrets.token_hex(2).upper()
    return f"{p1}-{p2}"


def get_or_create_setup_code(conn: sqlite3.Connection) -> str:
    """Get the active one-time setup code, generating a new one if not present."""
    code = _get_setting(conn, "setup_code")
    if not code:
        code = generate_setup_code()
        _set_setting(conn, "setup_code", code)
    return code


def verify_setup_code(conn: sqlite3.Connection, code: str | None) -> bool:
    """Verify setup code case-insensitively ignoring hyphens/spaces."""
    if not code:
        return False
    stored = _get_setting(conn, "setup_code")
    if not stored:
        return False
    norm_input = re.sub(r"[\s-]", "", code).upper()
    norm_stored = re.sub(r"[\s-]", "", stored).upper()
    return secrets.compare_digest(norm_input, norm_stored)


def clear_setup_code(conn: sqlite3.Connection) -> None:
    """Invalidate / delete the one-time setup code."""
    _delete_setting(conn, "setup_code")


# --- Registration window management ---


def get_registration_window(conn: sqlite3.Connection) -> dict[str, Any]:
    """Return current registration window status."""
    val = _get_setting(conn, "window_open_until")
    if not val:
        return {"is_open": False, "remaining_seconds": None, "until_closed": False}

    try:
        until = float(val)
    except ValueError:
        return {"is_open": False, "remaining_seconds": None, "until_closed": False}

    if until == -1:
        return {"is_open": True, "remaining_seconds": None, "until_closed": True}

    now = time.time()
    if until > now:
        return {
            "is_open": True,
            "remaining_seconds": max(0.0, round(until - now, 1)),
            "until_closed": False,
        }

    return {"is_open": False, "remaining_seconds": 0.0, "until_closed": False}


def is_registration_window_open(conn: sqlite3.Connection) -> bool:
    """Check if the registration window is currently open."""
    return bool(get_registration_window(conn)["is_open"])


def open_registration_window(
    conn: sqlite3.Connection, duration_seconds: int | None = None
) -> dict[str, Any]:
    """Open registration window for duration_seconds or until closed (duration_seconds=None)."""
    if duration_seconds is None or duration_seconds < 0:
        _set_setting(conn, "window_open_until", "-1")
    else:
        until = time.time() + float(duration_seconds)
        _set_setting(conn, "window_open_until", str(until))
    return get_registration_window(conn)


def close_registration_window(conn: sqlite3.Connection) -> None:
    """Close registration window immediately."""
    _delete_setting(conn, "window_open_until")


# --- Household join code management ---


def generate_join_code() -> str:
    """Generate an 8-character household join code formatted as ABCD-1234."""
    p1 = secrets.token_hex(2).upper()
    p2 = secrets.token_hex(2).upper()
    return f"{p1}-{p2}"


def rotate_join_code(conn: sqlite3.Connection) -> str:
    """Generate, hash, and store a new household join code; return plaintext code once."""
    plain = generate_join_code()
    # Normalize join code before hashing (uppercase, no hyphens)
    norm = re.sub(r"[\s-]", "", plain).upper()
    hashed = hash_password(norm)
    _set_setting(conn, "join_code_hash", hashed)
    return plain


def verify_join_code(conn: sqlite3.Connection, code: str | None) -> bool:
    """Check if provided join code matches stored hashed join code."""
    if not code:
        return False
    stored_hash = _get_setting(conn, "join_code_hash")
    if not stored_hash:
        return False
    norm = re.sub(r"[\s-]", "", code).upper()
    return verify_password(norm, stored_hash)


def has_join_code(conn: sqlite3.Connection) -> bool:
    """Return True if a household join code hash is configured."""
    return bool(_get_setting(conn, "join_code_hash"))


# --- First claim ---


def claim_owner(
    conn: sqlite3.Connection,
    username: str,
    password: str,
    is_loopback: bool,
    setup_code: str | None = None,
    data_root: Path | str | None = None,
) -> dict[str, Any]:
    """Claim owner access.

    Refused with 403 if not loopback and missing/invalid setup code.
    Refused with 404 (OwnerAlreadyExistsError) if an owner already exists.
    """
    if has_owner(conn):
        raise OwnerAlreadyExistsError("An owner already exists on this server.")

    if not is_loopback:
        if not verify_setup_code(conn, setup_code):
            raise SetupForbiddenError(
                "First claim from network requires the one-time setup code printed at start."
            )

    username = username.strip()
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", username) or len(username) < 3 or len(username) > 50:
        raise ValueError(
            "Username must be 3-50 characters with only alphanumeric characters, underscores, or hyphens."
        )
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")

    import uuid
    from datetime import UTC, datetime

    user_id = str(uuid.uuid4())
    pw_hash = hash_password(password)
    created_at = datetime.now(UTC).isoformat()

    # BEGIN IMMEDIATE plus the unique index on is_owner: of N simultaneous claims exactly one wins.
    conn.execute("BEGIN IMMEDIATE")
    try:
        if has_owner(conn):
            raise OwnerAlreadyExistsError("An owner already exists on this server.")
        conn.execute(
            "INSERT INTO users (id, username, password_hash, is_owner, disabled, created_at) "
            "VALUES (?, ?, ?, 1, 0, ?)",
            (user_id, username, pw_hash, created_at),
        )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        conn.rollback()
        if has_owner(conn):
            raise OwnerAlreadyExistsError("An owner already exists on this server.") from exc
        raise ValueError("Username is already taken.") from exc
    except Exception:
        conn.rollback()
        raise

    # Clear setup code once claimed
    clear_setup_code(conn)

    # Adopt legacy data root if present (AC-08 adopt_legacy_root)
    if data_root:
        from food_khata.users import UserContext

        UserContext(data_root, user_id).unlock(password).adopt_legacy_root()

    return {
        "id": user_id,
        "username": username,
        "is_owner": True,
        "created_at": created_at,
    }


# --- User administration ---


def list_users(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """List all registered users."""
    cursor = conn.execute(
        "SELECT id, username, is_owner, disabled, created_at FROM users ORDER BY created_at ASC"
    )
    return [
        {
            "id": row["id"],
            "username": row["username"],
            "is_owner": bool(row["is_owner"]),
            "disabled": bool(row["disabled"]),
            "created_at": row["created_at"],
        }
        for row in cursor.fetchall()
    ]


def set_user_disabled(
    conn: sqlite3.Connection, user_id: str, disabled: bool, data_root: Path | str | None = None
) -> dict[str, Any]:
    """Enable or disable a user account. Cannot disable the owner."""
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise ValueError("User not found.")
    if user["is_owner"] and disabled:
        raise ValueError("Cannot disable the owner account.")

    conn.execute("UPDATE users SET disabled = ? WHERE id = ?", (int(disabled), user_id))
    if disabled:
        # Invalidate active web sessions
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
        # Cancellation writes through a separate connection.
        JobControl.cancel_user(user_id, conn)
        if data_root is not None:
            from food_khata.users.context import wipe_provider_sessions

            wipe_provider_sessions(data_root, user_id)
    conn.commit()

    return {
        "id": user["id"],
        "username": user["username"],
        "is_owner": bool(user["is_owner"]),
        "disabled": bool(disabled),
    }


def reset_user_password(
    conn: sqlite3.Connection,
    user_id: str,
    owner_id: str,
    owner_password: str,
    new_password: str | None = None,
    data_root: Path | str | None = None,
) -> dict[str, Any]:
    """Owner reset of a user password. Requires owner password verification.

    Wipes that user's provider sessions and calls JobControl.cancel_user.
    """
    owner = conn.execute(
        "SELECT * FROM users WHERE id = ? AND is_owner = 1", (owner_id,)
    ).fetchone()
    if not owner or not verify_password(owner_password, owner["password_hash"]):
        raise PermissionError("Invalid owner password.")

    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise ValueError("User not found.")

    effective_pw = new_password or secrets.token_urlsafe(12)
    new_hash = hash_password(effective_pw)

    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
    # Invalidate that user's web sessions
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.commit()

    JobControl.cancel_user(user_id, conn)

    # Wipe provider sessions (cannot be decrypted after owner reset)
    if data_root:
        from food_khata.users.context import reset_password as context_reset_password

        context_reset_password(data_root, user_id, effective_pw)

    return {
        "status": "ok",
        "user_id": user_id,
        "temporary_password": effective_pw if not new_password else None,
    }


def transfer_ownership(
    conn: sqlite3.Connection,
    current_owner_id: str,
    target_username_or_id: str,
    owner_password: str | None = None,
) -> dict[str, Any]:
    """Transfer owner role to another existing user (one transaction)."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        return _transfer_ownership(conn, current_owner_id, target_username_or_id, owner_password)
    except Exception:
        conn.rollback()
        raise


def _transfer_ownership(conn, current_owner_id, target_username_or_id, owner_password):
    owner = conn.execute(
        "SELECT * FROM users WHERE id = ? AND is_owner = 1", (current_owner_id,)
    ).fetchone()
    if not owner:
        raise PermissionError("Current user is not the owner.")

    if owner_password is not None and not verify_password(owner_password, owner["password_hash"]):
        raise PermissionError("Invalid owner password.")

    target = conn.execute(
        "SELECT * FROM users WHERE id = ? OR username = ? COLLATE NOCASE",
        (target_username_or_id, target_username_or_id),
    ).fetchone()
    if not target:
        raise ValueError("Target user not found.")
    if target["id"] == current_owner_id:
        raise ValueError("User is already the owner.")
    if target["disabled"]:
        raise ValueError("Target user is disabled.")

    conn.execute("UPDATE users SET is_owner = 0 WHERE id = ?", (current_owner_id,))
    conn.execute("UPDATE users SET is_owner = 1 WHERE id = ?", (target["id"],))
    conn.commit()

    return {
        "status": "ok",
        "previous_owner_id": current_owner_id,
        "new_owner_id": target["id"],
        "new_owner_username": target["username"],
    }


def remove_user(
    conn: sqlite3.Connection,
    user_id: str,
    owner_id: str,
    owner_password: str,
    data_root: Path | str | None = None,
) -> None:
    """Delete a user: sessions, jobs and provider links (by cascade), their data folder and the row.

    The folder is renamed first and put back if the row cannot be deleted, so nothing is half removed.
    """
    import shutil
    import uuid

    owner = conn.execute("SELECT password_hash FROM users WHERE id = ? AND is_owner = 1", (owner_id,)).fetchone()
    if not owner or not verify_password(owner_password, owner["password_hash"]):
        raise PermissionError("Invalid owner password.")
    if user_id == owner_id:
        raise ValueError("The owner cannot remove themselves.")
    if not conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
        raise ValueError("User not found.")

    JobControl.cancel_user(user_id, conn)  # waits for running jobs to stop
    folder = trash = None
    if data_root is not None:
        from food_khata.users.context import user_root

        folder = user_root(data_root, user_id)
        if folder.exists():
            trash = folder.with_name(f".deleting-{uuid.uuid4().hex}")
            folder.rename(trash)
    try:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        if trash is not None:
            trash.rename(folder)
        raise
    if trash is not None:
        shutil.rmtree(trash, ignore_errors=True)
