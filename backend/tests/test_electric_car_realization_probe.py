"""Step 0 probes for the electric car's use case realization (plan 2, phase A).

What the parser, the derivation and the viewer do with the constructs the model is
about to use, before the model uses them. Merged into test_electric_car_realization.py
once the model is updated.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from fastapi.testclient import TestClient
from helpers import api_url

from adapters.api.app import create_app
from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind, SysmlFile
from domain.perform import resolve_performers
from domain.realization import derive_realization

ROOT = resolve_repo_root() / "examples" / "electric_car"
UC_FILE = "use_cases/use_cases.sysml"


def _files(overrides: dict[str, str] | None = None, extra: str | None = None) -> list[SysmlFile]:
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        text = (overrides or {}).get(rel) or path.read_text(encoding="utf-8")
        files.append(SysmlFile(id=rel, name=path.name, content=text, path=rel))
    if extra:
        files.append(SysmlFile(id="probe.sysml", name="probe.sysml", content=extra, path="probe.sysml"))
    return files


def _parse(overrides=None, extra=None):
    return SubsetSysmlParser().parse_project(_files(overrides, extra))


def _with_actor_block(text: str, uc: str, actor: str, step: str) -> str:
    """`actor X;` of one use case def becomes `actor X { perform step; }`."""
    head = text.index(f"> {uc} {{")
    at = text.index(f"actor {actor};", head)
    return text[:at] + f"actor {actor} {{ perform {step}; }}" + text[at + len(f"actor {actor};"):]


def test_nested_use_case_step_is_a_refine_end():
    """A function step and a use case step, both nested actions, resolve as refine ends."""
    result = _parse(
        extra="package Probe {\n  #refine dependency from Functions::Charging::chargingFlow::detectPlug\n"
        "                       to UseCases::Managing::Charge::connectCharger;\n}\n"
    )
    assert result.warnings == []
    assert all(not ws for ws in result.file_warnings.values())
    (dep,) = [e for e in result.elements.values() if e.parent_id == "Probe"]
    assert dep.kind == ArtifactKind.DEPENDENCY and "refine" in dep.metadata_keywords
    assert dep.source_id == "Functions::Charging::chargingFlow::detectPlug"
    assert dep.target_id == "UseCases::Managing::Charge::connectCharger"
    assert result.elements[dep.source_id].kind == ArtifactKind.ACTION
    assert result.elements[dep.target_id].kind == ArtifactKind.ACTION


def test_actor_block_makes_an_actor_step():
    """Plan 1 reads `actor X { perform step; }` (A7 no longer holds): no warning, the
    same elements plus the perform, and the step is the actor's, not a system step."""
    text = (ROOT / UC_FILE).read_text(encoding="utf-8")
    before = _parse()
    after = _parse({UC_FILE: _with_actor_block(text, "StartVehicle", "Driver", "pressStart")})
    assert after.warnings == []
    assert all(not ws for ws in after.file_warnings.values())
    uc = "UseCases::Driving::StartVehicle"
    assert set(after.elements) - set(before.elements) == {f"{uc}::Driver::perform_pressStart"}
    assert set(before.elements) - set(after.elements) == set()
    assert resolve_performers(after.elements)[f"{uc}::pressStart"] == [f"{uc}::Driver"]


def test_actor_step_may_be_the_target_of_a_step_link():
    """A3/B2: a function step that reads the actor's input refines the actor step. That is
    a realization link (it puts the use case in scope), not a bad end, and the actor step
    is never reported as unrealized."""
    text = (ROOT / UC_FILE).read_text(encoding="utf-8")
    result = _parse(
        {UC_FILE: _with_actor_block(text, "Unlock", "Driver", "pressUnlock")},
        extra="package Probe {\n  #refine dependency from Functions::Security::securityFlow::checkCredential\n"
        "                       to UseCases::Managing::Unlock::pressUnlock;\n}\n",
    )
    real = derive_realization(result.elements)
    uc = "UseCases::Managing::Unlock"
    step = f"{uc}::pressUnlock"
    assert real.actor_steps[uc] == {step: f"{uc}::Driver"}
    assert step not in real.system_steps[uc]
    assert real.step_realizers[step] == ["Functions::Security::securityFlow::checkCredential"]
    assert real.in_scope == {uc}
    assert not [f for f in real.findings if f.code == "bad-realization-end"]
    assert not [f for f in real.findings if f.element_id in (step, "Probe::dep1")]


def test_stale_layout_keys_are_harmless(tmp_path: Path):
    """B11: a saved flow layout with a key for a step that no longer exists loads, gives no
    warning, and opening the project does not rewrite the layout file."""
    copy = tmp_path / "electric_car"
    shutil.copytree(ROOT, copy)
    layout = copy / "views" / "SecurityFlowView.json"
    data = json.loads(layout.read_text(encoding="utf-8"))
    data["nodes"]["Functions::Security::securityFlow::noSuchStep"] = {
        "x": 10.0, "y": 10.0, "width": 140.0, "height": 90.0,
    }
    layout.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    saved = layout.read_bytes()

    client = TestClient(create_app(workspace=tmp_path))
    opened = client.post(api_url("/session/open"), json={"folder": str(copy)})
    assert opened.status_code == 200, opened.text
    project = opened.json()["project"]
    assert all(not f.get("warnings") for f in project["files"])
    view = client.get(api_url(f"/projects/{project['id']}/views/Functions::SecurityFlowView")).json()
    assert view["diagramMode"] == "actionFlow"
    assert "modeError" not in view
    assert view["hasViewLayout"] is True
    assert "Functions::Security::securityFlow::noSuchStep" not in view["semantic"]
    assert layout.read_bytes() == saved


def _use_case_views(tmp_path: Path, text: str | None) -> dict:
    copy = tmp_path / "electric_car"
    shutil.copytree(ROOT, copy)
    if text is not None:
        (copy / UC_FILE).write_text(text, encoding="utf-8")
    client = TestClient(create_app(workspace=tmp_path))
    pid = client.post(api_url("/session/open"), json={"folder": str(copy)}).json()["project"]["id"]
    out = {}
    for view_id in ("UseCases::VehicleUseCaseView", "UseCases::UseCaseTraceabilityView"):
        body = client.get(api_url(f"/projects/{pid}/views/{view_id}")).json()
        viz = body["visualization"]
        out[view_id] = (set(body["semantic"]), set(viz["nodes"]), set(viz["edges"]))
    return out


def test_actor_blocks_do_not_change_the_use_case_views(tmp_path: Path):
    """B11: VehicleUseCaseView.json is not touched, so an actor block must add nothing to
    the use case diagrams (the perform is not drawn)."""
    text = (ROOT / UC_FILE).read_text(encoding="utf-8")
    before = _use_case_views(tmp_path / "a", None)
    after = _use_case_views(
        tmp_path / "b", _with_actor_block(text, "StartVehicle", "Driver", "pressStart")
    )
    assert after == before
