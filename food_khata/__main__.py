"""Executable entry point for python -m food_khata."""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
