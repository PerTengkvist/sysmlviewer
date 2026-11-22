"""GridView picks its mode from what it exposes (decision B5): use cases and no
requirements give the realization matrix, anything else the requirements table."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.diagram_mode import resolve_diagram_mode
from domain.models import ArtifactKind, SemanticElement, ViewDef
from helpers import add_content_file, api_url, resolve_example_path

PROBE = (Path(__file__).parent / "fixtures" / "realization_probe.sysml").read_text(
    encoding="utf-8"
)
REPO = Path(__file__).resolve().parents[2]
P = "RealizationProbe"
START = f"{P}::UC::Start"
UNLOCK = f"{P}::UC::Unlock"
LOCK = f"{P}::UC::Lock"
DRIVE = f"{P}::UC::Drive"
SEC = f"{P}::F::Security"

MATRIX_VIEWS = """
package Views {
  view Matrix : GridView { expose RealizationProbe::UC; }
  view Mixed : GridView {
    expose RealizationProbe::UC;
    expose RealizationProbe::R;
  }
  view OnlyStart : GridView { expose RealizationProbe::UC::Start; }
}
"""
# Allocation between two plain parts: neither is a function node.
OTHER = "package Other { part logical; part physical; allocate Other::logical to Other::physical; }"
REQ = "package R { requirement def Safe { doc /* safe */ } }"


def _project(tmp_path: Path, content: str = PROBE + "\n" + REQ + OTHER + MATRIX_VIEWS):
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "T"}).json()["id"]
    add_content_file(client, pid, tmp_path, "probe.sysml", content)
    return client, pid


def _view(client: TestClient, pid: str, view_id: str) -> dict:
    res = client.get(api_url(f"/projects/{pid}/views/{view_id}"))
    assert res.status_code == 200, res.text
    return res.json()


def test_resolve_gridview_exposed_kinds():
    root = SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P")
    view = ViewDef(id="v", name="v", root_artifact_id="P", type_ref="GridView")
    uc, req = ArtifactKind.USE_CASE, ArtifactKind.REQUIREMENT
    assert resolve_diagram_mode(view, root) == "requirementTable"
    assert resolve_diagram_mode(view, root, {ArtifactKind.PACKAGE}) == "requirementTable"
    assert resolve_diagram_mode(view, root, {uc}) == "realizationMatrix"
    assert resolve_diagram_mode(view, root, {uc, ArtifactKind.PACKAGE}) == "realizationMatrix"
    assert resolve_diagram_mode(view, root, {uc, req}) == "requirementTable"
    other = ViewDef(id="v", name="v", root_artifact_id="P", type_ref="UseCaseView")
    assert resolve_diagram_mode(other, root, {uc}) == "useCase"


@pytest.mark.parametrize(
    ("example", "view_id"),
    [("diagrams", "RequirementsExample::RequirementsTableView"),
     ("electric_car", "Requirements::RequirementsTableView")],
)
def test_gridview_on_requirements_unchanged(tmp_path: Path, example: str, view_id: str):
    copy = tmp_path / example
    shutil.copytree(REPO / "examples" / example, copy)
    client = TestClient(create_app(workspace=tmp_path))
    pid = client.post(api_url("/session/open"), json={"folder": str(copy)}).json()["project"]["id"]
    view = _view(client, pid, view_id)
    assert view["diagramMode"] == "requirementTable"
    assert "realization" not in view
    assert "matrixColumns" not in view


def test_gridview_on_use_cases_is_matrix(tmp_path: Path):
    client, pid = _project(tmp_path)
    view = _view(client, pid, "Views::Matrix")
    assert view["diagramMode"] == "realizationMatrix"
    assert "modeError" not in view


def test_gridview_mixed_prefers_requirement_table(tmp_path: Path):
    client, pid = _project(tmp_path)
    view = _view(client, pid, "Views::Mixed")
    assert view["diagramMode"] == "requirementTable"


def test_matrix_payload(tmp_path: Path):
    client, pid = _project(tmp_path)
    view = _view(client, pid, "Views::Matrix")
    full = client.get(api_url(f"/projects/{pid}/realization")).json()
    real = view["realization"]
    assert set(real) == set(full)
    # Every use case is exposed here: the payload equals the project's.
    rows = {START, UNLOCK, LOCK, DRIVE}
    assert {k: v for k, v in real.items() if k != "findings"} == {
        k: v for k, v in full.items() if k != "findings"
    }
    assert real["findings"] == [
        f for f in full["findings"]
        if f["elementId"] in rows or f["elementId"].rsplit("::", 1)[0] in rows
    ]

    cols = view["matrixColumns"]
    nodes = {n["id"]: n for n in cols["nodes"]}
    assert list(nodes) == [f"{SEC}::auth", f"{SEC}::immo", f"{SEC}::locks"]
    assert nodes[f"{SEC}::auth"] == {"id": f"{SEC}::auth", "functionId": SEC}
    # Who performs a realizing step, and the parts of a node, come from the realization.
    assert real["realizerNodes"][f"{SEC}::startFlow::checkKeyInCabin"] == [f"{SEC}::auth"]
    assert real["nodeParts"][f"{SEC}::locks"] == [f"{P}::L::bc"]
    assert "performers" not in view

    semantic = view["semantic"]
    for needed in (
        START, f"{START}::checkKey", f"{START}::askForBrake", DRIVE, LOCK,
        SEC, f"{SEC}::auth", f"{P}::L::vc", f"{P}::L::bc",
    ):
        assert needed in semantic, needed
    for link in real["links"]:
        assert link["refineId"] in semantic


def test_matrix_payload_is_filtered_to_exposed_use_cases(tmp_path: Path):
    client, pid = _project(tmp_path)
    view = _view(client, pid, "Views::OnlyStart")
    assert view["diagramMode"] == "realizationMatrix"
    real = view["realization"]
    assert set(real["useCases"]) == {START}
    assert set(real["systemSteps"]) == {START}
    assert set(real["inScope"]) == {START}
    assert {link["targetId"].rsplit("::", 1)[0] for link in real["links"]} == {START}
    assert set(real["coarseRealizers"]) == set()
    assert {f["elementId"] for f in real["findings"]} == {f"{START}::askForBrake"}
    assert LOCK not in view["semantic"]
    # Columns cover the whole model, so gaps show.
    assert len(view["matrixColumns"]["nodes"]) == 3


def test_matrix_view_saves_no_geometry(tmp_path: Path):
    client, pid = _project(tmp_path)
    snapshot = {
        "structureNotation": "sysmlv2",
        "parts": {START: {"x": 5, "y": 6, "width": 100, "height": 50}},
        "ports": {},
        "edges": {},
    }
    res = client.post(api_url(f"/projects/{pid}/views/Views::Matrix/save-snapshot"), json=snapshot)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "skipped"
    for file in tmp_path.rglob("views/Matrix.json"):
        assert not json.loads(file.read_text(encoding="utf-8")).get("nodes"), file


NESTED = """
package Deep {
  package A { package B { use case def <'UCX'> Deepest { action s; } } }
  use case def Top;
}
package Both {
  requirement def Safe { doc /* safe */ }
  use case def Drive;
}
package Views2 {
  view Nested : GridView { expose Deep; }
  view OnlyUseCases : GridView {
    expose Both;
    filter @SysML::UseCaseUsage;
  }
  view Unfiltered : GridView { expose Both; }
}
"""


def _nested(tmp_path: Path):
    return _project(tmp_path, NESTED)


@pytest.mark.parametrize("levels", [1, 2, 3, 6])
def test_mode_and_rows_do_not_depend_on_the_diagram_levels(tmp_path: Path, levels: int):
    client, pid = _nested(tmp_path)
    res = client.get(api_url(f"/projects/{pid}/views/Views2::Nested"), params={"levels": levels})
    view = res.json()
    assert view["diagramMode"] == "realizationMatrix"
    ucs = {k for k, e in view["semantic"].items() if e["kind"] == "useCase"}
    assert ucs == {"Deep::A::B::Deepest", "Deep::Top"}


def test_the_filter_decides_the_mode_on_the_rows_it_keeps(tmp_path: Path):
    client, pid = _nested(tmp_path)
    assert _view(client, pid, "Views2::Unfiltered")["diagramMode"] == "requirementTable"
    view = _view(client, pid, "Views2::OnlyUseCases")
    assert view["diagramMode"] == "realizationMatrix"
    assert {k for k, e in view["semantic"].items() if e["kind"] == "useCase"} == {"Both::Drive"}


def test_electric_car_use_cases_grid_is_a_matrix_at_default_levels(tmp_path: Path):
    copy = tmp_path / "electric_car"
    shutil.copytree(REPO / "examples" / "electric_car", copy)
    uc = copy / "use_cases" / "use_cases.sysml"
    text = uc.read_text(encoding="utf-8")
    cut = text.rstrip().rfind("}")
    uc.write_text(text[:cut] + "  view UCGrid : GridView { expose UseCases; }\n" + text[cut:], encoding="utf-8")
    client = TestClient(create_app(workspace=tmp_path))
    pid = client.post(api_url("/session/open"), json={"folder": str(copy)}).json()["project"]["id"]
    view = _view(client, pid, "UseCases::UCGrid")
    assert view["diagramMode"] == "realizationMatrix"
    assert sum(1 for e in view["semantic"].values() if e["kind"] == "useCase") == 21


def test_use_cases_nested_in_a_use_case_are_no_rows(tmp_path: Path):
    src = """
