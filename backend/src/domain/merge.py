from __future__ import annotations

from domain.models import (
    ArtifactKind,
    ElementStyle,
    ElementStyleMode,
    PortSide,
    RoutingType,
    SemanticElement,
    VisualizationEdge,
    VisualizationModel,
    VisualizationNode,
    ViewDef,
)


DEFAULT_PART_WIDTH = 200.0
DEFAULT_PART_HEIGHT = 120.0
DEFAULT_PACKAGE_WIDTH = 320.0
DEFAULT_PACKAGE_HEIGHT = 220.0
DEFAULT_STATE_WIDTH = 140.0
DEFAULT_STATE_HEIGHT = 72.0
DEFAULT_ACTION_WIDTH = 140.0
DEFAULT_ACTION_HEIGHT = 56.0
DEFAULT_LIFELINE_WIDTH = 120.0
DEFAULT_LIFELINE_HEIGHT = 48.0
DEFAULT_TREE_WIDTH = 160.0
DEFAULT_TREE_HEIGHT = 40.0

# Keep default L/R ports in the part body (below header), not over title text.
PORT_BODY_OFFSET_MIN = 0.45
PORT_BODY_OFFSET_MAX = 0.92
PORT_CHAR_W = 7.2
PORT_ROW_PX = 22.0
PART_HEADER_PX = 48.0
PART_PAD_X = 20.0
PART_PAD_BOTTOM = 14.0


def _pack_body_offsets(count: int) -> list[float]:
    if count <= 0:
        return []
    lo = PORT_BODY_OFFSET_MIN
    hi = PORT_BODY_OFFSET_MAX
    if count == 1:
        return [(lo + hi) / 2.0]
    return [lo + (i + 0.5) / count * (hi - lo) for i in range(count)]


def _estimate_part_size_for_ports(
    part_name: str,
    ports: list[tuple[str, PortSide]],
) -> tuple[float, float]:
    left_names = [n for n, s in ports if s == PortSide.LEFT]
    right_names = [n for n, s in ports if s == PortSide.RIGHT]
    left_w = max((len(n) * PORT_CHAR_W for n in left_names), default=0.0)
    right_w = max((len(n) * PORT_CHAR_W for n in right_names), default=0.0)
    title_w = max(24.0, len(part_name) * 8.0) + 36.0
    width = max(DEFAULT_PART_WIDTH, title_w, PART_PAD_X * 2 + left_w + right_w + 10.0)
    rows = max(len(left_names), len(right_names), 1)
    height = max(
        DEFAULT_PART_HEIGHT,
        PART_HEADER_PX + rows * PORT_ROW_PX + PART_PAD_BOTTOM,
    )
    return width, height


EDGE_KINDS = {
    ArtifactKind.CONNECTION,
    ArtifactKind.DEPENDENCY,
    ArtifactKind.ALLOCATION,
    ArtifactKind.BINDING,
    ArtifactKind.FLOW,
    ArtifactKind.SPECIALIZATION,
    ArtifactKind.SUBSETTING,
    ArtifactKind.REDEFINITION,
    ArtifactKind.MESSAGE,
    ArtifactKind.TRANSITION,
    ArtifactKind.SUCCESSION,
}

DEFAULT_EDGE_STYLE: dict[ArtifactKind, dict[str, str | None]] = {
    ArtifactKind.CONNECTION: {
        "line_style": "solid",
        "marker_end": None,
        "marker_start": None,
    },
    ArtifactKind.DEPENDENCY: {
        "line_style": "dashed",
        "marker_end": "openArrow",
        "marker_start": None,
    },
    ArtifactKind.ALLOCATION: {
        "line_style": "dashed",
        "marker_end": "arrow",
        "marker_start": None,
    },
    ArtifactKind.BINDING: {
        "line_style": "dotted",
        "marker_end": None,
        "marker_start": None,
    },
    ArtifactKind.FLOW: {
        "line_style": "solid",
        "marker_end": "arrow",
        "marker_start": None,
    },
    ArtifactKind.SPECIALIZATION: {
        "line_style": "solid",
        "marker_end": "hollowTriangle",
        "marker_start": None,
    },
    ArtifactKind.SUBSETTING: {
        "line_style": "dashed",
        "marker_end": "hollowTriangle",
        "marker_start": None,
    },
    ArtifactKind.REDEFINITION: {
        "line_style": "solid",
        "marker_end": "triangle",
        "marker_start": None,
    },
}

STRUCTURE_EDGE_KINDS = {
    ArtifactKind.CONNECTION,
    ArtifactKind.DEPENDENCY,
    ArtifactKind.ALLOCATION,
    ArtifactKind.BINDING,
    ArtifactKind.FLOW,
    ArtifactKind.SPECIALIZATION,
    ArtifactKind.SUBSETTING,
    ArtifactKind.REDEFINITION,
}


