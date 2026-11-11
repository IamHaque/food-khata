"""Stress: kill/resume."""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.load_test import run_kill_suite


@pytest.mark.stress
def test_kill_three_runs(tmp_path):
    run_kill_suite(3, tmp_path)
