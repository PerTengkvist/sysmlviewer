"""The electric-car example replaces the data-center model and stays consistent."""

from pathlib import Path

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from application.project_service import ProjectService
from domain.models import ArtifactKind, SysmlFile

ROOT = resolve_repo_root() / "examples" / "electric_car"



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
    names = {
        e.name
        for e in result.elements.values()
        if e.kind == ArtifactKind.PACKAGE and e.parent_id is None
    }
    assert names == {
        "Requirements",
        "Functions",
        "FunctionTraceability",
        "UseCases",
        "LogicalArchitecture",
        "Dynamics",
        "PhysicalArchitecture",
    }
    assert "PhysicalArchitecture::LogicalCounterparts" in result.elements


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
        # Peer (non-nested) connections keep Out→In. Parent↔child proxy
        # ports use bind (not connection).
        def _owner(port_id: str) -> str | None:
            return elements[port_id].parent_id

        def _nested(a: str | None, b: str | None) -> bool:
            if not a or not b:
                return False
            return a.startswith(b + "::") or b.startswith(a + "::")

        peer = [
            c
            for c in wired
            if not _nested(_owner(c.source_id), _owner(c.target_id))
        ]
        assert peer, iface.name
        assert all(elements[c.source_id].name.endswith("Out") for c in peer)
        assert all(elements[c.target_id].name.endswith("In") for c in peer)


def test_logical_and_physical_interfaces_have_both_sides():
    _assert_provider_and_consumer("LogicalArchitecture")
    _assert_provider_and_consumer("PhysicalArchitecture")


def test_physical_ecu_proxy_ports_and_connection_owners():
    """Cross-boundary signals go via ECU proxy ports, not nested SW ports."""
    elements = _load().elements
    vp = "PhysicalArchitecture::VehiclePhysical"
    ecu_ports = {
        "vehicleEcu": {"credentialIn", "startIn", "driveEnableOut", "feedbackOut"},
        "driveEcu": {
            "driveEnableIn",
            "torqueIn",
            "brakeIn",
            "gearIn",
            "directionIn",
            "torqueCommandOut",
            "brakeCommandOut",
            "gearCommandOut",
            "directionCommandOut",
        },
        "bodyEcu": {"lockOut", "doorOut", "windowOut", "lampOut", "wipeOut"},
        "engineEcu": {"gearCommandIn", "torqueCommandIn"},
        "batteryEcu": {"energyOut", "chargeIn"},
    }
    for ecu, names in ecu_ports.items():
        parent = f"{vp}::{ecu}"
        found = {
            e.name
            for e in elements.values()
            if e.kind == ArtifactKind.PORT and e.parent_id == parent
        }
        assert names <= found, (ecu, found)

    direct_children = {
        e.id
        for e in elements.values()
        if e.kind == ArtifactKind.PART and e.parent_id == vp
    }
    conns = [
        e
        for e in elements.values()
        if e.kind == ArtifactKind.CONNECTION and e.id.startswith(f"{vp}::")
    ]
    binds = [
        e
        for e in elements.values()
        if e.kind == ArtifactKind.BINDING and e.id.startswith(f"{vp}::")
    ]
    # 24 external peer links + 22 internal ECU↔SW bindings
    assert len(conns) == 24
    assert len(binds) == 22

    for c in conns:
        sp = elements[c.source_id]
        tp = elements[c.target_id]
        src_owner = sp.parent_id
        tgt_owner = tp.parent_id
        assert src_owner and tgt_owner
        # External peers: both ends owned by VehiclePhysical direct children
        assert src_owner in direct_children, (c.name, src_owner)
        assert tgt_owner in direct_children, (c.name, tgt_owner)

    for b in binds:
        sp = elements[b.source_id]
        tp = elements[b.target_id]
        src_owner = sp.parent_id
        tgt_owner = tp.parent_id
        assert src_owner and tgt_owner
        # Internal: ECU proxy port ↔ nested SW port
        same_ecu = src_owner == tgt_owner or src_owner.startswith(
            tgt_owner + "::"
        ) or tgt_owner.startswith(src_owner + "::")
        assert same_ecu, (b.name, src_owner, tgt_owner)


