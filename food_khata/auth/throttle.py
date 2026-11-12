"""Login attempt rate limiter and throttling (AC-06)."""

import math
import sqlite3
import time

THROTTLE_WINDOW_SECONDS = 600.0  # 10 minutes
MAX_FAILED_ATTEMPTS = 5
MAX_FAILED_PER_IP = 30
MAX_STORED_USERNAME = 50
THROTTLE_ERROR_MESSAGE = "Too many failed login attempts. Please try again later."
INVALID_CREDENTIALS_MESSAGE = "Invalid username or password."


def _normalize_key(username: str, ip: str) -> tuple[str, str]:
    return (username or "").strip().lower()[:MAX_STORED_USERNAME], (ip or "").strip()


def check_ip_throttle(conn: sqlite3.Connection, ip: str) -> tuple[bool, int]:
    """Check failed logins from one IP across all usernames within the window."""
    _, ip_key = _normalize_key("", ip)
    now = time.time()
    count, earliest = conn.execute(
        "SELECT COUNT(*), MIN(attempted_at) FROM failed_logins WHERE ip = ? AND attempted_at >= ?",
        (ip_key, now - THROTTLE_WINDOW_SECONDS),
    ).fetchone()
    if count is not None and count >= MAX_FAILED_PER_IP:
        return True, max(1, math.ceil(earliest + THROTTLE_WINDOW_SECONDS - now))
    return False, 0


def check_throttle(conn: sqlite3.Connection, username: str, ip: str) -> tuple[bool, int]:
    """Check if login attempts for (username, IP) exceed the limit within the 10 min window.

    Returns (is_throttled, retry_after_seconds).
    """
    user_key, ip_key = _normalize_key(username, ip)
    now = time.time()
    cutoff = now - THROTTLE_WINDOW_SECONDS

    # Count failed attempts within the window
    cursor = conn.execute(
        "SELECT COUNT(*), MIN(attempted_at) FROM failed_logins WHERE username = ? AND ip = ? AND attempted_at >= ?",
        (user_key, ip_key, cutoff),
    )
    count, earliest = cursor.fetchone()
    if count is not None and count >= MAX_FAILED_ATTEMPTS:
        retry_after = max(1, math.ceil(earliest + THROTTLE_WINDOW_SECONDS - now))
        return True, retry_after
    return False, 0


def record_failed_login(conn: sqlite3.Connection, username: str, ip: str) -> None:
    """Record a failed login attempt and prune expired records."""
    user_key, ip_key = _normalize_key(username, ip)
    now = time.time()
    cutoff = now - THROTTLE_WINDOW_SECONDS

    conn.execute(
        "INSERT INTO failed_logins (username, ip, attempted_at) VALUES (?, ?, ?)",
        (user_key, ip_key, now),
    )
    # Prune old records
    conn.execute("DELETE FROM failed_logins WHERE attempted_at < ?", (cutoff,))
    conn.commit()


def reset_failed_logins(conn: sqlite3.Connection, username: str, ip: str) -> None:
    """Clear failed login records upon successful authentication."""
    user_key, ip_key = _normalize_key(username, ip)
    conn.execute("DELETE FROM failed_logins WHERE username = ? AND ip = ?", (user_key, ip_key))
    conn.commit()
