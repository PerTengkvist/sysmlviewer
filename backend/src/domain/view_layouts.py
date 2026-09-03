"""View-scoped node geometry overlays (x/y/width/height only)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from domain.models import VisualizationEdge, VisualizationNode, Waypoint


@dataclass
class ViewNodeLayout:
    """Per-view geometry for one artifact — no style/side/offset."""

    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if self.x is not None:
            out["x"] = self.x
        if self.y is not None:
            out["y"] = self.y
        if self.width is not None:
            out["width"] = self.width
        if self.height is not None:
            out["height"] = self.height
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ViewNodeLayout:
        if not data:
            return cls()
        return cls(
            x=float(data["x"]) if data.get("x") is not None else None,
            y=float(data["y"]) if data.get("y") is not None else None,
            width=float(data["width"]) if data.get("width") is not None else None,
            height=float(data["height"]) if data.get("height") is not None else None,
        )

    def merge_patch(self, patch: dict[str, Any]) -> ViewNodeLayout:
        """Apply geometry fields from a patch; ignore style/side/offset."""
        x = self.x
        y = self.y
        width = self.width
        height = self.height
        if "x" in patch and patch["x"] is not None:
            x = float(patch["x"])
        if "y" in patch and patch["y"] is not None:
            y = float(patch["y"])
        if "width" in patch and patch["width"] is not None:
            width = float(patch["width"])
        if "height" in patch and patch["height"] is not None:
            height = float(patch["height"])
        return ViewNodeLayout(x=x, y=y, width=width, height=height)


@dataclass
class ViewEdgeLayout:
    """Per-view connection geometry — routing, waypoints, label offset, attachment."""

    routing: str | None = None
    waypoints: list[Waypoint] | None = None
    label_offset_x: float | None = None
    label_offset_y: float | None = None
    source_side: str | None = None
    source_offset: float | None = None
    target_side: str | None = None
    target_offset: float | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if self.routing is not None:
            out["routing"] = self.routing
        if self.waypoints is not None:
            out["waypoints"] = [w.to_dict() for w in self.waypoints]
        if self.label_offset_x is not None or self.label_offset_y is not None:
            out["labelOffset"] = {
                "x": self.label_offset_x if self.label_offset_x is not None else 0.0,
                "y": self.label_offset_y if self.label_offset_y is not None else 0.0,
            }
        if self.source_side is not None:
            out["sourceSide"] = self.source_side
        if self.source_offset is not None:
            out["sourceOffset"] = self.source_offset
        if self.target_side is not None:
            out["targetSide"] = self.target_side
        if self.target_offset is not None:
            out["targetOffset"] = self.target_offset
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ViewEdgeLayout:
        if not data:
            return cls()
        lo = data.get("labelOffset") or {}
        waypoints_raw = data.get("waypoints")
        return cls(
            routing=data.get("routing"),
            waypoints=(
                [Waypoint.from_dict(w) for w in waypoints_raw]
                if waypoints_raw is not None
                else None
            ),
            label_offset_x=float(lo["x"]) if lo.get("x") is not None else None,
            label_offset_y=float(lo["y"]) if lo.get("y") is not None else None,
            source_side=data.get("sourceSide"),
            source_offset=(
                float(data["sourceOffset"])
                if data.get("sourceOffset") is not None
                else None
            ),
            target_side=data.get("targetSide"),
            target_offset=(
                float(data["targetOffset"])
                if data.get("targetOffset") is not None
                else None
            ),
        )

    def merge_patch(self, patch: dict[str, Any]) -> ViewEdgeLayout:
        routing = self.routing
        waypoints = self.waypoints
        label_offset_x = self.label_offset_x
        label_offset_y = self.label_offset_y
        source_side = self.source_side
        source_offset = self.source_offset
        target_side = self.target_side
        target_offset = self.target_offset
        if "routing" in patch and patch["routing"]:
            routing = str(patch["routing"])
        if "waypoints" in patch:
            waypoints = [Waypoint.from_dict(w) for w in patch["waypoints"] or []]
        if "labelOffset" in patch and patch["labelOffset"] is not None:
            lo = patch["labelOffset"] or {}
            label_offset_x = float(lo.get("x", 0) or 0)
            label_offset_y = float(lo.get("y", 0) or 0)
        if "sourceSide" in patch and patch["sourceSide"]:
            source_side = str(patch["sourceSide"])
        if "sourceOffset" in patch and patch["sourceOffset"] is not None:
            source_offset = float(patch["sourceOffset"])
        if "targetSide" in patch and patch["targetSide"]:
            target_side = str(patch["targetSide"])
        if "targetOffset" in patch and patch["targetOffset"] is not None:
            target_offset = float(patch["targetOffset"])
        return ViewEdgeLayout(
            routing=routing,
            waypoints=waypoints,
            label_offset_x=label_offset_x,
            label_offset_y=label_offset_y,
            source_side=source_side,
            source_offset=source_offset,
            target_side=target_side,
            target_offset=target_offset,
        )


@dataclass
class ViewLayout:
    nodes: dict[str, ViewNodeLayout] = field(default_factory=dict)
    edges: dict[str, ViewEdgeLayout] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"nodes": {k: v.to_dict() for k, v in self.nodes.items()}}
        if self.edges:
            out["edges"] = {k: v.to_dict() for k, v in self.edges.items()}
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ViewLayout:
        if not data:
            return cls()
        nodes = {
            k: ViewNodeLayout.from_dict(v)
            for k, v in (data.get("nodes") or {}).items()
        }
        edges = {
            k: ViewEdgeLayout.from_dict(v)
            for k, v in (data.get("edges") or {}).items()
        }
        return cls(nodes=nodes, edges=edges)


@dataclass
class ViewLayouts:
    """Map viewId → per-view node geometry."""

    by_view: dict[str, ViewLayout] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {vid: layout.to_dict() for vid, layout in self.by_view.items()}

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ViewLayouts:
        if not data:
            return cls()
        return cls(
            by_view={
                vid: ViewLayout.from_dict(layout)
                for vid, layout in data.items()
            }
        )

    def get_node(self, view_id: str, artifact_id: str) -> ViewNodeLayout | None:
        layout = self.by_view.get(view_id)
        if not layout:
            return None
        return layout.nodes.get(artifact_id)

    def get_edge(self, view_id: str, artifact_id: str) -> ViewEdgeLayout | None:
        layout = self.by_view.get(view_id)
        if not layout:
            return None
        return layout.edges.get(artifact_id)


def resolve_view_node(
    global_node: VisualizationNode,
    overlay: ViewNodeLayout | None = None,
) -> dict[str, Any]:
    """Merge global viz node with optional per-view geometry overlay."""
    out = global_node.to_dict()
    if overlay is None:
        return out
    if overlay.x is not None:
        out["x"] = overlay.x
    if overlay.y is not None:
        out["y"] = overlay.y
    if overlay.width is not None:
        out["width"] = overlay.width
    if overlay.height is not None:
        out["height"] = overlay.height
    return out


def resolve_view_edge(
    global_edge: VisualizationEdge,
    overlay: ViewEdgeLayout | None = None,
) -> dict[str, Any]:
    """Merge global viz edge with optional per-view routing/waypoints overlay."""
    out = global_edge.to_dict()
    if overlay is None:
        return out
    if overlay.routing is not None:
        out["routing"] = overlay.routing
    if overlay.waypoints is not None:
        out["waypoints"] = [w.to_dict() for w in overlay.waypoints]
    if overlay.label_offset_x is not None or overlay.label_offset_y is not None:
        lo = dict(out.get("labelOffset") or {"x": 0, "y": 0})
        if overlay.label_offset_x is not None:
            lo["x"] = overlay.label_offset_x
        if overlay.label_offset_y is not None:
            lo["y"] = overlay.label_offset_y
        out["labelOffset"] = lo
    if overlay.source_side is not None:
        out["sourceSide"] = overlay.source_side
    if overlay.source_offset is not None:
        out["sourceOffset"] = overlay.source_offset
    if overlay.target_side is not None:
        out["targetSide"] = overlay.target_side
    if overlay.target_offset is not None:
        out["targetOffset"] = overlay.target_offset
    return out


def apply_view_layout_patch(
    layouts: ViewLayouts,
    view_id: str,
    nodes_patch: dict[str, dict[str, Any]],
) -> ViewLayouts:
    """Upsert geometry-only fields into viewLayouts[viewId]."""
    by_view = dict(layouts.by_view)
    view_layout = by_view.get(view_id) or ViewLayout()
    nodes = dict(view_layout.nodes)
    for artifact_id, patch in nodes_patch.items():
        existing = nodes.get(artifact_id) or ViewNodeLayout()
        nodes[artifact_id] = existing.merge_patch(patch)
    by_view[view_id] = ViewLayout(nodes=nodes, edges=dict(view_layout.edges))
    return ViewLayouts(by_view=by_view)


def apply_view_layout_edge_patch(
    layouts: ViewLayouts,
    view_id: str,
    edges_patch: dict[str, dict[str, Any]],
) -> ViewLayouts:
    """Upsert routing/waypoints/labelOffset into viewLayouts[viewId]."""
    by_view = dict(layouts.by_view)
    view_layout = by_view.get(view_id) or ViewLayout()
    nodes = dict(view_layout.nodes)
    edges = dict(view_layout.edges)
    for artifact_id, patch in edges_patch.items():
        existing = edges.get(artifact_id) or ViewEdgeLayout()
        edges[artifact_id] = existing.merge_patch(patch)
    by_view[view_id] = ViewLayout(nodes=nodes, edges=edges)
    return ViewLayouts(by_view=by_view)
