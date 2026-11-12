"""Per-view layout JSON files under ``<project>/views/``.

SysML v2 layouts use ``<name>.json``. Arcadia / SysML v1 layouts use the sibling
``<name>.arcadia.json`` so geometry can differ per structure notation.
"""

from __future__ import annotations

import errno
import json
import os
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from adapters.persistence.atomic_write import atomic_write_json
from domain.view_layouts import ViewLayout, ViewLayouts

VIEWS_DIR = "views"
SCHEMA_VERSION = 1
ARCADIA_SUFFIX = ".arcadia"

_UNSAFE = re.compile(r"[^\w.\-]+", re.UNICODE)

StructureNotation = str  # "sysmlv2" | "arcadia"


class ViewFileNotWritable(PermissionError):
    """The view file exists but must not be replaced.

    ``os.replace`` only needs directory access, so an atomic write would
    otherwise overwrite a file the user marked read-only.
    """

    def __init__(self, path: Path) -> None:
        super().__init__(errno.EACCES, "View file is not writable", str(path))
        self.path = path


def normalize_notation(raw: str | None) -> StructureNotation:
    return "arcadia" if (raw or "").strip().lower() == "arcadia" else "sysmlv2"


def views_dir(root: Path) -> Path:
    return Path(root) / VIEWS_DIR


def sanitize_filename_stem(raw: str) -> str:
    text = (raw or "").strip().replace("::", "__").replace("/", "__").replace("\\", "__")
    text = _UNSAFE.sub("_", text).strip("._")
    return text or "view"


def is_arcadia_layout_path(path: Path) -> bool:
    return path.name.endswith(".arcadia.json") or path.stem.endswith(".arcadia")


def notation_filename(base_filename: str, notation: StructureNotation) -> str:
    """Turn ``Foo.json`` into ``Foo.arcadia.json`` when notation is arcadia."""
    if not base_filename.endswith(".json"):
        base_filename = f"{base_filename}.json"
    if normalize_notation(notation) != "arcadia":
        return base_filename
    stem = base_filename[: -len(".json")]
    if stem.endswith(ARCADIA_SUFFIX):
        return base_filename
    return f"{stem}{ARCADIA_SUFFIX}.json"


def safe_view_filename(
    view_id: str,
    name: str | None,
    *,
    existing_names: set[str] | None = None,
    notation: StructureNotation = "sysmlv2",
) -> str:
    """Return ``<stem>.json`` or ``<stem>.arcadia.json``."""
    existing = existing_names or set()
    short = (name or "").strip()
    if short and short not in existing:
        return notation_filename(f"{sanitize_filename_stem(short)}.json", notation)
    return notation_filename(f"{sanitize_filename_stem(view_id)}.json", notation)


def layout_document(
    view_id: str,
    name: str | None,
    layout: ViewLayout,
    *,
    structure_notation: StructureNotation = "sysmlv2",
) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "viewId": view_id,
        "name": name or view_id.split("::")[-1],
        "structureNotation": normalize_notation(structure_notation),
        "nodes": {k: v.to_dict() for k, v in layout.nodes.items()},
        "edges": {k: v.to_dict() for k, v in layout.edges.items()},
    }
    if layout.hierarchical_levels_override is not None:
        doc["hierarchicalLevelsOverride"] = layout.hierarchical_levels_override
    if layout.view_filters:
        doc["viewFilters"] = list(layout.view_filters)
    if layout.layout_scopes:
        doc["layoutScopes"] = [dict(s) for s in layout.layout_scopes]
    if layout.auto_layout_edge_kinds is not None:
        doc["autoLayoutEdgeKinds"] = dict(layout.auto_layout_edge_kinds)
    return doc


def write_one(
    root: Path,
    view_id: str,
    name: str | None,
    layout: ViewLayout,
    *,
    filename: str | None = None,
    structure_notation: StructureNotation = "sysmlv2",
) -> Path:
    """Write a single view layout file; return absolute path."""
    notation = normalize_notation(structure_notation)
    directory = views_dir(root)
    directory.mkdir(parents=True, exist_ok=True)
    path = _write_target(directory, view_id, name, filename, notation)
    if path.exists() and not os.access(path, os.W_OK):
        raise ViewFileNotWritable(path.resolve())
    if not os.access(directory, os.W_OK):
        raise ViewFileNotWritable(directory.resolve())
    atomic_write_json(
        path,
        layout_document(view_id, name, layout, structure_notation=notation),
    )
    return path.resolve()


def _write_target(
    directory: Path,
    view_id: str,
    name: str | None,
    filename: str | None,
    notation: StructureNotation,
) -> Path:
    """Pick the file to write, which must be the one a later read returns."""
    if filename is not None:
        path = directory / notation_filename(filename, notation)
    else:
        existing = _files_for_view(directory, view_id, notation)
        if existing:
            return existing[-1]
        claimed = _stems_claimed_by_other_views(directory, view_id, notation)
        path = directory / safe_view_filename(
            view_id,
            name,
            existing_names=claimed,
            notation=notation,
        )
    existing_doc = _read_document(path) if path.is_file() else None
    if existing_doc and existing_doc.get("viewId") not in (None, "", view_id):
        path = directory / notation_filename(
            f"{sanitize_filename_stem(view_id)}.json", notation
        )
    return path