def get_default_edge_style(kind: ArtifactKind) -> ElementStyle:
    defaults = DEFAULT_EDGE_STYLE.get(kind, DEFAULT_EDGE_STYLE[ArtifactKind.CONNECTION])
    mode = ElementStyleMode(
        line_style=defaults.get("line_style"),
        marker_end=defaults.get("marker_end"),
        marker_start=defaults.get("marker_start"),
    )
    return ElementStyle(light=mode, dark=ElementStyleMode(
        line_style=defaults.get("line_style"),
        marker_end=defaults.get("marker_end"),
        marker_start=defaults.get("marker_start"),
    ))

NODE_KINDS = {
    ArtifactKind.PACKAGE,
    ArtifactKind.PART,
    ArtifactKind.PORT,
    ArtifactKind.INTERACTION,
    ArtifactKind.LIFELINE,
    ArtifactKind.STATE,
    ArtifactKind.ACTION,
}


def _default_node(
    element: SemanticElement,
    index: int,
    *,
    port_side: PortSide | None = None,
    port_offset: float | None = None,
) -> VisualizationNode:
    col = index % 3
    row = index // 3
    x = 80.0 + col * 280.0
    y = 80.0 + row * 180.0

    if element.kind == ArtifactKind.PORT:
        return VisualizationNode(
            artifact_id=element.id,
            x=0,
            y=0,
            width=12,
            height=12,
            symbol_ref="default-port",
            side=port_side
            if port_side is not None
            else (PortSide.RIGHT if index % 2 == 0 else PortSide.LEFT),
            offset=port_offset
            if port_offset is not None
            else (PORT_BODY_OFFSET_MIN + PORT_BODY_OFFSET_MAX) / 2.0,
        )
    if element.kind == ArtifactKind.PACKAGE:
        return VisualizationNode(
            artifact_id=element.id,
            x=x,
            y=y,
            width=DEFAULT_PACKAGE_WIDTH,
            height=DEFAULT_PACKAGE_HEIGHT,
            symbol_ref="default-package",
        )
    if element.kind == ArtifactKind.LIFELINE:
        # `index` for lifelines is sibling order under the interaction (see merge).
        return VisualizationNode(
            artifact_id=element.id,
            x=60.0 + index * 160.0,
            y=40.0,
            width=DEFAULT_LIFELINE_WIDTH,
            height=DEFAULT_LIFELINE_HEIGHT,
            symbol_ref="default-lifeline",
        )
    if element.kind == ArtifactKind.STATE:
        return VisualizationNode(
            artifact_id=element.id,
            x=x,
            y=y,
            width=DEFAULT_STATE_WIDTH,
            height=DEFAULT_STATE_HEIGHT,
            symbol_ref="default-state",
        )
    if element.kind == ArtifactKind.ACTION:
        return VisualizationNode(
            artifact_id=element.id,
            x=80.0 + index * 200.0,
            y=120.0,
            width=DEFAULT_ACTION_WIDTH,
            height=DEFAULT_ACTION_HEIGHT,
            symbol_ref="default-action",
        )
    if element.kind == ArtifactKind.INTERACTION:
        return VisualizationNode(
            artifact_id=element.id,
            x=40.0,
            y=20.0,
            width=480.0,
            height=320.0,
            symbol_ref="default-interaction",
        )
    return VisualizationNode(
        artifact_id=element.id,
        x=x,
        y=y,
        width=DEFAULT_PART_WIDTH,
        height=DEFAULT_PART_HEIGHT,
        symbol_ref="default-part",
    )


