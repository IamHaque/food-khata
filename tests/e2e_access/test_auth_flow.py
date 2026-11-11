"""Smoke checks for the auth-flow test server flags."""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]


def _start(tmp_path, *flags):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = {**os.environ, "PYTHONPATH": str(ROOT)}
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "tests" / "e2e_access" / "server.py"), str(tmp_path), str(port), *flags],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
    )
    for _ in range(100):
        try:
            if httpx.get(f"http://127.0.0.1:{port}/health", timeout=2).status_code == 200:
                break
        except httpx.TransportError:
            time.sleep(0.1)
    else:
        proc.terminate()
        proc.wait(timeout=10)
        raise AssertionError("server did not start")
    return proc, port


def test_server_starts_default(tmp_path):
    proc, port = _start(tmp_path)
    try:
        assert httpx.get(f"http://127.0.0.1:{port}/health").status_code == 200
    finally:
        proc.terminate()
        proc.wait(timeout=10)


def test_server_starts_with_fake_provider_switch(tmp_path):
    proc, port = _start(tmp_path, "--enable-fake-provider")
    try:
        assert httpx.get(f"http://127.0.0.1:{port}/health").status_code == 200
    finally:
        proc.terminate()
        proc.wait(timeout=10)
