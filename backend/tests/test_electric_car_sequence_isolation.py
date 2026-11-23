"""The electric car's migrated sequences leave failure impact and FMEA alone.

The committed reports under examples/electric_car/fmea/docs/ are guarded by
test_fmea_outputs.py::test_committed_reports_are_current; the impact graph,
the single points of failure and the FMEA tutorial output by their own tests.
These tests pin what the migration adds: 152 lifeline parts and 27 logical part
defs that must not become candidates, nodes or suggestions.
"""

from __future__ import annotations

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.scenarios import UnknownName, resolve_failure_target
from domain.fmea.load import _suggest
from domain.models import ArtifactKind, SemanticElement, SysmlFile
from domain.name_resolution import ImportSpec, NameResolver
from domain.occurrence import in_occurrence

ROOT = resolve_repo_root() / "examples" / "electric_car"


@pytest.fixture(scope="module")
def model():
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel)
        )
    result = SubsetSysmlParser().parse_project(files)
    resolver = NameResolver(result.elements, [ImportSpec.from_dict(i) for i in result.imports])
    return result.elements, resolver


def test_electric_car_sequence_parts_are_not_failure_candidates(model):
    elements, _ = model
    graph = build_impact_graph(elements)
    nodes = set(graph.inputs) | {e.source for edges in graph.inputs.values() for e in edges}
    parts = [
        e.id
        for e in elements.values()
        if e.kind == ArtifactKind.PART and in_occurrence(elements, e.id)
    ]
    assert len(parts) == 152
    assert not set(parts) & nodes


def test_logical_types_are_not_failure_candidates(model):
    elements, resolver = model
    with pytest.raises(UnknownName):
        resolve_failure_target("KeyFob", elements, resolver)
    assert (
        resolve_failure_target("keyFob", elements, resolver)
        == "LogicalArchitecture::Car::keyFob"
    )
    assert (
        resolve_failure_target("frictionBrakes", elements, resolver)
        == "LogicalArchitecture::Car::frictionBrakes"
    )


def _def(eid: str) -> SemanticElement:
    return SemanticElement(
        id=eid,
        name=eid.rsplit("::", 1)[-1],
        kind=ArtifactKind.PART,
        is_definition=True,
        parent_id=eid.rsplit("::", 1)[0],
    )


def test_suggestions_look_in_the_named_package_first():
    defs = [_def("Physical::BatteryCellModule"), _def("Logical::Types::Battery")]
    assert _suggest("Physical::BatteryModule", defs) == ("Physical::BatteryCellModule",)


def test_suggestions_fall_back_to_every_package():
    defs = [_def("Physical::Engine"), _def("Logical::Types::Battery")]
    assert _suggest("Physical::BatteryModule", defs) == ("Logical::Types::Battery",)
    assert _suggest("BatteryModule", defs) == ("Logical::Types::Battery",)


def test_suggestions_put_an_exact_name_in_another_package_first():
    defs = [
        _def("Physical::BatteryModule"),
        _def("Logical::Types::Battery"),
        _def("Logical::BatteryMod"),
    ]
    got = _suggest("Logical::BatteryModule", defs)
    assert got[0] == "Physical::BatteryModule"
    assert "Logical::BatteryMod" in got
    assert len(got) == len(set(got))


def test_sequence_refines_do_not_reach_failure(model):
    """Plan 2, B10: a sequence refines its use case, but an occurrence is no function, so the
    impact graph (nodes and inputs, in order) is the same without those refines."""
    import re

    elements, _ = model
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        if rel == "dynamics/sequences.sysml":
            stripped = re.sub(r"  #refine dependency from \w+Sequence to UseCases::[\w:]+;\n", "", text)
            assert stripped.count("\n") == text.count("\n") - 23
            text = stripped
        files.append(SysmlFile(id=rel, name=path.name, content=text, path=rel))
    without = SubsetSysmlParser().parse_project(files).elements
    a, b = build_impact_graph(elements), build_impact_graph(without)
    assert a.nodes == b.nodes
    assert [(k, list(v)) for k, v in a.inputs.items()] == [(k, list(v)) for k, v in b.inputs.items()]
