"""Built-in example projects under the repository examples/ folder."""

from __future__ import annotations

import json
from pathlib import Path

from adapters.api.static_paths import resolve_repo_root

_DEFAULT_NAMES = {
    "data_center": "Data Center",
    "diagrams": "Diagrams",
}


def list_example_projects() -> list[dict[str, str]]:
    """Return example projects that have a project.json manifest."""
    examples_dir = resolve_repo_root() / "examples"
    if not examples_dir.is_dir():
        return []

    projects: list[dict[str, str]] = []
    for folder in sorted(examples_dir.iterdir()):
        if not folder.is_dir():
            continue
        manifest_path = folder / "project.json"
        if not manifest_path.is_file():
            continue
        name = _DEFAULT_NAMES.get(folder.name, folder.name.replace("_", " ").title())
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            name = manifest.get("projektnamn") or manifest.get("name") or name
        except (json.JSONDecodeError, OSError):
            pass
        resolved = folder.resolve()
        projects.append(
            {
                "id": f"examples/{folder.name}",
                "name": name,
                "folder": str(resolved),
                "projectFile": str((resolved / "project.json").resolve()),
            }
        )
    return projects
