"""Resolve repo root and frontend static directory."""

from __future__ import annotations

import os
from pathlib import Path

_STATIC_ENV = "SYSMLVIEWER_STATIC_DIR"


def resolve_repo_root() -> Path:
    """Return repository root (parent of backend/)."""
    # app.py -> api -> adapters -> src -> backend -> repo
    return Path(__file__).resolve().parents[4]


def resolve_static_dir(*, explicit: Path | None = None) -> Path | None:
    """Return directory to serve as static frontend, or None if unavailable."""
    if explicit is not None:
        path = Path(explicit).resolve()
        return path if path.is_dir() else None

    env_val = os.environ.get(_STATIC_ENV)
    if env_val:
        path = Path(env_val).expanduser().resolve()
        return path if path.is_dir() else None

    default = resolve_repo_root() / "frontend" / "dist"
    return default if default.is_dir() else None
