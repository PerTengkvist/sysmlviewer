"""Use case realization in the electric car: every system step is realized by function steps.

The one link written by hand is a `#refine` from a function step to a use case step;
`domain.realization.derive_realization` derives function, function node and logical part
from it. These tests freeze the intended realization (REALIZATION, ACTOR_STEPS) and check
the coverage rules of plan 2: every system step is realized, every function step refines a
use case step, and the explicit function and entity refines equal what the steps give.
"""

from __future__ import annotations

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind, SysmlFile
from domain.perform import resolve_performers
from domain.realization import derive_realization

ROOT = resolve_repo_root() / "examples" / "electric_car"

DRV = "UseCases::Driving"
MAN = "UseCases::Managing"
SEC = "Functions::Security"
DI = "Functions::DriverFeedback"
SPD = "Functions::SpeedControl"
MNV = "Functions::Maneuvrability"
LIG = "Functions::Lighting"
WIN = "Functions::WindshieldCleaning"
CHA = "Functions::Charging"
CLI = "Functions::Climate"
ENT = "Functions::Entertainment"

USE_CASES = {
    "StartVehicle": DRV, "StopVehicle": DRV, "ChangeGear": DRV, "TurnLeft": DRV,
    "TurnRight": DRV, "Brake": DRV, "Accelerate": DRV, "EmergencyStop": DRV,
    "CleanWindshield": DRV, "ToggleHeadlights": DRV, "Drive": DRV, "Park": DRV,
    "Unlock": MAN, "Lock": MAN, "OpenDoor": MAN, "CloseDoor": MAN, "OpenWindow": MAN,
    "CloseWindow": MAN, "AdjustClimate": MAN, "PlayMedia": MAN, "Charge": MAN,
}
COMPOSITES = {"Drive", "Park"}  # reached through include (B7, B9)
LEAVES = [uc for uc in USE_CASES if uc not in COMPOSITES]


def uc_id(name: str) -> str:
    return f"{USE_CASES[name]}::{name}"


