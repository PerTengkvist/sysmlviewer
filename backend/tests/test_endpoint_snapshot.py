"""Regression gate: relation endpoints, perform targets and warnings of examples/.

The fixture was generated from unmodified `main` (7fc47c0) before the name
resolution rework. Any difference must be listed in ACCEPTED_DIFFS with a
justification in .claude/specs/import_name_resolution_tdd_plan.md.
"""

from __future__ import annotations

import re

import pytest

from endpoint_snapshot_ec_realization import accepted_lines as ec_realization_lines
from sequence_migration_fixture import load_fixture as load_migration_fixture
from endpoint_snapshot import (
    collect_snapshot,
    diff_snapshots,
    load_fixture,
    snapshot_keys,
)

# The five pre-existing "connection ... not found" warnings of examples/diagrams
# (the same connections as before, unresolved before and after) are now worded
# with the reference as written, e.g. `engine.powerIn` instead of the guessed id
# `Example::Vehicle::engine::powerIn`, and carry a line number. The ends are unchanged.
_OLD_NEW_WARNINGS = [
    ("connection target not found: Example::Vehicle::engine::powerIn (in 'Example::Vehicle::conn1')",
     "line 17: connection target not found: engine.powerIn (in 'Example::Vehicle::conn1')"),
    ("connection target not found: Example::Vehicle::engine::PowerIn (in 'Example::Vehicle::poower')",
     "line 57: connection target not found: engine.PowerIn (in 'Example::Vehicle::poower')"),
    ("connection source not found: Example::Vehicle::engine::TorqueOut (in 'Example::Vehicle::torque')",
     "line 58: connection source not found: engine.TorqueOut (in 'Example::Vehicle::torque')"),
    ("connection target not found: Example::Vehicle::axle::TorqueIn (in 'Example::Vehicle::torque')",
     "line 58: connection target not found: axle.TorqueIn (in 'Example::Vehicle::torque')"),
    ("connection target not found: Example::Vehicle::engine::GaugeIn (in 'Example::Vehicle::gaugebus')",
     "line 60: connection target not found: engine.GaugeIn (in 'Example::Vehicle::gaugebus')"),
]

# Exact lines as produced by diff_snapshots().
ACCEPTED_DIFFS: set[str] = set()
for _old, _new in _OLD_NEW_WARNINGS:
    if "conn1" in _new:  # the other four no longer occur, see _TYPE_RESOLUTION_*
        ACCEPTED_DIFFS.add(f"project:examples/diagrams: warning added {_new!r}")
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: warning removed {_old!r}")

# Part types (`: T`) resolve through namespaces and imports instead of "first
# definition with that name" (examples/diagrams only; the other examples are
# identical). Each changed type and the ids that follow from it:
#   UseCasesExample::Drive::vehicle : Vehicle  TreeExample::Vehicle -> UseCasesExample::Vehicle
#     (`Vehicle` is declared next to it in UseCasesExample). Its inherited
#     battery/cabin/engine copies were TreeExample::Vehicle's and are gone.
#   Example::Vehicle::engine : Engine          CarLogical::Engine -> Example::Engine
#   Example::Vehicle::axle   : Axle            CarLogical::Axle -> Example::Axle
#     (both are declared in the enclosing package Example). The copies of
#     CarLogical's members (powerKW, driven) are replaced by Example's own.
# As a consequence the four connection warnings on engine.PowerIn,
# engine.TorqueOut, axle.TorqueIn and engine.GaugeIn disappear: those ports now
# exist (the ends are the same ids as before).
_TYPE_RESOLUTION_ADDED = [
    "Example::Vehicle::axle::TorqueIn",
    "Example::Vehicle::axle::rotationSpeed",
    "Example::Vehicle::engine::EventOut",
    "Example::Vehicle::engine::GaugeIn",
    "Example::Vehicle::engine::PowerIn",
    "Example::Vehicle::engine::TorqueOut",
    "Example::Vehicle::engine::rpm",
    "Example::Vehicle::engine::status",
    "Example::Vehicle::engine::torque",
]
_TYPE_RESOLUTION_REMOVED = [
    "Example::Vehicle::axle::driven",
    "Example::Vehicle::engine::powerKW",
    "UseCasesExample::Drive::vehicle::battery",
    "UseCasesExample::Drive::vehicle::cabin",
    "UseCasesExample::Drive::vehicle::engine",
]
for _id in _TYPE_RESOLUTION_ADDED:
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: element id added {_id!r}")
for _id in _TYPE_RESOLUTION_REMOVED:
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: element id removed {_id!r}")

