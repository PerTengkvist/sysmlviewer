"""Sequence views on an `occurrence def`: payload, mode check and layout."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.diagram_mode import expected_root_kinds, resolve_diagram_mode
from domain.models import ArtifactKind, SemanticElement, ViewDef
from helpers import add_content_file, add_example_file, api_url

MODEL = """\
package P {
  part def PartA { event occurrence sent; event occurrence ackReceived; }
  part def PartB { event occurrence received; }
  part def Car { part keyFob : PartA; part locks : PartB; }
  occurrence def S {
    ref part a : PartA;
    part b : PartB;
    ref part car : Car;
    part unused;
    message m1 from a.sent to b.received;
    #Reply message m2 from b to a.ackReceived;
    message m3 from car.keyFob.sent to car.locks.received;
  }
  occurrence def Plain { part x; part y; message mm from x to y; }
  part def NotASequence;
  view SView : SequenceView { expose S; }
  view PlainView : SequenceView { expose Plain; }
  view BadView : SequenceView { expose NotASequence; }
  view TreeV : TreeView { expose S; }
}
"""


def _client(tmp_path: Path, src: str = MODEL) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "O"}).json()["id"]
    add_content_file(client, pid, tmp_path, "occ.sysml", src)
    return client, pid


def _view(client: TestClient, pid: str, view_id: str) -> dict:
    res = client.get(api_url(f"/projects/{pid}/views/{view_id}"))
    assert res.status_code == 200, res.text
    return res.json()


def test_expected_root_kinds_for_sequence():
    assert expected_root_kinds("sequence") == {
        ArtifactKind.INTERACTION,
        ArtifactKind.OCCURRENCE,
    }


def test_resolve_diagram_mode_for_occurrence():
    root = SemanticElement(id="P::S", kind=ArtifactKind.OCCURRENCE, name="S")
    view = ViewDef(id="P::V", name="V", root_artifact_id="P::S", type_ref="SequenceView")
    assert resolve_diagram_mode(view, root) == "sequence"


def test_sequence_view_accepts_occurrence_root(tmp_path: Path):
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "P::SView")
    assert payload["diagramMode"] == "sequence"
    assert payload.get("modeError") is None


def test_sequence_view_mode_error_is_sorted(tmp_path: Path):
    client, pid = _client(tmp_path)
    payload = _view(client, pid, "P::BadView")
    assert payload["modeError"] == (
        "SequenceView requires expose of kind interaction, occurrence; got 'part'"
    )


def test_occurrence_payload(tmp_path: Path):
    client, pid = _client(tmp_path)
    sem = _view(client, pid, "P::SView")["semantic"]
    own = [k for k in sem if k.startswith("P::S")]
    assert own[0] == "P::S"
    assert [k for k in sem if sem[k]["kind"] == "message"] == [
        "P::S::m1",
        "P::S::m2",
        "P::S::m3",
    ]
    assert [k for k in sem if k.startswith("P::S::") and sem[k]["kind"] == "part"][:3] == [
        "P::S::a",
        "P::S::b",
        "P::S::car",
    ]
    # the referenced events live in the part defs, outside the occurrence
    assert sem["P::PartA::sent"]["kind"] == "eventOccurrence"
    assert sem["P::PartB::received"]["kind"] == "eventOccurrence"
    assert sem["P::PartA::ackReceived"]["kind"] == "eventOccurrence"
    assert sem["P::S::m1"]["sourceEventId"] == "P::PartA::sent"
    assert sem["P::S::m1"]["targetEventId"] == "P::PartB::received"
    assert "sourceEventId" not in sem["P::S::m2"] or sem["P::S::m2"]["sourceEventId"] is None
    assert sem["P::S::m2"]["metadataKeywords"] == ["Reply"]
    # subsetting/redefinition targets are outside the view: no relations
    assert not [k for k, v in sem.items() if v["kind"] in {"subsetting", "redefinition"}]


def test_occurrence_payload_includes_whole_subtree(tmp_path: Path):
    src = MODEL.replace(
        "part unused;",
        "part unused; ref part vehicle { part cc { event occurrence r; } }",
    ).replace(
        "message m3 ",
        "message m4 from a to vehicle.cc.r; message m3 ",
    )
    client, pid = _client(tmp_path, src)
    sem = _view(client, pid, "P::SView")["semantic"]
    assert "P::S::vehicle::cc" in sem
    assert "P::S::vehicle::cc::r" in sem
    # materialised nested ends
    assert sem["P::S::car::keyFob"]["kind"] == "part"
    assert sem["P::S::car::locks"]["kind"] == "part"


def test_occurrence_payload_keeps_order_of_twelve_messages(tmp_path: Path):
    msgs = "\n".join(f"    message m{i:02d} from x to y;" for i in range(12))
    src = f"""package P {{
  occurrence def S {{ part y; part x;
{msgs}
  }}
  view V : SequenceView {{ expose S; }}
}}"""
    client, pid = _client(tmp_path, src)
    sem = _view(client, pid, "P::V")["semantic"]
    names = [v["name"] for v in sem.values() if v["kind"] == "message"]
    assert names == [f"m{i:02d}" for i in range(12)]


def test_sequence_layout_round_trip_on_occurrence_view(tmp_path: Path):
    client, pid = _client(tmp_path)
    seq = {"order": ["P::S::b", "P::S::a"], "widths": {"P::S::a": 150.0}}
    res = client.patch(
        api_url(f"/projects/{pid}/visualization"),
        json={"viewId": "P::SView", "structureNotation": "sysmlv2", "sequenceLayout": seq},
    )
    assert res.status_code == 200
    assert _view(client, pid, "P::SView")["sequenceLayout"] == seq


def test_legacy_interaction_payload_unchanged(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "H"}).json()["id"]
    add_example_file(client, pid, tmp_path, "hbox.sysml")
    sem = _view(client, pid, "hbox::HBoxEventView")["semantic"]
    kinds: dict[str, list[str]] = {}
    for el in sem.values():
        kinds.setdefault(el["kind"], []).append(el["id"])
    assert kinds["interaction"] == ["hbox::EventInteraction"]
    assert len(kinds["lifeline"]) == 4
    assert "eventOccurrence" not in kinds and "occurrence" not in kinds
    assert not any("sourceEventId" in el for el in sem.values())


def test_tree_view_hides_event_occurrences(tmp_path: Path):
    client, pid = _client(tmp_path)
    sem = _view(client, pid, "P::TreeV")["semantic"]
    assert not [k for k, v in sem.items() if v["kind"] == "eventOccurrence"]


def test_merge_has_no_nodes_or_edges_for_events(tmp_path: Path):
    from adapters.parser.subset_parser import SubsetSysmlParser
    from domain.merge import merge_visualization

    elements = SubsetSysmlParser().parse(MODEL, "f").elements
    viz = merge_visualization(elements)
    assert not [i for i, e in elements.items() if e.kind == ArtifactKind.EVENT_OCCURRENCE and (i in viz.nodes or i in viz.edges)]
    assert "P::S" in viz.nodes


# The diagrams example: every form of lifeline


def _example():
    from adapters.parser.subset_parser import SubsetSysmlParser

    path = Path(__file__).resolve().parents[2] / "examples/diagrams/occurrence_sequences.sysml"
    return SubsetSysmlParser().parse(path.read_text(), "f")


def test_diagrams_occurrence_example_parses_clean():
    result = _example()
    assert result.warnings == []
    messages = [e for e in result.elements.values() if e.kind == ArtifactKind.MESSAGE]
    assert len(messages) == 7
    for msg in messages:
        for part_id, event_id in (
            (msg.source_id, msg.source_event_id),
            (msg.target_id, msg.target_event_id),
        ):
            assert part_id in result.elements
            assert event_id is None or event_id in result.elements


def test_diagrams_occurrence_lifelines():
    from domain.occurrence import sequence_lifelines

    elements = _example().elements
    p = "OccurrenceSequences::"
    assert sequence_lifelines(elements, p + "SequenceA") == [
        p + "SequenceA::a",
        p + "SequenceA::b",
    ]
    assert sequence_lifelines(elements, p + "SequenceB") == [
        p + "SequenceB::a",
        p + "SequenceB::b",
    ]
    assert sequence_lifelines(elements, p + "SequenceC") == [
        p + "SequenceC::operator",
        p + "SequenceC::ctrl",
        p + "SequenceC::plant::actuator",
        p + "SequenceC::listener",
    ]
