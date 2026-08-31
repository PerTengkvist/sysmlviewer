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
