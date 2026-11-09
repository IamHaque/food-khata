"""Open analytics databases without creating or modifying them."""

import sqlite3
from pathlib import Path


def resolve_user_database(
    data_root: Path | str,
    user_id: str,
    legacy_db: Path | str | None = None,
    allow_legacy_fallback: bool = False,
) -> Path:
    """Resolve the analytics database for one authenticated user (AC-08).

    The client never supplies this path or the user id: both come from the
    server-side session and the app's configured data root.
    """
    from food_khata.users.context import user_database

    per_user = user_database(data_root, user_id)
    if per_user.is_file():
        return per_user
    managed = (Path(data_root) / "users").is_dir()
    if allow_legacy_fallback and not managed and legacy_db is not None:
        legacy = Path(legacy_db)
        if legacy.is_file():
            return legacy
    return per_user


def connect_readonly(path: Path | str) -> sqlite3.Connection:
    """Open a new read-only connection; callers own it and must close it."""
    # FastAPI may use different workers for request setup, queries, and cleanup.
    # Each call still returns its own connection; nothing is shared across requests.
    conn = sqlite3.connect(
        Path(path).resolve().as_uri() + "?mode=ro", uri=True, timeout=30.0, check_same_thread=False
    )
    try:
        conn.execute("PRAGMA query_only=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        conn.row_factory = sqlite3.Row
        return conn
    except Exception:
        conn.close()
        raise


def database_version(path: Path | str) -> tuple[int | None, int | None]:
    """Return database and WAL modification times for cache invalidation."""
    db = Path(path).resolve()

    def mtime(file: Path) -> int | None:
        try:
            return file.stat().st_mtime_ns
        except FileNotFoundError:
            return None

    return mtime(db), mtime(db.with_name(db.name + "-wal"))