def test_user_stories_are_typed():
    elements = _load().elements
    stories = [
        e
        for e in elements.values()
        if e.kind == ArtifactKind.REQUIREMENT and e.short_id and e.short_id.startswith("US-")
    ]
    assert len(stories) == 9
    for story in stories:
        type_attr = next(
            elements[cid]
            for cid in story.children
            if elements[cid].kind == ArtifactKind.ATTRIBUTE and elements[cid].name == "Type"
        )
        assert type_attr.default_value == '"UserStory"'



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
        # Docs are named <Package>[.<SubPackage>…].<name>.md (package chain only).
        packages = []
        cur = elements.get(el.parent_id) if el.parent_id else None
        while cur is not None:
            if cur.kind == ArtifactKind.PACKAGE:
                packages.insert(0, cur.name)
            cur = elements.get(cur.parent_id) if cur.parent_id else None
        path = ROOT / folder / "docs" / (".".join([*packages, el.name]) + ".md")
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
    # Logical counterparts live outside VehiclePhysical; implements filtered out of whitebox
    assert not any(
        e["kind"] == "dependency" and "implements" in (e.get("metadataKeywords") or [])
        for e in physical["semantic"].values()
    )
    assert not any(
        "Logical" in (e.get("metadataKeywords") or [])
        for e in physical["semantic"].values()
    )

    physical_deps = service.get_view(
        project.id,
        "PhysicalArchitecture::PhysicalDependenciesView",
        hierarchical_levels=3,
    )
    assert physical_deps["diagramMode"] == "whitebox"
    assert (
        sum(
            1
            for e in physical_deps["semantic"].values()
            if e["kind"] == "dependency"
            and "implements" in (e.get("metadataKeywords") or [])
        )
        == 40
    )
    assert any(
        e["id"] == "PhysicalArchitecture::LogicalCounterparts::car"
        for e in physical_deps["semantic"].values()
    )

    unlock = service.get_view(project.id, "Dynamics::UnlockSequenceView")
    assert unlock["diagramMode"] == "sequence"
    unlock_msgs = [
        e for e in unlock["semantic"].values() if e["kind"] == "message"
    ]
    assert len(unlock_msgs) == 8
    assert any(e["name"] == "credential" for e in unlock_msgs)

    logical = service.get_view(
        project.id, "LogicalArchitecture::CarLogicalView", hierarchical_levels=3
    )
    assert logical["diagramMode"] == "whitebox"
    assert sum(1 for e in logical["semantic"].values() if e["kind"] == "dependency") == 0
    assert sum(1 for e in logical["semantic"].values() if e["kind"] == "connection") == 24

    logical_deps = service.get_view(
        project.id,
        "LogicalArchitecture::CarLogicalDependenciesView",
        hierarchical_levels=3,
    )
    assert logical_deps["diagramMode"] == "whitebox"
    assert (
        sum(1 for e in logical_deps["semantic"].values() if e["kind"] == "connection")
        == 0
    )
    assert (
        sum(1 for e in logical_deps["semantic"].values() if e["kind"] == "dependency")
        == 39
    )


# --- Logical architecture: controllers, routing and traceability -------------

CAR = "LogicalArchitecture::Car"
CONTROLLERS = {"vehicleController", "driveController", "bodyController"}
NEW_LOGICAL_PARTS = CONTROLLERS | {
    "startButton",
    "keyFob",
    "doors",
    "windowLifts",
    "frictionBrakes",
    "instrumentCluster",
}


def _parts_under(elements, root_id):
    return {
        e.name: e
        for e in elements.values()
        if e.kind == ArtifactKind.PART and e.parent_id == root_id
    }


def test_logical_controllers_exist():
    parts = _parts_under(_load().elements, CAR)
    assert NEW_LOGICAL_PARTS <= set(parts), sorted(NEW_LOGICAL_PARTS - set(parts))


def test_driver_controls_route_through_drive_controller():
    elements = _load().elements
    driver_controls = {"acceleratorPedal", "brakePedal", "gearStick", "steeringWheel"}
    actuators = {"engine", "wheels", "frictionBrakes"}
    for c in elements.values():
        if c.kind != ArtifactKind.CONNECTION or not c.id.startswith(CAR + "::"):
            continue
        src_owner = elements[elements[c.source_id].parent_id].name
        tgt_owner = elements[elements[c.target_id].parent_id].name
        if src_owner in driver_controls:
            assert tgt_owner == "driveController", (c.name, src_owner, tgt_owner)
        if tgt_owner in actuators and src_owner != "battery":
            assert src_owner == "driveController", (c.name, src_owner, tgt_owner)