# Use case step -> the function steps that realize it, in declaration order (B14).
REALIZATION: dict[str, dict[str, list[str]]] = {
    "StartVehicle": {
        "pressStart": [f"{SEC}::startFlow::readStartRequest"],
        "checkKey": [f"{SEC}::startFlow::checkKeyInCabin"],
        "showReady": [
            f"{SEC}::startFlow::releaseImmobilizer",
            f"{SEC}::startFlow::switchOnHighVoltage",
            f"{SEC}::startFlow::enableDrive",
            f"{DI}::powerModeFlow::showPowerMode",
        ],
        "rejectKey": [f"{SEC}::startFlow::refuseStart", f"{DI}::powerModeFlow::showPrompt"],
        "askForBrake": [f"{SEC}::startFlow::refuseStart", f"{DI}::powerModeFlow::showPrompt"],
    },
    "StopVehicle": {
        "pressStart": [f"{SEC}::stopFlow::readStopRequest"],
        "shutDown": [
            f"{SEC}::stopFlow::disableDrive",
            f"{SEC}::stopFlow::switchOffHighVoltage",
            f"{SEC}::stopFlow::armImmobilizer",
            f"{DI}::powerModeFlow::showPowerMode",
        ],
        "askForPark": [f"{SEC}::stopFlow::keepReady", f"{DI}::powerModeFlow::showPrompt"],
    },
    "ChangeGear": {
        "selectGear": [f"{MNV}::gearSelectionFlow::selectGear"],
        "engageGear": [
            f"{MNV}::gearSelectionFlow::engageGear",
            f"{DI}::driverFeedbackFlow::showGear",
        ],
        "refuseGear": [
            f"{MNV}::gearSelectionFlow::refuseGear",
            f"{DI}::driverFeedbackFlow::showWarnings",
        ],
    },
    "TurnLeft": {
        "steerWheels": [f"{MNV}::maneuvrabilityFlow::steerWheels", f"{MNV}::maneuvrabilityFlow::holdRoad"],
        "flashLeftIndicator": [
            f"{LIG}::indicatorFlow::readIndicatorRequest",
            f"{LIG}::indicatorFlow::flashIndicator",
        ],
    },
    "TurnRight": {
        "steerWheels": [f"{MNV}::maneuvrabilityFlow::steerWheels", f"{MNV}::maneuvrabilityFlow::holdRoad"],
        "flashRightIndicator": [
            f"{LIG}::indicatorFlow::readIndicatorRequest",
            f"{LIG}::indicatorFlow::flashIndicator",
        ],
    },
    "Brake": {
        "pressBrake": [f"{SPD}::speedControlFlow::arbitrateTorque"],
        "applyBrake": [f"{SPD}::speedControlFlow::blendRegen", f"{SPD}::speedControlFlow::applyFriction"],
        "applyBrakeLights": [
            f"{LIG}::brakeLampFlow::readBrakeRequest",
            f"{LIG}::brakeLampFlow::lightBrakeLamps",
        ],
    },
    "Accelerate": {
        "pressAccelerator": [f"{SPD}::speedControlFlow::arbitrateTorque"],
        "driveWheels": [f"{SPD}::speedControlFlow::driveWheels"],
        "limitTorque": [
            f"{SPD}::speedControlFlow::arbitrateTorque",
            f"{DI}::driverFeedbackFlow::showWarnings",
        ],
        "showSpeed": [f"{DI}::driverFeedbackFlow::showSpeed"],
    },
    "EmergencyStop": {
        "pressBrakeHard": [f"{SPD}::speedControlFlow::arbitrateTorque"],
        "brakeAtMaximum": [f"{SPD}::speedControlFlow::blendRegen", f"{SPD}::speedControlFlow::applyFriction"],
        "flashHazards": [f"{LIG}::indicatorFlow::readIndicatorRequest", f"{LIG}::indicatorFlow::flashHazards"],
    },
    "CleanWindshield": {
        "moveStalk": [f"{WIN}::windshieldCleaningFlow::readStalk"],
        "sprayWasher": [f"{WIN}::windshieldCleaningFlow::sprayWasher"],
        "sweepGlass": [f"{WIN}::windshieldCleaningFlow::sweepGlass"],
        "parkBlades": [f"{WIN}::windshieldCleaningFlow::parkBlades"],
    },
    "ToggleHeadlights": {
        "turnLightSwitch": [f"{LIG}::lightingFlow::selectLamps"],
        "lightLamps": [f"{LIG}::lightingFlow::lightLamps"],
        "switchOffLamps": [f"{LIG}::lightingFlow::switchOffLamps"],
        "showBeamSymbol": [f"{DI}::driverFeedbackFlow::showBeamSymbol"],
    },
    "Unlock": {
        "pressUnlock": [f"{SEC}::securityFlow::checkCredential"],
        "unlockDoors": [f"{SEC}::securityFlow::unlockDoors"],
        "wakeCabin": [f"{SEC}::securityFlow::wakeCabin"],
        "rejectKey": [f"{SEC}::securityFlow::rejectKey"],
    },
    "Lock": {
        "pressLock": [f"{SEC}::lockFlow::checkCredential"],
        "lockDoors": [
            f"{SEC}::lockFlow::checkDoorsClosed",
            f"{SEC}::lockFlow::engageLatches",
            f"{SEC}::lockFlow::confirmLock",
        ],
        "stayUnlocked": [f"{SEC}::lockFlow::checkDoorsClosed", f"{SEC}::lockFlow::keepUnlocked"],
    },
    "OpenDoor": {
        "pullHandle": [f"{SEC}::cabinAccessFlow::readDoorHandle"],
        "releaseDoor": [
            f"{SEC}::cabinAccessFlow::checkUnlocked",
            f"{SEC}::cabinAccessFlow::releaseDoor",
            f"{DI}::cabinStatusFlow::showDoorState",
        ],
        "stayLatched": [f"{SEC}::cabinAccessFlow::checkUnlocked", f"{SEC}::cabinAccessFlow::stayLatched"],
    },
    "CloseDoor": {
        "pushDoorShut": [f"{SEC}::cabinAccessFlow::closeDoor"],
        "clearDoorWarning": [f"{SEC}::cabinAccessFlow::relatch", f"{DI}::cabinStatusFlow::showDoorState"],
        "keepDoorWarning": [
            f"{SEC}::cabinAccessFlow::keepDoorAjar",
            f"{DI}::cabinStatusFlow::showDoorState",
        ],
    },
    "OpenWindow": {
        "holdSwitchDown": [f"{SEC}::cabinAccessFlow::runWindowLift"],
        "lowerWindow": [f"{SEC}::cabinAccessFlow::runWindowLift"],
    },
    "CloseWindow": {
        "holdSwitchUp": [f"{SEC}::cabinAccessFlow::runWindowLift"],
        "raiseWindow": [f"{SEC}::cabinAccessFlow::runWindowLift"],
        "stopWindow": [f"{SEC}::cabinAccessFlow::runWindowLift"],
        "reverseWindow": [f"{SEC}::cabinAccessFlow::runWindowLift"],
    },
    "AdjustClimate": {
        "setTemperature": [f"{CLI}::climateFlow::readSetpoint"],
        "showSetpoint": [f"{DI}::cabinStatusFlow::showSetpoint"],
        "conditionCabin": [f"{CLI}::climateFlow::conditionCabin"],
    },
    "PlayMedia": {
        "selectTitle": [f"{ENT}::entertainmentFlow::selectTitle"],
        "playTitle": [f"{ENT}::entertainmentFlow::playMedia"],
        "stopPlayback": [f"{ENT}::entertainmentFlow::stopPlayback"],
    },
    "Charge": {
        "connectCharger": [f"{CHA}::chargingFlow::detectPlug"],
        "negotiateSession": [f"{CHA}::chargingFlow::negotiateCurrent"],
        "transferEnergy": [f"{CHA}::chargingFlow::transferEnergy", f"{CHA}::chargingFlow::storeEnergy"],
        "reportCharge": [f"{DI}::chargeStatusFlow::showStateOfCharge"],
        "endSession": [f"{CHA}::chargingFlow::stopAtTarget", f"{DI}::chargeStatusFlow::showFinalCharge"],
    },
}

