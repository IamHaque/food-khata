"""Jobs persistence and SQLite app.db schema (AC-09)."""

from __future__ import annotations

import json
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from ..storage import provider_identity
from .states import INTERRUPTED, QUEUED, RUNNING

JOBS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_id TEXT,
    mode TEXT NOT NULL DEFAULT 'incremental',
    status TEXT NOT NULL,
    phase TEXT,
    page INTEGER,
    counts TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at REAL NOT NULL,
    started_at REAL,
    finished_at REAL,
    updated_at REAL NOT NULL,
    resumable INTEGER NOT NULL DEFAULT 1,
    checkpoint_data TEXT,
    partial_decision TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL,
    phase TEXT,
    page INTEGER,
    counts TEXT,
    code TEXT,
    message TEXT,
    created_at REAL NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_provider_status ON jobs(provider, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id, created_at);
"""


@contextmanager
def get_db_conn(conn_or_path: sqlite3.Connection | Path | str) -> Iterator[sqlite3.Connection]:
    if isinstance(conn_or_path, sqlite3.Connection):
        yield conn_or_path
    else:
        path = Path(conn_or_path)
        if str(path) != ":memory:" and not str(path).startswith("file:"):
            path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 30000;")
        try:
            yield conn
        finally:
            conn.close()


def migrate_job_identifiers(conn: sqlite3.Connection) -> None:
    """Replace legacy job identifiers inside the caller's transaction."""
    for job_id, provider_id in conn.execute(
        "SELECT id, provider_id FROM jobs WHERE provider_id IS NOT NULL"
    ).fetchall():
        if not provider_id.startswith("sha256:"):
            conn.execute(
                "UPDATE jobs SET provider_id = ? WHERE id = ?",
                (provider_identity(provider_id), job_id),
            )


def init_jobs_tables(conn_or_path: sqlite3.Connection | Path | str) -> None:
    """Initialize jobs and job_events tables in app.db."""
    with get_db_conn(conn_or_path) as conn:
        conn.executescript(JOBS_SCHEMA_SQL)
        conn.execute("PRAGMA secure_delete = ON")
        conn.execute("BEGIN IMMEDIATE")
        columns = {row[1] for row in conn.execute("PRAGMA table_info(jobs)")}
        if "partial_decision" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN partial_decision TEXT NOT NULL DEFAULT 'pending'")
        conn.execute("""UPDATE jobs SET partial_decision = 'imported' WHERE partial_decision = 'pending' AND EXISTS
            (SELECT 1 FROM job_events WHERE job_id = jobs.id AND code = 'IMPORTED_PARTIAL')""")
        migrate_job_identifiers(conn)
        conn.commit()
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")


def _format_counts(counts: Any) -> str | None:
    if counts is None:
        return None
    if isinstance(counts, str):
        return counts
    return json.dumps(counts)