# Typed-by targets (`typeTargetId`, compared with what main's name matching gave).
# Usage -> (main, now). All in examples/diagrams, where the same names are
# declared in several packages. Why each group changes:
#   part types: as above (own/enclosing package wins over the first same name).
#   scalar attribute types (Real, Integer, String): each package declares its
#     own `attribute def`, and the usage now finds the one in its own package
#     instead of CarLogical's.
_TYPE_TARGET_CHANGES = {
    "Example::Vehicle::axle": ("CarLogical::Axle", "Example::Axle"),
    "Example::Vehicle::engine": ("CarLogical::Engine", "Example::Engine"),
    "UseCasesExample::Drive::vehicle": ("TreeExample::Vehicle", "UseCasesExample::Vehicle"),
    "Example::Axle::rotationSpeed": ("CarLogical::Real", "Example::Real"),
    "Example::Battery::SoC": ("CarLogical::Real", "Example::Real"),
    "Example::Battery::power": ("CarLogical::Real", "Example::Real"),
    "Example::Engine::rpm": ("CarLogical::Integer", "Example::Integer"),
    "Example::Engine::status": ("CarLogical::String", "Example::String"),
    "Example::Engine::torque": ("CarLogical::Real", "Example::Real"),
    "Example::Vehicle::battery::SoC": ("CarLogical::Real", "Example::Real"),
    "Example::Vehicle::battery::power": ("CarLogical::Real", "Example::Real"),
    "Example::Vehicle::status": ("CarLogical::String", "Example::String"),
    "hbox::HBox::BoxA::status": ("CarLogical::String", "hbox::String"),
    "hbox::HBox::BoxB::status": ("CarLogical::String", "hbox::String"),
    "hbox::HBox::BoxC::status": ("CarLogical::String", "hbox::String"),
    "hbox::HBox::status": ("CarLogical::String", "hbox::String"),
    **{
        f"PartRelationships::{u}": ("CarLogical::Real", "PartRelationships::Real")
        for u in (
            "Aggregator::sharedEng::capacity",
            "Base::capacity",
            "Small::capacity",
            "System::baseEng::capacity",
            "System::child::capacity",
            "System::eng::capacity",
            "System::logical::capacity",
            "System::physical::capacity",
            "System::reading",
            "System::sharedEng::capacity",
            "System::temp",
        )
    },
}
for _usage, (_old, _new) in _TYPE_TARGET_CHANGES.items():
    ACCEPTED_DIFFS.add(
        f"project:examples/diagrams: {_usage} typeTargetId {_old!r} -> {_new!r}"
    )

# Failure-impact showcase in electric_car (pool of battery modules, redundant brake
# circuits and the FailureModel library). Purely additive: no existing id and no
# relation end changes. The two new «implements» dependencies are numbered after
# the 40 existing anonymous dependencies of vehicle_physical.sysml (dep<N>).
_PA = "PhysicalArchitecture::VehiclePhysical"
_FAILURE_MODEL_ADDED = [
    "PhysicalArchitecture::BatteryModule",
    "PhysicalArchitecture::BatteryModule::capacityKWh",
    "PhysicalArchitecture::BrakeCircuit",
    f"{_PA}::batteryPack::modules",
    f"{_PA}::batteryPack::modules::capacityKWh",
    f"{_PA}::batteryPack::required",
    f"{_PA}::brakeCircuits",
    f"{_PA}::brakeCircuitsRequired",
]
_FAILURE_MODEL_NEW_DEPS = [f"{_PA}::dep41", f"{_PA}::dep42"]
_PHYSICAL_FILE = (
    "file:examples/electric_car/physical_architecture/vehicle_physical.sysml"
)
for _id in ["FailureModel", *_FAILURE_MODEL_ADDED, *_FAILURE_MODEL_NEW_DEPS]:
    ACCEPTED_DIFFS.add(f"project:examples/electric_car: element id added {_id!r}")
