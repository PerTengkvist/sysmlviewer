from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from application.project_service import ProjectService, _remap_stale_relation_layouts
from domain.models import ArtifactKind, Project, SemanticElement
from domain.view_layouts import ViewEdgeLayout, ViewLayout, ViewLayouts


def test_relation_todos_service(tmp_path: Path):
    repo = WorkspaceProjectRepository(tmp_path)
    service = ProjectService(repo, SubsetSysmlParser())
    project = service.create_project("Todos")
    service.record_relation_todo(
        {
            "action": "add",
            "original": "",
            "filepath": "m.sysml",
            "rownumber": 0,
            "source": "P::a::out",
            "target": "P::b::inn",
            "type": "connection",
            "new_def": "connection c connect P::a::out to P::b::inn;",
        }
    )
    items = service.list_relation_todos(project.id)
    assert items is not None
    assert len(items) == 1
    assert items[0]["type"] == "connection"
    assert (tmp_path / ".update_relations_todos.json").is_file()
    assert service.delete_relation_todo(project.id, items[0]["id"]) is True
    assert service.list_relation_todos(project.id) == []


def test_update_relation_ends_and_use_delete(tmp_path: Path):
    repo = WorkspaceProjectRepository(tmp_path)
    service = ProjectService(repo, SubsetSysmlParser())
    project = service.create_project("Ends")
    project.semantic = {
        "A": SemanticElement(id="A", kind=ArtifactKind.PART, name="A"),
        "B": SemanticElement(id="B", kind=ArtifactKind.PART, name="B"),
        "C": SemanticElement(id="C", kind=ArtifactKind.PART, name="C"),
        "dep": SemanticElement(
            id="dep",
            kind=ArtifactKind.DEPENDENCY,
            name="dep",
            source_id="A",
            target_id="B",
        ),
        "UC": SemanticElement(
            id="UC",
            kind=ArtifactKind.USE_CASE,
            name="Login",
            children=["UC::Driver"],
        ),
        "UC::Driver": SemanticElement(
            id="UC::Driver",
            kind=ArtifactKind.ACTOR,
            name="Driver",
            parent_id="UC",
        ),
    }
    service.repo.save(project)

    updated = service.update_relation_ends(project.id, "dep", "A", "C")
    assert updated is not None
    assert updated.semantic["dep"].target_id == "C"

    deleted = service.delete_artifact(project.id, "use:UC::Driver->UC")
    assert deleted is not None
    assert "UC::Driver" not in deleted.semantic
    items = service.list_relation_todos(project.id) or []
    assert any(item["action"] == "change" and item["target"] == "C" for item in items)
    assert any(
        item["action"] == "delete" and item["relationId"] == "use:UC::Driver->UC"
        for item in items
    )


def test_remap_include_layout_id():
    project = Project.create(name="remap")
    project.semantic = {
        "P::Login::include_Auth": SemanticElement(
            id="P::Login::include_Auth",
            kind=ArtifactKind.INCLUDE,
            name="include_Auth",
            source_id="P::Login",
            target_id="P::Auth",
        )
    }
    project.view_layouts = ViewLayouts(
        by_view={
            "v": ViewLayout(
                edges={
                    "P::Login::include_4": ViewEdgeLayout(source_side="top", source_offset=0.5)
                }
            )
        }
    )
    before = {
        "P::Login::include_4": {
            "kind": "include",
            "sourceId": "P::Login",
            "targetId": "P::Auth",
        }
    }
    assert _remap_stale_relation_layouts(before, project) is True
    assert "P::Login::include_Auth" in project.view_layouts.by_view["v"].edges
    assert "P::Login::include_4" not in project.view_layouts.by_view["v"].edges
