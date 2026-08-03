#!/usr/bin/env python3
"""Seed a sample Vehicle project into data/projects for local demos."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.json_repo import JsonFileProjectRepository
from application.project_service import ProjectService


def main() -> None:
    data_dir = ROOT / "data" / "projects"
    sample = ROOT / "examples" / "vehicle.sysml"
    service = ProjectService(
        repo=JsonFileProjectRepository(data_dir),
        parser=SubsetSysmlParser(),
    )
    project = service.create_project("Vehicle Sample")
    content = sample.read_text(encoding="utf-8")
    project = service.add_file(project.id, "vehicle.sysml", content)
    assert project is not None
    print(f"Created project {project.id} ({project.name})")
    print(f"Views: {[v.name for v in project.views]}")


if __name__ == "__main__":
    main()
