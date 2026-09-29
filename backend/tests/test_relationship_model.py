"""Domain contract tests for part relationship kinds and default edge styling."""

from domain.merge import EDGE_KINDS, get_default_edge_style
from domain.models import ArtifactKind, ElementStyle, SemanticElement


RELATIONSHIP_KINDS = {
    ArtifactKind.DEPENDENCY,
    ArtifactKind.ALLOCATION,
    ArtifactKind.BINDING,
    ArtifactKind.FLOW,
    ArtifactKind.SPECIALIZATION,
    ArtifactKind.SUBSETTING,
    ArtifactKind.REDEFINITION,
}


def test_relationship_kinds_in_edge_kinds():
    for kind in RELATIONSHIP_KINDS:
        assert kind in EDGE_KINDS


def test_semantic_element_roundtrip_for_relationship_kinds():
    for kind in RELATIONSHIP_KINDS:
        el = SemanticElement(
            id=f"P::{kind.value}",
            kind=kind,
            name=kind.value,
            source_id="P::A",
            target_id="P::B",
            parent_id="P",
            file_id="f1",
        )
        data = el.to_dict()
        restored = SemanticElement.from_dict(data)
        assert restored.kind == kind
        assert restored.source_id == "P::A"
        assert restored.target_id == "P::B"


def test_default_edge_style_dependency():
    style = get_default_edge_style(ArtifactKind.DEPENDENCY)
    assert style.light is not None
    assert style.light.line_style == "dashed"
    assert style.light.marker_end == "openArrow"


def test_semantic_element_metadata_keywords_roundtrip():
    el = SemanticElement(
        id="P::dep1",
        kind=ArtifactKind.DEPENDENCY,
        name="dep1",
        source_id="P::A",
        target_id="P::B",
        parent_id="P",
        file_id="f1",
        metadata_keywords=["Mount", "Refine"],
    )
    data = el.to_dict()
    assert data["metadataKeywords"] == ["Mount", "Refine"]
    restored = SemanticElement.from_dict(data)
    assert restored.metadata_keywords == ["Mount", "Refine"]


def test_serialize_dependency_with_metadata_keywords():
    from adapters.parser.subset_serializer import serialize_file

    semantic = {
        "P": SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P", file_id="f1"),
        "P::A": SemanticElement(
            id="P::A", kind=ArtifactKind.PART, name="A", parent_id="P", file_id="f1"
        ),
        "P::B": SemanticElement(
            id="P::B", kind=ArtifactKind.PART, name="B", parent_id="P", file_id="f1"
        ),
        "P::dep1": SemanticElement(
            id="P::dep1",
            kind=ArtifactKind.DEPENDENCY,
            name="dep1",
            parent_id="P",
            source_id="P::A",
            target_id="P::B",
            file_id="f1",
            metadata_keywords=["Mount"],
        ),
    }
    # Wire children for serializer tree walk
    semantic["P"].children = ["P::A", "P::B", "P::dep1"]
    text = serialize_file(semantic, "f1")
    assert "#Mount dependency from A to B;" in text
    assert "dependency dep1" not in text


def test_serialize_named_dependency_with_metadata_keywords():
    from adapters.parser.subset_serializer import serialize_file

    semantic = {
        "P": SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P", file_id="f1"),
        "P::A": SemanticElement(
            id="P::A", kind=ArtifactKind.PART, name="A", parent_id="P", file_id="f1"
        ),
        "P::B": SemanticElement(
            id="P::B", kind=ArtifactKind.PART, name="B", parent_id="P", file_id="f1"
        ),
        "P::use": SemanticElement(
            id="P::use",
            kind=ArtifactKind.DEPENDENCY,
            name="use",
            parent_id="P",
            source_id="P::A",
            target_id="P::B",
            file_id="f1",
            metadata_keywords=["Mount"],
        ),
    }
    semantic["P"].children = ["P::A", "P::B", "P::use"]
    text = serialize_file(semantic, "f1")
    assert "#Mount dependency use from A to B;" in text


def test_default_edge_style_connection():
    style = get_default_edge_style(ArtifactKind.CONNECTION)
    assert style.light is not None
    assert style.light.line_style == "solid"
    assert style.light.marker_end is None


def test_default_edge_style_allocation():
    style = get_default_edge_style(ArtifactKind.ALLOCATION)
    assert style.light is not None
    assert style.light.line_style == "dashed"
    assert style.light.marker_end == "arrow"


def test_default_edge_style_binding():
    style = get_default_edge_style(ArtifactKind.BINDING)
    assert style.light is not None
    assert style.light.line_style == "dotted"
    assert style.light.marker_end is None


def test_default_edge_style_flow():
    style = get_default_edge_style(ArtifactKind.FLOW)
    assert style.light is not None
    assert style.light.line_style == "solid"
    assert style.light.marker_end == "arrow"


def test_default_edge_style_specialization():
    style = get_default_edge_style(ArtifactKind.SPECIALIZATION)
    assert style.light is not None
    assert style.light.line_style == "solid"
    assert style.light.marker_end == "hollowTriangle"


def test_default_edge_style_subsetting():
    style = get_default_edge_style(ArtifactKind.SUBSETTING)
    assert style.light is not None
    assert style.light.line_style == "dashed"
    assert style.light.marker_end == "hollowTriangle"


def test_default_edge_style_redefinition():
    style = get_default_edge_style(ArtifactKind.REDEFINITION)
    assert style.light is not None
    assert style.light.line_style == "solid"
    assert style.light.marker_end == "triangle"


def test_element_style_mode_serializes_line_style_and_markers():
    style = get_default_edge_style(ArtifactKind.DEPENDENCY)
    data = style.to_dict()
    assert data["light"]["lineStyle"] == "dashed"
    assert data["light"]["markerEnd"] == "openArrow"
    restored = ElementStyle.from_dict(data)
    assert restored is not None
    assert restored.light is not None
    assert restored.light.line_style == "dashed"
    assert restored.light.marker_end == "openArrow"
