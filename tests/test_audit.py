import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIT = ROOT / "scripts" / "audit.py"


def load_module():
    spec = importlib.util.spec_from_file_location("audit", AUDIT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_cli(*args):
    return subprocess.run([sys.executable, str(AUDIT), *args],
                         capture_output=True, text=True)


def test_pip_fail_on_fixable_high(tmp_path):
    load_module()
    data = {"dependencies": [{"name": "x", "version": "1.0",
                               "vulns": [{"id": "PY-1", "fix_versions": ["1.1"],
                                          "severity": "high"}]}]}
    f = tmp_path / "pip.json"
    f.write_text(json.dumps(data))
    allow = tmp_path / "allow.json"
    allow.write_text("[]")
    r = run_cli("--pip-audit", str(f), "--allowlist", str(allow))
    assert r.returncode == 1
    assert "FAIL" in r.stdout


def test_pip_warn_on_unfixed(tmp_path):
    load_module()
    data = {"dependencies": [{"name": "x", "version": "1.0",
                               "vulns": [{"id": "PY-2", "fix_versions": [],
                                          "severity": "high"}]}]}
    f = tmp_path / "pip.json"
    f.write_text(json.dumps(data))
    allow = tmp_path / "allow.json"
    allow.write_text("[]")
    r = run_cli("--pip-audit", str(f), "--allowlist", str(allow))
    assert r.returncode == 0
    assert "WARN" in r.stdout


def test_npm_fail_on_fixable_high(tmp_path):
    data = {"vulnerabilities": {"lodash": {
        "severity": "high", "fixAvailable": True, "via": []}}}
    f = tmp_path / "npm.json"
    f.write_text(json.dumps(data))
    allow = tmp_path / "allow.json"
    allow.write_text("[]")
    r = run_cli("--npm-audit", str(f), "--allowlist", str(allow))
    assert r.returncode == 1


def test_npm_warn_when_no_fix(tmp_path):
    data = {"vulnerabilities": {"lodash": {
        "severity": "high", "fixAvailable": False, "via": []}}}
    f = tmp_path / "npm.json"
    f.write_text(json.dumps(data))
    allow = tmp_path / "allow.json"
    allow.write_text("[]")
    r = run_cli("--npm-audit", str(f), "--allowlist", str(allow))
    assert r.returncode == 0


def test_allowlist_expired_fails(tmp_path):
    load_module()
    allow = tmp_path / "allow.json"
    allow.write_text(json.dumps([{"id": "PY-1", "reason": "r", "expiry": "2020-01-01"}]))
    data = {"dependencies": []}
    f = tmp_path / "pip.json"
    f.write_text(json.dumps(data))
    r = run_cli("--pip-audit", str(f), "--allowlist", str(allow))
    assert r.returncode == 1
    assert "expired" in r.stdout.lower()


def test_allowlist_permits_exception(tmp_path):
    data = {"dependencies": [{"name": "x", "version": "1.0",
                               "vulns": [{"id": "PY-1", "fix_versions": ["1.1"],
                                          "severity": "high"}]}]}
    f = tmp_path / "pip.json"
    f.write_text(json.dumps(data))
    allow = tmp_path / "allow.json"
    allow.write_text(json.dumps([{"id": "PY-1", "reason": "r", "expiry": "2099-01-01"}]))
    r = run_cli("--pip-audit", str(f), "--allowlist", str(allow))
    assert r.returncode == 0
