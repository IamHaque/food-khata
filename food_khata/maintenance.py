"""Hourly housekeeping for app.db (PR-09): every task is a function that returns how many rows it removed."""

import logging
import sqlite3
import threading
import time
from pathlib import Path

from .auth import connect_app_db
from .auth.sessions import IDLE_TIMEOUT_SECONDS

log = logging.getLogger(__name__)
CHUNK = 500  # keeps each write transaction well under 50 ms
EVENT_RETENTION = 7 * 86400
JOB_RETENTION = 90 * 86400
ATTEMPT_RETENTION = 86400
AUDIT_RETENTION = 90 * 86400


def _delete_chunks(conn: sqlite3.Connection, table: str, where: str, args: tuple) -> int:
    total = 0
    while True:
        n = conn.execute(
            f"DELETE FROM {table} WHERE rowid IN (SELECT rowid FROM {table} WHERE {where} LIMIT {CHUNK})", args
        ).rowcount
        conn.commit()
        total += n
        if n < CHUNK:
            return total


def delete_expired_sessions(conn: sqlite3.Connection) -> int:
    now = time.time()
    return _delete_chunks(conn, "sessions", "expires_at < ? OR last_active < ?", (now, now - IDLE_TIMEOUT_SECONDS))


def prune_attempts(conn: sqlite3.Connection) -> int:
    cutoff = time.time() - ATTEMPT_RETENTION
    return sum(_delete_chunks(conn, t, "attempted_at < ?", (cutoff,)) for t in ("failed_logins", "registration_attempts"))


def prune_job_events(conn: sqlite3.Connection) -> int:
    return _delete_chunks(conn, "job_events", "created_at < ?", (time.time() - EVENT_RETENTION,))


def prune_old_jobs(conn: sqlite3.Connection) -> int:
    cutoff = time.time() - JOB_RETENTION
    return _delete_chunks(
        conn, "jobs", "status IN ('done', 'failed', 'cancelled', 'interrupted') AND updated_at < ?", (cutoff,)
    )


def prune_audit(conn: sqlite3.Connection) -> int:
    return _delete_chunks(conn, "audit_log", "at < ?", (time.time() - AUDIT_RETENTION,))


def checkpoint_wal(conn: sqlite3.Connection) -> int:
    conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
    return 0


TASKS = (delete_expired_sessions, prune_attempts, prune_job_events, prune_old_jobs, prune_audit, checkpoint_wal)


def run_once(app_db_path: Path | str) -> dict[str, int]:
    conn = connect_app_db(app_db_path)
    counts = {}
    try:
        for task in TASKS:
            try:
                counts[task.__name__] = task(conn)
            except Exception:  # one failing task must not stop the others; the error is logged, not hidden
                log.exception("maintenance task %s failed", task.__name__)
    finally:
        conn.close()
    log.info("maintenance: %s", counts)
    return counts


class Maintenance:
    def __init__(self, app_db_path: Path | str, interval: float = 3600.0) -> None:
        self.app_db_path, self.interval = app_db_path, interval
        self._stop = threading.Event()
        self.thread: threading.Thread | None = None

    def start(self) -> None:
        self._stop.clear()
        self.thread = threading.Thread(target=self._loop, daemon=True, name="maintenance")
        self.thread.start()

    def _loop(self) -> None:
        while not self._stop.wait(self.interval):
            run_once(self.app_db_path)

    def stop(self) -> None:
        self._stop.set()
        if self.thread:
            self.thread.join(timeout=5)