for _id in _FAILURE_MODEL_ADDED:
    ACCEPTED_DIFFS.add(f"{_PHYSICAL_FILE}: element id added {_id!r}")
for _id in _FAILURE_MODEL_NEW_DEPS:
    ACCEPTED_DIFFS.add(f"project:examples/electric_car: relation added {_id!r}")
    ACCEPTED_DIFFS.add(f"{_PHYSICAL_FILE}: element id added {_id!r}")
    ACCEPTED_DIFFS.add(f"{_PHYSICAL_FILE}: relation added {_id!r}")
ACCEPTED_DIFFS.add(
    "file:examples/electric_car/failure_model/failure_model.sysml: key added"
)

# examples/diagrams/occurrence_sequences.sysml: a new example file (SysML v2
# sequence diagrams as `occurrence def`, every form of lifeline). Purely
# additive: nothing existing changes and nothing is removed. The ids that are
# not written in the source are the relations `a_redefines_partA`,
# `ctrl_subsets_plant_controller` and the like (one per `:>`/`:>>`), and the
# part `SequenceC::plant::actuator` with its redefinition: the parser creates
# it for the nested message end `plant.actuator.moved` (a feature of the type
# of `plant`). All seven messages are relations. Only the element ids and
# relations are listed; no `typeTargetId` or `warning` line is produced.
_OCCURRENCE_EXAMPLE_ADDED = [
    "OccurrenceSequences",
    "OccurrenceSequences::Controller",
    "OccurrenceSequences::Controller::commandReceived",
    "OccurrenceSequences::Greeting",
    "OccurrenceSequences::PartA",
    "OccurrenceSequences::PartA::ackReceived",
    "OccurrenceSequences::PartA::sent",
    "OccurrenceSequences::PartB",
    "OccurrenceSequences::PartB::received",
    "OccurrenceSequences::Plant",
    "OccurrenceSequences::Plant::actuator",
    "OccurrenceSequences::Plant::actuator::moved",
    "OccurrenceSequences::Plant::controller",
    "OccurrenceSequences::SequenceA",
    "OccurrenceSequences::SequenceA::a",
    "OccurrenceSequences::SequenceA::a_redefines_partA",
    "OccurrenceSequences::SequenceA::ack",
    "OccurrenceSequences::SequenceA::b",
    "OccurrenceSequences::SequenceA::b_redefines_partB",
    "OccurrenceSequences::SequenceA::c",
    "OccurrenceSequences::SequenceA::msg",
    "OccurrenceSequences::SequenceAView",
    "OccurrenceSequences::SequenceB",
    "OccurrenceSequences::SequenceB::a",
    "OccurrenceSequences::SequenceB::a::ping",
    "OccurrenceSequences::SequenceB::b",
    "OccurrenceSequences::SequenceB::bye",
    "OccurrenceSequences::SequenceB::hello",
    "OccurrenceSequences::SequenceBView",
    "OccurrenceSequences::SequenceC",
    "OccurrenceSequences::SequenceC::command",
    "OccurrenceSequences::SequenceC::ctrl",
    "OccurrenceSequences::SequenceC::ctrl_subsets_plant_controller",
    "OccurrenceSequences::SequenceC::listener",
    "OccurrenceSequences::SequenceC::listener_subsets_OccurrenceSequences_partB",
    "OccurrenceSequences::SequenceC::move",
    "OccurrenceSequences::SequenceC::notify",
    "OccurrenceSequences::SequenceC::operator",
    "OccurrenceSequences::SequenceC::plant",
    "OccurrenceSequences::SequenceC::plant::actuator",
    "OccurrenceSequences::SequenceC::plant::actuator_redefines_OccurrenceSequences_Plant_actuator",
    "OccurrenceSequences::SequenceCView",
    "OccurrenceSequences::partA",
    "OccurrenceSequences::partB",
]

