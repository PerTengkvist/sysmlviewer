"""Domain tests for view-scoped node geometry overlays."""

from domain.models import (
    ElementStyle,
    ElementStyleMode,
    PortSide,
    RoutingType,
    VisualizationEdge,
    VisualizationNode,
    Waypoint,
)
from domain.view_layouts import (
    ViewEdgeLayout,
    ViewLayout,
    ViewLayouts,
    ViewNodeLayout,
    apply_view_layout_edge_patch,
    apply_view_layout_patch,
    apply_view_snapshot,
    resolve_view_edge,
    resolve_view_node,
)


def _global_node(**overrides) -> VisualizationNode:
    style = ElementStyle(light=ElementStyleMode(background_color="#abc"))
    base = dict(
        artifact_id="Pkg::Part",
        x=10.0,
        y=20.0,
        width=800.0,
        height=600.0,
        symbol_ref="default-part",
        side=PortSide.LEFT,
        offset=0.4,
        style=style,
    )
    base.update(overrides)
    return VisualizationNode(**base)


def test_resolve_view_node_without_overlay_returns_global_geometry():
    g = _global_node()
    out = resolve_view_node(g, overlay=None)
    assert out["x"] == 10.0
    assert out["y"] == 20.0
    assert out["width"] == 800.0
    assert out["height"] == 600.0
    assert out["side"] == "left"
    assert out["offset"] == 0.4
    assert out["style"]["light"]["backgroundColor"] == "#abc"


def test_resolve_view_node_overlay_wins_geometry_keeps_global_style():
    g = _global_node()
    overlay = ViewNodeLayout(x=40.0, y=50.0, width=160.0, height=40.0)
    out = resolve_view_node(g, overlay=overlay)
    assert out["x"] == 40.0
    assert out["y"] == 50.0
    assert out["width"] == 160.0
    assert out["height"] == 40.0
    assert out["side"] == "left"
    assert out["style"]["light"]["backgroundColor"] == "#abc"


def test_view_node_layout_roundtrip_side_offset():
    layout = ViewNodeLayout(side="right", offset=0.25)
    assert layout.to_dict() == {"side": "right", "offset": 0.25}
    restored = ViewNodeLayout.from_dict(layout.to_dict())
    assert restored.side == "right"
    assert restored.offset == 0.25
    assert ViewNodeLayout().to_dict() == {}


def test_apply_view_layout_patch_stores_side_offset():
    layouts = ViewLayouts()
    layouts = apply_view_layout_patch(
        layouts,
        "View::A",
        {
            "Pkg::Port": {
                "side": "top",
                "offset": 0.2,
                "style": {"light": {"backgroundColor": "#f00"}},
            }
        },
    )
    node = layouts.by_view["View::A"].nodes["Pkg::Port"]
    assert node.side == "top"
    assert node.offset == 0.2
    assert node.to_dict().get("style") is None

    layouts = apply_view_layout_patch(
        layouts,
        "View::A",
        {"Pkg::Port": {"x": 12}},
    )
    node = layouts.by_view["View::A"].nodes["Pkg::Port"]
    assert node.x == 12.0
    assert node.side == "top"
    assert node.offset == 0.2


def test_resolve_view_node_overlay_side_wins():
    g = _global_node()
    overlay = ViewNodeLayout(side="bottom", offset=0.2)
    out = resolve_view_node(g, overlay=overlay)
    assert out["side"] == "bottom"
    assert out["offset"] == 0.2
    assert out["style"]["light"]["backgroundColor"] == "#abc"


def test_resolve_view_node_partial_overlay_keeps_global_side():
    g = _global_node()
    overlay = ViewNodeLayout(x=40.0, y=50.0)
    out = resolve_view_node(g, overlay=overlay)
    assert out["x"] == 40.0
    assert out["y"] == 50.0
    assert out["side"] == "left"
    assert out["offset"] == 0.4


def test_apply_view_layout_patch_creates_and_updates_geometry_only():
    layouts = ViewLayouts()
    layouts = apply_view_layout_patch(
        layouts,
        "View::Tree",
        {"Pkg::Part": {"width": 160, "height": 40, "style": {"light": {"backgroundColor": "#f00"}}}},
    )
    node = layouts.by_view["View::Tree"].nodes["Pkg::Part"]
    assert node.width == 160.0
    assert node.height == 40.0
    assert node.x is None
    assert node.y is None

    layouts = apply_view_layout_patch(
        layouts,
        "View::Tree",
        {"Pkg::Part": {"x": 12, "y": 34}},
    )
    node = layouts.by_view["View::Tree"].nodes["Pkg::Part"]
    assert node.x == 12.0
    assert node.y == 34.0
    assert node.width == 160.0


