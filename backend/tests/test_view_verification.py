"""Compare diagram geometry against saved view layouts."""

from __future__ import annotations

from domain.models import Waypoint
from domain.view_layouts import ViewEdgeLayout, ViewLayout, ViewNodeLayout
from domain.view_verification import (
    GeometrySnapshot,
    compare_geometry,
    snapshot_from_layout,
    snapshot_from_view_payload,
)

PART = "Pkg::a"
PORT = "Pkg::a::p"
EDGE = "Pkg::conn1"


def _part(**overrides: float) -> dict:
    return {"x": 10.0, "y": 20.0, "width": 100.0, "height": 50.0, **overrides}


def _edge(**overrides: object) -> dict:
    return {
        "routing": "angular",
        "waypoints": [{"x": 1.0, "y": 2.0}, {"x": 3.0, "y": 4.0}],
        "labelOffset": {"x": 0.0, "y": 0.0},
        **overrides,
    }


def _snapshot(**overrides: dict) -> GeometrySnapshot:
    return GeometrySnapshot(
        parts=overrides.get("parts", {PART: _part()}),
        ports=overrides.get("ports", {PORT: {"side": "left", "offset": 0.5}}),
        edges=overrides.get("edges", {EDGE: _edge()}),
    )


def _fields(mismatches: list) -> list[tuple[str, str, str]]:
    return [(m.element, m.id, m.field) for m in mismatches]


def test_identical_geometry_has_no_mismatches():
    assert compare_geometry(_snapshot(), _snapshot(), source="disk") == []


def test_part_difference_beyond_tolerance_names_part_and_field():
    saved = _snapshot(parts={PART: _part(x=11.0)})

    [mismatch] = compare_geometry(_snapshot(), saved, source="disk")

    assert (mismatch.element, mismatch.id, mismatch.field) == ("part", PART, "x")
    assert (mismatch.canvas, mismatch.saved) == (10.0, 11.0)
    assert mismatch.source == "disk"


def test_difference_within_tolerance_is_ignored():
    saved = _snapshot(
        parts={PART: _part(x=10.4)},
        ports={PORT: {"side": "left", "offset": 0.5005}},
    )

    assert compare_geometry(_snapshot(), saved, source="disk") == []


def test_port_side_and_offset_mismatch():
    saved = _snapshot(ports={PORT: {"side": "right", "offset": 0.6}})

    mismatches = compare_geometry(_snapshot(), saved, source="disk")

    assert _fields(mismatches) == [("port", PORT, "side"), ("port", PORT, "offset")]


def test_waypoint_count_mismatch_is_reported_once():
    saved = _snapshot(edges={EDGE: _edge(waypoints=[{"x": 1.0, "y": 2.0}])})

    [mismatch] = compare_geometry(_snapshot(), saved, source="disk")

    assert (mismatch.element, mismatch.field) == ("edge", "waypoints")
    assert (mismatch.canvas, mismatch.saved) == (2, 1)


def test_waypoint_position_mismatch_names_the_point():
    moved = [{"x": 1.0, "y": 2.0}, {"x": 3.0, "y": 9.0}]
    saved = _snapshot(edges={EDGE: _edge(waypoints=moved)})

    [mismatch] = compare_geometry(_snapshot(), saved, source="disk")

    assert mismatch.field == "waypoints[1].y"
    assert (mismatch.canvas, mismatch.saved) == (4.0, 9.0)


def test_edge_attachment_mismatch():
    canvas = _snapshot(edges={EDGE: _edge(sourceSide="top", sourceOffset=0.2)})
    saved = _snapshot(edges={EDGE: _edge(sourceSide="left", sourceOffset=0.4)})

    mismatches = compare_geometry(canvas, saved, source="disk")

    assert _fields(mismatches) == [
        ("edge", EDGE, "sourceSide"),
        ("edge", EDGE, "sourceOffset"),
    ]


def test_absent_label_offset_counts_as_zero():
    saved = _snapshot(edges={EDGE: {k: v for k, v in _edge().items() if k != "labelOffset"}})

    assert compare_geometry(_snapshot(), saved, source="disk") == []


def test_missing_saved_entry_is_reported_as_missing():
    saved = GeometrySnapshot(parts={}, ports={}, edges={})

    mismatches = compare_geometry(_snapshot(), saved, source="served")

    assert _fields(mismatches) == [
        ("part", PART, "entry"),
        ("port", PORT, "entry"),
        ("edge", EDGE, "entry"),
    ]
    assert {m.saved for m in mismatches} == {None}


