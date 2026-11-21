"""ActionFlowView on a use case: diagramMode useCaseRealization (white-box activity)."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.diagram_mode import expected_root_kinds, resolve_diagram_mode
from domain.models import ArtifactKind, SemanticElement, ViewDef
from helpers import add_content_file, api_url

PROBE = (Path(__file__).parent / "fixtures" / "realization_probe.sysml").read_text(
    encoding="utf-8"
)
EXTRA = """
  package Nested { package Deep {
    use case def Own { action only; action unlinked; first start; then only; then unlinked; then done; }
  } }
  package Mixed {
    part def Fn { part n { perform flow.s1; perform flow.s2; } action flow { action s1; action s2; first start; then s1; then s2; then done; } }
    use case def Uc { actor A { perform a1; } action a1; action sys; action later; }
    #refine dependency from Mixed::Fn::flow::s1 to Mixed::Uc::sys;
    #refine dependency from Mixed::Fn::flow::s2 to Mixed::Uc::sys;
  }
"""
VIEWS = """\
package FlowViews {
  view StartFlow : ActionFlowView { expose RealizationProbe::UC::Start; }
  view UnlockFlow : ActionFlowView { expose RealizationProbe::UC::Unlock; }
  view LockFlow : ActionFlowView { expose RealizationProbe::UC::Lock; }
  view DriveFlow : ActionFlowView { expose RealizationProbe::UC::Drive; }
  view SecurityFlow : ActionFlowView { expose RealizationProbe::F::Security::startFlow; }
  view MixedFlow : ActionFlowView { expose RealizationProbe::Mixed::Uc; }
  view MixedExpose : ActionFlowView { expose RealizationProbe::UC::Lock; expose RealizationProbe::F::Security::startFlow; }
  view FlowFirst : ActionFlowView { expose RealizationProbe::F::Security::startFlow; expose RealizationProbe::UC::Lock; }
  view OwnFlow : ActionFlowView { expose RealizationProbe::Nested::Deep::Own; }
}
"""

P = "RealizationProbe"
START = f"{P}::UC::Start"
UNLOCK = f"{P}::UC::Unlock"
DRIVE = f"{P}::UC::Drive"
SEC = f"{P}::F::Security"
FLOW = f"{SEC}::startFlow"
AUTH, IMMO, LOCKS = f"{SEC}::auth", f"{SEC}::immo", f"{SEC}::locks"
VC, BC = f"{P}::L::vc", f"{P}::L::bc"
DRIVER = f"{START}::Driver"


def _model() -> str:
    return PROBE.rstrip().removesuffix("}") + EXTRA + "}\n"


def _client(tmp_path: Path, *, levels: int | None = None) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "C"}).json()["id"]
    add_content_file(client, pid, tmp_path, "probe.sysml", _model())
    add_content_file(client, pid, tmp_path, "views.sysml", VIEWS)
    return client, pid


def _view(client: TestClient, pid: str, name: str, levels: int = 2) -> dict:
    res = client.get(
        api_url(f"/projects/{pid}/views/FlowViews::{name}?levels={levels}")
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_action_flow_on_action_unchanged(tmp_path: Path):
    action = SemanticElement(id="P::A", kind=ArtifactKind.ACTION, name="A")
    view = ViewDef(id="v", name="v", root_artifact_id="P::A", type_ref="ActionFlowView")
    assert resolve_diagram_mode(view, action, {ArtifactKind.ACTION}) == "actionFlow"
    assert expected_root_kinds("actionFlow") == {ArtifactKind.ACTION}
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "SecurityFlow")
    assert payload["diagramMode"] == "actionFlow"
    assert payload.get("modeError") is None
    # Exactly the keys an action flow had before this mode existed.
    assert set(payload) == {
        "autoLayoutEdgeKinds", "diagramMode", "exposeControlsDepth", "exposeKinds",
        "exposeRootIds", "hasViewLayout", "hierarchicalLevels", "hierarchicalLevelsOverride",
        "layoutScopes", "menus", "performers", "realizationMatrix", "semantic", "sequenceLayout", "subdiagrams",
        "view", "viewFilters", "visualization",
    }
    assert payload["performers"] == {f"{FLOW}::checkKeyInCabin": [AUTH],
                                     f"{FLOW}::releaseImmobilizer": [IMMO],
                                     f"{FLOW}::logStart": [IMMO]}


def test_action_flow_on_use_case_is_realization(tmp_path: Path):
    uc = SemanticElement(id="P::U", kind=ArtifactKind.USE_CASE, name="U")
    view = ViewDef(id="v", name="v", root_artifact_id="P::U", type_ref="ActionFlowView")
    assert resolve_diagram_mode(view, uc, {ArtifactKind.USE_CASE}) == "useCaseRealization"
    # A use case together with an action stays an action flow.
    both = {ArtifactKind.USE_CASE, ArtifactKind.ACTION}
    assert resolve_diagram_mode(view, uc, both) == "actionFlow"
    assert expected_root_kinds("useCaseRealization") == {ArtifactKind.USE_CASE}
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "StartFlow")
    assert payload["diagramMode"] == "useCaseRealization"
    assert payload.get("modeError") is None


def test_mode_follows_all_exposes_not_only_the_first(tmp_path: Path):
    client, pid = _client(tmp_path)
    # A use case together with an action: an action flow, whichever comes first.
    assert _view(client, pid, "MixedExpose")["diagramMode"] == "actionFlow"
    assert _view(client, pid, "FlowFirst")["diagramMode"] == "actionFlow"


def test_payload_carries_the_use_case_and_its_realization(tmp_path: Path):
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "StartFlow")
    sem = payload["semantic"]
    for step in ("pressStart", "checkKey", "showReady", "askForBrake", "start", "done", "succ1"):
        assert f"{START}::{step}" in sem
    assert DRIVER in sem and f"{DRIVER}::perform_pressStart" in sem
    # The realizers, their flow with the successions, the performers and the parts.
    for eid in (
        f"{FLOW}::checkKeyInCabin", f"{FLOW}::releaseImmobilizer", FLOW, f"{FLOW}::succ2",
        SEC, AUTH, IMMO, VC,
    ):
        assert eid in sem, eid
    # Nothing of the unrelated flow or of the other use cases.
    assert UNLOCK not in sem and f"{SEC}::unlockFlow" not in sem and LOCKS not in sem and BC not in sem

    real = payload["realization"]
    assert real["useCaseId"] == START
    assert real["inScope"] is True
    assert real["actors"] == [DRIVER]
    assert real["actorSteps"] == {f"{START}::pressStart": DRIVER}
    assert real["systemSteps"] == [f"{START}::{s}" for s in ("checkKey", "showReady", "askForBrake")]
    assert real["stepRealizers"] == {
        f"{START}::checkKey": [f"{FLOW}::checkKeyInCabin"],
        f"{START}::showReady": [f"{FLOW}::releaseImmobilizer"],
    }
    assert real["unrealizedSteps"] == [f"{START}::askForBrake"]
    assert real["coarseSteps"] == {}
    assert real["realizerNodes"] == {
        f"{FLOW}::checkKeyInCabin": [AUTH],
        f"{FLOW}::releaseImmobilizer": [IMMO],
    }
    assert real["nodeFunctions"] == {AUTH: [SEC], IMMO: [SEC]}
    assert real["realizerFunctions"] == {
        f"{FLOW}::checkKeyInCabin": SEC,
        f"{FLOW}::releaseImmobilizer": SEC,
    }
    assert real["calls"] == []
    assert payload["laneTargets"] == {AUTH: [VC], IMMO: [VC]}
    labels = payload["realizationLabels"]
    assert labels[DRIVER] == "Driver" and labels[AUTH] == "auth" and labels[VC] == "vc"
    assert labels[SEC] == "Security"


def test_coarse_and_unrealized_steps(tmp_path: Path):
    client, pid = _client(tmp_path)
    unlock = _view(client, pid, "UnlockFlow")["realization"]
    # unlockFlow refines the whole use case: the system step is realized coarsely.
    assert unlock["coarseSteps"] == {f"{UNLOCK}::unlockDoors": [f"{SEC}::unlockFlow"]}
    assert unlock["stepRealizers"] == {}
    assert unlock["unrealizedSteps"] == []  # no step link: not in scope (opt-in)
    assert unlock["inScope"] is False
    assert unlock["realizerNodes"] == {f"{SEC}::unlockFlow": [LOCKS]}
    lock = _view(client, pid, "LockFlow")["realization"]
    assert lock["coarseSteps"] == {} and lock["unrealizedSteps"] == []
    assert lock["systemSteps"] == [f"{P}::UC::Lock::lockDoors"]


def test_two_function_steps_realize_one_step(tmp_path: Path):
    client, pid = _client(tmp_path)
    mixed = _view(client, pid, "MixedFlow")
    real = mixed["realization"]
    fn = f"{P}::Mixed::Fn"
    assert real["stepRealizers"] == {
        f"{P}::Mixed::Uc::sys": [f"{fn}::flow::s1", f"{fn}::flow::s2"]
    }
    assert real["unrealizedSteps"] == [f"{P}::Mixed::Uc::later"]
    assert f"{fn}::flow::succ2" in mixed["semantic"]


def test_composite_use_case_has_call_nodes(tmp_path: Path):
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "DriveFlow")
    assert payload["diagramMode"] == "useCaseRealization"
    calls = payload["realization"]["calls"]
    # viewId: the view to open for a call, the activity view of the called use case first.
    assert calls == [
        {"id": f"{DRIVE}::include_Start", "calledUseCaseId": START, "viewId": "FlowViews::StartFlow"},
        {"id": f"{DRIVE}::include_Unlock", "calledUseCaseId": UNLOCK, "viewId": "FlowViews::UnlockFlow"},
    ]
    for call in calls:
        assert call["id"] in payload["semantic"]
        assert call["calledUseCaseId"] in payload["semantic"]
    assert payload["realization"]["systemSteps"] == []


def test_a_call_opens_the_activity_view_before_other_views_and_none_when_there_is_none(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "C"}).json()["id"]
    add_content_file(client, pid, tmp_path, "probe.sysml", _model())
    add_content_file(
        client, pid, tmp_path, "views.sysml",
        """package FlowViews {
  view StartChain : AllocationView { expose RealizationProbe::UC::Start; }
  view StartFlow : ActionFlowView { expose RealizationProbe::UC::Start; }
  view DriveFlow : ActionFlowView { expose RealizationProbe::UC::Drive; }
}
""",
    )
    calls = {c["calledUseCaseId"]: c["viewId"] for c in _view(client, pid, "DriveFlow")["realization"]["calls"]}
    assert calls == {START: "FlowViews::StartFlow", UNLOCK: None}


def test_content_does_not_depend_on_the_depth_setting(tmp_path: Path):
    client, pid = _client(tmp_path)
    for name in ("StartFlow", "OwnFlow", "DriveFlow"):
        shallow, deep = _view(client, pid, name, 1), _view(client, pid, name, 6)
        assert shallow["diagramMode"] == deep["diagramMode"] == "useCaseRealization"
        assert list(shallow["semantic"]) == list(deep["semantic"])
        assert shallow["realization"] == deep["realization"]
    nested = _view(client, pid, "OwnFlow", 1)
    assert f"{P}::Nested::Deep::Own::only" in nested["semantic"]
    assert nested["realization"]["systemSteps"] == [
        f"{P}::Nested::Deep::Own::only", f"{P}::Nested::Deep::Own::unlinked",
    ]
    assert nested["realization"]["unrealizedSteps"] == []  # not in scope


def test_nodes_carry_no_saved_position(tmp_path: Path):
    client, pid = _client(tmp_path)
    nodes = _view(client, pid, "StartFlow")["visualization"]["nodes"]
    assert all("x" not in n and "y" not in n for n in nodes.values())


def test_electric_car_copy_with_a_use_case_flow_is_reasonable(tmp_path: Path):
    """No step links in the car yet: white box shows coarse or empty realizations."""
    src = Path(__file__).resolve().parents[2] / "examples" / "electric_car"
    ws = tmp_path / "ec"
    shutil.copytree(src, ws)
    (ws / "flow_views.sysml").write_text(
        "package CarFlows {\n"
        "  view StartFlow : ActionFlowView { expose UseCases::Driving::StartVehicle; }\n"
        "  view SecurityFlow : ActionFlowView { expose Functions::Security::securityFlow; }\n}\n",
        encoding="utf-8",
    )
    client = TestClient(create_app(workspace=ws))
    project = client.get(api_url("/session")).json()["project"]
    start = client.get(api_url(f"/projects/{project['id']}/views/CarFlows::StartFlow")).json()
    assert start["diagramMode"] == "useCaseRealization"
    assert start.get("modeError") is None
    real = start["realization"]
    assert real["useCaseId"] == "UseCases::Driving::StartVehicle"
    assert real["stepRealizers"] == {}  # the car has no step links yet
    assert real["unrealizedSteps"] == []  # not in scope: no step link, no finding
    assert real["inScope"] is False
    security = client.get(api_url(f"/projects/{project['id']}/views/CarFlows::SecurityFlow")).json()
    assert security["diagramMode"] == "actionFlow"