def test_every_satisfy_source_exists():
    elements = _load().elements
    satisfies = [e for e in elements.values() if e.kind == ArtifactKind.SATISFY]
    assert satisfies
    missing = [s.source_id for s in satisfies if s.source_id not in elements]
    assert missing == []
    assert all(s.target_id in elements for s in satisfies)


def test_every_logical_part_is_implemented():
    """Converse of test_physical_parts_implement_logical_parts."""
    elements = _load().elements
    counterparts = {
        e.name: e.id
        for e in elements.values()
        if e.kind == ArtifactKind.PART
        and e.parent_id == "PhysicalArchitecture::LogicalCounterparts"
    }
    implemented = {
        e.target_id
        for e in elements.values()
        if e.kind == ArtifactKind.DEPENDENCY
        and "implements" in (e.metadata_keywords or [])
    }
    not_implemented = sorted(
        name
        for name in _parts_under(elements, CAR)
        if counterparts.get(name) not in implemented
    )
    assert not_implemented == []


# --- Use cases: Driving / Managing split and user-story refinement ----------

DRIVING_USE_CASES = {
    "StartVehicle",
    "StopVehicle",
    "ChangeGear",
    "Accelerate",
    "Brake",
    "EmergencyStop",
    "TurnLeft",
    "TurnRight",
    "CleanWindshield",
    "ToggleHeadlights",
    "Park",
    "Drive",
}
MANAGING_USE_CASES = {
    "Unlock",
    "Lock",
    "OpenDoor",
    "CloseDoor",
    "OpenWindow",
    "CloseWindow",
    "AdjustClimate",
    "PlayMedia",
    "Charge",
}
COMPOSITE_USE_CASES = {"Drive", "Park"}


def _use_cases(elements):
    return [e for e in elements.values() if e.kind == ArtifactKind.USE_CASE]


def test_use_cases_split_into_driving_and_managing():
    elements = _load().elements
    assert "UseCases::Driving" in elements
    assert "UseCases::Managing" in elements
    by_parent: dict[str, set[str]] = {}
    for uc in _use_cases(elements):
        by_parent.setdefault(uc.parent_id, set()).add(uc.name)
    assert by_parent == {
        "UseCases::Driving": DRIVING_USE_CASES,
        "UseCases::Managing": MANAGING_USE_CASES,
    }


def test_composites_include_their_steps():
    elements = _load().elements
    includes = {
        (elements[e.source_id].name, elements[e.target_id].name)
        for e in elements.values()
        if e.kind == ArtifactKind.INCLUDE and e.source_id in elements and e.target_id in elements
    }
    assert ("Drive", "StartVehicle") in includes
    assert ("Park", "StopVehicle") in includes
    assert ("Park", "Lock") in includes


def test_every_use_case_has_an_objective():
    elements = _load().elements
    objectives = {
        e.source_id
        for e in elements.values()
        if e.kind == ArtifactKind.DEPENDENCY
        and "objective" in (e.metadata_keywords or [])
        and e.target_id in elements
        and elements[e.target_id].kind == ArtifactKind.REQUIREMENT
    }
    missing = sorted(uc.name for uc in _use_cases(elements) if uc.id not in objectives)
    assert missing == []


def _objectives(elements) -> dict[str, set[str]]:
    """Use case name → names of the requirements it pursues with `objective`."""
    out: dict[str, set[str]] = {}
    for e in elements.values():
        if (
            e.kind == ArtifactKind.DEPENDENCY
            and "objective" in (e.metadata_keywords or [])
            and e.source_id in elements
            and e.target_id in elements
        ):
            out.setdefault(elements[e.source_id].name, set()).add(elements[e.target_id].name)
    return out


def test_functional_requirements_are_use_case_objectives():
    """Immobilizer and TopSpeed are pursued by the use cases that exercise them."""
    objectives = _objectives(_load().elements)
    assert objectives["StartVehicle"] == {"PowerModes", "Immobilizer"}
    assert objectives["Accelerate"] == {"Acceleration", "TopSpeed"}


