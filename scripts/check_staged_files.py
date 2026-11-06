"""Reject private data paths before committing or in CI."""

import subprocess
import sys
from pathlib import PurePosixPath


def prohibited(path: str) -> bool:
    parts = PurePosixPath(path.lower()).parts
    name = parts[-1]
    return (
        any(part.startswith(".food-khata") for part in parts)
        or any(part in {"exports", "accounts"} for part in parts)
        or any(parts[i : i + 2] == ("public", "data") for i in range(len(parts) - 1))
        or ".db" in name
        or ".sqlite" in name
        or name.startswith(".env")
        or PurePosixPath(name).suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
        or "parity.local.md" in path.lower()
    )


def main() -> int:
    if "--self-check" in sys.argv:
        for path in (
            ".food-khata/accounts/x",
            "a/test.db-wal",
            "a/test.sqlite3",
            "dashboard-ui/public/data/dashboard.json",
            "exports/out.csv",
            ".env.local",
            "screenshots/real-screenshot.png",
            "screenshots/home.png",
            "capture.jpg",
            "docs/parity.local.md",
        ):
            assert prohibited(path), path
        assert not prohibited("docs/architecture.md")
        print("Synthetic path checks passed")
        return 0
    args = (
        ["git", "ls-files", "-z"]
        if "--all" in sys.argv
        else ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    )
    paths = subprocess.check_output(args).decode("utf-8").split("\0")
    blocked = [path for path in paths if path and prohibited(path)]
    if blocked:
        print("Blocked private paths:\n" + "\n".join(blocked), file=sys.stderr)
        return 1
    print("No prohibited paths found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
