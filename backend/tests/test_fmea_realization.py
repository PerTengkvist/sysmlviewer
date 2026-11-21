"""FMEA reads the impact graph, so step-level realization gives the same rows."""

from __future__ import annotations

import pytest

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.fmea.analyze import analyze
from domain.fmea.load import FmeaSources, load_fmea
from domain.models import SysmlFile
from domain.name_resolution import ImportSpec, NameResolver
from test_failure_realization import EXPLICIT, STEP

SEVERITY = {
    "requirement_groups": {"Safety": 10},
    "status_factor": {"LOST": 1.0, "DEGRADED": 0.6},
    "mission_time_h": 10000,
}


def mode(mode_id: str) -> dict:
    return {
        "id": mode_id, "local_effect": {"kind": "loss"}, "mode_ratio": 1.0,
        "effect_probability": 1.0, "occurrence": 3, "detection": {"score": 3},
    }


INSTANCES = [
    {"part": "Eq::Phys::ecu1", "rate_fit": 100, "failure_modes": [mode("dead1")]},
    {"part": "Eq::Phys::ecu2", "rate_fit": 100, "failure_modes": [mode("dead2")]},
]


def rows(text: str, kind: str):
    result = SubsetSysmlParser().parse_project(
        [SysmlFile("m.sysml", "m.sysml", text, path="m.sysml")]
    )
    assert result.warnings == []
    resolver = NameResolver(result.elements, [ImportSpec.from_dict(i) for i in result.imports])
    fmea = load_fmea(
        FmeaSources({"severity.yaml": SEVERITY, "instances.yaml": INSTANCES}, {}),
        result.elements,
        resolver,
    )
    graph = build_impact_graph(result.elements)
    return analyze(fmea, result.elements, graph, kind).rows


@pytest.mark.parametrize("kind", ["fmea", "fmeca"])
def test_fmea_end_effects_equal_for_equivalent_models(kind):
    a, b = rows(EXPLICIT, kind), rows(STEP, kind)
    assert len(a) == len(b) == 2
    for ra, rb in zip(a, b):
        assert ra.lost_functions == rb.lost_functions
        assert ra.next_higher == rb.next_higher
        assert ra.end_effect == rb.end_effect
    assert any(e.id == "Eq::UC::Start" for r in b for e in r.end_effect)