package N {
  use case def Outer { use case inner; action s; }
  view V : GridView { expose N; }
}
"""
    client, pid = _project(tmp_path, src)
    view = _view(client, pid, "N::V")
    assert view["diagramMode"] == "realizationMatrix"
    ucs = {k for k, e in view["semantic"].items() if e["kind"] == "useCase"}
    assert ucs == {"N::Outer"}, ucs


def test_findings_on_the_functions_nodes_and_links_of_the_rows_are_kept(tmp_path: Path):
    extra = """
package Extra {
  part def Other {
    part o { perform f.x; }
    action f { action x; first start; then x; then done; }
  }
  #refine dependency from Other to RealizationProbe::UC::Start;
  #refine dependency from RealizationProbe::UC::Start::checkKey to R::Safe;
  #refine dependency from Other to RealizationProbe::UC::Lock;
}
"""
    client, pid = _project(tmp_path, PROBE + "\n" + REQ + extra + MATRIX_VIEWS)
    view = _view(client, pid, "Views::OnlyStart")
    found = {(f["code"], f["elementId"].rsplit("::", 1)[-1]) for f in view["realization"]["findings"]}
    assert ("refine-without-step", "Other") in found
    assert ("unrealized-system-step", "askForBrake") in found
    assert any(code == "bad-realization-end" for code, _ in found)
    # Lock is not exposed: nothing about it.
    assert all("Lock" not in f["message"] for f in view["realization"]["findings"])


def test_a_finding_of_another_use_case_is_not_listed(tmp_path: Path):
    extra = """
package G { part def Gf { part g1 { perform gflow.a; } action gflow { action a; action b; } } }
#refine dependency from F::Security::unlockFlow::release to UC::Unlock::unlockDoors;
#refine dependency from G::Gf to UC::Start;
#refine dependency from G::Gf to UC::Unlock;
"""
    text = PROBE.rstrip().removesuffix("}") + extra + "}\n" + MATRIX_VIEWS
    client, pid = _project(tmp_path, text)
    only = _view(client, pid, "Views::OnlyStart")["realization"]["findings"]
    gf = [f for f in only if f["code"] == "refine-without-step"]
    assert [f["useCaseId"] for f in gf] == [START]
    assert all(UNLOCK not in f["message"] for f in only)
    allv = _view(client, pid, "Views::Matrix")["realization"]["findings"]
    assert sorted(f["useCaseId"] for f in allv if f["code"] == "refine-without-step") == sorted(
        [START, UNLOCK]
    )