_OCCURRENCE_EXAMPLE_RELATIONS = [
    "OccurrenceSequences::SequenceA::a_redefines_partA",
    "OccurrenceSequences::SequenceA::ack",
    "OccurrenceSequences::SequenceA::b_redefines_partB",
    "OccurrenceSequences::SequenceA::msg",
    "OccurrenceSequences::SequenceB::bye",
    "OccurrenceSequences::SequenceB::hello",
    "OccurrenceSequences::SequenceC::command",
    "OccurrenceSequences::SequenceC::ctrl_subsets_plant_controller",
    "OccurrenceSequences::SequenceC::listener_subsets_OccurrenceSequences_partB",
    "OccurrenceSequences::SequenceC::move",
    "OccurrenceSequences::SequenceC::notify",
    "OccurrenceSequences::SequenceC::plant::actuator_redefines_OccurrenceSequences_Plant_actuator",
]
_OCCURRENCE_FILE = "file:examples/diagrams/occurrence_sequences.sysml"
for _id in _OCCURRENCE_EXAMPLE_ADDED:
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: element id added {_id!r}")
for _id in _OCCURRENCE_EXAMPLE_RELATIONS:
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: relation added {_id!r}")
ACCEPTED_DIFFS.add(f"{_OCCURRENCE_FILE}: key added")

# Phase 3: electric car's sequences are occurrence defs with typed lifelines, and
# every logical part of Car gets a part def in LogicalArchitecture::Types.
#   - Lifeline ids are unchanged (`Dynamics::<S>::keyFob` is now a `ref part`, not
#     a `lifeline`), so they produce no line. No end of any message changes.
#   - Each of the 206 messages changes id from `<S>::msgN` to `<S>::<name>`; both
#     are relations, so each gives an element id and a relation removed/added.
#     The ids come from fixtures/sequence_migration.json, frozen from the legacy
#     model, and test_migrated_messages_keep_their_ends checks the ends.
#   - New part defs: the three actors in Dynamics and Types plus 27 defs. The
#     Car parts get `typeTargetId`s, but the snapshot only compares typeTargets of
#     ids that had one before (the Car parts had none), so those give no line.
_SEQ_FILE = "file:examples/electric_car/dynamics/sequences.sysml"
_CAR_FILE = "file:examples/electric_car/logical_architecture/car.sysml"
_PROJECT_EC = "project:examples/electric_car"
for _seq in load_migration_fixture().values():
    for _msg in _seq["messages"]:
        _new = _msg["oldId"].rsplit("::", 1)[0] + "::" + _msg["name"]
        for _scope in (_PROJECT_EC, _SEQ_FILE):
            for _kind in ("element id", "relation"):
                ACCEPTED_DIFFS.add(f"{_scope}: {_kind} removed {_msg['oldId']!r}")
                ACCEPTED_DIFFS.add(f"{_scope}: {_kind} added {_new!r}")
for _actor in ("Driver", "Passenger", "Charger"):
    for _scope in (_PROJECT_EC, _SEQ_FILE):
        ACCEPTED_DIFFS.add(f"{_scope}: element id added 'Dynamics::{_actor}'")
_TYPE_DEFS = [
    "KeyFob", "StartButton", "SteeringWheel", "GearStick", "AcceleratorPedal",
    "BrakePedal", "VehicleController", "DriveController", "BodyController",
    "InstrumentCluster", "ClimateSystem", "EntertainmentSystem", "Engine", "Battery",
    "ChargeInlet", "Chassis", "Wheels", "FrictionBrakes", "Suspension", "Body", "Doors",
    "Windows", "WindowLifts", "Windshield", "Wipers", "Locks", "Lamps",
]
for _scope in (_PROJECT_EC, _CAR_FILE):
    ACCEPTED_DIFFS.add(f"{_scope}: element id added 'LogicalArchitecture::Types'")
    for _name in _TYPE_DEFS:
        ACCEPTED_DIFFS.add(f"{_scope}: element id added 'LogicalArchitecture::Types::{_name}'")

