from __future__ import annotations

from domain.merge import child_view_ids, merge_visualization, rebuild_views
from domain.models import (
    ArtifactKind,
    PortSide,
    Project,
    RoutingType,
    SemanticElement,
    SysmlFile,
    VisualizationEdge,
    VisualizationNode,
    Waypoint,
    new_id,
    utc_now,
)
from ports import ProjectRepository, SysmlParser


class ProjectService:
    def __init__(self, repo: ProjectRepository, parser: SysmlParser) -> None:
        self.repo = repo
        self.parser = parser

    def create_project(self, name: str) -> Project:
        project = Project.create(name=name.strip() or "Untitled")
        return self.repo.save(project)

    def list_projects(self) -> list[dict[str, str]]:
        return self.repo.list_summaries()

    def delete_project(self, project_id: str) -> bool:
        return self.repo.delete(project_id)

    def get_project(self, project_id: str) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        changed = False
        if self._migrate_views_if_needed(project):
            changed = True
        if self._migrate_attributes_if_needed(project):
            changed = True
        if changed:
            return self.repo.save(project)
        return project

    def _reparse_all_files(self, project: Project) -> None:
        project.semantic = {}
        for sysml_file in project.files:
            result = self.parser.parse(sysml_file.content, sysml_file.id)
            sysml_file.warnings = list(result.warnings)
            for eid, element in result.elements.items():
                project.semantic[eid] = element
        project.visualization = merge_visualization(
            project.semantic, project.visualization
        )
        project.views = rebuild_views(project.semantic)
        project.updated_at = utc_now()

    def _migrate_attributes_if_needed(self, project: Project) -> bool:
        """Re-parse when SysML has attributes but semantic has none (pre-attribute projects)."""
        has_attr_el = any(
            e.kind == ArtifactKind.ATTRIBUTE for e in project.semantic.values()
        )
        if has_attr_el:
            return False
        if not project.files:
            return False
        if not any(
            "attribute " in f.content or "attribute\n" in f.content
            for f in project.files
        ):
            return False
        self._reparse_all_files(project)
        return True

    def _migrate_views_if_needed(self, project: Project) -> bool:
        """Re-parse files when SysML `view` declarations are missing from semantic."""
        has_view_el = any(e.kind == ArtifactKind.VIEW for e in project.semantic.values())
        if has_view_el:
            new_views = rebuild_views(project.semantic)
            if [v.id for v in new_views] != [v.id for v in project.views]:
                project.views = new_views
                project.updated_at = utc_now()
                return True
            return False

        if not project.files:
            return False
        if not any("view " in f.content for f in project.files):
            return False

        self._reparse_all_files(project)
        return True

    def save_project(self, project_id: str, payload: dict) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        if "name" in payload and payload["name"]:
            project.name = str(payload["name"])
        if "visualization" in payload and payload["visualization"] is not None:
            from domain.models import VisualizationModel

            project.visualization = VisualizationModel.from_dict(payload["visualization"])
        project.updated_at = utc_now()
        return self.repo.save(project)

    def add_file(
        self,
        project_id: str,
        name: str,
        content: str,
        source_path: str | None = None,
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None

        file_id = new_id()
        parse_result = self.parser.parse(content, file_id)
        sysml_file = SysmlFile(
            id=file_id,
            name=name,
            content=content,
            warnings=list(parse_result.warnings),
            source_path=source_path,
        )
        project.files.append(sysml_file)

        for eid, element in parse_result.elements.items():
            project.semantic[eid] = element

        project.visualization = merge_visualization(project.semantic, project.visualization)
        project.views = rebuild_views(project.semantic)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def refresh_file(
        self,
        project_id: str,
        file_id: str,
        content: str,
        source_path: str | None = None,
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None

        target = next((f for f in project.files if f.id == file_id), None)
        if not target:
            return None

        target.content = content
        if source_path is not None:
            target.source_path = source_path
        if source_path:
            # Keep display name in sync with picked file when provided via path/name
            name = source_path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
            if name:
                target.name = name

        to_remove = [
            eid for eid, el in project.semantic.items() if el.file_id == file_id
        ]
        for eid in to_remove:
            del project.semantic[eid]

        parse_result = self.parser.parse(target.content, file_id)
        target.warnings = list(parse_result.warnings)

        for eid, element in parse_result.elements.items():
            project.semantic[eid] = element

        project.visualization = merge_visualization(project.semantic, project.visualization)
        project.views = rebuild_views(project.semantic)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def add_connection(
        self,
        project_id: str,
        source_port_id: str,
        target_port_id: str,
        name: str | None = None,
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None

        source = project.semantic.get(source_port_id)
        target = project.semantic.get(target_port_id)
        if not source or source.kind != ArtifactKind.PORT:
            return None
        if not target or target.kind != ArtifactKind.PORT:
            return None
        if source_port_id == target_port_id:
            return None

        parent_id = source.parent_id
        sp = project.semantic.get(source.parent_id) if source.parent_id else None
        tp = project.semantic.get(target.parent_id) if target.parent_id else None
        if sp and tp and sp.parent_id and sp.parent_id == tp.parent_id:
            parent_id = sp.parent_id
        elif sp and tp and sp.id == tp.parent_id:
            parent_id = sp.id
        elif sp and tp and tp.id == sp.parent_id:
            parent_id = tp.id

        existing = [
            e
            for e in project.semantic.values()
            if e.kind == ArtifactKind.CONNECTION and e.parent_id == parent_id
        ]
        base_name = name or f"conn{len(existing) + 1}"
        conn_name = base_name
        element_id = f"{parent_id}::{conn_name}" if parent_id else conn_name
        n = 1
        while element_id in project.semantic:
            n += 1
            conn_name = f"{base_name}_{n}"
            element_id = f"{parent_id}::{conn_name}" if parent_id else conn_name

        el = SemanticElement(
            id=element_id,
            kind=ArtifactKind.CONNECTION,
            name=conn_name,
            parent_id=parent_id,
            source_id=source_port_id,
            target_id=target_port_id,
            file_id=source.file_id,
        )
        project.semantic[element_id] = el
        if parent_id and parent_id in project.semantic:
            if element_id not in project.semantic[parent_id].children:
                project.semantic[parent_id].children.append(element_id)

        project.visualization.edges[element_id] = VisualizationEdge(
            artifact_id=element_id,
            routing=RoutingType.ANGULAR,
            waypoints=[],
        )
        self._sync_sysml_file(project, el.file_id)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def _primary_file_id(self, project: Project) -> str | None:
        return project.files[0].id if project.files else None

    def _sync_sysml_file(self, project: Project, file_id: str | None) -> None:
        from adapters.parser.subset_serializer import serialize_file

        fid = file_id or self._primary_file_id(project)
        if not fid:
            return
        target = next((f for f in project.files if f.id == fid), None)
        if not target:
            return
        target.content = serialize_file(project.semantic, fid)

    def _unique_child_name(
        self, project: Project, parent_id: str | None, base: str
    ) -> tuple[str, str]:
        name = base
        element_id = f"{parent_id}::{name}" if parent_id else name
        n = 1
        while element_id in project.semantic:
            n += 1
            name = f"{base}{n}"
            element_id = f"{parent_id}::{name}" if parent_id else name
        return name, element_id

    def add_part(
        self,
        project_id: str,
        parent_id: str,
        name: str | None = None,
        type_ref: str | None = None,
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project or parent_id not in project.semantic:
            return None
        parent = project.semantic[parent_id]
        file_id = parent.file_id or self._primary_file_id(project)
        base = name or "part"
        part_name, element_id = self._unique_child_name(project, parent_id, base)
        el = SemanticElement(
            id=element_id,
            kind=ArtifactKind.PART,
            name=part_name,
            parent_id=parent_id,
            type_ref=type_ref,
            file_id=file_id,
        )
        project.semantic[element_id] = el
        if element_id not in parent.children:
            parent.children.append(element_id)
        project.visualization = merge_visualization(project.semantic, project.visualization)
        project.views = rebuild_views(project.semantic)
        self._sync_sysml_file(project, file_id)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def add_port(
        self, project_id: str, parent_id: str, name: str | None = None
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project or parent_id not in project.semantic:
            return None
        parent = project.semantic[parent_id]
        if parent.kind != ArtifactKind.PART:
            return None
        file_id = parent.file_id or self._primary_file_id(project)
        base = name or "port"
        port_name, element_id = self._unique_child_name(project, parent_id, base)
        el = SemanticElement(
            id=element_id,
            kind=ArtifactKind.PORT,
            name=port_name,
            parent_id=parent_id,
            file_id=file_id,
        )
        project.semantic[element_id] = el
        if element_id not in parent.children:
            parent.children.append(element_id)
        project.visualization = merge_visualization(project.semantic, project.visualization)
        self._sync_sysml_file(project, file_id)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def add_attribute(
        self, project_id: str, parent_id: str, name: str | None = None
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project or parent_id not in project.semantic:
            return None
        parent = project.semantic[parent_id]
        file_id = parent.file_id or self._primary_file_id(project)
        base = name or "attr"
        attr_name, element_id = self._unique_child_name(project, parent_id, base)
        el = SemanticElement(
            id=element_id,
            kind=ArtifactKind.ATTRIBUTE,
            name=attr_name,
            parent_id=parent_id,
            file_id=file_id,
        )
        project.semantic[element_id] = el
        if element_id not in parent.children:
            parent.children.append(element_id)
        self._sync_sysml_file(project, file_id)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def add_view(
        self,
        project_id: str,
        parent_id: str,
        name: str | None = None,
        expose_ref: str | None = None,
        type_ref: str | None = "GeneralView",
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project or parent_id not in project.semantic:
            return None
        parent = project.semantic[parent_id]
        file_id = parent.file_id or self._primary_file_id(project)
        base = name or "View"
        view_name, element_id = self._unique_child_name(project, parent_id, base)
        el = SemanticElement(
            id=element_id,
            kind=ArtifactKind.VIEW,
            name=view_name,
            parent_id=parent_id,
            type_ref=type_ref,
            expose_ref=expose_ref,
            file_id=file_id,
        )
        project.semantic[element_id] = el
        if element_id not in parent.children:
            parent.children.append(element_id)
        project.views = rebuild_views(project.semantic)
        self._sync_sysml_file(project, file_id)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def rename_artifact(
        self, project_id: str, artifact_id: str, name: str
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        el = project.semantic.get(artifact_id)
        if not el or not name.strip():
            return None
        el.name = name.strip()
        self._sync_sysml_file(project, el.file_id)
        project.views = rebuild_views(project.semantic)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def delete_artifact(self, project_id: str, artifact_id: str) -> Project | None:
        project = self.repo.get(project_id)
        if not project or artifact_id not in project.semantic:
            return None
        root = project.semantic[artifact_id]
        file_id = root.file_id

        to_remove: set[str] = set()
        stack = [artifact_id]
        while stack:
            aid = stack.pop()
            if aid in to_remove:
                continue
            to_remove.add(aid)
            el = project.semantic.get(aid)
            if el:
                stack.extend(el.children)

        # Also remove connections referencing removed ports
        for eid, el in list(project.semantic.items()):
            if el.kind == ArtifactKind.CONNECTION and (
                el.source_id in to_remove or el.target_id in to_remove
            ):
                to_remove.add(eid)

        for eid in to_remove:
            el = project.semantic.pop(eid, None)
            if el and el.parent_id and el.parent_id in project.semantic:
                parent = project.semantic[el.parent_id]
                parent.children = [c for c in parent.children if c != eid]
            project.visualization.nodes.pop(eid, None)
            project.visualization.edges.pop(eid, None)

        project.views = rebuild_views(project.semantic)
        self._sync_sysml_file(project, file_id)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def update_file_source_path(
        self, project_id: str, file_id: str, source_path: str | None
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        target = next((f for f in project.files if f.id == file_id), None)
        if not target:
            return None
        target.source_path = source_path
        project.updated_at = utc_now()
        return self.repo.save(project)

    def update_visualization(self, project_id: str, patch: dict) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None

        nodes_patch = patch.get("nodes") or {}
        edges_patch = patch.get("edges") or {}

        for artifact_id, node_data in nodes_patch.items():
            existing = project.visualization.nodes.get(artifact_id)
            if existing:
                if "x" in node_data:
                    existing.x = float(node_data["x"])
                if "y" in node_data:
                    existing.y = float(node_data["y"])
                if "width" in node_data:
                    existing.width = float(node_data["width"])
                if "height" in node_data:
                    existing.height = float(node_data["height"])
                if "side" in node_data and node_data["side"]:
                    existing.side = PortSide(node_data["side"])
                if "offset" in node_data and node_data["offset"] is not None:
                    existing.offset = float(node_data["offset"])
                if "symbolRef" in node_data and node_data["symbolRef"]:
                    existing.symbol_ref = str(node_data["symbolRef"])
            else:
                project.visualization.nodes[artifact_id] = VisualizationNode.from_dict(
                    {"artifactId": artifact_id, **node_data}
                )

        for artifact_id, edge_data in edges_patch.items():
            existing = project.visualization.edges.get(artifact_id)
            if existing:
                if "routing" in edge_data and edge_data["routing"]:
                    existing.routing = RoutingType(edge_data["routing"])
                if "waypoints" in edge_data:
                    existing.waypoints = [
                        Waypoint.from_dict(w) for w in edge_data["waypoints"] or []
                    ]
                if "labelOffset" in edge_data and edge_data["labelOffset"] is not None:
                    lo = edge_data["labelOffset"] or {}
                    existing.label_offset_x = float(lo.get("x", 0) or 0)
                    existing.label_offset_y = float(lo.get("y", 0) or 0)
            else:
                project.visualization.edges[artifact_id] = VisualizationEdge.from_dict(
                    {"artifactId": artifact_id, **edge_data}
                )

        project.updated_at = utc_now()
        return self.repo.save(project)

    def get_view(
        self, project_id: str, view_id: str, hierarchical_levels: int = 2
    ) -> dict | None:
        project = self.get_project(project_id)
        if not project:
            return None

        from domain.details import collect_artifacts_to_depth
        from domain.merge import artifact_diagram_view_id
        from domain.models import ViewDef

        view = next((v for v in project.views if v.id == view_id), None)
        if not view and view_id.startswith("artifact::"):
            artifact_id = view_id[len("artifact::") :]
            root = project.semantic.get(artifact_id)
            if not root:
                return None

            if root.kind == ArtifactKind.PACKAGE:
                general_views = [
                    e
                    for e in project.semantic.values()
                    if e.kind == ArtifactKind.VIEW
                    and e.parent_id == artifact_id
                    and (e.type_ref == "GeneralView" or e.type_ref is None)
                ]
                general_views.sort(key=lambda e: e.id)
                if general_views:
                    return self.get_view(
                        project_id, general_views[0].id, hierarchical_levels
                    )
                view = ViewDef(
                    id=artifact_diagram_view_id(artifact_id),
                    name=root.name,
                    root_artifact_id=artifact_id,
                )
            else:
                view = ViewDef(
                    id=artifact_diagram_view_id(artifact_id),
                    name=root.name,
                    root_artifact_id=artifact_id,
                )
        if not view:
            return None

        root = project.semantic.get(view.root_artifact_id)
        if not root:
            return None

        if root.kind == ArtifactKind.PART:
            artifact_ids = collect_artifacts_to_depth(
                project.semantic, root.id, hierarchical_levels
            )
        else:
            artifact_ids = {root.id}
            queue = list(root.children)
            while queue:
                aid = queue.pop()
                if aid in artifact_ids:
                    continue
                artifact_ids.add(aid)
                child = project.semantic.get(aid)
                if child:
                    queue.extend(child.children)

        semantic = {
            aid: project.semantic[aid].to_dict()
            for aid in artifact_ids
            if aid in project.semantic
        }
        nodes = {
            aid: project.visualization.nodes[aid].to_dict()
            for aid in artifact_ids
            if aid in project.visualization.nodes
        }
        edges = {
            aid: project.visualization.edges[aid].to_dict()
            for aid in artifact_ids
            if aid in project.visualization.edges
        }

        diagram_mode = "whitebox" if root.kind == ArtifactKind.PART else "structure"

        subdiagrams = child_view_ids(view.root_artifact_id, project.views, project.semantic)
        menus: dict[str, list[dict[str, str]]] = {}
        for aid in artifact_ids:
            menus[aid] = child_view_ids(aid, project.views, project.semantic)

        return {
            "view": view.to_dict(),
            "diagramMode": diagram_mode,
            "hierarchicalLevels": hierarchical_levels,
            "semantic": semantic,
            "visualization": {"nodes": nodes, "edges": edges},
            "subdiagrams": subdiagrams,
            "menus": menus,
        }
