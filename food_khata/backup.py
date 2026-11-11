"""Backup and restore of a data folder (PR-16). Archives and analytics inside a backup are not encrypted."""

import hashlib
import json
import shutil
import sqlite3
import tarfile
import tempfile
from datetime import UTC, datetime
from pathlib import Path

NOTE = "Archives and analytics databases in this backup are NOT encrypted; keep the file private."
SKIP_SUFFIXES = (".lock", ".db-wal", ".db-shm")


def _skipped(rel: Path) -> bool:
    return rel.parts[0] == "logs" or rel.name.endswith(SKIP_SUFFIXES) or any(p.startswith(".deleting-") for p in rel.parts)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup(data_dir: Path | str, out: Path | str) -> dict:
    """Write a tar with every database (SQLite backup API, safe while the server runs), archives, vaults and a manifest."""
    data_dir, out = Path(data_dir).resolve(), Path(out).resolve()
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        for src in sorted(data_dir.rglob("*")):
            rel = src.relative_to(data_dir)
            if not src.is_file() or src.is_symlink() or _skipped(rel) or src == out:
                continue
            dest = stage / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if src.suffix == ".db":
                source, target = sqlite3.connect(src), sqlite3.connect(dest)
                try:
                    source.backup(target)
                finally:
                    target.close()
                    source.close()
            else:
                shutil.copy2(src, dest)
        files = {str(p.relative_to(stage)): _sha256(p) for p in sorted(stage.rglob("*")) if p.is_file()}
        manifest = {"version": 1, "created_at": datetime.now(UTC).isoformat(), "files": files, "note": NOTE}
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2))
        with tarfile.open(out, "w:gz") as tar:
            tar.add(stage, arcname=".")
    return manifest


def restore(archive: Path | str, data_dir: Path | str) -> int:
    """Rebuild an empty folder from a backup after verifying every checksum; a non-empty folder is refused."""
    data_dir = Path(data_dir).resolve()
    if data_dir.exists() and any(data_dir.iterdir()):
        raise ValueError("The data folder is not empty; restore only into an empty folder.")
    with tempfile.TemporaryDirectory(dir=data_dir.parent) as tmp, tarfile.open(archive, "r:gz") as tar:
        stage = Path(tmp)
        for member in tar.getmembers():
            target = (stage / member.name).resolve()
            if not (member.isfile() or member.isdir()) or (stage.resolve() not in target.parents and target != stage.resolve()):
                raise ValueError(f"Unsafe entry in backup: {member.name}")
        tar.extractall(stage, filter="data")
        manifest = json.loads((stage / "manifest.json").read_text())
        for rel, digest in manifest["files"].items():
            if not (stage / rel).is_file() or _sha256(stage / rel) != digest:
                raise ValueError(f"Backup is damaged: {rel}")
        data_dir.mkdir(parents=True, exist_ok=True)
        for rel in manifest["files"]:
            dest = data_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(stage / rel, dest)
    return len(manifest["files"])