def test_view_layouts_roundtrip_empty_and_populated():
    empty = ViewLayouts.from_dict(None)
    assert empty.to_dict() == {}

    populated = ViewLayouts.from_dict(
        {
            "View::Tree": {
                "nodes": {
                    "Pkg::Part": {"x": 1, "y": 2, "width": 160, "height": 40},
                },
                "edges": {
                    "Pkg::conn": {
                        "routing": "angular",
                        "waypoints": [{"x": 10, "y": 20, "locked": True}],
                    }
                },
            }
        }
    )
    assert populated.to_dict() == {
        "View::Tree": {
            "nodes": {
                "Pkg::Part": {"x": 1.0, "y": 2.0, "width": 160.0, "height": 40.0},
            },
            "edges": {
                "Pkg::conn": {
                    "routing": "angular",
                    "waypoints": [{"x": 10.0, "y": 20.0, "locked": True}],
                }
            },
        }
    }
    again = ViewLayouts.from_dict(populated.to_dict())
    assert again.to_dict() == populated.to_dict()


def _global_edge(**overrides) -> VisualizationEdge:
    base = dict(
        artifact_id="Pkg::conn",
        routing=RoutingType.ANGULAR,
        waypoints=[Waypoint(x=1.0, y=2.0)],
        label_offset_x=0.0,
        label_offset_y=0.0,
    )
    base.update(overrides)
    return VisualizationEdge(**base)


def test_resolve_view_edge_overlay_wins_routing_and_waypoints():
    g = _global_edge()
    overlay = ViewEdgeLayout(
        routing="direct",
        waypoints=[Waypoint(x=50.0, y=60.0, locked=True)],
        label_offset_x=3.0,
        label_offset_y=4.0,
    )
    out = resolve_view_edge(g, overlay=overlay)
    assert out["routing"] == "direct"
    assert out["waypoints"] == [{"x": 50.0, "y": 60.0, "locked": True}]
    assert out["labelOffset"] == {"x": 3.0, "y": 4.0}


def test_apply_view_layout_edge_patch_and_node_patch_preserve_each_other():
    layouts = ViewLayouts()
    layouts = apply_view_layout_patch(
        layouts,
        "View::A",
        {"Pkg::Part": {"x": 1, "y": 2}},
    )
    layouts = apply_view_layout_edge_patch(
        layouts,
        "View::A",
        {"Pkg::conn": {"waypoints": [{"x": 10, "y": 20}]}},
    )
    view = layouts.by_view["View::A"]
    assert view.nodes["Pkg::Part"].x == 1.0
    assert len(view.edges["Pkg::conn"].waypoints or []) == 1

    layouts = apply_view_layout_patch(
        layouts,
        "View::A",
        {"Pkg::Part": {"width": 100}},
    )
    view = layouts.by_view["View::A"]
    assert view.nodes["Pkg::Part"].width == 100.0
    assert len(view.edges["Pkg::conn"].waypoints or []) == 1


def test_boundary_anchors_round_trip_on_view_layout():
    layouts = apply_view_layout_patch(
        ViewLayouts(),
        "View::A",
        {
            "Pkg::UC": {
                "x": 10,
                "anchors": [
                    {"id": "a-left", "side": "left", "offset": 0.2},
                    {"id": "extra-1", "side": "right", "offset": 0.8},
                    {"id": "bad", "side": "nope", "offset": 0.1},
                ],
            }
        },
    )
    node = layouts.by_view["View::A"].nodes["Pkg::UC"]
    assert node.x == 10.0
    assert node.anchors == [
        {"id": "a-left", "side": "left", "offset": 0.2},
        {"id": "extra-1", "side": "right", "offset": 0.8},
    ]
    resolved = resolve_view_node(_global_node(artifact_id="Pkg::UC"), node)
    assert resolved["anchors"][1]["id"] == "extra-1"

    layouts = apply_view_layout_edge_patch(
        layouts,
        "View::A",
        {
            "Pkg::inc": {
                "routing": "direct",
                "sourceAnchorId": "a-right",
                "targetAnchorId": "extra-1",
            }
        },
    )
    edge = layouts.by_view["View::A"].edges["Pkg::inc"]
    assert edge.routing == "direct"
    assert edge.source_anchor_id == "a-right"
    assert edge.target_anchor_id == "extra-1"
    # A later geometry patch must keep the anchors.
    layouts = apply_view_layout_patch(
        layouts, "View::A", {"Pkg::UC": {"y": 4}}
    )
    assert layouts.by_view["View::A"].nodes["Pkg::UC"].anchors[0]["offset"] == 0.2


def _saved_layout() -> ViewLayout:
    return ViewLayout(
        nodes={
            "Pkg::a": ViewNodeLayout(
                x=1.0,
                y=2.0,
                width=3.0,
                height=4.0,
                anchors=[{"id": "n1", "side": "top", "offset": 0.5}],
                edit_locked=True,
            ),
            "Pkg::a::p": ViewNodeLayout(side="left", offset=0.1),
            "Pkg::hidden": ViewNodeLayout(x=7.0, y=8.0),
        },
        edges={
            "Pkg::conn": ViewEdgeLayout(
                routing="angular",
                waypoints=[Waypoint(1.0, 1.0)],
                source_side="left",
                source_anchor_id="n1",
                edit_locked=True,
            ),
            "Pkg::hiddenConn": ViewEdgeLayout(routing="angular"),
        },
        hierarchical_levels_override=3,
        view_filters=[{"id": "f"}],
        layout_scopes=[{"id": "s"}],
    )


