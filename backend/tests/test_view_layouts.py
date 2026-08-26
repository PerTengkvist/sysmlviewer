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
    ViewLayouts,
    ViewNodeLayout,
    apply_view_layout_edge_patch,
    apply_view_layout_patch,
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