D, P, C = "Driver", "Passenger", "Charger"
# Use case step -> the actors that perform it (`actor X { perform step; }`, B1): 22 steps.
ACTOR_STEPS: dict[str, dict[str, set[str]]] = {
    "StartVehicle": {"pressStart": {D}},
    "StopVehicle": {"pressStart": {D}},
    "ChangeGear": {"selectGear": {D}},
    "TurnLeft": {"turnWheelLeft": {D}},
    "TurnRight": {"turnWheelRight": {D}},
    "Brake": {"pressBrake": {D}},
    "Accelerate": {"pressAccelerator": {D}},
    "EmergencyStop": {"pressBrakeHard": {D}},
    "CleanWindshield": {"moveStalk": {D}},
    "ToggleHeadlights": {"turnLightSwitch": {D}},
    "Drive": {"arrive": {D}},
    "Park": {"stopCar": {D}, "selectPark": {D}},
    "Unlock": {"pressUnlock": {D, P}},
    "Lock": {"pressLock": {D, P}},
    "OpenDoor": {"pullHandle": {D, P}},
    "CloseDoor": {"pushDoorShut": {D, P}},
    "OpenWindow": {"holdSwitchDown": {D, P}},
    "CloseWindow": {"holdSwitchUp": {D, P}},
    "AdjustClimate": {"setTemperature": {D, P}},
    "PlayMedia": {"selectTitle": {D, P}},
    "Charge": {"connectCharger": {D}},
}

# Every function flow after phase A.
FLOWS = [
    f"{SEC}::securityFlow", f"{SEC}::cabinAccessFlow", f"{SEC}::startFlow", f"{SEC}::stopFlow",
    f"{SEC}::lockFlow", f"{CHA}::chargingFlow", f"{SPD}::speedControlFlow",
    f"{MNV}::maneuvrabilityFlow", f"{MNV}::gearSelectionFlow", f"{ENT}::entertainmentFlow",
    f"{CLI}::climateFlow", f"{WIN}::windshieldCleaningFlow", f"{LIG}::lightingFlow",
    f"{LIG}::indicatorFlow", f"{LIG}::brakeLampFlow", f"{DI}::powerModeFlow",
    f"{DI}::driverFeedbackFlow", f"{DI}::cabinStatusFlow", f"{DI}::chargeStatusFlow",
]

