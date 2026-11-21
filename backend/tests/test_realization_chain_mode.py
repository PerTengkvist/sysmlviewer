"""AllocationView on a use case, a package of use cases or a function: realizationChain."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.diagram_mode import resolve_diagram_mode
from domain.models import ArtifactKind, SemanticElement, ViewDef
from helpers import add_content_file, api_url

PROBE = (Path(__file__).parent / "fixtures" / "realization_probe.sysml").read_text(
    encoding="utf-8"
)
VIEWS = """\
package ChainViews {
  view StartChain : AllocationView { expose RealizationProbe::UC::Start; }
  view UcChain : AllocationView { expose RealizationProbe::UC; }
  view SecurityChain : AllocationView { expose RealizationProbe::F::Security; }
  view LogicalAlloc : AllocationView { expose RealizationProbe::Car; }
  view PartsPkg : AllocationView { expose RealizationProbe::L; }
}
"""

P = "RealizationProbe"
START = f"{P}::UC::Start"
UNLOCK = f"{P}::UC::Unlock"
LOCK = f"{P}::UC::Lock"
DRIVE = f"{P}::UC::Drive"
SEC = f"{P}::F::Security"
AUTH, IMMO, LOCKS = f"{SEC}::auth", f"{SEC}::immo", f"{SEC}::locks"
VC, BC = f"{P}::L::vc", f"{P}::L::bc"


def _client(tmp_path: Path) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "C"}).json()["id"]
    add_content_file(client, pid, tmp_path, "probe.sysml", PROBE)
    add_content_file(client, pid, tmp_path, "views.sysml", VIEWS)
    return client, pid


def _view(client: TestClient, pid: str, name: str) -> dict:
    res = client.get(api_url(f"/projects/{pid}/views/ChainViews::{name}"))
    assert res.status_code == 200, res.text
    return res.json()


def _edges(payload: dict) -> set[tuple[str, str, str, str]]:
    return {(e["source"], e["target"], e["kind"], e["precision"]) for e in payload["chainEdges"]}


def test_allocation_view_unchanged_for_parts():
    part = SemanticElement(id="P::X", kind=ArtifactKind.PART, name="X")
    view = ViewDef(id="v", name="v", root_artifact_id="P::X", type_ref="AllocationView")
    assert resolve_diagram_mode(view, part) == "allocation"
    sem = {part.id: part}
    assert resolve_diagram_mode(view, part, sem) == "allocation"
    pkg = SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P")
    assert resolve_diagram_mode(view, pkg, {"P": pkg}) == "allocation"


def test_chain_mode_for_use_case_root(tmp_path: Path):
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "StartChain")
    assert payload["diagramMode"] == "realizationChain"
    assert payload.get("modeError") is None


def test_chain_mode_for_package_root(tmp_path: Path):
    client, pid = _client(tmp_path)
    assert _view(client, pid, "UcChain")["diagramMode"] == "realizationChain"


def test_chain_mode_for_function_root(tmp_path: Path):
    client, pid = _client(tmp_path)
    assert _view(client, pid, "SecurityChain")["diagramMode"] == "realizationChain"


def test_other_allocation_views_unchanged(tmp_path: Path):
    client, pid = _client(tmp_path)
    assert _view(client, pid, "LogicalAlloc")["diagramMode"] == "allocation"
    assert _view(client, pid, "PartsPkg")["diagramMode"] == "allocation"
    assert "chainEdges" not in _view(client, pid, "LogicalAlloc")


def test_chain_payload_for_use_case(tmp_path: Path):
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "StartChain")
    assert set(payload["semantic"]) == {START, SEC, AUTH, IMMO, VC}
    assert payload["chainRoles"] == {
        START: "useCase",
        SEC: "function",
        AUTH: "node",
        IMMO: "node",
        VC: "part",
    }
    assert _edges(payload) == {
        (SEC, START, "refine", "step"),
        (SEC, AUTH, "owns", "step"),
        (SEC, IMMO, "owns", "step"),
        (AUTH, VC, "allocate", "step"),
        (IMMO, VC, "allocate", "step"),
    }


def test_chain_payload_for_package_has_every_use_case(tmp_path: Path):
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "UcChain")
    roles = payload["chainRoles"]
    assert {i for i, r in roles.items() if r == "useCase"} == {START, UNLOCK, LOCK, DRIVE}
    edges = _edges(payload)
    assert (SEC, UNLOCK, "refine", "coarse") in edges
    assert (SEC, LOCK, "refine", "explicit") in edges
    assert (LOCKS, BC, "allocate", "coarse") in edges
    # Drive has what Start and Unlock have, through include.
    assert (SEC, DRIVE, "refine", "step") in edges
    drive = next(e for e in payload["chainEdges"] if e["target"] == DRIVE)
    assert drive["viaInclude"] is True
    start = next(e for e in payload["chainEdges"] if e["target"] == START)
    assert start["viaInclude"] is False
    # A function, node or part used by several use cases is one element, one edge.
    assert len(payload["chainEdges"]) == len({(e["source"], e["target"], e["kind"]) for e in payload["chainEdges"]})
    assert list(payload["semantic"]).count(SEC) == 1


def test_chain_payload_for_function_root(tmp_path: Path):
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "SecurityChain")
    roles = payload["chainRoles"]
    assert roles[SEC] == "function"
    assert {i for i, r in roles.items() if r == "useCase"} == {START, UNLOCK, LOCK, DRIVE}
    assert {i for i, r in roles.items() if r == "node"} == {AUTH, IMMO, LOCKS}
    assert {i for i, r in roles.items() if r == "part"} == {VC, BC}
    edges = _edges(payload)
    assert (SEC, LOCK, "refine", "explicit") in edges
    assert (AUTH, VC, "allocate", "step") in edges


def test_chain_labels_are_unambiguous(tmp_path: Path):
    client, pid = _client(tmp_path)
    labels = _view(client, pid, "UcChain")["chainLabels"]
    assert labels[START] == "UCA Start"
    assert labels[SEC] == "Security"
    # `auth` and `immo` are unique; nothing is qualified without a clash.
    assert labels[AUTH] == "auth"
    assert labels[VC] == "vc"


def test_chain_labels_qualify_clashes():
    from domain.realization_chain import chain_labels

    def el(i: str, kind: ArtifactKind, short: str | None = None) -> SemanticElement:
        return SemanticElement(id=i, kind=kind, name=i.split("::")[-1], short_id=short)

    sem = {
        "A::Brake": el("A::Brake", ArtifactKind.PART),
        "B::Brake": el("B::Brake", ArtifactKind.PART),
        "C::Park": el("C::Park", ArtifactKind.USE_CASE, "UC9"),
        "D::Park": el("D::Park", ArtifactKind.USE_CASE, "UC9"),
    }
    assert chain_labels(sem, list(sem)) == {
        "A::Brake": "A::Brake",
        "B::Brake": "B::Brake",
        "C::Park": "UC9 C::Park",
        "D::Park": "UC9 D::Park",
    }


def test_chain_nodes_carry_no_default_position(tmp_path: Path):
    client, pid = _client(tmp_path)
    nodes = _view(client, pid, "StartChain")["visualization"]["nodes"]
    assert nodes, "the elements still have visualization rows"
    assert all("x" not in n and "y" not in n for n in nodes.values())


NESTED = """\
package Outer {
  package Mid { package Inner { use case def Deep { action a; } } }
  view DeepChain : AllocationView { expose Outer; }
}
"""


def test_mode_and_content_do_not_depend_on_levels(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "N"}).json()["id"]
    add_content_file(client, pid, tmp_path, "nested.sysml", NESTED)
    seen = []
    for levels in (1, 2, 5):
        res = client.get(api_url(f"/projects/{pid}/views/Outer::DeepChain"), params={"levels": levels})
        body = res.json()
        seen.append((body["diagramMode"], sorted(body["chainRoles"])))
    assert seen[0] == seen[1] == seen[2] == ("realizationChain", ["Outer::Mid::Inner::Deep"])


def test_chain_edges_follow_the_explicit_links_of_electric_car(tmp_path: Path):
    import shutil

    src = Path(__file__).resolve().parents[2] / "examples" / "electric_car"
    ws = tmp_path / "ec"
    shutil.copytree(src, ws)
    (ws / "chain_views.sysml").write_text(
        "package ChainViews {\n"
        "  view BrakeChain : AllocationView { expose UseCases::Driving::Brake; }\n"
        "  view SecurityChain : AllocationView { expose Functions::Security; }\n}\n",
        encoding="utf-8",
    )
    client = TestClient(create_app(workspace=ws))
    project = client.get(api_url("/session")).json()["project"]
    from domain.realization import derive_realization

    for view_id, root in (("ChainViews::BrakeChain", "UseCases::Driving::Brake"),
                          ("ChainViews::SecurityChain", "Functions::Security")):
        body = client.get(api_url(f"/projects/{project['id']}/views/{view_id}")).json()
        assert body["diagramMode"] == "realizationChain", body.get("modeError")
        assert all(e["kind"] != "owns" for e in body["chainEdges"]), "no step links in electric car"
        refine_sources = {e["source"] for e in body["chainEdges"] if e["kind"] == "refine"}
        rel = {
            (r["sourceId"], r["targetId"])
            for r in client.get(api_url(f"/projects/{project['id']}/realization")).json()["links"]
        }
        for e in body["chainEdges"]:
            if e["kind"] == "refine" and not e["viaInclude"]:
                assert (e["source"], e["target"]) in rel
        assert refine_sources


PROJECTION = """\
package Pj {
  use case def <'U1'> Brake { action a; }
  use case def <'U2'> Park { action b; }
  part def Braking {
    part pump { perform flow.run; }
    part valve { perform flow.open; }
    action flow { action run; action open; first start; then run; then open; then done; }
  }
  part def Serving {
    part own { perform sflow.go; }
    part other { perform sflow.stop; }
    action sflow { action go; action stop; first start; then go; then stop; then done; }
  }
  part logical { part lp; part lq; }
  allocate Braking::pump to logical::lp;
  allocate Braking::valve to logical::lq;
  #refine dependency from Braking to Brake;
  #refine dependency from Serving to Park;
  #refine dependency from Serving::own to Park;
  view BrakeChain : AllocationView { expose Brake; }
  view BrakingChain : AllocationView { expose Braking; }
  view ParkChain : AllocationView { expose Park; }
}
"""


def _pj(tmp_path: Path, name: str) -> dict:
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "Pj"}).json()["id"]
    add_content_file(client, pid, tmp_path, "pj.sysml", PROJECTION)
    body = client.get(api_url(f"/projects/{pid}/views/Pj::{name}")).json()
    body["_realization"] = client.get(api_url(f"/projects/{pid}/realization")).json()
    return body


def test_function_stands_for_its_nodes_and_parts_as_projected_edges(tmp_path: Path):
    body = _pj(tmp_path, "BrakeChain")
    by_key = {(e["source"], e["target"], e["kind"]): e for e in body["chainEdges"]}
    assert by_key[("Pj::Braking", "Pj::Brake", "refine")]["projected"] is False
    for node, part in (("pump", "lp"), ("valve", "lq")):
        assert by_key[("Pj::Braking", f"Pj::Braking::{node}", "owns")]["projected"] is True
        assert by_key[(f"Pj::Braking::{node}", f"Pj::logical::{part}", "allocate")]["projected"] is True


def test_projection_is_off_when_a_node_serves_the_use_case(tmp_path: Path):
    body = _pj(tmp_path, "ParkChain")
    kinds = {(e["source"], e["kind"]) for e in body["chainEdges"]}
    assert ("Pj::Braking", "owns") not in kinds
    assert not any(e["projected"] for e in body["chainEdges"])
    assert "Pj::Serving::other" not in body["chainRoles"]


def test_chain_reaches_what_the_realization_says(tmp_path: Path):
    """Matrix, Details and the chain read the same fields: nodes and parts agree per use case."""
    for view, uc in (("BrakeChain", "Pj::Brake"), ("ParkChain", "Pj::Park")):
        (tmp_path / view).mkdir()
        body = _pj(tmp_path / view, view)
        info = body["_realization"]["useCases"][uc]
        edges = body["chainEdges"]
        fns = {e["source"] for e in edges if e["kind"] == "refine" and e["target"] == uc and body["chainRoles"][e["source"]] == "function"}
        nodes = {e["source"] for e in edges if e["kind"] == "refine" and e["target"] == uc and body["chainRoles"][e["source"]] == "node"}
        nodes |= {e["target"] for e in edges if e["kind"] == "owns" and e["source"] in fns}
        parts = {e["target"] for e in edges if e["kind"] == "allocate" and e["source"] in nodes}
        assert nodes == set(info["nodes"]) | set(info["functionNodes"]), view
        assert parts == set(info["parts"]) | set(info["functionParts"]), view


def test_function_root_keeps_only_its_own_projection(tmp_path: Path):
    body = _pj(tmp_path, "BrakingChain")
    assert {i for i, r in body["chainRoles"].items() if r == "node"} == {"Pj::Braking::pump", "Pj::Braking::valve"}
