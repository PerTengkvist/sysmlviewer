"""INTERFACE usages (with ends) are structure relations; defs are not."""

from domain.merge import STRUCTURE_EDGE_KINDS
from domain.models import ArtifactKind, SemanticElement
from domain.relationships import collect_related_edges, is_relation_element


def test_interface_in_structure_edge_kinds():
    assert ArtifactKind.INTERFACE in STRUCTURE_EDGE_KINDS


def test_interface_usage_is_relation_element():
    usage = SemanticElement(
        id="P::x",
        kind=ArtifactKind.INTERFACE,
        name="x",
        source_id="P::a",
        target_id="P::b",
        type_ref="itf_y",
    )
    assert is_relation_element(usage)


def test_interface_def_is_not_relation_element():
    iface_def = SemanticElement(
        id="P::itf_y",
        kind=ArtifactKind.INTERFACE,
        name="itf_y",
    )
    assert not is_relation_element(iface_def)


def test_collect_related_edges_includes_interface_usage():
    semantic = {
        "P": SemanticElement(id="P", kind=ArtifactKind.PACKAGE, name="P"),
        "P::part1": SemanticElement(
            id="P::part1", kind=ArtifactKind.PART, name="part1", parent_id="P"
        ),
        "P::part1::a": SemanticElement(
            id="P::part1::a",
            kind=ArtifactKind.PORT,
            name="a",
            parent_id="P::part1",
        ),
        "P::part2": SemanticElement(
            id="P::part2", kind=ArtifactKind.PART, name="part2", parent_id="P"
        ),
        "P::part2::b": SemanticElement(
            id="P::part2::b",
            kind=ArtifactKind.PORT,
            name="b",
            parent_id="P::part2",
        ),
        "P::x": SemanticElement(
            id="P::x",
            kind=ArtifactKind.INTERFACE,
            name="x",
            parent_id="P",
            type_ref="itf_y",
            source_id="P::part1::a",
            target_id="P::part2::b",
        ),
        "P::itf_y": SemanticElement(
            id="P::itf_y",
            kind=ArtifactKind.INTERFACE,
            name="itf_y",
            parent_id="P",
        ),
    }
    included = {"P::part1", "P::part2", "P::part1::a", "P::part2::b"}
    extra = collect_related_edges(semantic, included)
    assert "P::x" in extra
    assert "P::itf_y" not in extra


def test_collect_related_edges_includes_nested_port_endpoints():
    """Interface ends on nested ports must be pulled into the view set."""
    semantic = {
        "P::a": SemanticElement(id="P::a", kind=ArtifactKind.PART, name="a"),
        "P::a::layered": SemanticElement(
            id="P::a::layered",
            kind=ArtifactKind.PORT,
            name="layered",
            parent_id="P::a",
            children=["P::a::layered::l1"],
        ),
        "P::a::layered::l1": SemanticElement(
            id="P::a::layered::l1",
            kind=ArtifactKind.PORT,
            name="l1",
            parent_id="P::a::layered",
        ),
        "P::b": SemanticElement(id="P::b", kind=ArtifactKind.PART, name="b"),
        "P::b::layered": SemanticElement(
            id="P::b::layered",
            kind=ArtifactKind.PORT,
            name="layered",
            parent_id="P::b",
            children=["P::b::layered::l1"],
        ),
        "P::b::layered::l1": SemanticElement(
            id="P::b::layered::l1",
            kind=ArtifactKind.PORT,
            name="l1",
            parent_id="P::b::layered",
        ),
        "P::link": SemanticElement(
            id="P::link",
            kind=ArtifactKind.INTERFACE,
            name="link",
            parent_id="P",
            source_id="P::a::layered::l1",
            target_id="P::b::layered::l1",
        ),
    }
    # Parts + composite ports only — nested leaves missing until collect.
    included = {"P::a", "P::b", "P::a::layered", "P::b::layered"}
    extra = collect_related_edges(semantic, included)
    assert "P::link" in extra
    assert "P::a::layered::l1" in extra
    assert "P::b::layered::l1" in extra