# examples/diagrams/use_case_realization.sysml: a new example file (use case
# realization: `#refine` from function steps to use case steps, function nodes that
# `perform` steps, `allocate` to logical parts, and a UseCaseView). Purely additive:
# nothing existing changes. Every `perform` (the actors' too) resolves to the step it
# names, which gives a `performTargetId` line each; the 17 relations are the
# successions, the `#refine` dependencies, the allocations and the two `include`s.
_REALIZATION_ADDED = [
    "UseCaseRealization",
    "UseCaseRealization::F",
    "UseCaseRealization::F::Security",
    "UseCaseRealization::F::Security::auth",
    "UseCaseRealization::F::Security::auth::perform_startFlow_checkKeyInCabin",
    "UseCaseRealization::F::Security::immo",
    "UseCaseRealization::F::Security::immo::perform_startFlow_logStart",
    "UseCaseRealization::F::Security::immo::perform_startFlow_releaseImmobilizer",
    "UseCaseRealization::F::Security::locks",
    "UseCaseRealization::F::Security::locks::perform_unlockFlow_release",
    "UseCaseRealization::F::Security::startFlow",
    "UseCaseRealization::F::Security::startFlow::checkKeyInCabin",
    "UseCaseRealization::F::Security::startFlow::done",
    "UseCaseRealization::F::Security::startFlow::logStart",
    "UseCaseRealization::F::Security::startFlow::releaseImmobilizer",
    "UseCaseRealization::F::Security::startFlow::start",
    "UseCaseRealization::F::Security::startFlow::succ1",
    "UseCaseRealization::F::Security::startFlow::succ2",
    "UseCaseRealization::F::Security::startFlow::succ3",
    "UseCaseRealization::F::Security::startFlow::succ4",
    "UseCaseRealization::F::Security::unlockFlow",
    "UseCaseRealization::F::Security::unlockFlow::release",
    "UseCaseRealization::L",
    "UseCaseRealization::L::bc",
    "UseCaseRealization::L::vc",
    "UseCaseRealization::RealizationMatrix",
    "UseCaseRealization::UC",
    "UseCaseRealization::UC::Drive",
    "UseCaseRealization::UC::Drive::include_Start",
    "UseCaseRealization::UC::Drive::include_Unlock",
    "UseCaseRealization::UC::Lock",
    "UseCaseRealization::UC::Lock::lockDoors",
    "UseCaseRealization::UC::Start",
    "UseCaseRealization::UC::Start::Driver",
    "UseCaseRealization::UC::Start::Driver::perform_pressStart",
    "UseCaseRealization::UC::Start::askForBrake",
    "UseCaseRealization::UC::Start::checkKey",
    "UseCaseRealization::UC::Start::done",
    "UseCaseRealization::UC::Start::pressStart",
    "UseCaseRealization::UC::Start::showReady",
    "UseCaseRealization::UC::Start::start",
    "UseCaseRealization::UC::Start::succ1",
    "UseCaseRealization::UC::Start::succ2",
    "UseCaseRealization::UC::Start::succ3",
    "UseCaseRealization::UC::Start::succ4",
    "UseCaseRealization::UC::Unlock",
    "UseCaseRealization::UC::Unlock::Driver",
    "UseCaseRealization::UC::Unlock::Driver::perform_pressUnlock",
    "UseCaseRealization::UC::Unlock::pressUnlock",
    "UseCaseRealization::UC::Unlock::unlockDoors",
    "UseCaseRealization::UseCaseRealizationView",
    # The two AllocationViews that draw the realization chain (steps 15-17): views only.
    "UseCaseRealization::SecurityChain",
    "UseCaseRealization::StartChain",
    # The two ActionFlowViews on use cases that draw the swimlane activity (steps 18-22).
    "UseCaseRealization::StartRealization",
    "UseCaseRealization::DriveRealization",
    "UseCaseRealization::alloc1",
    "UseCaseRealization::alloc2",
    "UseCaseRealization::alloc3",
    "UseCaseRealization::dep1",
    "UseCaseRealization::dep2",
    "UseCaseRealization::dep3",
    "UseCaseRealization::dep4",
]

_REALIZATION_RELATIONS = [
    "UseCaseRealization::F::Security::startFlow::succ1",
    "UseCaseRealization::F::Security::startFlow::succ2",
    "UseCaseRealization::F::Security::startFlow::succ3",
    "UseCaseRealization::F::Security::startFlow::succ4",
    "UseCaseRealization::UC::Drive::include_Start",
    "UseCaseRealization::UC::Drive::include_Unlock",
    "UseCaseRealization::UC::Start::succ1",
    "UseCaseRealization::UC::Start::succ2",
    "UseCaseRealization::UC::Start::succ3",
    "UseCaseRealization::UC::Start::succ4",
    "UseCaseRealization::alloc1",
    "UseCaseRealization::alloc2",
    "UseCaseRealization::alloc3",
    "UseCaseRealization::dep1",
    "UseCaseRealization::dep2",
    "UseCaseRealization::dep3",
    "UseCaseRealization::dep4",
]

