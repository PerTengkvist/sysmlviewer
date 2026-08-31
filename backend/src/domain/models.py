from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class ArtifactKind(str, Enum):
    PACKAGE = "package"
    PART = "part"
    PORT = "port"
    CONNECTION = "connection"
    DEPENDENCY = "dependency"
    ALLOCATION = "allocation"
    BINDING = "binding"
    FLOW = "flow"
    SPECIALIZATION = "specialization"
    SUBSETTING = "subsetting"
    REDEFINITION = "redefinition"
    VIEW = "view"
    ATTRIBUTE = "attribute"
    INTERACTION = "interaction"
    LIFELINE = "lifeline"
    MESSAGE = "message"
    STATE = "state"
    TRANSITION = "transition"
    ACTION = "action"
    SUCCESSION = "succession"


class RoutingType(str, Enum):
    ANGULAR = "angular"
    DIRECT = "direct"
    SPLINE = "spline"


class PortSide(str, Enum):
    LEFT = "left"
    RIGHT = "right"
    TOP = "top"
    BOTTOM = "bottom"


@dataclass
class ElementStyleMode:
    background_color: str | None = None
    line_color: str | None = None
    text_color: str | None = None
    line_thickness: float | None = None
    line_style: str | None = None
    marker_end: str | None = None
    marker_start: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if self.background_color is not None:
            out["backgroundColor"] = self.background_color
        if self.line_color is not None:
            out["lineColor"] = self.line_color
        if self.text_color is not None:
            out["textColor"] = self.text_color
        if self.line_thickness is not None:
            out["lineThickness"] = self.line_thickness
        if self.line_style is not None:
            out["lineStyle"] = self.line_style
        if self.marker_end is not None:
            out["markerEnd"] = self.marker_end
        if self.marker_start is not None:
            out["markerStart"] = self.marker_start
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ElementStyleMode | None:
        if not data:
            return None
        return cls(
            background_color=data.get("backgroundColor"),
            line_color=data.get("lineColor"),
            text_color=data.get("textColor"),
            line_thickness=(
                float(data["lineThickness"])
                if data.get("lineThickness") is not None
                else None
            ),
            line_style=data.get("lineStyle"),
            marker_end=data.get("markerEnd"),
            marker_start=data.get("markerStart"),
        )

    def merge(self, patch: dict[str, Any]) -> None:
        if "backgroundColor" in patch:
            self.background_color = patch["backgroundColor"]
        if "lineColor" in patch:
            self.line_color = patch["lineColor"]
        if "textColor" in patch:
            self.text_color = patch["textColor"]
        if "lineThickness" in patch:
            val = patch["lineThickness"]
            self.line_thickness = float(val) if val is not None else None
        if "lineStyle" in patch:
            self.line_style = patch["lineStyle"]
        if "markerEnd" in patch:
            self.marker_end = patch["markerEnd"]
        if "markerStart" in patch:
            self.marker_start = patch["markerStart"]


@dataclass
class ElementStyle:
    light: ElementStyleMode | None = None
    dark: ElementStyleMode | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if self.light is not None:
            light = self.light.to_dict()
            if light:
                out["light"] = light
        if self.dark is not None:
            dark = self.dark.to_dict()
            if dark:
                out["dark"] = dark
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ElementStyle | None:
        if not data:
            return None
        light = ElementStyleMode.from_dict(data.get("light"))
        dark = ElementStyleMode.from_dict(data.get("dark"))
        if light is None and dark is None:
            return None
        return cls(light=light, dark=dark)

    def merge(self, patch: dict[str, Any]) -> None:
        if "light" in patch and patch["light"] is not None:
            if self.light is None:
                self.light = ElementStyleMode()
            self.light.merge(patch["light"])
        if "dark" in patch and patch["dark"] is not None:
            if self.dark is None:
                self.dark = ElementStyleMode()
            self.dark.merge(patch["dark"])


