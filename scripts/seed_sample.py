#!/usr/bin/env python3
"""Seed a sample Vehicle project into a workspace folder for local demos."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from application.project_service import ProjectService


def main() -> None:
    workspace = ROOT / "data" / "sample-workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    sample = ROOT / "examples" / "vehicle.sysml"
    repo = WorkspaceProjectRepository(workspace)
    service = ProjectService(repo=repo, parser=SubsetSysmlParser())
    if repo.get_open() is None:
        project = service.create_project("Vehicle Sample")
    else:
        project = repo.get_open()
        assert project is not None
    content = sample.read_text(encoding="utf-8")
    if not any(f.name == "vehicle.sysml" for f in project.files):
        project = service.add_file(project.id, "vehicle.sysml", content)
    assert project is not None
    print(f"Workspace: {workspace}")
    print(f"Created/opened project {project.id} ({project.name})")
    print(f"Views: {[v.name for v in project.views]}")
    print(f"Start with: ./sysmlviewer start -f {workspace}")


if __name__ == "__main__":
    main()