# What the model realizes so far (phase A lands step by step); the rest is xfail.
DONE_USE_CASES: set[str] = {
    "StartVehicle", "StopVehicle", "Unlock", "Lock", "OpenDoor", "CloseDoor", "OpenWindow",
    "CloseWindow", "AdjustClimate",
}
DONE_FLOWS: set[str] = {
    f"{SEC}::securityFlow", f"{SEC}::startFlow", f"{SEC}::stopFlow", f"{SEC}::lockFlow",
    f"{SEC}::cabinAccessFlow", f"{CLI}::climateFlow", f"{DI}::powerModeFlow",
    f"{DI}::cabinStatusFlow",
}


def _todo(name: str, done: set[str]):
    return pytest.param(
        name, marks=() if name in done else pytest.mark.xfail(strict=True, reason="not yet realized")
    )


def _ucs(names):
    return [_todo(n, DONE_USE_CASES) for n in names]


@pytest.fixture(scope="module")
def elements():
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel))
    result = SubsetSysmlParser().parse_project(files)
    assert result.warnings == []
    return result.elements


@pytest.fixture(scope="module")
def real(elements):
    return derive_realization(elements)


def _explicit(elements, kind: str) -> dict[str, set[str]]:
    """Use case -> sources of a `#refine` from a function (`kind="function"`) or a function node."""
    functions = {
        e.id for e in elements.values()
        if e.kind == ArtifactKind.PART and e.parent_id == "Functions" and not e.is_abstract
    }
    nodes = {e.id for e in elements.values() if e.kind == ArtifactKind.PART and e.parent_id in functions}
    sources = functions if kind == "function" else nodes
    out: dict[str, set[str]] = {}
    for e in elements.values():
        if (
            e.kind == ArtifactKind.DEPENDENCY
            and "refine" in (e.metadata_keywords or [])
            and e.source_id in sources
            and elements.get(e.target_id or "") is not None
            and elements[e.target_id].kind == ArtifactKind.USE_CASE
        ):
            out.setdefault(e.target_id, set()).add(e.source_id)
    return out


# -- the realization table ---------------------------------------------------


@pytest.mark.parametrize("name", _ucs(LEAVES))
def test_realization_table(real, name):
    uc = uc_id(name)
    got = {
        step.rsplit("::", 1)[1]: realizers
        for step, realizers in real.step_realizers.items()
        if step.rsplit("::", 1)[0] == uc
    }
    assert got == REALIZATION[name]


@pytest.mark.parametrize("name", _ucs(USE_CASES))
def test_actor_steps_are_the_intended_ones(elements, name):
    uc = uc_id(name)
    performers = resolve_performers(elements)
    got: dict[str, set[str]] = {}
    for sid in elements[uc].children:
        step = elements[sid]
        if step.kind != ArtifactKind.ACTION:
            continue
        actors = {elements[p].name for p in performers.get(sid, []) if elements[p].kind == ArtifactKind.ACTOR}
        if actors:
            got[step.name] = actors
    assert got == ACTOR_STEPS[name]


def test_actor_steps_count():
    assert sum(len(steps) for steps in ACTOR_STEPS.values()) == 22


@pytest.mark.parametrize("name", _ucs(LEAVES))
def test_every_system_step_is_realized(real, name):
    uc = uc_id(name)
    system = real.system_steps.get(uc, [])
    assert system, name
    assert [s for s in system if s not in real.step_realizers] == []
    # Every system step and every actor step is in the table, and nothing else.
    steps = {s.rsplit("::", 1)[1] for s in system} | set(ACTOR_STEPS[name])
    assert set(REALIZATION[name]) <= steps


@pytest.mark.parametrize("flow", [_todo(f, DONE_FLOWS) for f in FLOWS])
def test_every_function_step_realizes_a_use_case_step(elements, real, flow):
    """Requirement 2 of plan 2 (plan 1's untraced-function-step)."""
    assert flow in elements
    sources = {link.source_id for link in real.links if link.precision == "step"}
    steps = [
        c for c in elements[flow].children
        if elements[c].kind == ArtifactKind.ACTION
        and (elements[c].type_ref or "") not in {"start", "done", "decide", "decision", "condition"}
    ]
    assert len(steps) >= 2
    assert [s for s in steps if s not in sources] == []


