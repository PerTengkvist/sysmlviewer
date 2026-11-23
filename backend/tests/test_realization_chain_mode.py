"""AllocationView on a use case, a package of use cases or a function: realizationChain."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.models import ArtifactKind, SemanticElement
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


def test_allocation_view_unchanged_for_parts(tmp_path: Path):
    """A part with a logical/physical split and a behaviour of its own stays an allocation view."""
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "S"}).json()["id"]
    add_content_file(
        client,
        pid,
        tmp_path,
        "s.sysml",
        """package S {
  part def Vehicle {
    part logical { part ctrl; }
    part physical { part ecu; }
    allocate logical::ctrl to physical::ecu;
    action operate { action start; action stop; first start; then start; then stop; then done; }
  }
  view VA : AllocationView { expose Vehicle; }
}
""",
    )
    body = client.get(api_url(f"/projects/{pid}/views/S::VA")).json()
    assert body["diagramMode"] == "allocation"
    assert "chainEdges" not in body


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
    from domain.realization_labels import unambiguous_labels

    def el(i: str, kind: ArtifactKind, short: str | None = None) -> SemanticElement:
        return SemanticElement(id=i, kind=kind, name=i.split("::")[-1], short_id=short)

    sem = {
        "A::Brake": el("A::Brake", ArtifactKind.PART),
        "B::Brake": el("B::Brake", ArtifactKind.PART),
        "C::Park": el("C::Park", ArtifactKind.USE_CASE, "UC9"),
        "D::Park": el("D::Park", ArtifactKind.USE_CASE, "UC9"),
    }
    assert unambiguous_labels(sem, list(sem)) == {
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
    """Both ways: every refine edge is a link of the realization, and every link has its edge."""
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
    pid = client.get(api_url("/session")).json()["project"]["id"]
    realization = client.get(api_url(f"/projects/{pid}/realization")).json()
    explicit = {(l["sourceId"], l["targetId"]) for l in realization["links"]}
    for view_id, root_is_uc, root in (
        ("ChainViews::BrakeChain", True, "UseCases::Driving::Brake"),
        ("ChainViews::SecurityChain", False, "Functions::Security"),
    ):
        body = client.get(api_url(f"/projects/{pid}/views/{view_id}")).json()
        assert body["diagramMode"] == "realizationChain", body.get("modeError")
        refine = {(e["source"], e["target"]) for e in body["chainEdges"] if e["kind"] == "refine"}
        ucs = {i for i, r in body["chainRoles"].items() if r == "useCase"}
        # What the realization says about these use cases and nothing else.
        expected = set()
        for uc in ucs:
            info = realization["useCases"][uc]
            expected |= {(f, uc) for f in info["functions"]}
            expected |= {(n, uc) for n in info["nodes"] if not info["nodeFunctions"].get(n)}
        if not root_is_uc:
            expected = {(s, t) for s, t in expected if s == root or s.startswith(root + "::")}
        assert refine == expected, view_id
        # Every explicit #refine to one of the use cases is drawn: as a refine edge, or, for
        # a node the steps reach through its function, as that function's refine and owns.
        owns = {
            (e["source"], e["target"])
            for e in body["chainEdges"]
            if e["kind"] == "owns" and not e["projected"]
        }
        for s, t in explicit:
            if t not in ucs or s not in body["chainRoles"]:
                continue
            through = realization["useCases"][t]["nodeFunctions"].get(s, [])
            assert (s, t) in refine or any((f, s) in owns and (f, t) in refine for f in through), (s, t)
        # The car realizes its use cases step by step: an owns edge is a node reached
        # through its function.
        if any(uc in realization["inScope"] for uc in ucs):
            assert owns
        for f, n in owns:
            assert any(f in realization["useCases"][uc]["nodeFunctions"].get(n, []) for uc in ucs), (f, n)


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


def _modes(tmp_path: Path, model: str, views: str, names: list[str], extra: str = "") -> dict[str, dict]:
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "M"}).json()["id"]
    add_content_file(client, pid, tmp_path, "m.sysml", model)
    add_content_file(client, pid, tmp_path, "v.sysml", views)
    return {n: client.get(api_url(f"/projects/{pid}/views/V::{n}")).json() for n in names}


def test_package_that_allocates_stays_an_allocation_view(tmp_path: Path):
    """A package with a use case somewhere, but also allocations, is the old allocation view."""
    views = """package V {
  view WholePkg : AllocationView { expose RealizationProbe; }
  view UcOnly : AllocationView { expose RealizationProbe::UC; }
}"""
    out = _modes(tmp_path, PROBE, views, ["WholePkg", "UcOnly"])
    assert out["WholePkg"]["diagramMode"] == "allocation"
    assert out["UcOnly"]["diagramMode"] == "realizationChain"


def test_part_with_a_flow_but_no_realization_is_not_a_chain_root(tmp_path: Path):
    views = "package V { view F : AllocationView { expose RealizationProbe::F::Security; } }"
    no_links = PROBE.split("  #refine")[0] + "}\n"
    out = _modes(tmp_path, no_links, views, ["F"])
    assert out["F"]["diagramMode"] == "allocation"


MIXED_VIEWS = """package V {
  view UcThenPart : AllocationView { expose RealizationProbe::UC::Start; expose RealizationProbe::L; }
  view PartThenUc : AllocationView { expose RealizationProbe::L; expose RealizationProbe::UC::Start; }
  view UcAndFn : AllocationView { expose RealizationProbe::UC::Lock; expose RealizationProbe::F::Security; }
  view NoUc : AllocationView { expose RealizationProbe::UC; filter @SysML::PartUsage; }
  view Hidden : AllocationView { expose RealizationProbe::UC::Start; filter name.startsWith("S"); }
}"""


def test_mode_does_not_depend_on_the_order_of_exposes(tmp_path: Path):
    out = _modes(tmp_path, PROBE, MIXED_VIEWS, ["UcThenPart", "PartThenUc", "UcAndFn"])
    assert out["UcThenPart"]["diagramMode"] == out["PartThenUc"]["diagramMode"] == "allocation"
    assert out["UcAndFn"]["diagramMode"] == "realizationChain"


def test_filter_that_removes_every_use_case_gives_allocation(tmp_path: Path):
    out = _modes(tmp_path, PROBE, MIXED_VIEWS, ["NoUc"])
    assert out["NoUc"]["diagramMode"] == "allocation"


def test_chain_payload_only_names_what_the_view_shows(tmp_path: Path):
    out = _modes(tmp_path, PROBE, MIXED_VIEWS, ["Hidden"])["Hidden"]
    assert out["diagramMode"] == "realizationChain"
    shown = set(out["semantic"])
    assert SEC in shown and f"{SEC}::auth" not in shown
    assert set(out["chainRoles"]) <= shown
    assert all(e["source"] in shown and e["target"] in shown for e in out["chainEdges"])
    assert set(out["chainLabels"]) <= shown


ALLOC = """package Q {
  use case def U { action s; }
  part def F {
    part n1 { perform f.a; }
    part n2 { perform f.b; }
    action f { action a; action b; first start; then a; then b; then done; }
  }
  part logical { part lp; }
  allocate F::n1 to logical::lp;
  allocate F::n2 to logical::lp;
  #refine dependency from F::f::a to U::s;
  #refine dependency from F::n2 to U;
}"""


def test_allocate_edge_has_the_precision_of_its_node(tmp_path: Path):
    out = _modes(tmp_path, ALLOC, "package V { view C : AllocationView { expose Q::U; } }", ["C"])["C"]
    by = {(e["source"], e["target"], e["kind"]): e["precision"] for e in out["chainEdges"]}
    assert by[("Q::F::n1", "Q::logical::lp", "allocate")] == "step"
    assert by[("Q::F::n2", "Q::logical::lp", "allocate")] == "explicit"


FN_ALLOC = """package Fa {
  part def Vehicle {
    part logical { part ctrl { perform operate.start; } }
    part physical { part ecu; }
    allocate logical::ctrl to physical::ecu;
    action operate { action start; action stop; first start; then start; then stop; then done; }
  }
  use case def U { action go; }
  #refine dependency from Vehicle::operate::start to U::go;
}"""


def test_function_that_allocates_stays_an_allocation_view(tmp_path: Path):
    """A function that takes part in the realization but owns allocations is an allocation view."""
    out = _modes(
        tmp_path, FN_ALLOC, "package V { view VA : AllocationView { expose Fa::Vehicle; } }", ["VA"]
    )["VA"]
    assert out["diagramMode"] == "allocation"
    assert "chainEdges" not in out


def test_filter_that_does_not_match_the_use_case_root_gives_allocation(tmp_path: Path):
    """A filter cannot remove an expose root, but one that says 'no use cases' is read as such."""
    views = """package V {
  view Cut : AllocationView { expose RealizationProbe::UC::Start; filter @SysML::PartUsage; }
  view Kept : AllocationView { expose RealizationProbe::UC::Start; filter @SysML::UseCaseUsage or @SysML::PartUsage; }
  view FnCut : AllocationView { expose RealizationProbe::F::Security; filter @SysML::UseCaseUsage; }
}"""
    out = _modes(tmp_path, PROBE, views, ["Cut", "Kept", "FnCut"])
    assert out["Cut"]["diagramMode"] == "allocation"
    assert out["Kept"]["diagramMode"] == "realizationChain"
    assert out["FnCut"]["diagramMode"] == "allocation"


def test_the_realization_is_derived_once_per_chain_view(tmp_path: Path, monkeypatch):
    import application.project_service as service

    calls = []
    real = service.derive_realization
    monkeypatch.setattr(service, "derive_realization", lambda *a, **k: calls.append(1) or real(*a, **k))
    client, pid = _client(tmp_path)
    calls.clear()
    assert _view(client, pid, "StartChain")["diagramMode"] == "realizationChain"
    assert len(calls) == 1
