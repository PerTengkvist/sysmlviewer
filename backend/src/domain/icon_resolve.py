"""Resolve SVG icon files: project workspace first, then viewer icons."""

from __future__ import annotations

import re
from pathlib import Path

_SLUG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


def sanitize_icon_name(name: str | None) -> str | None:
    """Return a safe single-segment icon slug, or None if invalid."""
    if name is None:
        return None
    cleaned = name.strip()
    if not cleaned or cleaned in (".", ".."):
        return None
    if "/" in cleaned or "\\" in cleaned or cleaned.startswith("/"):
        return None
    if ".." in cleaned:
        return None
    if not _SLUG_RE.fullmatch(cleaned):
        return None
    return cleaned


def sanitize_library_name(library: str | None) -> str | None:
    """Same rules as icon names for library segment."""
    return sanitize_icon_name(library)


def project_icon_path(workspace: Path, library: str, name: str) -> Path:
    return Path(workspace) / "icons" / library / f"{name}.svg"


def viewer_icon_path(repo_icons: Path, library: str, name: str) -> Path:
    return Path(repo_icons) / library / f"{name}.svg"


def resolve_icon_file(
    library: str | None,
    name: str,
    *,
    workspace: Path | None,
    repo_icons: Path,
    repo_root: Path | None = None,
) -> Path | None:
    """Return absolute path to an existing SVG, preferring project over viewer.

    If ``library`` is None, use the default icon library (carbon) under viewer.
    """
    safe_name = sanitize_icon_name(name)
    if safe_name is None:
        return None

    if library is None:
        from domain.icon_library import resolve_icon_library

        lib_name, lib_path = resolve_icon_library(repo_root=repo_root)
        candidate = (lib_path / f"{safe_name}.svg").resolve()
        if candidate.is_file():
            return candidate
        return None

    safe_lib = sanitize_library_name(library)
    if safe_lib is None:
        return None

    if workspace is not None:
        proj = project_icon_path(workspace, safe_lib, safe_name).resolve()
        icons_root = (Path(workspace) / "icons").resolve()
        if str(proj).startswith(str(icons_root)) and proj.is_file():
            return proj

    view = viewer_icon_path(repo_icons, safe_lib, safe_name).resolve()
    repo_icons_resolved = Path(repo_icons).resolve()
    if str(view).startswith(str(repo_icons_resolved)) and view.is_file():
        return view
    return None