def _apply_snapshot(layout: ViewLayout) -> ViewLayout:
    return apply_view_snapshot(
        layout,
        parts={"Pkg::a": {"x": 10.0, "y": 20.0, "width": 30.0, "height": 40.0}},
        ports={"Pkg::a::p": {"side": "right", "offset": 0.9}},
        edges={
            "Pkg::conn": {
                "routing": "direct",
                "waypoints": [],
                "labelOffset": {"x": 1.0, "y": 2.0},
            }
        },
    )


def test_apply_snapshot_replaces_geometry():
    result = _apply_snapshot(_saved_layout())

    node = result.nodes["Pkg::a"]
    assert (node.x, node.y, node.width, node.height) == (10.0, 20.0, 30.0, 40.0)
    port = result.nodes["Pkg::a::p"]
    assert (port.side, port.offset) == ("right", 0.9)
    edge = result.edges["Pkg::conn"]
    assert (edge.routing, edge.waypoints) == ("direct", [])
    assert (edge.label_offset_x, edge.label_offset_y) == (1.0, 2.0)


def test_apply_snapshot_clears_stale_fields():
    edge = _apply_snapshot(_saved_layout()).edges["Pkg::conn"]

    assert edge.source_side is None
    assert edge.source_anchor_id is None


def test_apply_snapshot_keeps_hidden_elements():
    result = _apply_snapshot(_saved_layout())

    assert result.nodes["Pkg::hidden"].x == 7.0
    assert result.edges["Pkg::hiddenConn"].routing == "angular"


def test_apply_snapshot_keeps_locks_and_view_settings():
    result = _apply_snapshot(_saved_layout())

    assert result.nodes["Pkg::a"].edit_locked is True
    assert result.nodes["Pkg::a"].anchors == [
        {"id": "n1", "side": "top", "offset": 0.5}
    ]
    assert result.edges["Pkg::conn"].edit_locked is True
    assert result.hierarchical_levels_override == 3
    assert result.view_filters == [{"id": "f"}]
    assert result.layout_scopes == [{"id": "s"}]


def test_apply_snapshot_leaves_the_input_untouched():
    layout = _saved_layout()

    _apply_snapshot(layout)

    assert layout.nodes["Pkg::a"].x == 1.0


def test_port_label_offset_round_trips_through_the_view_file_shape():
    node = ViewNodeLayout.from_dict(
        {"side": "left", "offset": 0.5, "labelOffset": {"x": 12, "y": -8}}
    )

    assert node.label_offset == {"x": 12.0, "y": -8.0}
    assert node.to_dict()["labelOffset"] == {"x": 12.0, "y": -8.0}


def test_port_at_default_label_place_stores_nothing():
    node = ViewNodeLayout.from_dict({"side": "left", "labelOffset": {"x": 0, "y": 0}})

    assert node.label_offset is None
    assert "labelOffset" not in node.to_dict()


def test_patch_moves_and_clears_port_label_offset():
    moved = ViewNodeLayout(side="left", offset=0.5).merge_patch(
        {"labelOffset": {"x": 5, "y": 6}}
    )
    untouched = moved.merge_patch({"offset": 0.7})
    cleared = untouched.merge_patch({"labelOffset": None})

    assert moved.label_offset == {"x": 5.0, "y": 6.0}
    assert untouched.label_offset == {"x": 5.0, "y": 6.0}
    assert cleared.label_offset is None
    assert (cleared.side, cleared.offset) == ("left", 0.7)


def test_resolved_view_node_carries_port_label_offset():
    global_node = VisualizationNode(artifact_id="Pkg::a::p")

    resolved = resolve_view_node(
        global_node, ViewNodeLayout(label_offset={"x": 1.0, "y": 2.0})
    )

    assert resolved["labelOffset"] == {"x": 1.0, "y": 2.0}


def test_apply_snapshot_stores_and_clears_port_label_offset():
    layout = ViewLayout(
        nodes={
            "Pkg::p": ViewNodeLayout(side="left", offset=0.5),
            "Pkg::q": ViewNodeLayout(
                side="left", offset=0.5, label_offset={"x": 9.0, "y": 9.0}
            ),
        }
    )

    result = apply_view_snapshot(
        layout,
        parts={},
        ports={
            "Pkg::p": {
                "side": "left",
                "offset": 0.5,
                "labelOffset": {"x": 3.0, "y": 4.0},
            },
            "Pkg::q": {
                "side": "left",
                "offset": 0.5,
                "labelOffset": {"x": 0.0, "y": 0.0},
            },
        },
        edges={},
    )

    assert result.nodes["Pkg::p"].label_offset == {"x": 3.0, "y": 4.0}
    assert result.nodes["Pkg::q"].label_offset is None
