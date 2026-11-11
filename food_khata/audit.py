"""Append-only audit trail for logins and admin actions (PR-15). Never stores passwords, codes or phone numbers."""

import sqlite3
import time


def record(conn: sqlite3.Connection, actor: str | None, action: str, target: str | None = None, ip: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_log (at, actor, action, target, ip) VALUES (?, ?, ?, ?, ?)", (time.time(), actor, action, target, ip)
    )
    conn.commit()


def recent(conn: sqlite3.Connection, limit: int = 200) -> list[dict]:
    rows = conn.execute("SELECT at, actor, action, target, ip FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]
