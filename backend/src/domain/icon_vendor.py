"""Ensure an icon file exists locally, vendoring from a remote adapter if needed."""

from __future__ import annotations

from pathlib import Path

from adapters.icons.registry import get_fetcher
from domain.icon_catalog import curated_ids
from domain.icon_libraries_store import load_library_settings
from domain.icon_resolve import (
    project_icon_path,
    resolve_icon_file,
    sanitize_icon_name,
    sanitize_library_name,
)


def ensure_icon(
    library: str,
    name: str,
    *,
    workspace: Path | None,
    repo_icons: Path,
) -> Path | None:
    """Return path to an existing icon, fetching into the project on miss.

    Resolution order:
    1. project workspace icons
    2. viewer (repo) icons
    3. remote fetcher for ``library`` (only when workspace is open and lib enabled)
    """
    safe_lib = sanitize_library_name(library)
    safe_name = sanitize_icon_name(name)
    if safe_lib is None or safe_name is None:
        return None

    existing = resolve_icon_file(
        safe_lib,
        safe_name,
        workspace=workspace,
        repo_icons=repo_icons,
    )
    if existing is not None:
        return existing

    if workspace is None:
        return None

    settings = load_library_settings(workspace)
    lib_conf = settings.get(safe_lib)
    if lib_conf is not None and not lib_conf.get("enabled", True):
        return None

    # Curated libs must be registered; test fakes may register extra ids.
    if safe_lib in curated_ids() or get_fetcher(safe_lib) is not None:
        pass
    else:
        return None

    style = ""
    if lib_conf is not None:
        style = str(lib_conf.get("style") or "")

    fetcher = get_fetcher(safe_lib, style=style)
    if fetcher is None:
        return None

    try:
        body = fetcher.fetch(safe_name)
    except Exception:
        return None

    if not body.lstrip().lower().startswith("<svg"):
        return None

    dest = project_icon_path(workspace, safe_lib, safe_name)
    icons_root = (Path(workspace) / "icons").resolve()
    dest_resolved = dest.resolve()
    if not str(dest_resolved).startswith(str(icons_root)):
        return None

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(body, encoding="utf-8")
    return dest.resolve()
