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

# Exact lines as produced by diff_snapshots().
ACCEPTED_DIFFS: set[str] = set()

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
    assert normalize(new["warnings"]) - normalize(old["warnings"]) == set()