def test_every_use_case_refines_a_user_story():
    elements = _load().elements
    refines = [
        e
        for e in elements.values()
        if e.kind == ArtifactKind.DEPENDENCY
        and "refine" in (e.metadata_keywords or [])
        and e.source_id in elements
        and elements[e.source_id].kind == ArtifactKind.USE_CASE
    ]
    stories = {
        e.id
        for e in elements.values()
        if e.kind == ArtifactKind.REQUIREMENT and (e.short_id or "").startswith("US-")
    }
    for r in refines:
        assert r.target_id in stories, (elements[r.source_id].name, r.target_id)
    refining = {r.source_id for r in refines}
    unrefined = sorted(
        uc.name for uc in _use_cases(elements) if uc.id not in refining
    )
    assert unrefined == []
    refined_stories = {r.target_id for r in refines}
    assert sorted(stories - refined_stories) == []


def test_use_case_view_exposes_both_packages():
    repo = WorkspaceProjectRepository(ROOT)
    project = repo.get_open()
    service = ProjectService(repo=repo, parser=SubsetSysmlParser())
    view = service.get_view(project.id, "UseCases::VehicleUseCaseView")
    assert view["diagramMode"] == "useCase"
    shown = {e["name"] for e in view["semantic"].values() if e["kind"] == "useCase"}
    assert shown == DRIVING_USE_CASES | MANAGING_USE_CASES


# --- Functions: functional entities allocated to logical parts ---------------


def _functions_and_entities(elements):
    # Abstract `Function` / `FunctionNode` are the bases, not functions.
    functions = {
        e.id: e
        for e in elements.values()
        if e.kind == ArtifactKind.PART
        and e.parent_id == "Functions"
        and not e.is_abstract
    }
    entities = [
        e
        for e in elements.values()
        if e.kind == ArtifactKind.PART and e.parent_id in functions
    ]
    return functions, entities


def test_every_function_decomposes_into_entities():
    functions, entities = _functions_and_entities(_load().elements)
    assert len(functions) == 8
    without = sorted(
        f.name for f in functions.values() if not any(e.parent_id == f.id for e in entities)
    )
    assert without == []


def test_functional_entities_are_allocated_exactly_once():
    elements = _load().elements
    _, entities = _functions_and_entities(elements)
    allocations = [e for e in elements.values() if e.kind == ArtifactKind.ALLOCATION]
    by_source: dict[str, list] = {}
    for a in allocations:
        by_source.setdefault(a.source_id, []).append(a)
    for ent in entities:
        allocs = by_source.get(ent.id, [])
        assert len(allocs) == 1, (ent.id, [a.target_id for a in allocs])
        target = elements.get(allocs[0].target_id)
        assert target is not None and target.parent_id == CAR, (ent.id, allocs[0].target_id)


def test_each_controller_comprises_entities():
    elements = _load().elements
    targets: dict[str, int] = {}
    for a in elements.values():
        if a.kind == ArtifactKind.ALLOCATION and a.target_id in elements:
            targets[elements[a.target_id].name] = targets.get(elements[a.target_id].name, 0) + 1
    for controller in CONTROLLERS:
        assert targets.get(controller, 0) >= 2, (controller, targets)


def test_function_views_render():
    repo = WorkspaceProjectRepository(ROOT)
    project = repo.get_open()
    service = ProjectService(repo=repo, parser=SubsetSysmlParser())
    functions = service.get_view(project.id, "Functions::FunctionsView")
    assert functions["diagramMode"] == "structure"
    assert sum(1 for e in functions["semantic"].values() if e["kind"] == "dependency") == 12
    assert not any(e["kind"] == "allocation" for e in functions["semantic"].values())

    allocation = service.get_view(
        project.id, "Functions::FunctionAllocationView", hierarchical_levels=3
    )
    allocs = [e for e in allocation["semantic"].values() if e["kind"] == "allocation"]
    assert len(allocs) >= 20
    assert any(e["name"] == "driveController" for e in allocation["semantic"].values())


# --- Functions: FunctionNode, action flows and one view per flow ------------

DECISION_TYPES = {"decide", "decision", "condition"}


def _flow_id(function_id: str) -> str:
    """The function's main flow, `<function>Flow`."""
    name = function_id.split("::")[-1]
    return f"{function_id}::{name[0].lower()}{name[1:]}Flow"


