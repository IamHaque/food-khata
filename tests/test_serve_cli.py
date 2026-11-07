from food_khata.cli import main
from food_khata.serve import cli


def test_serve_dispatch(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(cli, "serve", lambda *args: calls.append(args) or 0)
    assert main(["serve", "--data-dir", str(tmp_path)]) == 0
    assert calls == [("127.0.0.1", 8765, tmp_path / "food_analytics.db", False)]


def test_host_and_missing_dependencies(monkeypatch, capsys):
    assert cli.serve("0.0.0.0", 8765, "unused") == 1
    import builtins

    original = builtins.__import__

    def missing(name, *args, **kwargs):
        if name == "fastapi":
            raise ImportError
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", missing)
    assert cli.serve("127.0.0.1", 8765, "unused") == 1
    assert 'pip install -e ".[serve]"' in capsys.readouterr().out


def test_direct_port_and_startup_failures(monkeypatch, capsys):
    import uvicorn

    assert cli.serve("127.0.0.1", 0, "unused") == 1
    assert cli.serve("127.0.0.1", 65536, "unused") == 1

    def fail(*args, **kwargs):
        raise OSError("private")

    monkeypatch.setattr(uvicorn, "run", fail)
    assert cli.serve("127.0.0.1", 8765, "unused") == 1
    assert "private" not in capsys.readouterr().out

    def interrupt(*args, **kwargs):
        raise KeyboardInterrupt

    monkeypatch.setattr(uvicorn, "run", interrupt)
    assert cli.serve("127.0.0.1", 8765, "unused") == 130
