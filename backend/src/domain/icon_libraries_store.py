"""Persist per-workspace icon library settings under icons/libraries.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from domain.icon_catalog import merge_library_settings

LIBRARIES_FILENAME = "libraries.json"


def libraries_config_path(workspace: Path) -> Path:
    return Path(workspace) / "icons" / LIBRARIES_FILENAME


def load_library_settings(workspace: Path | None) -> dict[str, dict[str, Any]]:
    if workspace is None:
        return merge_library_settings(None)
    path = libraries_config_path(workspace)
    if not path.is_file():
        return merge_library_settings(None)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return merge_library_settings(None)
    if not isinstance(raw, dict):
        return merge_library_settings(None)
    # Allow either { "libraries": { ... } } or flat { "iconoven": {...} }
    libs = raw.get("libraries") if "libraries" in raw else raw
    if not isinstance(libs, dict):
        return merge_library_settings(None)
    return merge_library_settings(libs)


def save_library_settings(
    workspace: Path,
    overrides: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    merged = merge_library_settings(overrides)
    path = libraries_config_path(workspace)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"libraries": merged}
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return merged
