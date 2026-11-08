import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest

from food_khata.serve.db import connect_readonly, database_version


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