def _parse_job_row(row: sqlite3.Row | dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    d = dict(row)
    if d.get("counts") and isinstance(d["counts"], str):
        try:
            d["counts"] = json.loads(d["counts"])
        except Exception:
            pass
    if d.get("checkpoint_data") and isinstance(d["checkpoint_data"], str):
        try:
            d["checkpoint_data"] = json.loads(d["checkpoint_data"])
        except Exception:
            pass
    d["resumable"] = bool(d.get("resumable", 1))
    return d


def create_job(
    conn_or_path: sqlite3.Connection | Path | str,
    *,
    job_id: str,
    user_id: str,
    account_id: str,
    provider: str,
    provider_id: str | None = None,
    mode: str = "incremental",
    status: str = QUEUED,
    phase: str | None = None,
    page: int | None = None,
    counts: Any = None,
    checkpoint_data: Any = None,
) -> dict[str, Any]:
    now = time.time()
    counts_str = _format_counts(counts)
    checkpoint_str = (
        json.dumps(checkpoint_data)
        if checkpoint_data is not None and not isinstance(checkpoint_data, str)
        else checkpoint_data
    )

    with get_db_conn(conn_or_path) as conn:
        conn.execute(
            """
            INSERT INTO jobs (
                id, user_id, account_id, provider, provider_id, mode, status,
                phase, page, counts, created_at, updated_at, resumable, checkpoint_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                job_id,
                user_id,
                account_id,
                provider,
                provider_id,
                mode,
                status,
                phase,
                page,
                counts_str,
                now,
                now,
                checkpoint_str,
            ),
        )
        conn.execute(
            """
            INSERT INTO job_events (job_id, status, phase, page, counts, code, message, created_at)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (job_id, status, phase, page, counts_str, f"Job {status}", now),
        )
        conn.commit()

    return get_job(conn_or_path, job_id) or {}


def get_job(
    conn_or_path: sqlite3.Connection | Path | str,
    job_id: str,
    user_id: str | None = None,
) -> dict[str, Any] | None:
    with get_db_conn(conn_or_path) as conn:
        if user_id is not None:
            cursor = conn.execute(
                "SELECT * FROM jobs WHERE id = ? AND user_id = ?",
                (job_id, user_id),
            )
        else:
            cursor = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        return _parse_job_row(row)


def update_job(
    conn_or_path: sqlite3.Connection | Path | str,
    job_id: str,
    **kwargs: Any,
) -> dict[str, Any] | None:
    if not kwargs:
        return get_job(conn_or_path, job_id)

    updates = dict(kwargs)
    updates["updated_at"] = time.time()
    if "counts" in updates:
        updates["counts"] = _format_counts(updates["counts"])
    if "checkpoint_data" in updates and updates["checkpoint_data"] is not None:
        if not isinstance(updates["checkpoint_data"], str):
            updates["checkpoint_data"] = json.dumps(updates["checkpoint_data"])
    if "resumable" in updates:
        updates["resumable"] = 1 if updates["resumable"] else 0

    set_clauses = [f"{k} = ?" for k in updates]
    values = list(updates.values())
    values.append(job_id)

    with get_db_conn(conn_or_path) as conn:
        conn.execute(f"UPDATE jobs SET {', '.join(set_clauses)} WHERE id = ?", values)
        conn.commit()

    return get_job(conn_or_path, job_id)


def add_job_event(
    conn_or_path: sqlite3.Connection | Path | str,
    job_id: str,
    status: str,
    *,
    phase: str | None = None,
    page: int | None = None,
    counts: Any = None,
    code: str | None = None,
    message: str | None = None,
) -> None:
    now = time.time()
    counts_str = _format_counts(counts)
    with get_db_conn(conn_or_path) as conn:
        conn.execute(
            """
            INSERT INTO job_events (job_id, status, phase, page, counts, code, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (job_id, status, phase, page, counts_str, code, message, now),
        )
        conn.commit()


def get_job_events(
    conn_or_path: sqlite3.Connection | Path | str,
    job_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    with get_db_conn(conn_or_path) as conn:
        cursor = conn.execute(
            """
            SELECT * FROM job_events WHERE job_id = ?
            ORDER BY id ASC LIMIT ?
            """,
            (job_id, limit),
        )
        events = []
        for row in cursor.fetchall():
            d = dict(row)
            if d.get("counts") and isinstance(d["counts"], str):
                try:
                    d["counts"] = json.loads(d["counts"])
                except Exception:
                    pass
            events.append(d)
        return events


def list_jobs(
    conn_or_path: sqlite3.Connection | Path | str,
    *,
    user_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    query = "SELECT * FROM jobs"
    clauses = []
    params: list[Any] = []
    if user_id is not None:
        clauses.append("user_id = ?")
        params.append(user_id)
    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    with get_db_conn(conn_or_path) as conn:
        cursor = conn.execute(query, params)
        return [_parse_job_row(r) for r in cursor.fetchall() if r is not None]  # type: ignore


def count_user_active_jobs(
    conn_or_path: sqlite3.Connection | Path | str,
    user_id: str,
) -> tuple[int, int]:
    """Return (running_count, queued_count) for the specified user."""
    with get_db_conn(conn_or_path) as conn:
        cursor = conn.execute(
            """
            SELECT status, COUNT(*) as cnt
            FROM jobs
            WHERE user_id = ? AND status IN (?, ?)
            GROUP BY status
            """,
            (user_id, RUNNING, QUEUED),
        )
        running = 0
        queued = 0
        for row in cursor.fetchall():
            if row["status"] == RUNNING:
                running = row["cnt"]
            elif row["status"] == QUEUED:
                queued = row["cnt"]
        return running, queued


def mark_interrupted_on_startup(
    conn_or_path: sqlite3.Connection | Path | str,
) -> list[str]:
    """Mark all running jobs as interrupted when server starts (AC-09 restart scenario)."""
    now = time.time()
    with get_db_conn(conn_or_path) as conn:
        cursor = conn.execute("SELECT id FROM jobs WHERE status = ?", (RUNNING,))
        interrupted_ids = [row["id"] for row in cursor.fetchall()]
        if not interrupted_ids:
            return []

        conn.execute(
            """
            UPDATE jobs
            SET status = ?, error_code = 'INTERRUPTED',
                error_message = 'Interrupted by server restart',
                finished_at = ?, updated_at = ?, resumable = 1
            WHERE status = ?
            """,
            (INTERRUPTED, now, now, RUNNING),
        )
        for job_id in interrupted_ids:
            conn.execute(
                """
                INSERT INTO job_events (job_id, status, code, message, created_at)
                VALUES (?, ?, 'INTERRUPTED', 'Interrupted by server restart', ?)
                """,
                (job_id, INTERRUPTED, now),
            )
        conn.commit()
        return interrupted_ids


def prune_job_events(
    conn_or_path: sqlite3.Connection | Path | str,
    max_age_seconds: float = 7 * 86400,
) -> int:
    """Prune job events older than max_age_seconds (retention per BL-103)."""
    cutoff = time.time() - max_age_seconds
    with get_db_conn(conn_or_path) as conn:
        cursor = conn.execute("DELETE FROM job_events WHERE created_at < ?", (cutoff,))
        conn.commit()
        return cursor.rowcount
