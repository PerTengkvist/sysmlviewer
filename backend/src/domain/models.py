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
    VIEW = "view"
    ATTRIBUTE = "attribute"


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

    def to_dict(self) -> dict[str, Any]:
        return {
            "artifactId": self.artifact_id,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "symbolRef": self.symbol_ref,
            "side": self.side.value if self.side else None,
            "offset": self.offset,
        }

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
        )


@dataclass
class Waypoint:
    x: float
    y: float

    def to_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Waypoint:
        return cls(x=float(data["x"]), y=float(data["y"]))


@dataclass
class VisualizationEdge:
    artifact_id: str
    routing: RoutingType = RoutingType.ANGULAR
    waypoints: list[Waypoint] = field(default_factory=list)
    label_offset_x: float = 0.0
    label_offset_y: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "artifactId": self.artifact_id,
            "routing": self.routing.value,
            "waypoints": [w.to_dict() for w in self.waypoints],
            "labelOffset": {
                "x": self.label_offset_x,
                "y": self.label_offset_y,
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> VisualizationEdge:
        lo = data.get("labelOffset") or {}
        return cls(
            artifact_id=data["artifactId"],
            routing=RoutingType(data.get("routing", RoutingType.ANGULAR.value)),
            waypoints=[Waypoint.from_dict(w) for w in data.get("waypoints") or []],
            label_offset_x=float(lo.get("x", 0) or 0),
            label_offset_y=float(lo.get("y", 0) or 0),
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

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "rootArtifactId": self.root_artifact_id,
            "parentViewId": self.parent_view_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ViewDef:
        return cls(
            id=data["id"],
            name=data["name"],
            root_artifact_id=data["rootArtifactId"],
            parent_view_id=data.get("parentViewId"),
        )


@dataclass
class SysmlFile:
    id: str
    name: str
    content: str
    warnings: list[str] = field(default_factory=list)
    source_path: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "content": self.content,
            "warnings": list(self.warnings),
            "sourcePath": self.source_path,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SysmlFile:
        return cls(
            id=data["id"],
            name=data["name"],
            content=data["content"],
            warnings=list(data.get("warnings") or []),
            source_path=data.get("sourcePath"),
        )


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

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
            "files": [f.to_dict() for f in self.files],
            "semantic": {k: v.to_dict() for k, v in self.semantic.items()},
            "visualization": self.visualization.to_dict(),
            "views": [v.to_dict() for v in self.views],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Project:
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
        )

    @classmethod
    def create(cls, name: str) -> Project:
        now = utc_now()
        return cls(
            id=new_id(),
            name=name,
            created_at=now,
            updated_at=now,
        )
