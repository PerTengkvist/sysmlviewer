"""Text, markdown and JSON reports."""

from __future__ import annotations

import json
import re

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.model import Failure, FailureKind
from domain.failure.propagate import evaluate
from domain.failure.report import (
    spof_to_json_list,
    spof_to_markdown,
    spof_to_text,
    to_json_dict,
    to_markdown,
    to_text,
)
from domain.failure.scenarios import spof
from domain.models import SysmlFile

ROOT = resolve_repo_root() / "examples" / "electric_car"
PA = "PhysicalArchitecture::VehiclePhysical"


@pytest.fixture(scope="module")
def graph():
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel)
        )
    return build_impact_graph(SubsetSysmlParser().parse_project(files).elements)


def _run(graph, *failures):
    return failures, evaluate(graph, failures)


def _text(graph, *failures):
    fs, impacts = _run(graph, *failures)
    return to_text(graph, fs, impacts).splitlines()


MOTOR = Failure(f"{PA}::electricMotor", FailureKind.LOSS)
MODULES_1 = Failure(f"{PA}::batteryPack::modules", FailureKind.LOSS, None, 1)
CIRCUIT_1 = Failure(f"{PA}::brakeCircuits", FailureKind.LOSS, None, 1)
INFOTAINMENT = Failure(f"{PA}::infotainmentEcu", FailureKind.LOSS)

LOST_USE_CASES = [
    "Accelerate", "Brake", "ChangeGear", "CleanWindshield", "Drive", "EmergencyStop",
    "ToggleHeadlights", "TurnLeft", "TurnRight",
]
LOST_REQUIREMENTS = [
    "Acceleration", "BrakingDistance", "DirectionalControl", "ForwardVisibility",
    "NightVisibility", "PropulsionModes", "Range", "TopSpeed",
]


def test_text_failure_header(graph):
    lines = _text(graph, MOTOR)
    assert re.match(rf"^FAILURE\s+{PA}::electricMotor\s+loss$", lines[0])


def test_text_chain_line(graph):
    lines = _text(graph, MOTOR)
    assert any(
        re.match(r"^LOST\s+SpeedControl\s+← tractionDrive «allocate» engine «implements» electricMotor$", l)
        for l in lines
    ), lines


def test_text_chain_stops_at_listed_function(graph):
    lines = _text(graph, MOTOR)
    assert any(re.match(r"^LOST\s+Maneuvrability\s+← #Stability SpeedControl$", l) for l in lines)


def test_text_pool_line(graph):
    lines = _text(graph, MODULES_1)
    pattern = (
        r"^DEGRADED\s+Charging\s+87\.5 %\s+← chargeSession «allocate» battery «implements» "
        r"batteryPack\.modules pool 7/8 \(52\.5 of 60, required 45\)$"
    )
    assert any(re.match(pattern, l) for l in lines), lines


def test_text_summary(graph):
    lines = _text(graph, MOTOR)
    assert f"USE CASES lost: {', '.join(LOST_USE_CASES)}" in lines
    assert f"REQUIREMENTS at risk: {', '.join(LOST_REQUIREMENTS)}" in lines
    flags = _text(graph, CIRCUIT_1)
    assert (
        "FLAGS     redundancy exhausted: VehiclePhysical::brakeCircuits (1 of 2, required 1)"
        in flags
    )


def test_text_common_cause(graph):
    lines = _text(graph, INFOTAINMENT)
    assert lines[0].endswith("[common cause: climateSystem, entertainmentSystem]")


def test_markdown_tables(graph):
    fs, impacts = _run(graph, MOTOR)
    md = to_markdown(graph, fs, impacts)
    for heading in ("## Failures", "## Functions", "## Use cases", "## Requirements"):
        assert heading in md
    functions = md.split("## Functions")[1].split("## ")[0].strip().splitlines()
    assert functions[0] == "| Status | Function | Capability | Cause |"
    assert len(functions) == 2 + 4


def test_json_dict_contract(graph):
    fs, impacts = _run(graph, MOTOR)
    data = to_json_dict(graph, fs, impacts)
    assert set(data) == {"failures", "nodes", "functions", "useCases", "requirements", "warnings"}
    node = data["nodes"]["Functions::SpeedControl"]
    assert node["status"] == "LOST"
    assert node["capability"] == 0.0
    assert node["limitedBy"] == {"id": "Functions::SpeedControl::tractionDrive", "label": "node"}
    assert node["layer"] == "function"
    assert node["chain"][-1] == f"{PA}::electricMotor"
    assert data["failures"][0]["partId"] == f"{PA}::electricMotor"
    assert data["failures"][0]["kind"] == "loss"
    assert data["functions"] == sorted(data["functions"])
    assert len(data["functions"]) == 4
    assert len(data["useCases"]) == 9
    assert len(data["requirements"]) == 8
    json.dumps(data)


def test_json_lists_are_sorted_lost_before_degraded(graph):
    fs, impacts = _run(graph, Failure(f"{PA}::driveEcu", FailureKind.DEGRADED, 0.5))
    data = to_json_dict(graph, fs, impacts)
    assert data["functions"] == sorted(data["functions"])
    fs, impacts = _run(graph, Failure(f"{PA}::batteryPack", FailureKind.LOSS))
    data = to_json_dict(graph, fs, impacts)
    assert all(impacts[f].status.value == "LOST" for f in data["functions"][:1])


def test_spof_markdown(graph):
    rows = spof(graph)
    md = spof_to_markdown(graph, rows).strip().splitlines()
    assert md[0] == "| Part | Lost functions | Degraded functions | Requirements at risk | Flags |"
    body = md[2:]
    assert len(body) == 39
    with_lost = [r for r in body if r.split("|")[2].strip()]
    assert len(with_lost) == 23
    assert all(r.split("|")[2].strip() for r in body[:23])


def test_spof_text_and_json(graph):
    rows = spof(graph)
    text = spof_to_text(graph, rows)
    assert "Lost functions" in text.splitlines()[0]
    assert len(text.strip().splitlines()) == 1 + 39
    data = spof_to_json_list(graph, rows)
    assert len(data) == 39
    assert {"partId", "lostFunctions", "degradedFunctions", "requirementsAtRisk", "flags"} <= set(data[0])
    json.dumps(data)


def test_json_failure_flags_include_gate_flags(graph):
    fs, impacts = _run(graph, CIRCUIT_1)
    data = to_json_dict(graph, fs, impacts)
    assert data["failures"][0]["flags"] == ["redundancy_exhausted"]
    fs, impacts = _run(graph, INFOTAINMENT)
    assert to_json_dict(graph, fs, impacts)["failures"][0]["flags"] == ["common_cause"]


def test_json_warns_about_a_part_that_implements_nothing(graph):
    bolt = Failure("Spare::Kit::looseBolt", FailureKind.LOSS)
    fs, impacts = _run(graph, bolt)
    assert to_json_dict(graph, fs, impacts)["warnings"] == [
        "Spare::Kit::looseBolt implements nothing; it has no effect"
    ]
