"""Versioned, additive app.db migrations: each runs once, inside one transaction (PR-10)."""

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path


def _one_owner(conn, data_root):
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_owner ON users(is_owner) WHERE is_owner = 1"
    )


def _provider_links(conn, data_root):
    conn.execute(
        """CREATE TABLE IF NOT EXISTS provider_links (
        provider TEXT NOT NULL, identity_hash TEXT NOT NULL, user_id TEXT NOT NULL, account_id TEXT,
        PRIMARY KEY (provider, identity_hash),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"""
    )


def _backfill_provider_links(conn, data_root):
    from food_khata.storage import provider_identity

    for account_json in Path(data_root).glob("users/*/accounts/*/account.json"):
        try:
            data = json.loads(account_json.read_text())
        except (OSError, ValueError):
            continue  # unreadable metadata is skipped; a later link of that account is still checked by the table
        user_id, account_id = account_json.parents[2].name, account_json.parent.name
        # Encrypted accounts keep only the identity hash; older plaintext ones keep the raw id in `providers`.
        for provider, value in {
            **(data.get("providers") or {}),
            **(data.get("provider_identities") or {}),
        }.items():
            if isinstance(value, str) and value:
                identity = value if value.startswith("sha256:") else provider_identity(value)
                conn.execute(
                    "INSERT OR IGNORE INTO provider_links (provider, identity_hash, user_id, account_id) "
                    "SELECT ?, ?, id, ? FROM users WHERE id = ?",
                    (provider, identity, account_id, user_id),
                )


def _one_active_job(conn, data_root):
    live = "status IN ('queued', 'running')"
    conn.execute(  # keep the newest of any duplicates so the index can be built
        f"UPDATE jobs SET status = 'interrupted', error_code = 'RESTART' WHERE {live} AND rowid NOT IN "
        f"(SELECT MAX(rowid) FROM jobs WHERE {live} GROUP BY account_id, provider)"
    )
    conn.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_one_active ON jobs(account_id, provider) WHERE {live}")


# (version, function, needs the data root)
MIGRATIONS = [
    (1, _one_owner, False),
    (2, _provider_links, False),
    (3, _backfill_provider_links, True),
    (4, _one_active_job, False),
]


def run_migrations(db_path: Path | str, data_root: Path | str | None = None) -> None:
    conn = sqlite3.connect(db_path, isolation_level=None, timeout=30.0)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        done = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
        pending = [
            m for m in MIGRATIONS if m[0] not in done and (data_root is not None or not m[2])
        ]
        if not pending:
            return
        if conn.execute(
            "SELECT 1 FROM users LIMIT 1"
        ).fetchone():  # back up existing data before changing it
            backup = sqlite3.connect(f"{db_path}.pre-v{pending[0][0]}.bak")
            try:
                conn.backup(backup)
            finally:
                backup.close()
        for version, fn, _ in pending:
            conn.execute("BEGIN IMMEDIATE")
            try:
                fn(conn, data_root)
                conn.execute(
                    "INSERT INTO schema_migrations VALUES (?, ?)",
                    (version, datetime.now(UTC).isoformat()),
                )
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
    finally:
        conn.close()