_REALIZATION_PERFORMS = [
    ("UseCaseRealization::F::Security::auth::perform_startFlow_checkKeyInCabin", "UseCaseRealization::F::Security::startFlow::checkKeyInCabin"),
    ("UseCaseRealization::F::Security::immo::perform_startFlow_logStart", "UseCaseRealization::F::Security::startFlow::logStart"),
    ("UseCaseRealization::F::Security::immo::perform_startFlow_releaseImmobilizer", "UseCaseRealization::F::Security::startFlow::releaseImmobilizer"),
    ("UseCaseRealization::F::Security::locks::perform_unlockFlow_release", "UseCaseRealization::F::Security::unlockFlow::release"),
    ("UseCaseRealization::UC::Start::Driver::perform_pressStart", "UseCaseRealization::UC::Start::pressStart"),
    ("UseCaseRealization::UC::Unlock::Driver::perform_pressUnlock", "UseCaseRealization::UC::Unlock::pressUnlock"),
]

_REALIZATION_FILE = "file:examples/diagrams/use_case_realization.sysml"
for _id in _REALIZATION_ADDED:
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: element id added {_id!r}")
for _id in _REALIZATION_RELATIONS:
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: relation added {_id!r}")
for _perform, _target in _REALIZATION_PERFORMS:
    ACCEPTED_DIFFS.add(
        f"project:examples/diagrams: {_perform} performTargetId None -> {_target!r}"
    )
ACCEPTED_DIFFS.add(f"{_REALIZATION_FILE}: key added")

# Plan 2, phase A: the electric car realizes its use cases step by step (new flows, the
# DriverFeedback function, actor blocks and step-level `#refine`s). The ids are listed per
# step in endpoint_snapshot_ec_realization.py.
ACCEPTED_DIFFS |= ec_realization_lines()

_LINE_PREFIX = re.compile(r"^line \d+: ")


def normalize(warnings: list[str]) -> set[str]:
    return {_LINE_PREFIX.sub("", w) for w in warnings}


def _snap(warnings=(), ids=(), relations=(), performs=()):
    return {
        "k": {
            "elementIds": list(ids),
            "relations": list(relations),
            "performs": list(performs),
            "warnings": list(warnings),
        }
    }


def _rel(i, target):
    return {"id": i, "kind": "dependency", "sourceId": "P::a", "targetId": target, "typeRef": None}


def test_diff_snapshots_reports_changed_endpoint():
    a = _snap(ids=["P::dep1"], relations=[_rel("P::dep1", "P::x")])
    b = _snap(ids=["P::dep1"], relations=[_rel("P::dep1", "Q::x")])
    assert diff_snapshots(a, b) == ["k: P::dep1 targetId 'P::x' -> 'Q::x'"]


def test_diff_snapshots_reports_added_and_removed_ids():
    a = _snap(ids=["P::old"])
    b = _snap(ids=["P::new"])
    assert diff_snapshots(a, b) == [
        "k: element id added 'P::new'",
        "k: element id removed 'P::old'",
    ]


@pytest.fixture(scope="module")
def current():
    return collect_snapshot()


@pytest.mark.parametrize("key", snapshot_keys())
def test_examples_match_endpoint_snapshot(current, key):
    old, new = load_fixture(), current
    unexpected = [
        d
        for d in diff_snapshots({key: old[key]}, {key: new[key]})
        if d not in ACCEPTED_DIFFS
    ]
    assert unexpected == []


def test_accepted_diffs_are_all_used(current):
    produced = set(diff_snapshots(load_fixture(), current))
    assert ACCEPTED_DIFFS - produced == set()


@pytest.mark.parametrize("key", snapshot_keys())
def test_examples_add_no_warnings(current, key):
    old = load_fixture()[key]
    new = current[key]
    accepted = {normalize([n]).pop() for _, n in _OLD_NEW_WARNINGS}
    added = normalize(new["warnings"]) - normalize(old["warnings"]) - accepted
    assert added == set()


def test_new_snapshot_keys_are_accepted(current):
    """The parametrised tests only walk the fixture's keys; a new file needs a line."""
    new_keys = set(current) - set(load_fixture())
    assert {f"{k}: key added" for k in new_keys} - ACCEPTED_DIFFS == set()
