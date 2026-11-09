"""Registration rules, rate-limiting, and quotas (AC-07, DEC-010)."""

import math
import sqlite3
import time

from food_khata.auth.owner import (
    has_owner,
    is_registration_window_open,
    verify_join_code,
    verify_setup_code,
)

MAX_USERS = 8  # 8 users cap (DEC-010)
REGISTRATION_THROTTLE_WINDOW_SECONDS = 600.0  # 10 minutes
MAX_REGISTRATION_ATTEMPTS = 5


def check_registration_throttle(conn: sqlite3.Connection, ip: str) -> tuple[bool, int]:
    """Check if registration attempts for IP exceed limit in window.

    Returns (is_throttled, retry_after_seconds).
    """
    ip_key = (ip or "").strip()
    now = time.time()
    cutoff = now - REGISTRATION_THROTTLE_WINDOW_SECONDS

    cursor = conn.execute(
        "SELECT COUNT(*), MIN(attempted_at) FROM registration_attempts WHERE ip = ? AND attempted_at >= ?",
        (ip_key, cutoff),
    )
    count, earliest = cursor.fetchone()
    if count is not None and count >= MAX_REGISTRATION_ATTEMPTS:
        retry_after = max(1, math.ceil(earliest + REGISTRATION_THROTTLE_WINDOW_SECONDS - now))
        return True, retry_after
    return False, 0


def record_registration_attempt(conn: sqlite3.Connection, ip: str) -> None:
    """Record a registration attempt and prune expired records."""
    ip_key = (ip or "").strip()
    now = time.time()
    cutoff = now - REGISTRATION_THROTTLE_WINDOW_SECONDS

    conn.execute(
        "INSERT INTO registration_attempts (ip, attempted_at) VALUES (?, ?)",
        (ip_key, now),
    )
    conn.execute("DELETE FROM registration_attempts WHERE attempted_at < ?", (cutoff,))
    conn.commit()


def reset_registration_throttle(conn: sqlite3.Connection, ip: str) -> None:
    """Clear registration attempt records upon successful registration."""
    ip_key = (ip or "").strip()
    conn.execute("DELETE FROM registration_attempts WHERE ip = ?", (ip_key,))
    conn.commit()


def get_user_count(conn: sqlite3.Connection) -> int:
    """Return the total number of registered users."""
    row = conn.execute("SELECT COUNT(*) FROM users").fetchone()
    return int(row[0]) if row else 0


def can_register(
    conn: sqlite3.Connection,
    join_code: str | None = None,
    is_loopback: bool = False,
    setup_code: str | None = None,
) -> tuple[bool, str | None, int]:
    """Check whether a registration is allowed.

    Returns (allowed, error_message, status_code).
    """
    # 1. When no owner exists, check loopback / setup code for first claim
    if not has_owner(conn):
        if is_loopback or verify_setup_code(conn, setup_code or join_code):
            return True, None, 200
        return (
            False,
            "First claim from network requires the one-time setup code printed at start.",
            403,
        )

    # 2. When owner exists, check 8 user cap (DEC-010)
    count = get_user_count(conn)
    if count >= MAX_USERS:
        return False, f"User limit reached (maximum {MAX_USERS} users).", 403

    # 3. If join code is provided, verify it
    if join_code:
        if verify_join_code(conn, join_code):
            return True, None, 200
        return False, "Invalid join code.", 403

    # 4. Check if registration window is open
    if is_registration_window_open(conn):
        return True, None, 200

    # 5. Closed by default
    return False, "Registration is closed.", 403