def merge_visualization(
    semantic: dict[str, SemanticElement],
    existing: VisualizationModel | None = None,
) -> VisualizationModel:
    """Merge semantic artifacts into visualization, preserving layout by artifact id."""
    existing = existing or VisualizationModel()
    nodes: dict[str, VisualizationNode] = {}
    edges: dict[str, VisualizationEdge] = {}

    part_like = [
        e
        for e in semantic.values()
        if e.kind
        in {
            ArtifactKind.PACKAGE,
            ArtifactKind.PART,
            ArtifactKind.LIFELINE,
            ArtifactKind.STATE,
            ArtifactKind.ACTION,
            ArtifactKind.INTERACTION,
        }
    ]
    part_index = {e.id: i for i, e in enumerate(part_like)}

    # Sibling ports under the same parent — stable body packing for defaults
    ports_by_parent: dict[str | None, list[SemanticElement]] = {}
    for element in semantic.values():
        if element.kind != ArtifactKind.PORT:
            continue
        ports_by_parent.setdefault(element.parent_id, []).append(element)
    for siblings in ports_by_parent.values():
        siblings.sort(key=lambda e: e.id)
    port_placement: dict[str, tuple[PortSide, float]] = {}
    for siblings in ports_by_parent.values():
        offsets = _pack_body_offsets(len(siblings))
        for i, port in enumerate(siblings):
            side = PortSide.LEFT if i % 2 == 0 else PortSide.RIGHT
            port_placement[port.id] = (side, offsets[i])

    for element in semantic.values():
        if element.kind in EDGE_KINDS:
            if element.id in existing.edges:
                edges[element.id] = existing.edges[element.id]
            else:
                routing = (
                    RoutingType.DIRECT
                    if element.kind
                    in {
                        ArtifactKind.MESSAGE,
                        ArtifactKind.SUCCESSION,
                        ArtifactKind.DEPENDENCY,
                        ArtifactKind.ALLOCATION,
                        ArtifactKind.BINDING,
                        ArtifactKind.FLOW,
                        ArtifactKind.SPECIALIZATION,
                        ArtifactKind.SUBSETTING,
                        ArtifactKind.REDEFINITION,
                    }
                    else RoutingType.ANGULAR
                )
                style = (
                    get_default_edge_style(element.kind)
                    if element.kind in STRUCTURE_EDGE_KINDS
                    else None
                )
                edges[element.id] = VisualizationEdge(
                    artifact_id=element.id,
                    routing=routing,
                    waypoints=[],
                    style=style,
                )
            continue

        if element.kind not in NODE_KINDS:
            continue

        if element.id in existing.nodes:
            node = existing.nodes[element.id]
            # Keep geometry; refresh symbol defaults if missing
            if not node.symbol_ref:
                node.symbol_ref = f"default-{element.kind.value}"
            nodes[element.id] = node
        else:
            if element.kind == ArtifactKind.LIFELINE:
                siblings = sorted(
                    (
                        e
                        for e in semantic.values()
                        if e.kind == ArtifactKind.LIFELINE
                        and e.parent_id == element.parent_id
                    ),
                    key=lambda e: e.id,
                )
                idx = next(
                    (i for i, e in enumerate(siblings) if e.id == element.id),
                    0,
                )
                nodes[element.id] = _default_node(element, idx)
            elif element.kind == ArtifactKind.PORT:
                side, offset = port_placement.get(
                    element.id,
                    (PortSide.RIGHT, (PORT_BODY_OFFSET_MIN + PORT_BODY_OFFSET_MAX) / 2),
                )
                nodes[element.id] = _default_node(
                    element,
                    0,
                    port_side=side,
                    port_offset=offset,
                )
            else:
                idx = part_index.get(element.id, len(nodes))
                nodes[element.id] = _default_node(element, idx)

    # Grow default-sized parts so port names fit in the body
    for part in semantic.values():
        if part.kind != ArtifactKind.PART:
            continue
        node = nodes.get(part.id)
        if not node:
            continue
        port_specs: list[tuple[str, PortSide]] = []
        for cid in part.children:
            child = semantic.get(cid)
            if not child or child.kind != ArtifactKind.PORT:
                continue
            pv = nodes.get(cid)
            if not pv or pv.side is None:
                continue
            port_specs.append((child.name, pv.side))
        if not port_specs:
            continue
        need_w, need_h = _estimate_part_size_for_ports(part.name, port_specs)
        if node.width < need_w:
            node.width = need_w
        if node.height < need_h:
            node.height = need_h

    return VisualizationModel(nodes=nodes, edges=edges)


def rebuild_views(semantic: dict[str, SemanticElement]) -> list[ViewDef]:
    """Build Views list from declared SysML `view` elements only (not parts/packages)."""
    views: list[ViewDef] = []
    declared = [e for e in semantic.values() if e.kind == ArtifactKind.VIEW]
    declared.sort(key=lambda e: e.id)

    for el in declared:
        root_id = el.expose_ref
        if not root_id or root_id not in semantic:
            # Fall back to parent package if expose missing/unresolved
            root_id = el.parent_id or el.id
        parent_view_id = None
        if el.parent_id:
            # Nest under a view that exposes the parent package, if any
            for other in declared:
                if other.expose_ref == el.parent_id:
                    parent_view_id = other.id
                    break
        views.append(
            ViewDef(
                id=el.id,
                name=el.name,
                root_artifact_id=root_id,
                parent_view_id=parent_view_id,
                type_ref=el.type_ref,
            )
        )

    return views


def artifact_diagram_view_id(artifact_id: str) -> str:
    return f"artifact::{artifact_id}"


def child_view_ids(
    artifact_id: str, views: list[ViewDef], semantic: dict[str, SemanticElement]
) -> list[dict[str, str]]:
    """Sub-diagrams for >> menu: declared views + child part artefacts."""
    result: list[dict[str, str]] = []
    seen: set[str] = set()

    for view in views:
        if view.root_artifact_id == artifact_id and view.id not in seen:
            result.append({"viewId": view.id, "name": view.name})
            seen.add(view.id)

    element = semantic.get(artifact_id)
    if not element:
        return result

    for child_id in element.children:
        child = semantic.get(child_id)
        if not child or child.kind != ArtifactKind.PART:
            continue
        # Prefer a declared view exposing this child
        declared = next((v for v in views if v.root_artifact_id == child_id), None)
        view_id = declared.id if declared else artifact_diagram_view_id(child_id)
        if view_id in seen:
            continue
        result.append({"viewId": view_id, "name": child.name})
        seen.add(view_id)
    return result
