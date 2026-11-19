"""Impact graph of the electric car example."""

from __future__ import annotations

from collections import Counter

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.model import Edge, Gate, GateKind, Layer
from domain.models import SysmlFile

ROOT = resolve_repo_root() / "examples" / "electric_car"
PA = "PhysicalArchitecture::VehiclePhysical"
LA = "LogicalArchitecture::Car"


@pytest.fixture(scope="module")
def graph():
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel)
        )
    return build_impact_graph(SubsetSysmlParser().parse_project(files).elements)


def test_engine_implementers_in_model_order(graph):
    inputs = graph.inputs[f"{LA}::engine"]
    assert [e.source for e in inputs] == [
        f"{PA}::engineEcu",
        f"{PA}::engineEcu::engineControlSw",
        f"{PA}::electricMotor",
    ]
    assert {e.label for e in inputs} == {"implements"}


def test_speed_control_inputs(graph):
    inputs = graph.inputs["Functions::SpeedControl"]
    nodes = [e.source for e in inputs if e.label == "node"]
    assert sorted(nodes) == sorted(
        f"Functions::SpeedControl::{n}"
        for n in ("torqueArbitration", "regenBlending", "tractionDrive", "frictionBraking")
    )
    assert Edge("Functions::Security", "#Authorize") in inputs
    assert Edge("Functions::Charging", "#Energy") in inputs
    assert len(inputs) == 6


def test_layer_counts(graph):
    counts = Counter(n.layer for n in graph.nodes.values())
    assert counts[Layer.FUNCTION] == 8
    assert counts[Layer.FUNCTION_NODE] == 24
    assert counts[Layer.PHYSICAL] == 39
    assert counts[Layer.USE_CASE] == 21
    assert counts[Layer.LOGICAL] >= 28
    assert graph.nodes[LA].layer == Layer.LOGICAL


def test_example_gates(graph):
    assert graph.nodes[f"{PA}::batteryPack::modules"].gate == Gate(
        GateKind.POOL, 8, 45.0, (7.5,) * 8
    )
    assert graph.nodes[f"{PA}::brakeCircuits"].gate == Gate(GateKind.KOFN, 2, 1.0, (1.0, 1.0))


def test_no_extract_warnings(graph):
    assert graph.warnings == []
