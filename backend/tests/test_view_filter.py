"""Unit tests for SysML view filter metaclass map and evaluation."""

from domain.models import ArtifactKind, SemanticElement
from domain.view_filter import (
    MetaclassFilter,
    NameStartsWithFilter,
    apply_view_filters,
    element_matches_filters,
    metaclass_to_kind,
    parse_stored_filters,
)


def test_metaclass_to_kind_connection_usage():
    assert metaclass_to_kind("SysML::ConnectionUsage") == ArtifactKind.CONNECTION
    assert metaclass_to_kind("ConnectionUsage") == ArtifactKind.CONNECTION


def test_metaclass_to_kind_dependency():
    assert metaclass_to_kind("Dependency") == ArtifactKind.DEPENDENCY
    assert metaclass_to_kind("KerML::Dependency") == ArtifactKind.DEPENDENCY


def test_metaclass_to_kind_part_usage():
    assert metaclass_to_kind("PartUsage") == ArtifactKind.PART
    assert metaclass_to_kind("SysML::PartUsage") == ArtifactKind.PART


def test_metaclass_to_kind_unknown():
    assert metaclass_to_kind("NotARealMetaclass") is None
    assert metaclass_to_kind("SysML::BogusUsage") is None


def test_semantic_element_view_filters_roundtrip():
    el = SemanticElement(
        id="Pkg::V",
        kind=ArtifactKind.VIEW,
        name="V",
        view_filters=[
            {"op": "metaclass", "ref": "ConnectionUsage"},
            {"op": "nameStartsWith", "prefix": "power"},
        ],
    )
    data = el.to_dict()
    assert data["viewFilters"] == [
        {"op": "metaclass", "ref": "ConnectionUsage"},
        {"op": "nameStartsWith", "prefix": "power"},
    ]
    restored = SemanticElement.from_dict(data)
    assert restored.view_filters == el.view_filters


def test_element_matches_connection_metaclass():
    conn = SemanticElement(
        id="P::powerBus", kind=ArtifactKind.CONNECTION, name="powerBus"
    )
    dep = SemanticElement(id="P::d1", kind=ArtifactKind.DEPENDENCY, name="d1")
    filters = [MetaclassFilter("ConnectionUsage")]
    assert element_matches_filters(conn, filters) is True
    assert element_matches_filters(dep, filters) is False


def test_element_matches_name_startswith():
    power = SemanticElement(
        id="P::powerBus", kind=ArtifactKind.CONNECTION, name="powerBus"
    )
    signal = SemanticElement(
        id="P::signalX", kind=ArtifactKind.CONNECTION, name="signalX"
    )
    filters = [NameStartsWithFilter("power")]
    assert element_matches_filters(power, filters) is True
    assert element_matches_filters(signal, filters) is False


def test_element_matches_metaclass_any_or():
    from domain.view_filter import MetaclassAnyFilter

    part = SemanticElement(id="P::a", kind=ArtifactKind.PART, name="a")
    port = SemanticElement(id="P::p", kind=ArtifactKind.PORT, name="p")
    dep = SemanticElement(id="P::d", kind=ArtifactKind.DEPENDENCY, name="d")
    filters = [
        MetaclassAnyFilter(("PartUsage", "PortUsage", "ConnectionUsage"))
    ]
    assert element_matches_filters(part, filters) is True
    assert element_matches_filters(port, filters) is True
    assert element_matches_filters(dep, filters) is False


def test_element_matches_and_of_metaclass_and_name():
    power = SemanticElement(
        id="P::powerBus", kind=ArtifactKind.CONNECTION, name="powerBus"
    )
    part = SemanticElement(
        id="P::powerTrain", kind=ArtifactKind.PART, name="powerTrain"
    )
    filters = [
        MetaclassFilter("ConnectionUsage"),
        NameStartsWithFilter("power"),
    ]
    assert element_matches_filters(power, filters) is True
    assert element_matches_filters(part, filters) is False


def test_apply_view_filters_empty_unchanged():
    semantic = {
        "R": SemanticElement(id="R", kind=ArtifactKind.PART, name="Root"),
        "R::a": SemanticElement(id="R::a", kind=ArtifactKind.PART, name="a"),
    }
    ids = {"R", "R::a"}
    assert apply_view_filters(semantic, ids, [], root_id="R") == ids


def test_apply_view_filters_keeps_root_and_matching_plus_endpoints():
    semantic = {
        "R": SemanticElement(id="R", kind=ArtifactKind.PART, name="Root"),
        "R::a": SemanticElement(id="R::a", kind=ArtifactKind.PART, name="a"),
        "R::b": SemanticElement(id="R::b", kind=ArtifactKind.PART, name="b"),
        "R::powerBus": SemanticElement(
            id="R::powerBus",
            kind=ArtifactKind.CONNECTION,
            name="powerBus",
            source_id="R::a",
            target_id="R::b",
        ),
        "R::signalX": SemanticElement(
            id="R::signalX",
            kind=ArtifactKind.CONNECTION,
            name="signalX",
            source_id="R::a",
            target_id="R::b",
        ),
        "R::d1": SemanticElement(
            id="R::d1",
            kind=ArtifactKind.DEPENDENCY,
            name="d1",
            source_id="R::a",
            target_id="R::b",
        ),
    }
    ids = set(semantic)
    filters = parse_stored_filters(
        [
            {"op": "metaclass", "ref": "ConnectionUsage"},
            {"op": "nameStartsWith", "prefix": "power"},
        ]
    )
    kept = apply_view_filters(semantic, ids, filters, root_id="R")
    assert "R" in kept
    assert "R::powerBus" in kept
    assert "R::a" in kept  # endpoint of kept connection
    assert "R::b" in kept
    assert "R::signalX" not in kept
    assert "R::d1" not in kept
