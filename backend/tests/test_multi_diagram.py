"""TDD coverage for state, action flow, and tree diagram modes."""

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind
from helpers import add_example_file


def test_parse_state_machine():
    sample = Path(__file__).resolve().parents[2] / "examples" / "state_machine.sysml"
    result = SubsetSysmlParser().parse(sample.read_text(encoding="utf-8"), "f1")
    assert "StateExample::DoorMachine" in result.elements
    assert result.elements["StateExample::DoorMachine"].kind == ArtifactKind.STATE
    assert "StateExample::DoorMachine::Closed" in result.elements
    assert result.elements["StateExample::DoorMachine::Closed"].kind == ArtifactKind.STATE
    trans = result.elements["StateExample::DoorMachine::open"]
    assert trans.kind == ArtifactKind.TRANSITION
    assert trans.source_id == "StateExample::DoorMachine::Closed"
    assert trans.target_id == "StateExample::DoorMachine::Open"
    view = result.elements["StateExample::DoorStateView"]
    assert view.type_ref == "StateTransitionView"
    assert view.expose_ref == "StateExample::DoorMachine"


def test_state_view_api(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "SM"}).json()["id"]
    add_example_file(client, project_id, tmp_path, "state_machine.sysml")
    project = client.get(f"/projects/{project_id}").json()
    views = {v["name"]: v for v in project["views"]}
    payload = client.get(
        f"/projects/{project_id}/views/{views['DoorStateView']['id']}"
    ).json()
    assert payload["diagramMode"] == "state"
    kinds = {e["kind"] for e in payload["semantic"].values()}
    assert "state" in kinds
    assert "transition" in kinds


def test_parse_action_flow():
    sample = Path(__file__).resolve().parents[2] / "examples" / "action_flow.sysml"
    result = SubsetSysmlParser().parse(sample.read_text(encoding="utf-8"), "f1")
    assert result.elements["ActionExample::BootFlow"].kind == ArtifactKind.ACTION
    start = result.elements["ActionExample::BootFlow::start"]
    assert start.type_ref == "start"
    decis = result.elements["ActionExample::BootFlow::testSuccessful"]
    assert decis.type_ref == "decision"
    s1 = result.elements["ActionExample::BootFlow::s1"]
    assert s1.kind == ArtifactKind.SUCCESSION
    assert s1.source_id.endswith("::start")
    assert s1.target_id.endswith("::loadApplication")
    yes = result.elements["ActionExample::BootFlow::yes"]
    assert yes.source_id.endswith("::testSuccessful")
    assert yes.target_id.endswith("::ready")
    no = result.elements["ActionExample::BootFlow::no"]
    assert no.target_id.endswith("::reportFailure")


def test_action_flow_view_api(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "AF"}).json()["id"]
    add_example_file(client, project_id, tmp_path, "action_flow.sysml")
    project = client.get(f"/projects/{project_id}").json()
    views = {v["name"]: v for v in project["views"]}
    payload = client.get(
        f"/projects/{project_id}/views/{views['BootFlowView']['id']}"
    ).json()
    assert payload["diagramMode"] == "actionFlow"
    kinds = {e["kind"] for e in payload["semantic"].values()}
    assert "action" in kinds
    assert "succession" in kinds
    names = {e["name"] for e in payload["semantic"].values()}
    assert "loadApplication" in names
    assert "testSuccessful" in names
    assert "reportFailure" in names
    assert "stop" in names
    assert "init" not in names
    assert "boot" not in names


def test_tree_view_api(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "Tree"}).json()["id"]
    add_example_file(client, project_id, tmp_path, "tree_view.sysml")
    project = client.get(f"/projects/{project_id}").json()
    views = {v["name"]: v for v in project["views"]}
    payload = client.get(
        f"/projects/{project_id}/views/{views['VehicleTree']['id']}?levels=3"
    ).json()
    assert payload["diagramMode"] == "tree"
    assert "TreeExample::Vehicle::engine" in payload["semantic"]
    assert "TreeExample::Vehicle::engine::piston" in payload["semantic"]