def test_missing_saved_field_is_reported():
    saved = _snapshot(parts={PART: {"x": 10.0, "y": 20.0}})

    mismatches = compare_geometry(_snapshot(), saved, source="disk")

    assert _fields(mismatches) == [("part", PART, "width"), ("part", PART, "height")]


def test_partial_mode_ignores_missing_entries_and_fields():
    saved = GeometrySnapshot(
        parts={PART: {"x": 10.0, "y": 20.0}},
        ports={},
        edges={EDGE: {"routing": "angular"}},
    )

    assert compare_geometry(_snapshot(), saved, source="restored", partial=True) == []


def test_partial_mode_still_reports_stored_values_that_differ():
    saved = GeometrySnapshot(parts={PART: {"x": 99.0}}, ports={}, edges={})

    mismatches = compare_geometry(_snapshot(), saved, source="restored", partial=True)

    assert _fields(mismatches) == [("part", PART, "x")]


def test_snapshot_values_absent_from_canvas_are_not_compared():
    canvas = _snapshot(parts={PART: {"x": 10.0, "y": 20.0}})
    saved = _snapshot(parts={PART: _part()})

    assert compare_geometry(canvas, saved, source="disk") == []


def test_snapshot_from_dict_tolerates_missing_sections():
    assert GeometrySnapshot.from_dict({"parts": {PART: _part()}}) == GeometrySnapshot(
        parts={PART: _part()}, ports={}, edges={}
    )


def test_snapshot_from_layout_and_view_payload_share_shape():
    layout = ViewLayout(
        nodes={
            PART: ViewNodeLayout(x=10.0, y=20.0, width=100.0, height=50.0),
            PORT: ViewNodeLayout(side="left", offset=0.5),
        },
        edges={
            EDGE: ViewEdgeLayout(
                routing="angular",
                waypoints=[Waypoint(1.0, 2.0), Waypoint(3.0, 4.0)],
                label_offset_x=0.0,
                label_offset_y=0.0,
            )
        },
    )
    payload = {
        "visualization": {
            "nodes": {
                PART: {**_part(), "artifactId": PART, "side": None, "offset": None},
                PORT: {
                    "artifactId": PORT,
                    "x": 0.0,
                    "y": 0.0,
                    "width": 12.0,
                    "height": 12.0,
                    "side": "left",
                    "offset": 0.5,
                },
            },
            "edges": {EDGE: {**_edge(), "artifactId": EDGE, "style": None}},
        }
    }
    canvas = _snapshot()

    assert compare_geometry(canvas, snapshot_from_layout(layout), source="disk") == []
    assert (
        compare_geometry(canvas, snapshot_from_view_payload(payload), source="served")
        == []
    )


def _port(**overrides: object) -> dict:
    return {"side": "left", "offset": 0.5, **overrides}


def test_port_label_offset_mismatch_names_the_axis():
    canvas = _snapshot(ports={PORT: _port(labelOffset={"x": 20.0, "y": 5.0})})
    saved = _snapshot(ports={PORT: _port(labelOffset={"x": 20.0, "y": 9.0})})

    assert _fields(compare_geometry(canvas, saved, source="disk")) == [
        ("port", PORT, "labelOffset.y")
    ]


def test_port_label_at_default_matches_nothing_saved():
    canvas = _snapshot(ports={PORT: _port(labelOffset={"x": 0.0, "y": 0.0})})

    assert compare_geometry(canvas, _snapshot(), source="disk") == []


def test_port_label_at_default_differs_from_saved_offset():
    canvas = _snapshot(ports={PORT: _port(labelOffset={"x": 0.0, "y": 0.0})})
    saved = _snapshot(ports={PORT: _port(labelOffset={"x": 7.0, "y": 0.0})})

    assert _fields(compare_geometry(canvas, saved, source="restored", partial=True)) == [
        ("port", PORT, "labelOffset.x")
    ]


def test_moved_port_label_without_saved_offset_is_a_mismatch():
    canvas = _snapshot(ports={PORT: _port(labelOffset={"x": 7.0, "y": 0.0})})

    assert _fields(compare_geometry(canvas, _snapshot(), source="disk")) == [
        ("port", PORT, "labelOffset.x")
    ]


def test_snapshots_from_layout_and_payload_keep_port_label_offset():
    offset = {"x": 4.0, "y": 5.0}
    layout = ViewLayout(nodes={PORT: ViewNodeLayout(label_offset=offset)})
    payload = {
        "visualization": {
            "nodes": {PORT: {"side": None, "offset": None, "labelOffset": offset}},
            "edges": {},
        }
    }

    assert snapshot_from_layout(layout).ports[PORT]["labelOffset"] == offset
    assert snapshot_from_view_payload(payload).ports[PORT]["labelOffset"] == offset