def test_realizing_steps_are_function_steps(elements, real):
    """Every step link goes from a step of a function flow to a step of a use case."""
    for link in real.links:
        if link.precision != "step":
            continue
        flow = elements[elements[link.source_id].parent_id]
        assert elements[flow.parent_id].kind == ArtifactKind.PART, link
        assert elements[flow.parent_id].parent_id == "Functions", link
        assert elements[elements[link.target_id].parent_id].kind == ArtifactKind.USE_CASE, link


@pytest.mark.parametrize("name", _ucs(LEAVES))
def test_explicit_refines_match_step_realization(elements, real, name):
    """Requirement 3 (plan 1's explicit-mismatch): during phase A the explicit refines from
    functions and function nodes are exactly what the step links give."""
    uc = uc_id(name)
    step_functions = {f for f, p in real.uc_functions.get(uc, {}).items() if p == "step"}
    step_nodes = {n for n, p in real.uc_nodes.get(uc, {}).items() if p == "step"}
    assert _explicit(elements, "function").get(uc, set()) == step_functions
    assert _explicit(elements, "node").get(uc, set()) == step_nodes


def test_no_realization_findings(real):
    assert [(f.code, f.element_id) for f in real.findings] == []


def test_use_cases_in_scope(real):
    assert real.in_scope == {uc_id(n) for n in DONE_USE_CASES}


# -- model findings F1, F3, F6, F7 -------------------------------------------


def _performed_by(elements, node_id: str) -> set[str]:
    return {
        step for step, parts in resolve_performers(elements).items() if node_id in parts
    }


def test_immobilizer_is_released_only_at_start(elements):
    """F1: unlocking leaves the immobilizer engaged; only startFlow releases it."""
    performed = _performed_by(elements, f"{SEC}::immobilizer")
    assert performed == {f"{SEC}::startFlow::releaseImmobilizer", f"{SEC}::stopFlow::armImmobilizer"}
    assert not any(s.startswith(f"{SEC}::securityFlow::") for s in performed)
    unlock = "Dynamics::UnlockSequence"
    messages = [e for e in elements.values() if e.kind == ArtifactKind.MESSAGE and e.parent_id == unlock]
    assert messages
    assert not any(m.target_id == f"{unlock}::driveController" for m in messages)


@pytest.mark.xfail(strict=True, reason="F3, F7: step 4")
def test_flows_have_one_trigger(elements):
    """F3, F7: one flow per trigger in Lighting and Maneuvrability."""
    def names(flow):
        return {elements[c].name for c in elements[flow].children if elements[c].kind == ArtifactKind.ACTION}

    assert names(f"{LIG}::lightingFlow") - {"start", "done", "lampsOn"} == {
        "selectLamps", "lightLamps", "switchOffLamps",
    }
    assert "selectGear" not in names(f"{MNV}::maneuvrabilityFlow")
    assert f"{LIG}::indicatorFlow" in elements and f"{LIG}::brakeLampFlow" in elements
    assert f"{MNV}::gearSelectionFlow" in elements


def test_instrument_cluster_loss_keeps_security(elements):
    """F6: a broken instrument cluster takes away the indications, not the car."""
    from domain.failure.extract import build_impact_graph
    from domain.failure.model import Failure, FailureKind, Layer, Status
    from domain.failure.propagate import evaluate

    graph = build_impact_graph(elements)
    impacts = evaluate(
        graph, [Failure("PhysicalArchitecture::VehiclePhysical::instrumentClusterUnit", FailureKind.LOSS)]
    )

    def lost(layer):
        return {n for n, node in graph.nodes.items() if node.layer is layer and impacts[n].status is Status.LOST}

    assert lost(Layer.FUNCTION) == {DI}
    assert lost(Layer.USE_CASE) == {
        uc_id(n) for n in (
            "StartVehicle", "StopVehicle", "ChangeGear", "Accelerate", "ToggleHeadlights",
            "OpenDoor", "CloseDoor", "AdjustClimate", "Charge", "Drive", "Park",
        )
    }
