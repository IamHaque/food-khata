import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

import food_khata.serve.app as app_module
from food_khata.serve.app import authenticate_client, create_app
from food_khata.serve.db import connect_readonly, database_version

pytest_plugins = ["test_serve_filters"]


class TrackedConnection:
    """Proxy that records when the app closes its per-request connection."""

    def __init__(self, wrapped, on_close):
        self.wrapped = wrapped
        self.on_close = on_close

    def execute(self, sql, params=()):
        return self.wrapped.execute(sql, params)

    def close(self):
        self.on_close(self)
        self.wrapped.close()


def test_readonly_and_missing_database(tmp_path):
    path = tmp_path / "data with spaces.db"
    with pytest.raises(sqlite3.OperationalError):
        connect_readonly(path)
    assert not path.exists()
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE sample (id INTEGER)")
    conn = connect_readonly(path)
    try:
        with pytest.raises(sqlite3.OperationalError):
            conn.execute("INSERT INTO sample VALUES (1)")
    finally:
        conn.close()


def test_readonly_connection_across_worker_threads(tmp_path):
    path = tmp_path / "data.db"
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE sample (id INTEGER)")
    conn = connect_readonly(path)
    with ThreadPoolExecutor(max_workers=1) as worker:
        try:
            count = worker.submit(
                lambda: conn.execute("SELECT COUNT(*) FROM sample").fetchone()[0]
            ).result()
            assert count == 0
            with pytest.raises(sqlite3.OperationalError):
                worker.submit(conn.execute, "INSERT INTO sample VALUES (1)").result()
        finally:
            worker.submit(conn.close).result()


def test_database_version_tracks_wal(tmp_path):
    path = tmp_path / "data.db"
    path.touch()
    before = database_version(path)
    path.with_name(path.name + "-wal").touch()
    assert database_version(path) != before


def test_connections_enforce_query_only(tmp_path):
    path = tmp_path / "data.db"
    with sqlite3.connect(path) as writer:
        writer.execute("CREATE TABLE sample (id INTEGER)")
    conn = connect_readonly(path)
    try:
        assert conn.execute("PRAGMA query_only").fetchone()[0] == 1
        with pytest.raises(sqlite3.OperationalError):
            conn.execute("INSERT INTO sample VALUES (1)")
        with pytest.raises(sqlite3.OperationalError):
            conn.execute("CREATE TABLE other (id INTEGER)")
    finally:
        conn.close()


def test_parallel_readonly_connections_are_independent(tmp_path):
    path = tmp_path / "data.db"
    with sqlite3.connect(path) as writer:
        writer.execute("CREATE TABLE sample (id INTEGER)")
        writer.execute("INSERT INTO sample VALUES (1)")
    connections = []
    lock = threading.Lock()

    def read(_):
        connection = connect_readonly(path)
        with lock:
            connections.append(connection)
        try:
            return connection.execute("SELECT COUNT(*) FROM sample").fetchone()[0]
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=20) as pool:
        counts = list(pool.map(read, range(20)))

    assert counts == [1] * 20
    assert len({id(connection) for connection in connections}) == 20


def test_concurrent_requests_use_separate_closed_connections(conn, monkeypatch):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    original = app_module.connect_readonly
    lock = threading.Lock()
    opened, closed = [], []

    def connect(database):
        connection = TrackedConnection(original(database), lambda c: closed.append(c))
        with lock:
            opened.append(connection)
        return connection

    monkeypatch.setattr(app_module, "connect_readonly", connect)
    client = TestClient(create_app(path, legacy_single_db=True), base_url="http://127.0.0.1")
    authenticate_client(client)
    with ThreadPoolExecutor(max_workers=20) as pool:
        responses = list(pool.map(lambda _: client.get("/api/orders/slim"), range(20)))

    assert [response.status_code for response in responses] == [200] * 20
    assert all("ProgrammingError" not in response.text for response in responses)
    assert len(opened) == 20
    assert len({id(connection) for connection in opened}) == 20
    assert len(closed) == 20
    assert {id(connection) for connection in closed} == {id(connection) for connection in opened}


def test_missing_database_returns_clear_error(tmp_path):
    path = tmp_path / "missing.db"
    client = TestClient(create_app(path, legacy_single_db=True), base_url="http://127.0.0.1")
    authenticate_client(client)
    responses = (
        client.get("/api/orders"),
        client.get("/api/meta/filters"),
        client.post("/api/dashboard", json={}),
    )
    for response in responses:
        assert response.status_code == 503
        error = response.json()["error"]
        assert error["code"] == "database_not_found"
        assert "not found" in error["message"].lower()
        assert "Traceback" not in response.text
    assert not path.exists()
