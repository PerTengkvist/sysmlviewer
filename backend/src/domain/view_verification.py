"""Compare diagram geometry against what a view layout holds."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from domain.view_layouts import ViewLayout

POSITION_TOLERANCE_PX = 0.5
OFFSET_TOLERANCE = 0.001

_ZERO_OFFSET = {"x": 0.0, "y": 0.0}

# Field name and numeric tolerance; None means the values must be equal.
_PART_FIELDS: tuple[tuple[str, float | None], ...] = (
    ("x", POSITION_TOLERANCE_PX),
    ("y", POSITION_TOLERANCE_PX),
    ("width", POSITION_TOLERANCE_PX),
    ("height", POSITION_TOLERANCE_PX),
)
_PORT_FIELDS: tuple[tuple[str, float | None], ...] = (
    ("side", None),
    ("offset", OFFSET_TOLERANCE),
)
_PORT_KEYS = (*(name for name, _ in _PORT_FIELDS), "labelOffset")
_EDGE_FIELDS: tuple[tuple[str, float | None], ...] = (
    ("routing", None),
    ("sourceSide", None),
    ("sourceOffset", OFFSET_TOLERANCE),
    ("targetSide", None),
    ("targetOffset", OFFSET_TOLERANCE),
    ("sourceAnchorId", None),
    ("targetAnchorId", None),
)
_EDGE_KEYS = (
    *(name for name, _ in _EDGE_FIELDS),
    "waypoints",
    "labelOffset",
)


@dataclass(frozen=True)
class GeometrySnapshot:
    """Geometry per element id, in the same shape whatever its origin."""

    parts: dict[str, dict[str, Any]] = field(default_factory=dict)
    ports: dict[str, dict[str, Any]] = field(default_factory=dict)
    edges: dict[str, dict[str, Any]] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> GeometrySnapshot:
        return cls(
            parts=dict(data.get("parts") or {}),
            ports=dict(data.get("ports") or {}),
            edges=dict(data.get("edges") or {}),
        )


@dataclass(frozen=True)
class Mismatch:
    """One field that differs. ``field`` is ``entry`` when nothing is saved."""

    element: str
    id: str
    field: str
    canvas: Any
    saved: Any
    source: str


def snapshot_from_layout(layout: ViewLayout) -> GeometrySnapshot:
    parts: dict[str, dict[str, Any]] = {}
    ports: dict[str, dict[str, Any]] = {}
    for artifact_id, node in layout.nodes.items():
        data = node.to_dict()
        if any(name in data for name, _ in _PART_FIELDS):
            parts[artifact_id] = data
        if any(name in data for name in _PORT_KEYS):
            ports[artifact_id] = data
    edges = {k: v.to_dict() for k, v in layout.edges.items()}
    return GeometrySnapshot(parts=parts, ports=ports, edges=edges)


def snapshot_from_view_payload(payload: dict[str, Any]) -> GeometrySnapshot:
    """Geometry from a ``get_view`` result, which is what a reload receives."""
    visualization = payload.get("visualization") or {}
    nodes: dict[str, dict[str, Any]] = visualization.get("nodes") or {}
    edges: dict[str, dict[str, Any]] = visualization.get("edges") or {}
    return GeometrySnapshot(
        parts={
            artifact_id: {name: node.get(name) for name, _ in _PART_FIELDS}
            for artifact_id, node in nodes.items()
        },
        ports={
            artifact_id: {key: node.get(key) for key in _PORT_KEYS}
            for artifact_id, node in nodes.items()
            if node.get("side") is not None or node.get("labelOffset") is not None
        },
        edges={
            artifact_id: {key: edge.get(key) for key in _EDGE_KEYS}
            for artifact_id, edge in edges.items()
        },
    )


def compare_geometry(
    canvas: GeometrySnapshot,
    saved: GeometrySnapshot,
    *,
    source: str,
    partial: bool = False,
) -> list[Mismatch]:
    """List where ``saved`` differs from ``canvas``.

    Only what the canvas holds is compared, so elements hidden from the diagram
    never count. With ``partial`` a value that is not saved is not a mismatch,
    which suits layouts that only hold what has been placed by hand.
    """
    out: list[Mismatch] = []
    sections = (
        ("part", canvas.parts, saved.parts, _PART_FIELDS),
        ("port", canvas.ports, saved.ports, _PORT_FIELDS),
        ("edge", canvas.edges, saved.edges, _EDGE_FIELDS),
    )
    for element, canvas_section, saved_section, fields in sections:
        for artifact_id, canvas_entry in canvas_section.items():
            saved_entry = saved_section.get(artifact_id)
            if saved_entry is None:
                if not partial:
                    out.append(
                        Mismatch(
                            element, artifact_id, "entry", "present", None, source
                        )
                    )
                continue
            found = _compare_fields(canvas_entry, saved_entry, fields, partial)
            if element == "edge":
                found += _compare_edge_shape(canvas_entry, saved_entry, partial)
            if element == "port":
                found += _compare_label_offset(canvas_entry, saved_entry)
            out.extend(
                Mismatch(element, artifact_id, name, canvas_value, saved_value, source)
                for name, canvas_value, saved_value in found
            )
    return out


def _compare_fields(
    canvas_entry: dict[str, Any],
    saved_entry: dict[str, Any],
    fields: tuple[tuple[str, float | None], ...],
    partial: bool,
) -> list[tuple[str, Any, Any]]:
    out: list[tuple[str, Any, Any]] = []
    for name, tolerance in fields:
        canvas_value = canvas_entry.get(name)
        saved_value = saved_entry.get(name)
        if canvas_value is None or (partial and saved_value is None):
            continue
        if not _same(canvas_value, saved_value, tolerance):
            out.append((name, canvas_value, saved_value))
    return out


def _same(canvas_value: Any, saved_value: Any, tolerance: float | None) -> bool:
    if tolerance is None or saved_value is None:
        return canvas_value == saved_value
    return abs(float(canvas_value) - float(saved_value)) <= tolerance


def _compare_edge_shape(
    canvas_entry: dict[str, Any],
    saved_entry: dict[str, Any],
    partial: bool,
) -> list[tuple[str, Any, Any]]:
    out: list[tuple[str, Any, Any]] = []
    saved_points = saved_entry.get("waypoints") or []
    if "waypoints" in canvas_entry and not (partial and not saved_points):
        out += _compare_waypoints(canvas_entry["waypoints"] or [], saved_points)
    saved_label = saved_entry.get("labelOffset")
    if canvas_entry.get("labelOffset") is not None and not (
        partial and saved_label is None
    ):
        out += _compare_label_offset(canvas_entry, saved_entry)
    return out


def _compare_label_offset(
    canvas_entry: dict[str, Any],
    saved_entry: dict[str, Any],
) -> list[tuple[str, Any, Any]]:
    """A saved offset that is absent is the default place, which is zero."""
    canvas_offset = canvas_entry.get("labelOffset")
    if canvas_offset is None:
        return []
    saved_offset = saved_entry.get("labelOffset") or _ZERO_OFFSET
    out: list[tuple[str, Any, Any]] = []
    for axis in ("x", "y"):
        canvas_value = canvas_offset.get(axis, 0.0)
        saved_value = saved_offset.get(axis, 0.0)
        if not _same(canvas_value, saved_value, POSITION_TOLERANCE_PX):
            out.append((f"labelOffset.{axis}", canvas_value, saved_value))
    return out


def _compare_waypoints(
    canvas_points: list[dict[str, Any]],
    saved_points: list[dict[str, Any]],
) -> list[tuple[str, Any, Any]]:
    if len(canvas_points) != len(saved_points):
        return [("waypoints", len(canvas_points), len(saved_points))]
    out: list[tuple[str, Any, Any]] = []
    for index, (canvas_point, saved_point) in enumerate(
        zip(canvas_points, saved_points, strict=True)
    ):
        for axis in ("x", "y"):
            if not _same(canvas_point[axis], saved_point[axis], POSITION_TOLERANCE_PX):
                out.append(
                    (f"waypoints[{index}].{axis}", canvas_point[axis], saved_point[axis])
                )
    return out