def _flow_ids(elements, function_id: str) -> list[str]:
    """Every action flow a function owns: its main flow first, then the rest."""
    flows = [
        c
        for c in elements[function_id].children
        if c in elements and elements[c].kind == ArtifactKind.ACTION
    ]
    main = _flow_id(function_id)
    return sorted(flows, key=lambda f: (f != main, f))


def _flow_view_name(function_id: str, flow_id: str) -> str:
    """`SecurityFlowView` for the main flow, `SecurityCabinAccessFlowView` for another."""
    name = function_id.split("::")[-1]
    if flow_id == _flow_id(function_id):
        return f"{name}FlowView"
    local = flow_id.split("::")[-1].removesuffix("Flow")
    return f"{name}{local[0].upper()}{local[1:]}FlowView"


def _flow_steps(elements, flow_id):
    flow = elements[flow_id]
    actions = [
        elements[c]
        for c in flow.children
        if c in elements and elements[c].kind == ArtifactKind.ACTION
    ]
    successions = [
        elements[c]
        for c in flow.children
        if c in elements and elements[c].kind == ArtifactKind.SUCCESSION
    ]
    return actions, successions


def _is_pseudo(action) -> bool:
    return (action.type_ref or "").lower() in {"start", "done"} | DECISION_TYPES


def test_function_and_function_node_are_abstract_defs():
    elements = _load().elements
    for name in ("Function", "FunctionNode"):
        el = elements[f"Functions::{name}"]
        assert el.kind == ArtifactKind.PART
        assert el.parent_id == "Functions"
        assert el.is_abstract is True
        assert el.type_ref is None
        assert el.documentation


def test_functional_entities_are_function_nodes():
    _, entities = _functions_and_entities(_load().elements)
    assert len(entities) == 24
    assert sorted(e.name for e in entities if e.type_ref != "FunctionNode") == []


def test_every_function_has_a_connected_flow():
    """At least one flow per function, its main flow among them; each connected."""
    elements = _load().elements
    functions, _ = _functions_and_entities(elements)
    for fid in functions:
        flow_ids = _flow_ids(elements, fid)
        assert flow_ids and flow_ids[0] == _flow_id(fid), (fid, flow_ids)
        for flow_id in flow_ids:
            assert elements[flow_id].documentation, flow_id
            actions, successions = _flow_steps(elements, flow_id)
            by_type = {(a.type_ref or "").lower(): a.id for a in actions}
            assert "start" in by_type and "done" in by_type, flow_id
            outs: dict[str, set[str]] = {}
            for s in successions:
                assert s.source_id in elements and s.target_id in elements, s.id
                outs.setdefault(s.source_id, set()).add(s.target_id)
            reached = {by_type["start"]}
            todo = [by_type["start"]]
            while todo:
                for nxt in outs.get(todo.pop(), ()):
                    if nxt not in reached:
                        reached.add(nxt)
                        todo.append(nxt)
            assert by_type["done"] in reached, flow_id
            assert sorted(a.name for a in actions if a.id not in reached) == [], flow_id
            steps = [a for a in actions if not _is_pseudo(a)]
            assert len(steps) >= 2, flow_id
            assert all(a.documentation for a in steps), flow_id


def test_every_flow_step_is_performed_by_one_entity_of_its_function():
    """Every entity performs a step in at least one of its function's flows."""
    from domain.perform import resolve_performers

    elements = _load().elements
    functions, entities = _functions_and_entities(elements)
    performers = resolve_performers(elements)
    performing: set[str] = set()
    for fid in functions:
        for flow_id in _flow_ids(elements, fid):
            actions, _ = _flow_steps(elements, flow_id)
            for step in actions:
                if _is_pseudo(step):
                    assert step.id not in performers, step.id
                    continue
                parts = performers.get(step.id, [])
                assert len(parts) == 1, (step.id, parts)
                assert elements[parts[0]].parent_id == fid, (step.id, parts)
                performing.add(parts[0])
    assert sorted(e.name for e in entities if e.id not in performing) == []


