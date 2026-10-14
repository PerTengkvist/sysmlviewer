"""Resolve icon library name and offline icon directory from the environment."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_LIBRARY = "carbon"
OFFLINE_ICONS = ("satellite", "satellite-radar", "user", "user-filled")


def resolve_icon_library(
    *,
    env: dict[str, str] | None = None,
    repo_root: Path | None = None,
) -> tuple[str, Path]:
    """Return (library_name, absolute path to icon directory)."""
    environ = env if env is not None else os.environ
    name = (environ.get("SYSMLVIEWER_ICON_LIBRARY") or DEFAULT_LIBRARY).strip() or DEFAULT_LIBRARY
    root = repo_root
    if root is None:
        from adapters.api.static_paths import resolve_repo_root

        root = resolve_repo_root()
    path = Path(root) / "icons" / name
    return name, path.resolve()


def log_icon_library_startup(name: str, path: Path) -> str:
    """Message printed at startup."""
    return f"Icon library: {name} ({path})"


def offline_icon_files(library_path: Path) -> list[Path]:
    return [library_path / f"{n}.svg" for n in OFFLINE_ICONS]
