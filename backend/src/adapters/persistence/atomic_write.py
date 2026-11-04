"""Atomic file writes shared by the persistence adapters."""

from __future__ import annotations

import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any

NEW_FILE_MODE = 0o644


def atomic_write_text(path: Path, text: str) -> None:
    """Write through a unique temp file and replace, keeping the file mode.

    A fixed ``path.tmp`` name races: two writers replace the same temp and the
    loser hits FileNotFoundError on replace. ``mkstemp`` creates files as 0600,
    so the mode is restored before the temp file takes the final name.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else NEW_FILE_MODE
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, mode)
        os.replace(tmp_name, path)
    except Exception:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    atomic_write_text(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
