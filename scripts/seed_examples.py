#!/usr/bin/env python3
"""Ensure each examples/ subfolder with SysML files has project.json + state.json."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from application.project_service import ProjectService
from domain.models import Project, SysmlFile, new_id

_DEFAULT_NAMES = {
    "data_center": "Data Center",
    "diagrams": "Diagrams",
}


def seed_folder(folder: Path) -> None:
    if not folder.is_dir():
        return
    nested_sysml = sorted(folder.rglob("*.sysml"))
    if not nested_sysml:
        return

    repo = WorkspaceProjectRepository(folder)
    service = ProjectService(repo=repo, parser=SubsetSysmlParser())
    nested_paths = [p.relative_to(folder).as_posix() for p in nested_sysml]

    project = repo.get_open()
    if project is None:
        display = _DEFAULT_NAMES.get(folder.name, folder.name.replace("_", " ").title())
        project = Project.create(display)

    existing = {f.relative_path() for f in project.files}
    for rel in nested_paths:
        if rel in existing:
            continue
        content = (folder / rel).read_text(encoding="utf-8")
        project.files.append(
            SysmlFile(
                id=new_id(),
                name=Path(rel).name,
                content=content,
                warnings=[],
                source_path=None,
                path=rel,
            )
        )
        existing.add(rel)

    service._reparse_all_files(project)
    project = repo.save(project)
    print(f"{folder.name}: {project.id} ({project.name}), {len(project.files)} files")


def main() -> None:
    examples = ROOT / "examples"
    for child in sorted(examples.iterdir()):
        if child.is_dir():
            seed_folder(child)


if __name__ == "__main__":
    main()