def test_every_flow_has_a_flow_view():
    elements = _load().elements
    functions, _ = _functions_and_entities(elements)
    repo = WorkspaceProjectRepository(ROOT)
    project = repo.get_open()
    service = ProjectService(repo=repo, parser=SubsetSysmlParser())
    for fid in functions:
        for flow_id in _flow_ids(elements, fid):
            name = _flow_view_name(fid, flow_id)
            view_id = f"Functions::{name}"
            view_el = elements.get(view_id)
            assert view_el is not None, view_id
            assert view_el.type_ref == "ActionFlowView"
            assert view_el.expose_refs == [flow_id]
            assert (ROOT / "views" / f"{name}.json").is_file(), view_id

            view = service.get_view(project.id, view_id)
            assert view["diagramMode"] == "actionFlow", view_id
            assert "modeError" not in view, view_id
            actions, _ = _flow_steps(elements, flow_id)
            assert {a.id for a in actions} <= set(view["visualization"]["nodes"]), view_id
            steps = {a.id for a in actions if not _is_pseudo(a)}
            assert set(view["performers"]) == steps, view_id
            assert view["hasViewLayout"] is True, view_id


def test_security_owns_doors_and_windows_on_the_body_controller():
    elements = _load().elements
    security = "Functions::Security"
    assert _flow_ids(elements, security) == [
        f"{security}::securityFlow",
        f"{security}::cabinAccessFlow",
    ]
    allocated = {
        a.source_id: a.target_id
        for a in elements.values()
        if a.kind == ArtifactKind.ALLOCATION
    }
    for name in ("doorControl", "windowControl", "lockControl"):
        entity = elements[f"{security}::{name}"]
        assert entity.documentation, name
        assert allocated[entity.id] == f"{CAR}::bodyController", name


def _succession_pairs(elements, flow_id):
    _, successions = _flow_steps(elements, flow_id)
    return {
        (elements[s.source_id].name, elements[s.target_id].name, s.name.startswith("if_"))
        for s in successions
    }


def test_branching_flows_have_the_intended_successions():
    elements = _load().elements
    assert _succession_pairs(elements, "Functions::Security::securityFlow") == {
        ("start", "checkCredential", False),
        ("checkCredential", "credentialValid", False),
        ("credentialValid", "unlockDoors", True),
        ("credentialValid", "rejectKey", True),
        ("unlockDoors", "wakeCabin", False),
        ("wakeCabin", "releaseImmobilizer", False),
        ("releaseImmobilizer", "showReady", False),
        ("showReady", "done", False),
        ("rejectKey", "done", False),
    }
    assert _succession_pairs(elements, "Functions::SpeedControl::speedControlFlow") == {
        ("start", "arbitrateTorque", False),
        ("arbitrateTorque", "braking", False),
        ("braking", "blendRegen", True),
        ("braking", "driveWheels", True),
        ("blendRegen", "applyFriction", False),
        ("applyFriction", "done", False),
        ("driveWheels", "done", False),
    }
    assert _succession_pairs(elements, "Functions::Security::cabinAccessFlow") == {
        ("start", "doorRequested", False),
        ("doorRequested", "readDoorHandle", True),
        ("doorRequested", "runWindowLift", True),
        ("readDoorHandle", "checkUnlocked", False),
        ("checkUnlocked", "carUnlocked", False),
        ("carUnlocked", "releaseDoor", True),
        ("carUnlocked", "stayLatched", True),
        ("releaseDoor", "showDoorState", False),
        ("showDoorState", "done", False),
        ("stayLatched", "done", False),
        ("runWindowLift", "done", False),
    }


def test_step_docs_describe_the_flow_not_the_entity():
    """A step says what happens in the flow; its performer's doc says what it owns."""
    from difflib import SequenceMatcher

    from domain.perform import resolve_performers

    elements = _load().elements
    performers = resolve_performers(elements)
    too_close = []
    for step_id, parts in performers.items():
        step_doc = elements[step_id].documentation or ""
        for part_id in parts:
            part_doc = elements[part_id].documentation or ""
            ratio = SequenceMatcher(None, step_doc.lower(), part_doc.lower()).ratio()
            if ratio >= 0.6:
                too_close.append((elements[step_id].name, elements[part_id].name, round(ratio, 2)))
    assert too_close == []


# --- Traceability: function → use case (#refine) -----------------------------