@dataclass
class SemanticElement:
    id: str
    kind: ArtifactKind
    name: str
    parent_id: str | None = None
    type_ref: str | None = None
    source_id: str | None = None
    target_id: str | None = None
    # For view elements: qualified id of the exposed root artifact
    expose_ref: str | None = None
    # Optional default value for attributes/ports (SysML `= …`)
    default_value: str | None = None
    # Optional multiplicity for part usages, e.g. `0..*` from `part x [0..*] : Type`
    multiplicity: str | None = None
    children: list[str] = field(default_factory=list)
    file_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind.value,
            "name": self.name,
            "parentId": self.parent_id,
            "typeRef": self.type_ref,
            "sourceId": self.source_id,
            "targetId": self.target_id,
            "exposeRef": self.expose_ref,
            "defaultValue": self.default_value,
            "multiplicity": self.multiplicity,
            "children": list(self.children),
            "fileId": self.file_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SemanticElement:
        return cls(
            id=data["id"],
            kind=ArtifactKind(data["kind"]),
            name=data["name"],
            parent_id=data.get("parentId"),
            type_ref=data.get("typeRef"),
            source_id=data.get("sourceId"),
            target_id=data.get("targetId"),
            expose_ref=data.get("exposeRef"),
            default_value=data.get("defaultValue"),
            multiplicity=data.get("multiplicity"),
            children=list(data.get("children") or []),
            file_id=data.get("fileId"),
        )


@dataclass
class VisualizationNode:
    artifact_id: str
    x: float = 0.0
    y: float = 0.0
    width: float = 180.0
    height: float = 100.0
    symbol_ref: str = "default-part"
    side: PortSide | None = None
    offset: float | None = None
    style: ElementStyle | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "artifactId": self.artifact_id,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "symbolRef": self.symbol_ref,
            "side": self.side.value if self.side else None,
            "offset": self.offset,
        }
        if self.style is not None:
            style = self.style.to_dict()
            if style:
                out["style"] = style
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> VisualizationNode:
        side = data.get("side")
        return cls(
            artifact_id=data["artifactId"],
            x=float(data.get("x", 0)),
            y=float(data.get("y", 0)),
            width=float(data.get("width", 180)),
            height=float(data.get("height", 100)),
            symbol_ref=data.get("symbolRef") or "default-part",
            side=PortSide(side) if side else None,
            offset=data.get("offset"),
            style=ElementStyle.from_dict(data.get("style")),
        )


@dataclass
class Waypoint:
    x: float
    y: float
    locked: bool = False

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"x": self.x, "y": self.y}
        if self.locked:
            out["locked"] = True
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Waypoint:
        return cls(
            x=float(data["x"]),
            y=float(data["y"]),
            locked=bool(data.get("locked", False)),
        )


@dataclass
class VisualizationEdge:
    artifact_id: str
    routing: RoutingType = RoutingType.ANGULAR
    waypoints: list[Waypoint] = field(default_factory=list)
    label_offset_x: float = 0.0
    label_offset_y: float = 0.0
    style: ElementStyle | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "artifactId": self.artifact_id,
            "routing": self.routing.value,
            "waypoints": [w.to_dict() for w in self.waypoints],
            "labelOffset": {
                "x": self.label_offset_x,
                "y": self.label_offset_y,
            },
        }
        if self.style is not None:
            style = self.style.to_dict()
            if style:
                out["style"] = style
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> VisualizationEdge:
        lo = data.get("labelOffset") or {}
        return cls(
            artifact_id=data["artifactId"],
            routing=RoutingType(data.get("routing", RoutingType.ANGULAR.value)),
            waypoints=[Waypoint.from_dict(w) for w in data.get("waypoints") or []],
            label_offset_x=float(lo.get("x", 0) or 0),
            label_offset_y=float(lo.get("y", 0) or 0),
            style=ElementStyle.from_dict(data.get("style")),
        )


