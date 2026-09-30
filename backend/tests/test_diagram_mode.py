"""TDD: diagramMode resolution from view typeRef."""

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import api_url
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.diagram_mode import resolve_diagram_mode
from domain.models import ArtifactKind, SemanticElement, ViewDef
from helpers import add_example_file


def test_resolve_diagram_mode_by_type_ref():
    root = SemanticElement(id="P::I", kind=ArtifactKind.INTERACTION, name="I")
    view = ViewDef(
        id="P::V",
        name="V",
        root_artifact_id="P::I",
        type_ref="SequenceView",
    )
    assert resolve_diagram_mode(view, root) == "sequence"

    root_state = SemanticElement(id="P::S", kind=ArtifactKind.STATE, name="S")
    assert (
        resolve_diagram_mode(
            ViewDef(id="v", name="v", root_artifact_id="P::S", type_ref="StateTransitionView"),
            root_state,
        )
        == "state"
    )
    root_action = SemanticElement(id="P::A", kind=ArtifactKind.ACTION, name="A")
    assert (
        resolve_diagram_mode(
            ViewDef(id="v", name="v", root_artifact_id="P::A", type_ref="ActionFlowView"),
            root_action,
        )
        == "actionFlow"
    )
    root_pkg = SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P")
    assert (
        resolve_diagram_mode(
            ViewDef(id="v", name="v", root_artifact_id="P", type_ref="TreeView"),
            root_pkg,
        )
        == "tree"
    )


def test_resolve_grid_and_usecase_views():
    pkg = SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P")
    assert (
        resolve_diagram_mode(
            ViewDef(id="v", name="v", root_artifact_id="P", type_ref="GridView"),
            pkg,
        )
        == "requirementTable"
    )
    assert (
        resolve_diagram_mode(
            ViewDef(id="v", name="v", root_artifact_id="P", type_ref="UseCaseView"),
            pkg,
        )
        == "useCase"
    )


def test_resolve_general_view_falls_back_to_root_kind():
    part = SemanticElement(id="P::X", kind=ArtifactKind.PART, name="X")
    assert (
        resolve_diagram_mode(
            ViewDef(id="v", name="v", root_artifact_id="P::X", type_ref="GeneralView"),
            part,
        )
        == "whitebox"
    )
    assert (
        resolve_diagram_mode(
            ViewDef(
                id="v",
                name="v",
                root_artifact_id="P::X",
                type_ref="AllocationView",
            ),
            part,
        )
        == "allocation"
    )
    pkg = SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P")
    assert (
        resolve_diagram_mode(
            ViewDef(id="v", name="v", root_artifact_id="P", type_ref=None),
            pkg,
        )
        == "structure"
    )


def test_unknown_type_ref_falls_back_safely():
    part = SemanticElement(id="P::X", kind=ArtifactKind.PART, name="X")
    assert (
        resolve_diagram_mode(
            ViewDef(id="v", name="v", root_artifact_id="P::X", type_ref="NoSuchView"),
            part,
        )
        == "whitebox"
    )
