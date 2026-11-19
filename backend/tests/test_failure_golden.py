"""Golden scenarios on the electric car: exact expected impact."""

from __future__ import annotations

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.model import Failure, FailureKind, Layer, Status
from domain.failure.propagate import chain, evaluate, failure_flags
from domain.models import SysmlFile

ROOT = resolve_repo_root() / "examples" / "electric_car"
PA = "PhysicalArchitecture::VehiclePhysical"
LA = "LogicalArchitecture::Car"


def _f(*names: str) -> set[str]:
    return {f"Functions::{n}" for n in names}


def _uc(*names: str) -> set[str]:
    return {f"UseCases::{n}" for n in names}


def _r(*names: str) -> set[str]:
    return {f"Requirements::{n}" for n in names}


ALL_FUNCTIONS = _f(
    "Security", "Charging", "SpeedControl", "Maneuvrability",
    "Entertainment", "Climate", "WindshieldCleaning", "Lighting",
)
DRIVE_FUNCTIONS = _f("SpeedControl", "Maneuvrability", "WindshieldCleaning", "Lighting")
DRIVE_USE_CASES = _uc(
    "Driving::Accelerate", "Driving::Brake", "Driving::EmergencyStop", "Driving::ChangeGear",
    "Driving::TurnLeft", "Driving::TurnRight", "Driving::ToggleHeadlights",
    "Driving::CleanWindshield", "Driving::Drive",
)
DRIVE_REQUIREMENTS = _r(
    "Acceleration", "TopSpeed", "BrakingDistance", "PropulsionModes",
    "DirectionalControl", "ForwardVisibility", "NightVisibility", "Range",
)
# Use cases that only Security refines, and Park: untouched by energy trouble.
SECURITY_ONLY = _uc(
    "Driving::StartVehicle", "Driving::StopVehicle", "Managing::Unlock", "Managing::Lock",
    "Managing::OpenDoor", "Managing::CloseDoor", "Managing::OpenWindow",
    "Managing::CloseWindow", "Driving::Park",
)
ENERGY_USE_CASES = DRIVE_USE_CASES | _uc("Managing::Charge", "Managing::AdjustClimate", "Managing::PlayMedia")
ENERGY_REQUIREMENTS = DRIVE_REQUIREMENTS | _r("ChargeTime", "CabinClimate", "CabinMedia")


@pytest.fixture(scope="module")
def graph():
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel)
        )
    return build_impact_graph(SubsetSysmlParser().parse_project(files).elements)


def loss(part, instances=None):
    return Failure(f"{PA}::{part}", FailureKind.LOSS, None, instances)


def _with_status(graph, impacts, layer, status):
    return {
        nid
        for nid, node in graph.nodes.items()
        if node.layer is layer and impacts[nid].status is status
    }


def _not_ok(graph, impacts, layer):
    return {
        nid
        for nid, node in graph.nodes.items()
        if node.layer is layer and impacts[nid].status is not Status.OK
    }


def _check(graph, impacts, status, functions, use_cases, requirements):
    assert _not_ok(graph, impacts, Layer.FUNCTION) == functions
    assert _not_ok(graph, impacts, Layer.USE_CASE) == use_cases
    assert _not_ok(graph, impacts, Layer.REQUIREMENT) == requirements
    for layer, ids in (
        (Layer.FUNCTION, functions), (Layer.USE_CASE, use_cases), (Layer.REQUIREMENT, requirements)
    ):
        assert _with_status(graph, impacts, layer, status) == ids


def test_electric_motor_loss(graph):
    impacts = evaluate(graph, [loss("electricMotor")])
    _check(graph, impacts, Status.LOST, DRIVE_FUNCTIONS, DRIVE_USE_CASES, DRIVE_REQUIREMENTS)
    assert impacts["Functions::SpeedControl"].limited_by == (
        "Functions::SpeedControl::tractionDrive", "node"
    )
    assert impacts["Functions::Maneuvrability"].limited_by == ("Functions::SpeedControl", "#Stability")
    assert impacts["Functions::WindshieldCleaning"].limited_by == ("Functions::SpeedControl", "#Speed")
    assert impacts["Functions::Lighting"].limited_by == ("Functions::Maneuvrability", "#Indicate")
    assert chain(impacts, "Functions::SpeedControl") == [
        "Functions::SpeedControl::tractionDrive", f"{LA}::engine", f"{PA}::electricMotor",
    ]