@dataclass
class VisualizationModel:
    nodes: dict[str, VisualizationNode] = field(default_factory=dict)
    edges: dict[str, VisualizationEdge] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes": {k: v.to_dict() for k, v in self.nodes.items()},
            "edges": {k: v.to_dict() for k, v in self.edges.items()},
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> VisualizationModel:
        if not data:
            return cls()
        nodes = {
            k: VisualizationNode.from_dict(v)
            for k, v in (data.get("nodes") or {}).items()
        }
        edges = {
            k: VisualizationEdge.from_dict(v)
            for k, v in (data.get("edges") or {}).items()
        }
        return cls(nodes=nodes, edges=edges)


@dataclass
class ViewDef:
    id: str
    name: str
    root_artifact_id: str
    parent_view_id: str | None = None
    type_ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "rootArtifactId": self.root_artifact_id,
            "parentViewId": self.parent_view_id,
            "typeRef": self.type_ref,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ViewDef:
        return cls(
            id=data["id"],
            name=data["name"],
            root_artifact_id=data["rootArtifactId"],
            parent_view_id=data.get("parentViewId"),
            type_ref=data.get("typeRef"),
        )


@dataclass
class SysmlFile:
    id: str
    name: str
    content: str
    warnings: list[str] = field(default_factory=list)
    source_path: str | None = None
    # Relative path within the project directory (on-disk location)
    path: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "content": self.content,
            "warnings": list(self.warnings),
            "sourcePath": self.source_path,
            "path": self.path or self.name,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SysmlFile:
        name = data["name"]
        return cls(
            id=data["id"],
            name=name,
            content=data.get("content") or "",
            warnings=list(data.get("warnings") or []),
            source_path=data.get("sourcePath"),
            path=data.get("path") or name,
        )

    def relative_path(self) -> str:
        return self.path or self.name


def default_sheet() -> dict[str, Any]:
    return {"titleBlock": None, "frame": None}


@dataclass
class Project:
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    files: list[SysmlFile] = field(default_factory=list)
    semantic: dict[str, SemanticElement] = field(default_factory=dict)
    visualization: VisualizationModel = field(default_factory=VisualizationModel)
    views: list[ViewDef] = field(default_factory=list)
    sheet: dict[str, Any] | None = None
    view_layouts: Any = None  # ViewLayouts; typed loosely to avoid cycle

    def __post_init__(self) -> None:
        if self.view_layouts is None:
            from domain.view_layouts import ViewLayouts

            self.view_layouts = ViewLayouts()

    def to_dict(self) -> dict[str, Any]:
        sheet = self.sheet if self.sheet is not None else default_sheet()
        from domain.view_layouts import ViewLayouts

        layouts = self.view_layouts if isinstance(self.view_layouts, ViewLayouts) else ViewLayouts()
        return {
            "id": self.id,
            "name": self.name,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
            "files": [f.to_dict() for f in self.files],
            "semantic": {k: v.to_dict() for k, v in self.semantic.items()},
            "visualization": self.visualization.to_dict(),
            "views": [v.to_dict() for v in self.views],
            "sheet": sheet,
            "viewLayouts": layouts.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Project:
        from domain.view_layouts import ViewLayouts

        sheet = data.get("sheet")
        if sheet is None:
            sheet = default_sheet()
        return cls(
            id=data["id"],
            name=data["name"],
            created_at=datetime.fromisoformat(data["createdAt"]),
            updated_at=datetime.fromisoformat(data["updatedAt"]),
            files=[SysmlFile.from_dict(f) for f in data.get("files") or []],
            semantic={
                k: SemanticElement.from_dict(v)
                for k, v in (data.get("semantic") or {}).items()
            },
            visualization=VisualizationModel.from_dict(data.get("visualization")),
            views=[ViewDef.from_dict(v) for v in data.get("views") or []],
            sheet=sheet,
            view_layouts=ViewLayouts.from_dict(data.get("viewLayouts")),
        )

    @classmethod
    def create(cls, name: str) -> Project:
        now = utc_now()
        return cls(
            id=new_id(),
            name=name,
            created_at=now,
            updated_at=now,
            sheet=default_sheet(),
        )
