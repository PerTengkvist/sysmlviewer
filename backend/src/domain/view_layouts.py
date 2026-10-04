"""View-scoped node geometry overlays (x/y/width/height and boundary anchors)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from domain.models import VisualizationEdge, VisualizationNode, Waypoint

_ANCHOR_SIDES = frozenset({"left", "right", "top", "bottom"})


def parse_boundary_anchors(raw: Any) -> list[dict[str, Any]] | None:
    """Keep id/side/offset points. None means the patch did not set anchors."""
    if raw is None:
        return None
    if not isinstance(raw, list):
        return None
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        side = item.get("side")
        anchor_id = str(item.get("id") or "").strip()
        if side not in _ANCHOR_SIDES or not anchor_id:
            continue
        try:
            offset = float(item.get("offset", 0.5))
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "id": anchor_id,
                "side": side,
                "offset": max(0.0, min(1.0, offset)),
            }
        )
    return out


@dataclass
class ViewNodeLayout:
    """Per-view geometry for one artifact, plus optional boundary anchors."""

    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    side: str | None = None
    offset: float | None = None
    anchors: list[dict[str, Any]] | None = None
    edit_locked: bool | None = None

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
        if self.side is not None:
            out["side"] = self.side
        if self.offset is not None:
            out["offset"] = self.offset
        if self.anchors is not None:
            out["anchors"] = list(self.anchors)
        if self.edit_locked:
            out["editLocked"] = True
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
            side=str(data["side"]) if data.get("side") else None,
            offset=(
                float(data["offset"]) if data.get("offset") is not None else None
            ),
            anchors=parse_boundary_anchors(data.get("anchors"))
            if "anchors" in data
            else None,
            edit_locked=bool(data["editLocked"]) if "editLocked" in data else None,
        )

    def merge_patch(self, patch: dict[str, Any]) -> ViewNodeLayout:
        """Apply geometry fields from a patch; ignore style."""
        x = self.x
        y = self.y
        width = self.width
        height = self.height
        side = self.side
        offset = self.offset
        anchors = self.anchors
        edit_locked = self.edit_locked
        if "x" in patch and patch["x"] is not None:
            x = float(patch["x"])
        if "y" in patch and patch["y"] is not None:
            y = float(patch["y"])
        if "width" in patch and patch["width"] is not None:
            width = float(patch["width"])
        if "height" in patch and patch["height"] is not None:
            height = float(patch["height"])
        if "side" in patch and patch["side"]:
            side = str(patch["side"])
        if "offset" in patch and patch["offset"] is not None:
            offset = float(patch["offset"])
        if "anchors" in patch:
            anchors = parse_boundary_anchors(patch.get("anchors"))
        if "editLocked" in patch:
            edit_locked = bool(patch["editLocked"])
        return ViewNodeLayout(
            x=x,
            y=y,
            width=width,
            height=height,
            side=side,
            offset=offset,
            anchors=anchors,
            edit_locked=edit_locked,
        )


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
    source_anchor_id: str | None = None
    target_anchor_id: str | None = None
    edit_locked: bool | None = None

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
        if self.source_anchor_id is not None:
            out["sourceAnchorId"] = self.source_anchor_id
        if self.target_anchor_id is not None:
            out["targetAnchorId"] = self.target_anchor_id
        if self.edit_locked:
            out["editLocked"] = True
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
            source_anchor_id=data.get("sourceAnchorId") or None,
            target_anchor_id=data.get("targetAnchorId") or None,
            edit_locked=bool(data["editLocked"]) if "editLocked" in data else None,
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
        source_anchor_id = self.source_anchor_id
        target_anchor_id = self.target_anchor_id
        edit_locked = self.edit_locked
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
        if "sourceAnchorId" in patch and patch["sourceAnchorId"]:
            source_anchor_id = str(patch["sourceAnchorId"])
        if "targetAnchorId" in patch and patch["targetAnchorId"]:
            target_anchor_id = str(patch["targetAnchorId"])
        if "editLocked" in patch:
            edit_locked = bool(patch["editLocked"])
        return ViewEdgeLayout(
            routing=routing,
            waypoints=waypoints,
            label_offset_x=label_offset_x,
            label_offset_y=label_offset_y,
            source_side=source_side,
            source_offset=source_offset,
            target_side=target_side,
            target_offset=target_offset,
            source_anchor_id=source_anchor_id,
            target_anchor_id=target_anchor_id,
            edit_locked=edit_locked,
        )


@dataclass
class ViewLayout:
    nodes: dict[str, ViewNodeLayout] = field(default_factory=dict)
    edges: dict[str, ViewEdgeLayout] = field(default_factory=dict)
    # None → inherit global Settings hierarchical levels for this view
    hierarchical_levels_override: int | None = None
    view_filters: list[dict[str, Any]] = field(default_factory=list)
    layout_rules: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"nodes": {k: v.to_dict() for k, v in self.nodes.items()}}
        if self.edges:
            out["edges"] = {k: v.to_dict() for k, v in self.edges.items()}
        if self.hierarchical_levels_override is not None:
            out["hierarchicalLevelsOverride"] = self.hierarchical_levels_override
        if self.view_filters:
            out["viewFilters"] = list(self.view_filters)
        if self.layout_rules:
            out["layoutRules"] = list(self.layout_rules)
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
        raw_override = data.get("hierarchicalLevelsOverride")
        override: int | None = None
        if raw_override is not None:
            try:
                override = max(1, int(raw_override))
            except (TypeError, ValueError):
                override = None
        filters = _normalize_view_filters(data.get("viewFilters"))
        rules = _normalize_layout_rules(data.get("layoutRules"))
        return cls(
            nodes=nodes,
            edges=edges,
            hierarchical_levels_override=override,
            view_filters=filters,
            layout_rules=rules,
        )


def _normalize_view_filters(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        row_id = str(item.get("id") or "").strip()
        kind = str(item.get("kind") or "").strip()
        if not row_id or not kind:
            continue
        match_field = str(item.get("matchField") or "name").strip().lower()
        if match_field not in ("name", "stereotype", "any"):
            match_field = "name"
        out.append(
            {
                "id": row_id,
                "kind": kind,
                "matchField": match_field,
                "namePattern": str(
                    item.get("namePattern") or item.get("pattern") or "*"
                ),
                "enabled": bool(item.get("enabled")),
            }
        )
    return out


def _normalize_layout_rules(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        row_id = str(item.get("id") or "").strip()
        kind = str(item.get("kind") or "").strip()
        placement = str(item.get("placement") or "").strip()
        if not row_id or not kind or not placement:
            continue
        peer_kind = item.get("peerKind")
        peer_name = item.get("peerNamePattern")
        out.append(
            {
                "id": row_id,
                "kind": kind,
                "namePattern": str(item.get("namePattern") or "*"),
                "placement": placement,
                "peerKind": str(peer_kind) if peer_kind else None,
                "peerNamePattern": str(peer_name) if peer_name else None,
            }
        )
    return out


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
    if overlay.side is not None:
        out["side"] = overlay.side
    if overlay.offset is not None:
        out["offset"] = overlay.offset
    if overlay.anchors is not None:
        out["anchors"] = list(overlay.anchors)
    stamp_edit_lock(out, overlay.edit_locked)
    return out


def layout_has_local_geometry(layout: ViewLayout | None) -> bool:
    """True when the view layout already places at least one node in view space."""
    if layout is None:
        return False
    return any(n.x is not None or n.y is not None for n in layout.nodes.values())


def default_view_local_xy(index: int) -> tuple[float, float]:
    """Grid position for a node newly appearing in a view that already has a layout."""
    col = index % 3
    row = index // 3
    return 80.0 + col * 280.0, 80.0 + row * 180.0


def overlay_has_xy(overlay: ViewNodeLayout | None) -> bool:
    return overlay is not None and (overlay.x is not None or overlay.y is not None)


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
    if overlay.source_anchor_id is not None:
        out["sourceAnchorId"] = overlay.source_anchor_id
    if overlay.target_anchor_id is not None:
        out["targetAnchorId"] = overlay.target_anchor_id
    stamp_edit_lock(out, overlay.edit_locked)
    return out


def stamp_edit_lock(out: dict[str, Any], locked: bool | None) -> None:
    """Overlay wins. True sets the flag; False clears a global lock; None leaves it."""
    if locked is True:
        out["editLocked"] = True
    elif locked is False:
        out.pop("editLocked", None)


def _copy_view_layout(
    view_layout: ViewLayout,
    *,
    nodes: dict[str, ViewNodeLayout] | None = None,
    edges: dict[str, ViewEdgeLayout] | None = None,
    hierarchical_levels_override: int | None | object = ...,
    view_filters: list[dict[str, Any]] | None = None,
    layout_rules: list[dict[str, Any]] | None = None,
) -> ViewLayout:
    """Rebuild ViewLayout while preserving fields not explicitly overridden."""
    override = view_layout.hierarchical_levels_override
    if hierarchical_levels_override is not ...:
        override = hierarchical_levels_override  # type: ignore[assignment]
    return ViewLayout(
        nodes=nodes if nodes is not None else dict(view_layout.nodes),
        edges=edges if edges is not None else dict(view_layout.edges),
        hierarchical_levels_override=override,
        view_filters=(
            list(view_filters)
            if view_filters is not None
            else list(view_layout.view_filters)
        ),
        layout_rules=(
            list(layout_rules)
            if layout_rules is not None
            else list(view_layout.layout_rules)
        ),
    )


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
    by_view[view_id] = _copy_view_layout(view_layout, nodes=nodes)
    return ViewLayouts(by_view=by_view)


def apply_view_layout_edge_patch(
    layouts: ViewLayouts,
    view_id: str,
    edges_patch: dict[str, dict[str, Any]],
) -> ViewLayouts:
    """Upsert routing/waypoints/labelOffset into viewLayouts[viewId]."""
    by_view = dict(layouts.by_view)
    view_layout = by_view.get(view_id) or ViewLayout()
    edges = dict(view_layout.edges)
    for artifact_id, patch in edges_patch.items():
        existing = edges.get(artifact_id) or ViewEdgeLayout()
        edges[artifact_id] = existing.merge_patch(patch)
    by_view[view_id] = _copy_view_layout(view_layout, edges=edges)
    return ViewLayouts(by_view=by_view)


def apply_view_hierarchy_override(
    layouts: ViewLayouts,
    view_id: str,
    override: int | None,
) -> ViewLayouts:
    """Set or clear per-view hierarchicalLevelsOverride (None clears)."""
    by_view = dict(layouts.by_view)
    view_layout = by_view.get(view_id) or ViewLayout()
    levels = max(1, int(override)) if override is not None else None
    by_view[view_id] = _copy_view_layout(
        view_layout, hierarchical_levels_override=levels
    )
    return ViewLayouts(by_view=by_view)


def apply_view_filters(
    layouts: ViewLayouts,
    view_id: str,
    filters: list[dict[str, Any]] | None,
) -> ViewLayouts:
    """Replace per-view viewFilters list (None or [] clears)."""
    by_view = dict(layouts.by_view)
    view_layout = by_view.get(view_id) or ViewLayout()
    by_view[view_id] = _copy_view_layout(
        view_layout,
        view_filters=_normalize_view_filters(filters or []),
    )
    return ViewLayouts(by_view=by_view)


def apply_layout_rules(
    layouts: ViewLayouts,
    view_id: str,
    rules: list[dict[str, Any]] | None,
) -> ViewLayouts:
    """Replace per-view layoutRules list (None or [] clears)."""
    by_view = dict(layouts.by_view)
    view_layout = by_view.get(view_id) or ViewLayout()
    by_view[view_id] = _copy_view_layout(
        view_layout,
        layout_rules=_normalize_layout_rules(rules or []),
    )
    return ViewLayouts(by_view=by_view)
