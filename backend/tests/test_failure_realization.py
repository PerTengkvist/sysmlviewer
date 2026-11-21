"""The impact graph reads the realization derived from step-level `#refine` links."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.dependency_tree import build_dependency_tree
from domain.failure.extract import build_impact_graph
from domain.failure.model import Edge
from domain.models import SysmlFile

REPO = resolve_repo_root()
FIXTURES = Path(__file__).parent / "fixtures"
EXPLICIT = (FIXTURES / "realization_equivalence_explicit.sysml").read_text(encoding="utf-8")
STEP = (FIXTURES / "realization_equivalence_step.sysml").read_text(encoding="utf-8")
START, MOVE = "Eq::UC::Start", "Eq::UC::Move"
SEC, DRIVE = "Eq::F::Security", "Eq::F::Drive"


def graph(text: str):
    r = SubsetSysmlParser().parse_project(
        [SysmlFile(id="f.sysml", name="f.sysml", content=text, path="f.sysml")]
    )
    assert r.warnings == []
    return build_impact_graph(r.elements)


def edge_sets(g):
    return {k: set(v) for k, v in g.inputs.items()}


def with_links(text: str, links: str) -> str:
    return text.rstrip().removesuffix("}") + links + "}\n"


def test_step_links_create_use_case_edges():
    g = graph(STEP)
    assert set(g.inputs[START]) == {
        Edge(f"{SEC}::auth", "refine"), Edge(f"{SEC}::immo", "refine"), Edge(SEC, "refine"),
    }
    assert set(g.inputs[MOVE]) == {Edge(f"{DRIVE}::motor", "refine"), Edge(DRIVE, "refine")}


def test_equivalent_models_same_graph():
    a, b = graph(EXPLICIT), graph(STEP)
    assert a.nodes == b.nodes
    assert edge_sets(a) == edge_sets(b)
    assert a.parent == b.parent


def test_explicit_and_step_are_merged_without_duplicates():
    both = graph(with_links(EXPLICIT, "  #refine dependency from F::Security::startFlow::checkKeyInCabin to UC::Start::check;\n"))
    assert edge_sets(both) == edge_sets(graph(EXPLICIT))
    assert len(both.inputs[START]) == 3


def test_coarse_link_gives_edges():
    base = EXPLICIT.replace("  #refine dependency from F::Drive::motor to UC::Move;\n", "").replace(
        "  #refine dependency from F::Drive to UC::Move;\n", ""
    )
    coarse = graph(with_links(base, "  #refine dependency from F::Drive::driveFlow to UC::Move;\n"))
    assert set(coarse.inputs[MOVE]) == {Edge(f"{DRIVE}::motor", "refine"), Edge(DRIVE, "refine")}
    assert edge_sets(coarse) == edge_sets(graph(EXPLICIT))


def test_included_use_case_edges_are_not_duplicated_onto_the_including_one():
    g = graph(STEP)
    assert g.inputs["Eq::UC::Park"] == [Edge(START, "include")]


# -- reports ---------------------------------------------------------------


@pytest.fixture(scope="module")
def cli():
    spec = importlib.util.spec_from_file_location("failure_impact", REPO / "scripts" / "failure_impact.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _norm(value):
    if isinstance(value, dict):
        return {k: _norm(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return sorted((_norm(v) for v in value), key=lambda v: json.dumps(v, sort_keys=True))
    return value


def _report(cli, capsys, tmp_path, name, text, *argv):
    folder = tmp_path / name
    folder.mkdir()
    (folder / "m.sysml").write_text(text, encoding="utf-8")
    assert cli.main([str(folder), *argv]) == 0
    return capsys.readouterr().out


@pytest.mark.parametrize(
    "argv",
    [
        ("--spof",),
        ("--spof", "--format", "json"),
        ("--fail", "ecu1:loss"),
        ("--fail", "ecu2:loss", "--format", "json"),
    ],
)
def test_equivalent_models_same_reports(cli, capsys, tmp_path, argv):
    a = _report(cli, capsys, tmp_path, "a", EXPLICIT, *argv)
    b = _report(cli, capsys, tmp_path, "b", STEP, *argv)
    if "json" in argv:
        assert _norm(json.loads(a)) == _norm(json.loads(b))
    else:
        assert sorted(a.splitlines()) == sorted(b.splitlines())


def test_electric_car_graph_and_trees_unchanged_by_the_derivation(monkeypatch):
    """The committed car has no step links: with the derivation switched off, graph (inputs
    in order) and every dependency tree are the same."""
    import domain.dependency_tree as tree_module
    import domain.failure.extract as extract_module
    from domain.realization import Realization

    car = REPO / "examples" / "electric_car"
    files = [
        SysmlFile(id=p.relative_to(car).as_posix(), name=p.name, content=p.read_text(encoding="utf-8"),
                  path=p.relative_to(car).as_posix())
        for p in sorted(car.rglob("*.sysml"))
    ]
    elements = SubsetSysmlParser().parse_project(files).elements

    def snapshot():
        g = build_impact_graph(elements)
        trees = {eid: build_dependency_tree(elements, eid) for eid in elements}
        return (g.nodes, [(k, list(v)) for k, v in g.inputs.items()], g.parent, g.warnings), trees

    with_derivation = snapshot()
    monkeypatch.setattr(extract_module, "derive_realization", lambda *a, **k: Realization())
    monkeypatch.setattr(tree_module, "derive_realization", lambda *a, **k: Realization())
    assert snapshot() == with_derivation
