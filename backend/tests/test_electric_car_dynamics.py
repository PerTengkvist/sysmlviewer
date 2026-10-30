"""Dynamics rules for the electric car: one sequence per use case, lifelines are
logical parts, every driver action is acknowledged, modes come from a state
machine."""

import re
from pathlib import Path

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from application.project_service import ProjectService
from domain.models import ArtifactKind, SysmlFile

ROOT = resolve_repo_root() / "examples" / "electric_car"
CAR = "LogicalArchitecture::Car"
ACTORS = {"Driver", "Passenger", "Charger"}
MODES = "Dynamics::VehicleModes"
EXTRA_SEQUENCES = {"UnlockDeniedSequence", "EndChargeSequence"}


def _load():
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel)
        )
    return SubsetSysmlParser().parse_project(files).elements


def _interactions(elements):
    return {
        e.name: e
        for e in elements.values()
        if e.kind == ArtifactKind.INTERACTION and e.parent_id == "Dynamics"
    }


def _messages(elements, interaction):
    return sorted(
        (
            e
            for e in elements.values()
            if e.kind == ArtifactKind.MESSAGE and e.parent_id == interaction.id
        ),
        key=lambda e: int(e.id.rsplit("msg", 1)[-1]),
    )


def _lifelines(elements, interaction):
    return {
        e.id: e
        for e in elements.values()
        if e.kind == ArtifactKind.LIFELINE and e.parent_id == interaction.id
    }


def test_every_use_case_has_sequence_and_view():
    elements = _load()
    interactions = _interactions(elements)
    use_cases = [e for e in elements.values() if e.kind == ArtifactKind.USE_CASE]
    assert use_cases
    for uc in use_cases:
        assert f"{uc.name}Sequence" in interactions, uc.name
        assert f"Dynamics::{uc.name}SequenceView" in elements, uc.name
    expected = {f"{uc.name}Sequence" for uc in use_cases} | EXTRA_SEQUENCES
    assert set(interactions) == expected


def test_sequences_are_chains():
    elements = _load()
    short = {
        name: len(_messages(elements, it))
        for name, it in _interactions(elements).items()
        if len(_messages(elements, it)) < 5
    }
    assert short == {}


def test_lifelines_are_logical_parts_or_actors():
    elements = _load()
    part_names = {
        e.name for e in elements.values() if e.kind == ArtifactKind.PART and e.parent_id == CAR
    }
    allowed = part_names | ACTORS
    bad = sorted(
        (it.name, ll.name)
        for it in _interactions(elements).values()
        for ll in _lifelines(elements, it).values()
        if ll.name not in allowed
    )
    assert bad == []


def test_messages_resolve_within_interaction():
    elements = _load()
    for it in _interactions(elements).values():
        lifelines = _lifelines(elements, it)
        for msg in _messages(elements, it):
            assert msg.source_id in lifelines, (it.name, msg.name, msg.source_id)
            assert msg.target_id in lifelines, (it.name, msg.name, msg.target_id)
            assert msg.source_id != msg.target_id, (it.name, msg.name)


def test_driver_actions_are_acknowledged():
    elements = _load()
    for it in _interactions(elements).values():
        lifelines = _lifelines(elements, it)
        msgs = _messages(elements, it)
        first, last = msgs[0], msgs[-1]
        initiator = lifelines[first.source_id].name
        if initiator not in ACTORS:
            continue
        assert lifelines[last.target_id].name == initiator, (it.name, last.name)
        assert "reply" in (last.metadata_keywords or []), (it.name, last.name)


def test_interaction_docs_state_pre_and_post_conditions():
    elements = _load()
    states = {
        e.name for e in elements.values() if e.kind == ArtifactKind.STATE and e.parent_id == MODES
    }
    assert states == {"Locked", "Unlocked", "Ready", "Driving", "Parked", "Charging"}
    pattern = re.compile(r"Precondition (\w+)\. Postcondition (\w+)\.")
    for it in _interactions(elements).values():
        m = pattern.search(it.documentation or "")
        assert m, (it.name, it.documentation)
        assert m.group(1) in states, (it.name, m.group(1))
        assert m.group(2) in states, (it.name, m.group(2))


def test_vehicle_modes_transitions_map_to_sequences():
    elements = _load()
    interactions = _interactions(elements)
    transitions = [
        e for e in elements.values() if e.kind == ArtifactKind.TRANSITION and e.parent_id == MODES
    ]
    assert len(transitions) >= 8
    for t in transitions:
        seq = t.name[0].upper() + t.name[1:] + "Sequence"
        assert seq in interactions, t.name
        assert t.source_id in elements and t.target_id in elements, t.name
        doc = interactions[seq].documentation or ""
        pre, post = elements[t.source_id].name, elements[t.target_id].name
        assert f"Precondition {pre}. Postcondition {post}." in doc, (t.name, doc)


def test_state_view_renders():
    repo = WorkspaceProjectRepository(ROOT)
    project = repo.get_open()
    service = ProjectService(repo=repo, parser=SubsetSysmlParser())
    view = service.get_view(project.id, "Dynamics::VehicleModesView")
    assert view["diagramMode"] == "state"
    # The state def itself is also kind "state"; count only the modes inside it.
    assert (
        sum(
            1
            for e in view["semantic"].values()
            if e["kind"] == "state" and e["parentId"] == MODES
        )
        == 6
    )
    assert sum(1 for e in view["semantic"].values() if e["kind"] == "transition") >= 8

    brake = service.get_view(project.id, "Dynamics::BrakeSequenceView")
    assert brake["diagramMode"] == "sequence"
    replies = [
        e
        for e in brake["semantic"].values()
        if e["kind"] == "message" and "reply" in (e.get("metadataKeywords") or [])
    ]
    assert replies


def _names_by_role(elements, it):
    lifelines = _lifelines(elements, it)
    return [
        (m.name, lifelines[m.source_id].name, lifelines[m.target_id].name)
        for m in _messages(elements, it)
    ]


def test_physics_guards():
    elements = _load()
    interactions = _interactions(elements)
    accelerate = _names_by_role(elements, interactions["AccelerateSequence"])
    assert not any(src == "battery" and tgt == "engine" for _, src, tgt in accelerate)
    assert any(tgt == "engine" and src == "driveController" for _, src, tgt in accelerate)

    brake = _names_by_role(elements, interactions["BrakeSequence"])
    assert any(tgt == "frictionBrakes" for _, _, tgt in brake)
    assert any(tgt == "lamps" for _, _, tgt in brake)
    assert any(tgt == "engine" for _, _, tgt in brake)

    brake_names = {n for n, _, _ in brake}
    emergency_names = {n for n, _, _ in _names_by_role(elements, interactions["EmergencyStopSequence"])}
    assert brake_names <= emergency_names
    assert emergency_names - brake_names


def test_documentation_files_for_dynamics():
    elements = _load()
    missing = []
    for el in elements.values():
        if el.kind not in {ArtifactKind.INTERACTION, ArtifactKind.VIEW} or el.parent_id != "Dynamics":
            continue
        path = ROOT / "dynamics" / "docs" / f"Dynamics.{el.name}.md"
        if not path.is_file():
            missing.append(path.name)
    assert missing == []
