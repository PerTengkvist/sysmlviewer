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
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: warning added {_new!r}")
    ACCEPTED_DIFFS.add(f"project:examples/diagrams: warning removed {_old!r}")

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


def test_examples_match_endpoint_snapshot(current):
    unexpected = [
        d for d in diff_snapshots(load_fixture(), current) if d not in ACCEPTED_DIFFS
    ]
    assert unexpected == []


@pytest.mark.parametrize("key", snapshot_keys())
def test_examples_add_no_warnings(current, key):
    old = load_fixture()[key]
    new = current[key]
    accepted = {normalize([n]).pop() for _, n in _OLD_NEW_WARNINGS}
    added = normalize(new["warnings"]) - normalize(old["warnings"]) - accepted
    assert added == set()
