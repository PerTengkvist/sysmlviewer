"""The electric-car example replaces the data-center model and stays consistent."""

from pathlib import Path

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from application.project_service import ProjectService
from domain.models import ArtifactKind, SysmlFile

ROOT = resolve_repo_root() / "examples" / "electric_car"

SEQUENCES = {
    "Unlock": "UnlockSequence",
    "Lock": "LockSequence",
    "ChangeGear": "ChangeGearSequence",
    "TurnLeft": "TurnLeftSequence",
    "TurnRight": "TurnRightSequence",
    "Brake": "BrakeSequence",
    "Accelerate": "AccelerateSequence",
    "EmergencyStop": "EmergencyStopSequence",
    "Charge": "ChargeSequence",
    "Park": "ParkSequence",
    "AdjustClimate": "AdjustClimateSequence",
    "PlayMedia": "PlayMediaSequence",
    "CleanWindshield": "CleanWindshieldSequence",
}


def _load():
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            SysmlFile(
                id=rel,
                name=path.name,
                content=path.read_text(encoding="utf-8"),
                path=rel,
            )
        )
    return SubsetSysmlParser().parse_project(files)


def test_electric_car_parses_without_warnings():
    result = _load()
    assert result.warnings == []
    names = {e.name for e in result.elements.values() if e.kind == ArtifactKind.PACKAGE}
    assert names == {
        "Requirements",
        "Functions",
        "UseCases",
        "LogicalArchitecture",
        "Dynamics",
        "PhysicalArchitecture",
    }


def test_physical_parts_implement_logical_parts():
    elements = _load().elements
    root_id = "PhysicalArchitecture::VehiclePhysical"
    sources = {
        e.source_id
        for e in elements.values()
        if e.kind == ArtifactKind.DEPENDENCY
        and "implements" in (e.metadata_keywords or [])
        and e.source_id in elements
        and e.target_id in elements
    }

    def check(part_id: str) -> None:
        part = elements[part_id]
        if "Logical" in (part.metadata_keywords or []):
            return
        assert part_id in sources, part_id
        for child_id in part.children:
            child = elements.get(child_id)
            if child and child.kind == ArtifactKind.PART:
                check(child_id)

    check(root_id)


def _assert_provider_and_consumer(package_id: str) -> None:
    elements = _load().elements
    interfaces = [
        e
        for e in elements.values()
        if e.kind == ArtifactKind.INTERFACE and e.parent_id == package_id
    ]
    assert interfaces
    ports = [
        e
        for e in elements.values()
        if e.kind == ArtifactKind.PORT and e.id.startswith(f"{package_id}::")
    ]
    for iface in interfaces:
        typed = [p for p in ports if p.type_ref == iface.name]
        assert any(p.name.endswith("Out") for p in typed), iface.name
        assert any(p.name.endswith("In") for p in typed), iface.name
        wired = [
            c
            for c in elements.values()
            if c.kind == ArtifactKind.CONNECTION
            and c.source_id
            and c.target_id
            and elements.get(c.source_id)
            and elements.get(c.target_id)
            and elements[c.source_id].type_ref == iface.name
            and elements[c.target_id].type_ref == iface.name
        ]
        assert wired, iface.name
        assert all(elements[c.source_id].name.endswith("Out") for c in wired)
        assert all(elements[c.target_id].name.endswith("In") for c in wired)


def test_logical_and_physical_interfaces_have_both_sides():
    _assert_provider_and_consumer("LogicalArchitecture")
    _assert_provider_and_consumer("PhysicalArchitecture")


def test_user_stories_and_use_case_sequences():
    elements = _load().elements
    stories = [
        e
        for e in elements.values()
        if e.kind == ArtifactKind.REQUIREMENT and e.short_id and e.short_id.startswith("US-")
    ]
    assert len(stories) == 7
    for story in stories:
        type_attr = next(
            elements[cid]
            for cid in story.children
            if elements[cid].kind == ArtifactKind.ATTRIBUTE and elements[cid].name == "Type"
        )
        assert type_attr.default_value == '"UserStory"'

    for use_case, interaction in SEQUENCES.items():
        assert f"UseCases::{use_case}" in elements
        assert f"Dynamics::{interaction}" in elements
        assert f"Dynamics::{interaction}View" in elements


def test_documentation_files_match_artifacts():
    elements = _load().elements
    documented = {
        ArtifactKind.PACKAGE,
        ArtifactKind.PART,
        ArtifactKind.VIEW,
        ArtifactKind.REQUIREMENT,
        ArtifactKind.USE_CASE,
        ArtifactKind.ACTOR,
        ArtifactKind.INTERACTION,
    }
    missing = []
    for el in elements.values():
        if el.kind not in documented or not el.file_id or "/" not in el.file_id:
            continue
        folder = el.file_id.rsplit("/", 1)[0]
        path = ROOT / folder / "docs" / f"{el.name}.md"
        if not path.is_file():
            missing.append(str(path.relative_to(ROOT)))
    assert missing == []


def test_shipped_views_render_requested_diagrams():
    repo = WorkspaceProjectRepository(ROOT)
    project = repo.get_open()
    assert project is not None
    assert project.name == "Electric Car"
    service = ProjectService(repo=repo, parser=SubsetSysmlParser())

    functions = service.get_view(project.id, "Functions::FunctionsView")
    assert functions["diagramMode"] == "structure"
    assert sum(1 for e in functions["semantic"].values() if e["kind"] == "dependency") == 12

    use_cases = service.get_view(project.id, "UseCases::VehicleUseCaseView")
    assert use_cases["diagramMode"] == "useCase"

    table = service.get_view(project.id, "Requirements::RequirementsTableView")
    assert table["diagramMode"] == "requirementTable"

    physical = service.get_view(project.id, "PhysicalArchitecture::PhysicalView")
    assert physical["diagramMode"] == "whitebox"
    assert physical["hierarchicalLevels"] == 3
    assert any(e["name"] == "entertainmentSw" for e in physical["semantic"].values())
    assert (
        sum(
            1
            for e in physical["semantic"].values()
            if e["kind"] == "dependency" and "implements" in (e.get("metadataKeywords") or [])
        )
        == 30
    )

    unlock = service.get_view(project.id, "Dynamics::UnlockSequenceView")
    assert unlock["diagramMode"] == "sequence"
    assert sum(1 for e in unlock["semantic"].values() if e["kind"] == "message") == 4
