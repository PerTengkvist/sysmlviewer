"""Per-view layout JSON files under ``<project>/views/``."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from domain.view_layouts import ViewLayout, ViewLayouts

VIEWS_DIR = "views"
SCHEMA_VERSION = 1

_UNSAFE = re.compile(r"[^\w.\-]+", re.UNICODE)


def views_dir(root: Path) -> Path:
    return Path(root) / VIEWS_DIR


def sanitize_filename_stem(raw: str) -> str:
    text = (raw or "").strip().replace("::", "__").replace("/", "__").replace("\\", "__")
    text = _UNSAFE.sub("_", text).strip("._")
    return text or "view"


def safe_view_filename(
    view_id: str,
    name: str | None,
    *,
    existing_names: set[str] | None = None,
) -> str:
    """Return ``<stem>.json`` using short name when unique among *existing_names*."""
    existing = existing_names or set()
    short = (name or "").strip()
    if short and short not in existing:
        return f"{sanitize_filename_stem(short)}.json"
    # Name taken or missing — disambiguate with view id
    return f"{sanitize_filename_stem(view_id)}.json"


def layout_document(
    view_id: str,
    name: str | None,
    layout: ViewLayout,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "viewId": view_id,
        "name": name or view_id.split("::")[-1],
        "nodes": {k: v.to_dict() for k, v in layout.nodes.items()},
        "edges": {k: v.to_dict() for k, v in layout.edges.items()},
    }


def write_one(
    root: Path,
    view_id: str,
    name: str | None,
    layout: ViewLayout,
    *,
    filename: str | None = None,
) -> Path:
    """Write a single view layout file; return absolute path."""
    directory = views_dir(root)
    directory.mkdir(parents=True, exist_ok=True)
    if filename is None:
        existing = {
            p.stem
            for p in directory.glob("*.json")
            if p.is_file()
        }
        # Prefer short name if no other file already claims that stem for a different viewId
        claimed = _stems_claimed_by_other_views(directory, view_id)
        filename = safe_view_filename(
            view_id,
            name,
            existing_names=claimed,
        )
    path = directory / filename
    # If file exists for another viewId, fall back to id-based name
    if path.is_file():
        try:
            existing_doc = json.loads(path.read_text(encoding="utf-8"))
            if existing_doc.get("viewId") and existing_doc.get("viewId") != view_id:
                path = directory / f"{sanitize_filename_stem(view_id)}.json"
        except (json.JSONDecodeError, OSError):
            pass
    path.write_text(
        json.dumps(layout_document(view_id, name, layout), indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    return path.resolve()


def _stems_claimed_by_other_views(directory: Path, view_id: str) -> set[str]:
    claimed: set[str] = set()
    if not directory.is_dir():
        return claimed
    for path in directory.glob("*.json"):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            claimed.add(path.stem)
            continue
        if doc.get("viewId") != view_id:
            # Short name (stem) is reserved if another view uses a file named after it
            claimed.add(path.stem)
            name = doc.get("name")
            if name:
                claimed.add(str(name))
    return claimed


def read_all(root: Path) -> ViewLayouts:
    directory = views_dir(root)
    by_view: dict[str, ViewLayout] = {}
    if not directory.is_dir():
        return ViewLayouts()
    for path in sorted(directory.glob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        view_id = doc.get("viewId")
        if not view_id or not isinstance(view_id, str):
            continue
        by_view[view_id] = ViewLayout.from_dict(
            {"nodes": doc.get("nodes") or {}, "edges": doc.get("edges") or {}}
        )
    return ViewLayouts(by_view=by_view)


def migrate_from_state(
    root: Path,
    state: dict[str, Any],
    *,
    view_names: dict[str, str] | None = None,
) -> ViewLayouts:
    """Split ``state['viewLayouts']`` into ``views/*.json`` files."""
    raw = state.get("viewLayouts") or {}
    if not isinstance(raw, dict) or not raw:
        return read_all(root)
    names = view_names or {}
    layouts = ViewLayouts.from_dict(raw)
    for view_id, layout in layouts.by_view.items():
        write_one(root, view_id, names.get(view_id), layout)
    return read_all(root)


def find_view_file(root: Path, view_id: str) -> Path | None:
    directory = views_dir(root)
    if not directory.is_dir():
        return None
    for path in directory.glob("*.json"):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if doc.get("viewId") == view_id:
            return path
    return None
