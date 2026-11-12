"""Backup and restore of a data folder (PR-16). Archives and analytics inside a backup are not encrypted."""

import hashlib
import json
import os
import shutil
import sqlite3
import tarfile
import tempfile
from datetime import UTC, datetime
from pathlib import Path, PurePath

NOTE = "Archives and analytics databases in this backup are NOT encrypted; keep the file private."
RESTORE_MAX_BYTES = 20 * 1024**3
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
    out.chmod(0o600)  # it holds unencrypted databases and vaults
    return manifest


def restore(archive: Path | str, data_dir: Path | str) -> int:
    """Rebuild an empty folder from a backup after verifying every checksum; a non-empty folder is refused.

    Nothing is placed until the whole manifest is validated; if placing fails, what was placed is removed again.
    """
    data_dir = Path(data_dir).resolve()
    if data_dir.exists() and any(data_dir.iterdir()):
        raise ValueError("The data folder is not empty; restore only into an empty folder.")
    with tempfile.TemporaryDirectory(dir=data_dir.parent) as tmp, tarfile.open(archive, "r:gz") as tar:
        stage = Path(tmp).resolve()
        members = tar.getmembers()
        for member in members:
            target = (stage / member.name).resolve()
            if not (member.isfile() or member.isdir()) or (stage not in target.parents and target != stage):
                raise ValueError(f"Unsafe entry in backup: {member.name}")
        if sum(m.size for m in members if m.isfile()) > RESTORE_MAX_BYTES:
            raise ValueError("Backup is larger than the restore limit.")
        extracted = {os.path.normpath(m.name) for m in members if m.isfile()}
        tar.extractall(stage, filter="data")
        manifest = json.loads((stage / "manifest.json").read_text())
        files = manifest["files"]
        if not isinstance(files, dict):
            raise ValueError("Backup manifest is invalid.")
        for rel, digest in files.items():
            if (
                not isinstance(rel, str)
                or not rel
                or PurePath(rel).is_absolute()
                or ".." in PurePath(rel).parts
                or os.path.normpath(rel) not in extracted
            ):
                raise ValueError(f"Unsafe path in backup manifest: {rel!r}")
            path = stage / rel
            if stage not in path.resolve().parents or path.is_symlink() or not path.is_file():
                raise ValueError(f"Unsafe path in backup manifest: {rel!r}")
            if _sha256(path) != digest:
                raise ValueError(f"Backup is damaged: {rel}")
        created_root = not data_dir.exists()
        data_dir.mkdir(parents=True, exist_ok=True)
        placed: list[Path] = []
        made: list[Path] = []
        try:
            for rel in files:
                dest = data_dir / rel
                for parent in reversed([p for p in dest.parents if data_dir in p.parents and not p.exists()]):
                    parent.mkdir()
                    made.append(parent)
                os.replace(stage / rel, dest)
                placed.append(dest)
        except BaseException:
            for dest in placed:
                dest.unlink(missing_ok=True)
            for folder in reversed(made):
                shutil.rmtree(folder, ignore_errors=True)
            if created_root:
                shutil.rmtree(data_dir, ignore_errors=True)
            raise
    return len(files)
