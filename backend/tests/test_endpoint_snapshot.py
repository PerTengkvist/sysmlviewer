"""Regression gate: relation endpoints, perform targets and warnings of examples/.

The fixture was generated from unmodified `main` (7fc47c0) before the name
resolution rework. Any difference must be listed in ACCEPTED_DIFFS with a
justification in .claude/specs/import_name_resolution_tdd_plan.md.
"""

from __future__ import annotations

import re

import pytest

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
