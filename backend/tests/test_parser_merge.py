from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.merge import merge_visualization
from domain.models import ArtifactKind, VisualizationModel, VisualizationNode


from helpers import resolve_example_path

SAMPLE = resolve_example_path("vehicle.sysml")
HBOX = resolve_example_path("hbox.sysml")


def test_parse_vehicle_sample():
    content = SAMPLE.read_text(encoding="utf-8")
    result = SubsetSysmlParser().parse(content, file_id="f1")
    assert "Example" in result.elements
    assert result.elements["Example"].kind == ArtifactKind.PACKAGE
    assert "Example::Vehicle" in result.elements
    assert "Example::Engine" in result.elements
    assert "Example::FunctionalModule" in result.elements
    assert "Example::Vehicle::engine" in result.elements
    assert result.elements["Example::Vehicle::engine"].type_ref == "Engine"
    assert result.elements["Example::Vehicle::fm1"].type_ref == "FunctionalModule"
    assert "Example::Vehicle::powerOut" in result.elements
    assert "Example::Engine::powerIn" in result.elements

    connections = [
        e for e in result.elements.values() if e.kind == ArtifactKind.CONNECTION
    ]
    assert len(connections) >= 1
    conn = connections[0]
    assert conn.source_id == "Example::Vehicle::powerOut"
    assert conn.target_id == "Example::Vehicle::engine::powerIn"


def test_parse_hbox_resolves_event_port():
    content = HBOX.read_text(encoding="utf-8")
    result = SubsetSysmlParser().parse(content, file_id="f1")
    assert "hbox::EventPort" in result.elements
    assert result.elements["hbox::EventPort"].kind == ArtifactKind.PORT
    event = result.elements["hbox::HBox::BoxA::event"]
    assert event.type_ref == "EventPort"
    unresolved = [w for w in result.warnings if "EventPort" in w and "could not be resolved" in w]
    assert unresolved == []


def test_merge_preserves_layout():
    parser = SubsetSysmlParser()
    content = SAMPLE.read_text(encoding="utf-8")
    result = parser.parse(content, file_id="f1")
    existing = VisualizationModel(
        nodes={
            "Example::Vehicle": VisualizationNode(
                artifact_id="Example::Vehicle", x=42, y=99, width=200, height=120
            )
        }
    )
    merged = merge_visualization(result.elements, existing)
    assert merged.nodes["Example::Vehicle"].x == 42
    assert merged.nodes["Example::Vehicle"].y == 99
    assert "Example::Engine" in merged.nodes


def test_merge_default_ports_stay_in_body_and_size_part():
    from domain.merge import PORT_BODY_OFFSET_MIN
    from domain.models import SemanticElement

    semantic = {
        "P": SemanticElement(
            id="P", kind=ArtifactKind.PACKAGE, name="P", children=["P::A"]
        ),
        "P::A": SemanticElement(
            id="P::A",
            kind=ArtifactKind.PART,
            name="Box",
            parent_id="P",
            children=["P::A::longPortName", "P::A::other"],
        ),
        "P::A::longPortName": SemanticElement(
            id="P::A::longPortName",
            kind=ArtifactKind.PORT,
            name="longPortName",
            parent_id="P::A",
        ),
        "P::A::other": SemanticElement(
            id="P::A::other",
            kind=ArtifactKind.PORT,
            name="other",
            parent_id="P::A",
        ),
    }
    merged = merge_visualization(semantic)
    for pid in ("P::A::longPortName", "P::A::other"):
        node = merged.nodes[pid]
        assert node.side is not None
        assert node.offset is not None
        assert node.offset >= PORT_BODY_OFFSET_MIN
    part = merged.nodes["P::A"]
    assert part.width >= 200
    assert part.height >= 120
