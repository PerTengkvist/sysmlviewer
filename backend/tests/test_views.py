from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.merge import rebuild_views
from domain.models import ArtifactKind
from helpers import add_example_file


def test_parse_vehicle2_declared_views_only():
    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle2.sysml"
    result = SubsetSysmlParser().parse(sample.read_text(encoding="utf-8"), "f1")
    assert "Example::ExampleView" in result.elements
    assert result.elements["Example::ExampleView"].kind == ArtifactKind.VIEW
    assert result.elements["Example::ExampleView"].expose_ref == "Example::Vehicle"

    views = rebuild_views(result.elements)
    assert len(views) == 1
    assert views[0].name == "ExampleView"
    assert views[0].root_artifact_id == "Example::Vehicle"
    assert not any(v.name == "Vehicle" and v.id.startswith("view::") for v in views)


def test_package_resolves_to_general_view(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "V2"}).json()["id"]
    add_example_file(client, project_id, tmp_path, "vehicle2.sysml")

    pkg_view = client.get(f"/projects/{project_id}/views/artifact::Example").json()
    assert pkg_view["view"]["name"] == "ExampleView"
    assert pkg_view["view"]["rootArtifactId"] == "Example::Vehicle"
    assert pkg_view["diagramMode"] == "whitebox"

    part_view = client.get(
        f"/projects/{project_id}/views/artifact::Example::Vehicle"
    ).json()
    assert part_view["diagramMode"] == "whitebox"
    assert "Example::Vehicle::engine" in part_view["semantic"]
    assert any(e["kind"] == "connection" for e in part_view["semantic"].values())


def test_add_connection_and_views_in_project(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "Conn"}).json()["id"]
    add_example_file(client, project_id, tmp_path, "vehicle2.sysml")

    view = client.get(
        f"/projects/{project_id}/views/artifact::Example::Vehicle"
    ).json()
    conns = [e for e in view["semantic"].values() if e["kind"] == "connection"]
    assert len(conns) >= 2

    created = client.post(
        f"/projects/{project_id}/connections",
        json={
            "sourceId": "Example::Vehicle::engine::EventOut",
            "targetId": "Example::Vehicle::battery::EventOut",
        },
    ).json()
    assert any(
        e["kind"] == "connection"
        and e["sourceId"] == "Example::Vehicle::engine::EventOut"
        and e["targetId"] == "Example::Vehicle::battery::EventOut"
        for e in created["semantic"].values()
    )

    project = client.get(f"/projects/{project_id}").json()
    assert "Example::ExampleView" in project["semantic"]
    assert project["semantic"]["Example::ExampleView"]["kind"] == "view"
    assert any(v["id"] == "Example::ExampleView" for v in project["views"])