def test_infotainment_ecu_common_cause(graph):
    failure = loss("infotainmentEcu")
    assert failure_flags(graph, failure) == frozenset({"common_cause"})
    impacts = evaluate(graph, [failure])
    for sw in ("entertainmentSw", "climateControlSw"):
        node = impacts[f"{PA}::infotainmentEcu::{sw}"]
        assert node.status is Status.LOST
        assert node.limited_by == (f"{PA}::infotainmentEcu", "contained in")
    _check(
        graph, impacts, Status.LOST,
        _f("Entertainment", "Climate"),
        _uc("Managing::PlayMedia", "Managing::AdjustClimate"),
        _r("CabinMedia", "CabinClimate"),
    )


def _pool_checks(graph, impacts, capability):
    modules = impacts[f"{PA}::batteryPack::modules"]
    assert modules.capability == pytest.approx(capability)
    assert impacts[f"{LA}::battery"].capability == pytest.approx(capability)
    degraded = ALL_FUNCTIONS - _f("Security")
    _check(graph, impacts, Status.DEGRADED, degraded, ENERGY_USE_CASES, ENERGY_REQUIREMENTS)
    for fn in degraded:
        assert impacts[fn].capability == pytest.approx(capability)
    assert impacts["Requirements::Range"].status is Status.DEGRADED
    for uc in SECURITY_ONLY:
        assert impacts[uc].status is Status.OK
    return modules


def test_pool_above_required(graph):
    modules = _pool_checks(graph, evaluate(graph, [loss("batteryPack::modules", 1)]), 0.875)
    assert "pool_at_minimum" not in modules.flags


def test_pool_at_required(graph):
    modules = _pool_checks(graph, evaluate(graph, [loss("batteryPack::modules", 2)]), 0.75)
    assert "pool_at_minimum" in modules.flags


def test_pool_below_required(graph):
    impacts = evaluate(graph, [loss("batteryPack::modules", 3)])
    assert impacts[f"{LA}::battery"].status is Status.LOST
    _check(
        graph, impacts, Status.LOST,
        ALL_FUNCTIONS - _f("Security"), ENERGY_USE_CASES, ENERGY_REQUIREMENTS,
    )
    assert impacts["Requirements::ChargeTime"].status is Status.LOST
    assert impacts["Requirements::Range"].status is Status.LOST


def test_brake_circuit_redundancy_exhausted(graph):
    impacts = evaluate(graph, [loss("brakeCircuits", 1)])
    _check(graph, impacts, Status.LOST, set(), set(), set())
    flagged = _f("SpeedControl", "Maneuvrability", "WindshieldCleaning", "Lighting")
    for fn in ALL_FUNCTIONS:
        assert ("redundancy_exhausted" in impacts[fn].flags) == (fn in flagged), fn


def test_both_brake_circuits_lost(graph):
    impacts = evaluate(graph, [loss("brakeCircuits", 2)])
    _check(graph, impacts, Status.LOST, DRIVE_FUNCTIONS, DRIVE_USE_CASES, DRIVE_REQUIREMENTS)
    assert impacts[f"{LA}::frictionBrakes"].status is Status.LOST
    assert chain(impacts, "Functions::SpeedControl") == [
        "Functions::SpeedControl::frictionBraking", f"{LA}::frictionBrakes", f"{PA}::brakeCircuits",
    ]


def test_drive_ecu_degraded(graph):
    failure = Failure(f"{PA}::driveEcu", FailureKind.DEGRADED, 0.5)
    impacts = evaluate(graph, [failure])
    sw = impacts[f"{PA}::driveEcu::driveControlSw"]
    assert sw.capability == 0.5 and sw.limited_by == (f"{PA}::driveEcu", "contained in")
    controller = impacts[f"{LA}::driveController"]
    assert controller.capability == 0.5
    assert controller.limited_by == (f"{PA}::driveEcu", "implements")
    _check(graph, impacts, Status.DEGRADED, DRIVE_FUNCTIONS, DRIVE_USE_CASES, DRIVE_REQUIREMENTS)
    assert impacts["Functions::SpeedControl"].limited_by == (
        "Functions::SpeedControl::torqueArbitration", "node"
    )
    for fn in DRIVE_FUNCTIONS:
        assert impacts[fn].capability == 0.5


def test_electric_motor_erroneous(graph):
    failure = Failure(f"{PA}::electricMotor", FailureKind.ERRONEOUS)
    impacts = evaluate(graph, [failure])
    _check(graph, impacts, Status.LOST, DRIVE_FUNCTIONS, DRIVE_USE_CASES, DRIVE_REQUIREMENTS)
    for fn in DRIVE_FUNCTIONS:
        assert "erroneous_as_loss" in impacts[fn].flags
