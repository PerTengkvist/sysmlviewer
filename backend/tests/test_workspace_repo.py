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
            id="lib/main.sysml",
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
    assert loaded.files[0].id == "lib/main.sysml"


def test_load_discovers_disk_without_sysmlfiles(tmp_path: Path):
    import json
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "x.sysml").write_text(
        "package X { part A; }\n", encoding="utf-8"
    )
    (tmp_path / "project.json").write_text(
        json.dumps(
            {
                "id": "proj-1",
                "projektnamn": "Scan",
                "created": now,
                "updated": now,
            }
        ),
        encoding="utf-8",
    )
    repo = WorkspaceProjectRepository(tmp_path)
    loaded = repo.get("proj-1")
    assert loaded is not None
    assert len(loaded.files) == 1
    assert loaded.files[0].id == "lib/x.sysml"
    assert loaded.files[0].path == "lib/x.sysml"
    assert "package X" in loaded.files[0].content


def test_load_ignores_sysmlfiles_manifest_disk_wins(tmp_path: Path):
    import json
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "x.sysml").write_text(
        "package X {}\n", encoding="utf-8"
    )
    (tmp_path / "project.json").write_text(
        json.dumps(
            {
                "id": "proj-2",
                "projektnamn": "DiskWins",
                "created": now,
                "updated": now,
                "sysmlfiles": ["other.sysml"],
            }
        ),
        encoding="utf-8",
    )
    repo = WorkspaceProjectRepository(tmp_path)
    loaded = repo.get("proj-2")
    assert loaded is not None
    assert [f.path for f in loaded.files] == ["lib/x.sysml"]


def test_orphan_sysmlfiles_entry_not_loaded(tmp_path: Path):
    import json
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    (tmp_path / "project.json").write_text(
        json.dumps(
            {
                "id": "proj-3",
                "projektnamn": "Orphan",
                "created": now,
                "updated": now,
                "sysmlfiles": ["missing.sysml"],
            }
        ),
        encoding="utf-8",
    )
    repo = WorkspaceProjectRepository(tmp_path)
    loaded = repo.get("proj-3")
    assert loaded is not None
    assert loaded.files == []


def test_list_summaries_single_workspace(tmp_path: Path):
    repo = WorkspaceProjectRepository(tmp_path)
    assert repo.list_summaries() == []
    project = Project.create("Only")
    repo.save(project)
    summaries = repo.list_summaries()
    assert len(summaries) == 1
    assert summaries[0]["name"] == "Only"
