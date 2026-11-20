"""Electric car sequences after the migration to occurrence defs (phase 3).

The facts in fixtures/sequence_migration.json were frozen from the legacy
`interaction def` form (see sequence_migration_fixture.py) and must still hold."""

from __future__ import annotations

import pytest

from domain.models import ArtifactKind
from domain.occurrence import in_occurrence, sequence_lifelines
from sequence_migration_fixture import EXAMPLE, load_electric_car_elements, load_fixture

ACTORS = {"Driver", "Passenger", "Charger"}
CAR = "LogicalArchitecture::Car"
EXAMPLE_SEQUENCES = EXAMPLE / "dynamics" / "sequences.sysml"


@pytest.fixture(scope="module")
def elements():
    return load_electric_car_elements()


@pytest.fixture(scope="module")
def fixture():
    return load_fixture()


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


def _sequences(elements):
    return {
        e.id: e
        for e in elements.values()
        if e.kind == ArtifactKind.OCCURRENCE and e.parent_id == "Dynamics"
    }


def _cap(name: str) -> str:
    return name[0].upper() + name[1:]


def test_every_sequence_is_an_occurrence_def(elements, fixture):
    kinds = [e.kind for e in elements.values()]
    assert set(_sequences(elements)) == set(fixture)
    assert len(_sequences(elements)) == 23
    assert ArtifactKind.INTERACTION not in kinds
    assert ArtifactKind.LIFELINE not in kinds
    assert all(e.is_definition for e in _sequences(elements).values())


def test_lifeline_ids_are_preserved(elements, fixture):
    for seq_id, facts in fixture.items():
        lifelines = sequence_lifelines(elements, seq_id)
        assert set(lifelines) == set(facts["lifelines"]), seq_id
        # The default order is first appearance in the messages, as the frontend
        # derives it, so a saved sequenceLayout keeps its meaning.
        assert lifelines == facts["defaultOrder"], seq_id
        declared = [c for c in elements[seq_id].children if elements[c].kind == ArtifactKind.PART]
        assert declared == facts["lifelines"], seq_id


def test_messages_preserved_in_order(elements, fixture):
    for seq_id, facts in fixture.items():
        seq = elements[seq_id]
        messages = [elements[c] for c in seq.children if elements[c].kind == ArtifactKind.MESSAGE]
        got = [
            (m.name, m.source_id, m.target_id, "reply" in [k.lower() for k in m.metadata_keywords or []])
            for m in messages
        ]
        want = [(m["name"], m["sourceId"], m["targetId"], m["reply"]) for m in facts["messages"]]
        assert got == want, seq_id
        assert [m.id for m in messages] == [f"{seq_id}::{m['name']}" for m in facts["messages"]]


def test_migrated_messages_keep_their_ends(elements, fixture):
    """The old msgN id and the new name id carry the same ends."""
    for seq_id, facts in fixture.items():
        for old in facts["messages"]:
            new = elements[f"{seq_id}::{old['name']}"]
            assert (new.source_id, new.target_id) == (old["sourceId"], old["targetId"])
            assert f"{seq_id}::msg" not in new.id


def test_lifelines_are_typed_instances(elements, fixture):
    actors = {"Driver", "Passenger", "Charger"}
    seen = 0
    for facts in fixture.values():
        for ll_id in facts["lifelines"]:
            ll = elements[ll_id]
            seen += 1
            assert ll.kind == ArtifactKind.PART and not ll.is_definition
            assert ll.is_reference, ll_id
            want = (
                f"Dynamics::{ll.name}"
                if ll.name in actors
                else f"LogicalArchitecture::Types::{_cap(ll.name)}"
            )
            assert ll.type_target_id == want, ll_id
    assert seen == 152
    relations = [
        e
        for e in elements.values()
        if e.kind in (ArtifactKind.SUBSETTING, ArtifactKind.REDEFINITION)
        and in_occurrence(elements, e.source_id or "")
    ]
    assert relations == []
    # no materialised parts: every part of a sequence is a direct child
    parts = [e for e in elements.values() if e.kind == ArtifactKind.PART and in_occurrence(elements, e.id)]
    assert all(elements[e.parent_id].kind == ArtifactKind.OCCURRENCE for e in parts)


def test_actor_part_defs_live_in_dynamics(elements):
    for name in ("Driver", "Passenger", "Charger"):
        d = elements[f"Dynamics::{name}"]
        assert d.kind == ArtifactKind.PART and d.is_definition


def test_car_parts_typed_by_logical_defs(elements):
    car_parts = [e for e in elements.values() if e.parent_id == CAR and e.kind == ArtifactKind.PART]
    assert len(car_parts) == 27
    for part in car_parts:
        assert part.type_target_id == f"LogicalArchitecture::Types::{_cap(part.name)}", part.id
    types = [
        e for e in elements.values() if e.parent_id == "LogicalArchitecture::Types"
    ]
    assert len(types) == 27
    assert all(t.kind == ArtifactKind.PART and t.is_definition for t in types)
    # Nothing is inherited from the empty defs: the children of a Car part are its own.
    for part in car_parts:
        assert all(c.startswith(part.id + "::") for c in part.children)
    assert elements["LogicalArchitecture::Types"].parent_id == "LogicalArchitecture"


def test_no_message_has_event_warnings():
    from adapters.parser.subset_parser import SubsetSysmlParser
    from domain.models import SysmlFile
    from sequence_migration_fixture import EXAMPLE

    files = [
        SysmlFile(
            id=p.relative_to(EXAMPLE).as_posix(),
            name=p.name,
            content=p.read_text(encoding="utf-8"),
            path=p.relative_to(EXAMPLE).as_posix(),
        )
        for p in sorted(EXAMPLE.rglob("*.sysml"))
    ]
    result = SubsetSysmlParser().parse_project(files)
    assert result.warnings == []
    assert all(
        m.source_event_id is None and m.target_event_id is None
        for m in result.elements.values()
        if m.kind == ArtifactKind.MESSAGE
    )


def test_sequences_file_parses_alone_without_warnings():
    from adapters.parser.subset_parser import SubsetSysmlParser
    from sequence_migration_fixture import EXAMPLE

    path = EXAMPLE / "dynamics" / "sequences.sysml"
    result = SubsetSysmlParser().parse(path.read_text(encoding="utf-8"), "dynamics/sequences.sysml")
    assert result.warnings == []


def test_reply_is_capitalised_with_a_metadata_def(elements, fixture):
    replies = [
        m
        for m in elements.values()
        if m.kind == ArtifactKind.MESSAGE and m.metadata_keywords
    ]
    assert len(replies) == sum(1 for f in fixture.values() for m in f["messages"] if m["reply"])
    assert all(m.metadata_keywords == ["Reply"] for m in replies)
    text = (EXAMPLE_SEQUENCES).read_text(encoding="utf-8")
    assert "metadata def Reply;" in text
    assert "#reply" not in text and "interaction def" not in text and "lifeline " not in text
    assert "then message" not in text and "then #" not in text


def test_type_stub_docs_point_to_the_car_part_docs():
    """A lifeline's docs fall back to its type's doc; the stub says where the real one is."""
    docs = EXAMPLE / "logical_architecture" / "docs"
    stubs = sorted(docs.glob("LogicalArchitecture.Types.*.md"))
    assert len(stubs) == 27
    for stub in stubs:
        name = stub.name.removeprefix("LogicalArchitecture.Types.").removesuffix(".md")
        target = f"LogicalArchitecture.{name[0].lower()}{name[1:]}.md"
        assert (docs / target).is_file(), target
        assert f"({target})" in stub.read_text(encoding="utf-8"), stub.name
