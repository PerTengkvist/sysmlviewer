"""Electric car sequences: facts frozen before the occurrence migration (phase 3)."""

from __future__ import annotations

import pytest

from sequence_migration_fixture import (
    collect_legacy,
    load_electric_car_elements,
    load_fixture,
)

ACTORS = {"Driver", "Passenger", "Charger"}
CAR = "LogicalArchitecture::Car"


@pytest.fixture(scope="module")
def elements():
    return load_electric_car_elements()


@pytest.fixture(scope="module")
def fixture():
    return load_fixture()


def test_fixture_matches_legacy_model(elements, fixture):
    assert collect_legacy(elements) == fixture


def test_every_lifeline_is_used_by_a_message(fixture):
    unused = {
        seq: sorted(set(f["lifelines"]) - set(f["defaultOrder"]))
        for seq, f in fixture.items()
        if set(f["lifelines"]) - set(f["defaultOrder"])
    }
    assert unused == {}


def test_message_names_unique_and_not_lifeline_names(fixture):
    clashes = {}
    for seq, f in fixture.items():
        names = [m["name"] for m in f["messages"]]
        lifeline_names = {ll.rsplit("::", 1)[-1] for ll in f["lifelines"]}
        bad = sorted({n for n in names if names.count(n) > 1} | (set(names) & lifeline_names))
        if bad:
            clashes[seq] = bad
    assert clashes == {}


def test_lifeline_names_are_car_parts_or_actors(elements, fixture):
    names = {ll.rsplit("::", 1)[-1] for f in fixture.values() for ll in f["lifelines"]}
    car_parts = {
        e.name for e in elements.values() if e.parent_id == CAR and e.kind.value == "part"
    }
    assert len(fixture) == 23
    assert names & ACTORS == ACTORS
    logical = names - ACTORS
    assert len(logical) == 24
    assert logical <= car_parts
    assert len(car_parts) == 27
    assert car_parts - logical == {"chassis", "suspension", "body"}
