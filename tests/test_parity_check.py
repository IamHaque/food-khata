from scripts.parity_check import compare, legacy_metrics, render

pytest_plugins = ["test_serve_filters"]


def test_parity_and_private_report(conn):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    conn.execute("UPDATE accounts SET phone='SENTINEL_PHONE'")
    conn.execute("UPDATE restaurants SET name='SENTINEL_NAME'")
    conn.commit()
    rows = compare(path)
    assert rows and all(row[-1] for row in rows)
    report = render(rows)
    assert "SENTINEL" not in report
    assert legacy_metrics([])["aov"] is None


def test_parity_detects_api_difference(conn, monkeypatch):
    import food_khata.serve.app as api

    original = api.compute_metrics

    def incorrect(connection, filters):
        result = original(connection, filters)
        result["spend"] += 1
        return result

    monkeypatch.setattr(api, "compute_metrics", incorrect)
    rows = compare(conn.execute("PRAGMA database_list").fetchone()[2])
    assert any(not row[-1] for row in rows)


def test_report_destination_safety(tmp_path):
    import os

    import pytest

    from scripts.parity_check import validate_output

    db = tmp_path / "source.db"
    db.write_bytes(b"preserve")
    alias = tmp_path / "alias.md"
    os.link(db, alias)
    with pytest.raises(ValueError, match="replace DB"):
        validate_output(db, alias)
    with pytest.raises(ValueError, match="ignored"):
        validate_output(db, tmp_path / "report.md")
    assert db.read_bytes() == b"preserve"
