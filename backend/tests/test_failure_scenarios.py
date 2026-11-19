"""Failure targets by name and the single-point-of-failure table."""

from __future__ import annotations

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.model import Layer
from domain.failure.scenarios import (
    AmbiguousName,
    UnknownName,
    resolve_failure_target,
    spof,
)
from domain.models import SysmlFile
from domain.name_resolution import ImportSpec, NameResolver

ROOT = resolve_repo_root() / "examples" / "electric_car"
PA = "PhysicalArchitecture::VehiclePhysical"
SPARE = "package Spare { part def Kit { part electricMotor; } }"


def _load(extra: str | None = None):
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel)
        )
    if extra:
        files.append(SysmlFile(id="spare.sysml", name="spare.sysml", content=extra, path="spare.sysml"))
    result = SubsetSysmlParser().parse_project(files)
    resolver = NameResolver(result.elements, [ImportSpec.from_dict(i) for i in result.imports])
    return result.elements, resolver


@pytest.fixture(scope="module")
def model():
    return _load()


def _resolve(model, ref):
    elements, resolver = model
    return resolve_failure_target(ref, elements, resolver)


def test_simple_name(model):
    assert _resolve(model, "electricMotor") == f"{PA}::electricMotor"


def test_partial_qualified(model):
    assert _resolve(model, "VehiclePhysical::electricMotor") == f"{PA}::electricMotor"


def test_fully_qualified_via_name_resolver(model):
    assert _resolve(model, f"{PA}::batteryPack.modules") == f"{PA}::batteryPack::modules"


def test_dotted_suffix(model):
    expected = f"{PA}::batteryPack::modules"
    assert _resolve(model, "batteryPack.modules") == expected
    assert _resolve(model, "batteryPack::modules") == expected


def test_logical_part_name(model):
    assert _resolve(model, "frictionBrakes") == "LogicalArchitecture::Car::frictionBrakes"


def test_ambiguous_name():
    model = _load(SPARE)
    with pytest.raises(AmbiguousName) as exc:
        _resolve(model, "electricMotor")
    assert exc.value.candidates == [f"{PA}::electricMotor", "Spare::Kit::electricMotor"]
    assert _resolve(model, "VehiclePhysical::electricMotor") == f"{PA}::electricMotor"


def test_unknown_name_with_suggestion(model):
    with pytest.raises(UnknownName) as exc:
        _resolve(model, "electricMotr")
    assert "electricMotor" in exc.value.suggestions
    with pytest.raises(UnknownName) as exc:
        _resolve(model, "nothingLikeIt")
    assert exc.value.suggestions == []


def test_definitions_and_subjects_are_not_candidates(model):
    with pytest.raises(UnknownName):
        _resolve(model, "VehiclePhysical")
    with pytest.raises(UnknownName):
        _resolve(model, "vehicle")


# -- single points of failure ------------------------------------------------

LOSING = {
    "vehicleEcu", "vehicleEcu::vehicleControlSw", "driveEcu", "driveEcu::driveControlSw",
    "bodyEcu", "bodyEcu::bodyControlSw", "infotainmentEcu", "infotainmentEcu::entertainmentSw",
    "infotainmentEcu::climateControlSw", "engineEcu", "engineEcu::engineControlSw",
    "batteryEcu", "batteryEcu::batteryControlSw", "instrumentClusterUnit", "hvacAssembly",
    "displayAndSpeakers", "electricMotor", "batteryPack", "chargeInletMech",
    "brakeCaliperAsm", "suspensionAsm", "wiperAsm", "lampUnits",
}
HARMLESS = {
    "keyFobUnit", "startButtonMech", "steeringWheelMech", "gearStickMech",
    "acceleratorPedalMech", "brakePedalMech", "chassisFrame", "wheelSet", "bodyShell",
    "doorAsm", "windowAsm", "windowLiftAsm", "windshieldGlass", "doorLockAsm",
    "batteryPack::modules", "brakeCircuits",
}


@pytest.fixture(scope="module")
def rows(model):
    graph = build_impact_graph(model[0])
    return graph, {r.part_id: r for r in spof(graph)}


def test_spof_partition(rows):
    graph, by_part = rows
    physical = [n for n, node in graph.nodes.items() if node.layer is Layer.PHYSICAL]
    assert len(by_part) == len(physical) == 39
    losing = {p.removeprefix(f"{PA}::") for p, r in by_part.items() if r.lost_functions}
    assert losing == LOSING
    assert {p.removeprefix(f"{PA}::") for p, r in by_part.items() if not r.lost_functions} == HARMLESS


def test_spof_flags(rows):
    _, by_part = rows
    assert "redundancy_exhausted" in by_part[f"{PA}::brakeCircuits"].flags
    modules = by_part[f"{PA}::batteryPack::modules"]
    assert modules.degraded_functions and not modules.lost_functions
    assert "common_cause" in by_part[f"{PA}::infotainmentEcu"].flags
    assert "common_cause" in by_part[f"{PA}::batteryEcu"].flags
    assert "common_cause" not in by_part[f"{PA}::driveEcu"].flags
    steering = by_part[f"{PA}::steeringWheelMech"]
    assert "Requirements::DirectionalControl" in steering.requirements_at_risk
    assert steering.lost_functions == () and steering.degraded_functions == ()