FUNCTION_REFINES = {
    "Security": {
        "StartVehicle",
        "StopVehicle",
        "Unlock",
        "Lock",
        "OpenDoor",
        "CloseDoor",
        "OpenWindow",
        "CloseWindow",
    },
    "Charging": {"Charge"},
    "SpeedControl": {"Accelerate", "Brake", "EmergencyStop"},
    "Maneuvrability": {"ChangeGear", "TurnLeft", "TurnRight"},
    "Lighting": {"ToggleHeadlights", "TurnLeft", "TurnRight", "Brake"},
    "WindshieldCleaning": {"CleanWindshield"},
    "Climate": {"AdjustClimate"},
    "Entertainment": {"PlayMedia"},
}


def _function_refines(elements) -> dict[str, set[str]]:
    """Function id → ids of the use cases it refines with `#refine`."""
    functions, _ = _functions_and_entities(elements)
    refines: dict[str, set[str]] = {}
    for e in elements.values():
        if (
            e.kind == ArtifactKind.DEPENDENCY
            and "refine" in (e.metadata_keywords or [])
            and e.source_id in functions
            and e.target_id in elements
            and elements[e.target_id].kind == ArtifactKind.USE_CASE
        ):
            refines.setdefault(e.source_id, set()).add(e.target_id)
    return refines


def test_every_function_refines_a_use_case():
    elements = _load().elements
    functions, _ = _functions_and_entities(elements)
    refines = _function_refines(elements)
    assert sorted(elements[f].name for f in functions if f not in refines) == []
    by_name = {
        elements[f].name: {elements[u].name for u in ucs} for f, ucs in refines.items()
    }
    assert by_name == FUNCTION_REFINES


def test_every_leaf_use_case_is_refined_by_a_function():
    """Drive and Park are composites; they are reached through include."""
    elements = _load().elements
    refined = set().union(*_function_refines(elements).values())
    leaves = [uc for uc in _use_cases(elements) if uc.name not in COMPOSITE_USE_CASES]
    assert sorted(uc.name for uc in leaves if uc.id not in refined) == []
    includes = {
        (e.source_id, e.target_id)
        for e in elements.values()
        if e.kind == ArtifactKind.INCLUDE
    }
    for uc in _use_cases(elements):
        if uc.name in COMPOSITE_USE_CASES:
            included = {t for s, t in includes if s == uc.id}
            assert included and included <= refined, uc.name


def _entity_refines(elements) -> dict[str, set[str]]:
    """Functional entity id → ids of the use cases it refines with `#refine`."""
    _, entities = _functions_and_entities(elements)
    entity_ids = {e.id for e in entities}
    refines: dict[str, set[str]] = {}
    for e in elements.values():
        if (
            e.kind == ArtifactKind.DEPENDENCY
            and "refine" in (e.metadata_keywords or [])
            and e.source_id in entity_ids
            and e.target_id in elements
            and elements[e.target_id].kind == ArtifactKind.USE_CASE
        ):
            refines.setdefault(e.source_id, set()).add(e.target_id)
    return refines


def test_every_entity_refines_a_use_case():
    elements = _load().elements
    _, entities = _functions_and_entities(elements)
    refines = _entity_refines(elements)
    assert sorted(e.name for e in entities if e.id not in refines) == []


def test_an_entity_refines_only_use_cases_of_its_function():
    elements = _load().elements
    by_function = _function_refines(elements)
    outside = sorted(
        (elements[eid].name, elements[u].name)
        for eid, ucs in _entity_refines(elements).items()
        for u in ucs - by_function.get(elements[eid].parent_id, set())
    )
    assert outside == []


def test_a_functions_entities_together_refine_its_use_cases():
    elements = _load().elements
    union: dict[str, set[str]] = {}
    for eid, ucs in _entity_refines(elements).items():
        union.setdefault(elements[eid].parent_id, set()).update(ucs)
    assert union == _function_refines(elements)


def _up_ids(elements, root_id: str) -> list[str]:
    from domain.dependency_tree import build_dependency_tree

    return [n["id"] for n in build_dependency_tree(elements, root_id)["up"]]


def test_logical_parts_climb_to_the_requirement_their_entity_serves():
    """The entity allocated to a part decides its chain, not the first use case
    its function happens to refine. The body controller confirms locking with
    the indicators, so it climbs to LockIndication (AccessControl is about
    authenticating before unlock, which the vehicle controller does)."""
    elements = _load().elements
    assert _up_ids(elements, f"{CAR}::frictionBrakes") == [
        "Requirements::Safety",
        "Requirements::BrakingDistance",
        "UseCases::Driving::Brake",
        "Functions::SpeedControl::frictionBraking",
    ]
    assert _up_ids(elements, f"{CAR}::bodyController") == [
        "Requirements::Security",
        "Requirements::LockIndication",
        "UseCases::Managing::Lock",
        "Functions::Security::lockControl",
    ]