def _read_document(path: Path) -> dict[str, Any] | None:
    """Parsed layout document, or None when the file cannot be used."""
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None
    return doc if isinstance(doc, dict) else None


def _layout_documents(
    directory: Path,
    notation: StructureNotation,
) -> Iterator[tuple[Path, dict[str, Any]]]:
    """Parsable layout files for one notation, in the order reads apply them."""
    want_arcadia = normalize_notation(notation) == "arcadia"
    for path in sorted(directory.glob("*.json")):
        if is_arcadia_layout_path(path) != want_arcadia:
            continue
        doc = _read_document(path)
        if doc is not None:
            yield path, doc


def _files_for_view(
    directory: Path,
    view_id: str,
    notation: StructureNotation,
) -> list[Path]:
    """Files holding this view. The last one wins, because reads apply in order."""
    if not directory.is_dir():
        return []
    return [
        path
        for path, doc in _layout_documents(directory, notation)
        if doc.get("viewId") == view_id
    ]


def duplicate_view_files(
    root: Path,
    view_id: str,
    *,
    structure_notation: StructureNotation = "sysmlv2",
) -> list[Path]:
    """All files for a view when more than one exists, otherwise empty."""
    files = _files_for_view(views_dir(root), view_id, structure_notation)
    return files if len(files) > 1 else []


def corrupt_view_files(root: Path) -> list[Path]:
    """Layout files that reads skip because they cannot be parsed."""
    directory = views_dir(root)
    if not directory.is_dir():
        return []
    return [
        path
        for path in sorted(directory.glob("*.json"))
        if _read_document(path) is None
    ]


def _stems_claimed_by_other_views(
    directory: Path,
    view_id: str,
    notation: StructureNotation,
) -> set[str]:
    claimed: set[str] = set()
    if not directory.is_dir():
        return claimed
    want_arcadia = normalize_notation(notation) == "arcadia"
    for path in directory.glob("*.json"):
        if is_arcadia_layout_path(path) != want_arcadia:
            continue
        doc = _read_document(path)
        if doc is None:
            claimed.add(path.stem.replace(ARCADIA_SUFFIX, ""))
            continue
        if doc.get("viewId") != view_id:
            stem = path.stem
            if stem.endswith(ARCADIA_SUFFIX):
                stem = stem[: -len(ARCADIA_SUFFIX)]
            claimed.add(stem)
            name = doc.get("name")
            if name:
                claimed.add(str(name))
    return claimed


def read_all(
    root: Path,
    *,
    structure_notation: StructureNotation = "sysmlv2",
) -> ViewLayouts:
    """Load layouts for one structure notation."""
    notation = normalize_notation(structure_notation)
    directory = views_dir(root)
    by_view: dict[str, ViewLayout] = {}
    if not directory.is_dir():
        return ViewLayouts()
    for _path, doc in _layout_documents(directory, notation):
        view_id = doc.get("viewId")
        if not view_id or not isinstance(view_id, str):
            continue
        by_view[view_id] = ViewLayout.from_dict(
            {
                "nodes": doc.get("nodes") or {},
                "edges": doc.get("edges") or {},
                "hierarchicalLevelsOverride": doc.get(
                    "hierarchicalLevelsOverride"
                ),
                "viewFilters": doc.get("viewFilters") or [],
                # Older files hold layoutRules + layeredLayout instead;
                # ViewLayout.from_dict migrates them.
                **(
                    {"layoutScopes": doc["layoutScopes"]}
                    if isinstance(doc.get("layoutScopes"), list)
                    else {
                        "layoutRules": doc.get("layoutRules") or [],
                        "layeredLayout": doc.get("layeredLayout"),
                    }
                ),
                "autoLayoutEdgeKinds": doc.get("autoLayoutEdgeKinds"),
            }
        )
    return ViewLayouts(by_view=by_view)


def read_for_view(
    root: Path,
    view_id: str,
    *,
    structure_notation: StructureNotation = "sysmlv2",
) -> ViewLayout | None:
    """Layout for one view/notation; Arcadia falls back to SysML v2 if missing."""
    notation = normalize_notation(structure_notation)
    layouts = read_all(root, structure_notation=notation)
    layout = layouts.by_view.get(view_id)
    if layout is not None:
        return layout
    if notation == "arcadia":
        return read_all(root, structure_notation="sysmlv2").by_view.get(view_id)
    return None


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


def find_view_file(
    root: Path,
    view_id: str,
    *,
    structure_notation: StructureNotation = "sysmlv2",
) -> Path | None:
    notation = normalize_notation(structure_notation)
    files = _files_for_view(views_dir(root), view_id, notation)
    if files:
        return files[-1]
    if notation == "arcadia":
        return find_view_file(root, view_id, structure_notation="sysmlv2")
    return None
