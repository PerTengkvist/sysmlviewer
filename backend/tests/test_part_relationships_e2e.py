"""End-to-end tests for part relationship parsing and view payload."""

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.models import ArtifactKind
from helpers import add_example_file, api_url, resolve_example_path


def test_part_relationships_fixture_counts(tmp_path: Path):
    from adapters.parser.subset_parser import SubsetSysmlParser

    content = resolve_example_path("part_relationships.sysml").read_text(encoding="utf-8")
    result = SubsetSysmlParser().parse(content, "part_relationships.sysml")
    assert not [w for w in result.warnings if "ignored" in w]

    by_kind = {}
    for el in result.elements.values():
        by_kind[el.kind] = by_kind.get(el.kind, 0) + 1

    assert by_kind.get(ArtifactKind.CONNECTION, 0) >= 1
    assert by_kind.get(ArtifactKind.DEPENDENCY, 0) >= 2
    assert by_kind.get(ArtifactKind.ALLOCATION, 0) >= 1
    assert by_kind.get(ArtifactKind.BINDING, 0) >= 1
    assert by_kind.get(ArtifactKind.FLOW, 0) >= 1
    assert by_kind.get(ArtifactKind.SPECIALIZATION, 0) >= 1
    assert by_kind.get(ArtifactKind.SUBSETTING, 0) >= 1
    assert by_kind.get(ArtifactKind.REDEFINITION, 0) >= 1


def test_part_relationships_view_payload(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "RelsE2E"}).json()["id"]
    add_example_file(client, project_id, tmp_path, "part_relationships.sysml")

    view = client.get(
        api_url(f"/projects/{project_id}/views/PartRelationships::RelationshipsView")
    ).json()
    edge_kinds = {
        view["semantic"][eid]["kind"]
        for eid in view["visualization"]["edges"]
    }
    assert "dependency" in edge_kinds
    assert "allocation" in edge_kinds
    assert "flow" in edge_kinds
    assert "connection" in edge_kinds

    dep_id = next(
        eid
        for eid, edge in view["visualization"]["edges"].items()
        if view["semantic"][eid]["kind"] == "dependency"
    )
    dep_style = view["visualization"]["edges"][dep_id]["style"]["light"]
    assert dep_style["lineStyle"] == "dashed"
    assert dep_style["markerEnd"] == "openArrow"
