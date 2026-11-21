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
