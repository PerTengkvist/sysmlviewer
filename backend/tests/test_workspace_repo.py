"""Workspace repo: project.json lives at folder root (no UUID subdir)."""

from pathlib import Path

from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from domain.models import Project, SysmlFile, new_id


def test_save_and_load_at_folder_root(tmp_path: Path):
    repo = WorkspaceProjectRepository(tmp_path)
    project = Project.create("RootProject")
    project.files.append(
        SysmlFile(
            id=new_id(),
            name="main.sysml",
            content="package Main { part A; }\n",
            path="main.sysml",
        )
    )
    repo.write_sysml("main.sysml", "package Main { part A; }\n")
    saved = repo.save(project)

    assert (tmp_path / "project.json").exists()
    assert (tmp_path / "state.json").exists()
    assert (tmp_path / "main.sysml").exists()
    assert not (tmp_path / saved.id).exists()

    loaded = repo.get(saved.id)
    assert loaded is not None
    assert loaded.name == "RootProject"
    assert loaded.files[0].content == "package Main { part A; }\n"
    assert loaded.files[0].path == "main.sysml"
    assert loaded.files[0].source_path is None


def test_save_does_not_overwrite_sysml_with_empty_content(tmp_path: Path):
    repo = WorkspaceProjectRepository(tmp_path)
    project = Project.create("Safe")
    project.files.append(
        SysmlFile(
            id=new_id(),
            name="keep.sysml",
            content="package Keep { part A; }\n",
            path="keep.sysml",
        )
    )
    repo.write_sysml("keep.sysml", "package Keep { part A; }\n")
    repo.save(project)

    # Simulate in-memory wipe (the historical bug path), then save again.
    project.files[0].content = ""
    repo.save(project)

    assert (tmp_path / "keep.sysml").read_text(encoding="utf-8") == (
        "package Keep { part A; }\n"
    )


def test_nested_sysml_path(tmp_path: Path):
    repo = WorkspaceProjectRepository(tmp_path)
    project = Project.create("Nested")
    project.files.append(
        SysmlFile(
            id=new_id(),
            name="main.sysml",
            content="package Lib { part X; }\n",
            path="lib/main.sysml",
        )
    )
    repo.write_sysml("lib/main.sysml", "package Lib { part X; }\n")
    saved = repo.save(project)
    assert (tmp_path / "lib" / "main.sysml").exists()
    loaded = repo.get(saved.id)
    assert loaded is not None
    assert loaded.files[0].path == "lib/main.sysml"


def test_list_summaries_single_workspace(tmp_path: Path):
    repo = WorkspaceProjectRepository(tmp_path)
    assert repo.list_summaries() == []
    project = Project.create("Only")
    repo.save(project)
    summaries = repo.list_summaries()
    assert len(summaries) == 1
    assert summaries[0]["name"] == "Only"
