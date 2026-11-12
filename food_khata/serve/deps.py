"""Shared request dependencies and helpers for serve routes."""

from __future__ import annotations

import ipaddress
import sqlite3
import time
from collections.abc import Iterator
from typing import Any

from fastapi import Request

from food_khata.auth import connect_app_db

from .security import client_ip as _get_client_ip
from .security import is_secure as _is_secure_request

__all__ = [
    "_get_client_ip",
    "_is_loopback_client",
    "_is_secure_request",
    "_cached_status",
    "get_auth_db",
]


def get_auth_db(request: Request) -> Iterator[sqlite3.Connection]:
    """Dependency that yields a connection to app.db."""
    app_db_path = getattr(request.app.state, "app_db_path", "app.db")
    conn = connect_app_db(app_db_path)
    try:
        yield conn
    finally:
        conn.close()


def _is_loopback_client(request: Request) -> bool:
    host = request.client.host if request.client else "127.0.0.1"
    # A proxy on this machine makes every remote request arrive from loopback; it is not proof of a local caller.
    if host == getattr(request.app.state, "trusted_proxy", None):
        return False
    if host in {"testclient", "localhost", "127.0.0.1", "::1"}:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _cached_status(session: dict[str, Any] | None) -> str:
    """Check session expiry status: ok, expiring (within 24h), or expired."""
    if not isinstance(session, dict):
        return "expired"
    now = time.time()
    expires = session.get("expires_at") or session.get("expiry") or session.get("exp")
    if isinstance(expires, (int, float)):
        if now > float(expires):
            return "expired"
        if now > float(expires) - 86400:
            return "expiring"
        return "ok"
    return "ok"