# --- Traceability: satisfy only where the function chain does not reach ------
#
#   requirement ←objective— use case ←#refine— entity —allocate→ logical part
#
# A `satisfy R by L` is redundant when that chain already leads from R to L.
# The rule is taken at entity level: the entity that refines the use case is
# the one allocated to the part, not just any entity of the same function.


def _chain_pairs(elements) -> set[tuple[str, str]]:
    """(requirement id, logical part id) pairs the entity chain connects."""
    objectives: dict[str, set[str]] = {}
    for e in elements.values():
        if e.kind == ArtifactKind.DEPENDENCY and "objective" in (e.metadata_keywords or []):
            objectives.setdefault(e.source_id, set()).add(e.target_id)
    allocated = {
        a.source_id: a.target_id
        for a in elements.values()
        if a.kind == ArtifactKind.ALLOCATION
    }
    pairs: set[tuple[str, str]] = set()
    for entity_id, use_cases in _entity_refines(elements).items():
        for uc in use_cases:
            for req in objectives.get(uc, ()):
                pairs.add((req, allocated[entity_id]))
    return pairs


def test_no_satisfy_repeats_the_function_chain():
    elements = _load().elements
    pairs = _chain_pairs(elements)
    redundant = sorted(
        f"satisfy {elements[s.target_id].name} by {elements[s.source_id].name}"
        for s in elements.values()
        if s.kind == ArtifactKind.SATISFY and (s.target_id, s.source_id) in pairs
    )
    assert redundant == []


def test_every_leaf_requirement_is_traced_to_a_logical_part():
    """A leaf requirement (one that refines a group) is reached by the chain or a satisfy."""
    elements = _load().elements
    groups = {
        e.id
        for e in elements.values()
        if e.kind == ArtifactKind.REQUIREMENT
        and any(
            elements[c].kind == ArtifactKind.ATTRIBUTE
            and elements[c].name == "Type"
            and elements[c].default_value != '"UserStory"'
            for c in e.children
            if c in elements
        )
    }
    stories = {
        e.id
        for e in elements.values()
        if e.kind == ArtifactKind.REQUIREMENT and (e.short_id or "").startswith("US-")
    }
    leaves = {
        e.source_id
        for e in elements.values()
        if e.kind == ArtifactKind.DEPENDENCY
        and "refine" in (e.metadata_keywords or [])
        and e.target_id in groups
        and e.source_id not in stories
    }
    assert len(leaves) == 24
    traced = {r for r, _ in _chain_pairs(elements)} | {
        s.target_id for s in elements.values() if s.kind == ArtifactKind.SATISFY
    }
    assert sorted(elements[r].name for r in leaves - traced) == []


# --- Traceability: physical «implements» reaches the logical architecture ----

COUNTERPARTS = "PhysicalArchitecture::LogicalCounterparts"


def test_every_implements_target_reaches_the_logical_car():
    """An «implements» target is a logical part itself, or a LogicalCounterparts
    copy that subsets one (the whole car: typed by the logical Car)."""
    from domain.type_resolution import part_def_resolver

    elements = _load().elements
    resolve = part_def_resolver(elements)
    subsets = {
        e.source_id: e.target_id
        for e in elements.values()
        if e.kind == ArtifactKind.SUBSETTING
    }

    def logical(part_id: str | None) -> bool:
        return part_id == CAR or (
            part_id in elements and elements[part_id].parent_id == CAR
        )

    targets = {
        e.target_id
        for e in elements.values()
        if e.kind == ArtifactKind.DEPENDENCY
        and "implements" in (e.metadata_keywords or [])
        and (e.file_id or "").startswith("physical_architecture/")
    }
    assert len(targets) == 28
    unreached = []
    for target in sorted(targets):
        if logical(target):
            continue
        el = elements[target]
        typed = resolve(el.type_ref)
        if el.parent_id == COUNTERPARTS and (
            logical(subsets.get(target)) or (typed is not None and typed.id == CAR)
        ):
            continue
        unreached.append(target)
    assert unreached == []
