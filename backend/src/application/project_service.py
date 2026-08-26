from __future__ import annotations

from pathlib import Path

from adapters.persistence.workspace_repo import sanitize_rel_path
from domain.interface_naming import (
    lint_interface_naming,
    suggest_connection_name,
    suggest_port_name_for_type,
)
from domain.merge import child_view_ids, merge_visualization, rebuild_views
from domain.models import (
    ArtifactKind,
    ElementStyle,
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
        if project.files:
            # SysML on disk is source of truth; state.json semantic can lag
            # after external edits (or edits while the server was stopped).
            before = {k: v.to_dict() for k, v in project.semantic.items()}
            before_warn = {f.id: list(f.warnings) for f in project.files}
            self._reparse_all_files(project)
            after = {k: v.to_dict() for k, v in project.semantic.items()}
            after_warn = {f.id: list(f.warnings) for f in project.files}
            if before != after or before_warn != after_warn:
                changed = True
        if self._migrate_views_if_needed(project):
            changed = True
        if self._migrate_attributes_if_needed(project):
            changed = True
        if changed:
            return self.repo.save(project)
        return project

    def _reparse_all_files(self, project: Project) -> None:
        result = self.parser.parse_project(project.files)
        project.semantic = dict(result.elements)
        for sysml_file in project.files:
            sysml_file.warnings = list(result.file_warnings.get(sysml_file.id) or [])
        for file_id, message in lint_interface_naming(project.semantic):
            if not file_id:
                continue
            target = next((f for f in project.files if f.id == file_id), None)
            if target is not None:
                target.warnings.append(message)
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

    def _resolve_file_path(
        self, name: str, source_path: str | None, existing_paths: set[str]
    ) -> str:
        raw = source_path or name
        rel = sanitize_rel_path(raw, name or "untitled.sysml")
        if rel not in existing_paths:
            return rel
        # Avoid collisions when uploading same name twice
        stem = Path(rel).stem
        suffix = Path(rel).suffix or ".sysml"
        parent = Path(rel).parent
        n = 2
        while True:
            candidate_name = f"{stem}_{n}{suffix}"
            candidate = (
                candidate_name
                if str(parent) in (".", "")
                else f"{parent.as_posix()}/{candidate_name}"
            )
            if candidate not in existing_paths:
                return candidate
            n += 1

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
        existing_paths = {f.relative_path() for f in project.files}
        rel = self._resolve_file_path(name, source_path, existing_paths)
        display_name = Path(rel).name
        sysml_file = SysmlFile(
            id=file_id,
            name=display_name,
            content=content,
            warnings=[],
            source_path=None,
            path=rel,
        )
        project.files.append(sysml_file)
        self._reparse_all_files(project)
        return self.repo.save(project)

    def add_file_from_path(
        self,
        project_id: str,
        path: str,
        content: str | None = None,
    ) -> Project | None:
        """Add a SysML file by relative path under the workspace root.

        If ``content`` is None, read from disk. If provided and file missing, create it.
        """
        project = self.repo.get(project_id)
        if not project:
            return None

        raw = path.strip().replace("\\", "/")
        parts = [p for p in raw.split("/") if p]
        if raw.startswith("/") or any(p == ".." for p in parts):
            raise ValueError(f"Path escapes project directory: {path}")

        rel = sanitize_rel_path(path, "untitled.sysml")
        existing_paths = {f.relative_path() for f in project.files}
        if rel in existing_paths:
            raise ValueError(f"File already in project: {rel}")

        text = content
        if text is None:
            read_fn = getattr(self.repo, "read_sysml", None)
            if read_fn is None:
                raise FileNotFoundError(rel)
            try:
                text = read_fn(rel)
            except FileNotFoundError:
                raise
            except ValueError as exc:
                raise ValueError(str(exc)) from exc
        else:
            write_fn = getattr(self.repo, "write_sysml", None)
            if write_fn is not None:
                write_fn(rel, text)

        return self.add_file(project_id, Path(rel).name, text, source_path=rel)

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
        target.source_path = None
        if source_path:
            name = source_path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
            if name:
                target.name = name
                if "/" not in (target.path or ""):
                    target.path = sanitize_rel_path(name, name)

        self._reparse_all_files(project)
        return self.repo.save(project)

    def refresh_file_from_disk(self, project_id: str, file_id: str) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        target = next((f for f in project.files if f.id == file_id), None)
        if not target:
            return None
        rel = target.relative_path()
        read_fn = getattr(self.repo, "read_sysml", None)
        if read_fn is None:
            raise FileNotFoundError(rel)
        content = read_fn(rel)
        return self.refresh_file(project_id, file_id, content)

    def list_documentation(self, project_id: str) -> list[str] | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        list_fn = getattr(self.repo, "list_documentation", None)
        if list_fn is None:
            return []
        return list_fn()

    def read_documentation(self, project_id: str, doc_path: str) -> str | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        read_fn = getattr(self.repo, "read_documentation", None)
        if read_fn is None:
            raise FileNotFoundError(doc_path)
        try:
            return read_fn(doc_path)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    def set_title_block(self, project_id: str, title_block: dict) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        sheet = dict(project.sheet or {"titleBlock": None, "frame": None})
        sheet["titleBlock"] = title_block
        project.sheet = sheet
        project.updated_at = utc_now()
        return self.repo.save(project)

    def clear_title_block(self, project_id: str) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        sheet = dict(project.sheet or {"titleBlock": None, "frame": None})
        sheet["titleBlock"] = None
        project.sheet = sheet
        project.updated_at = utc_now()
        return self.repo.save(project)

    def set_frame(self, project_id: str, frame: dict) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        sheet = dict(project.sheet or {"titleBlock": None, "frame": None})
        sheet["frame"] = frame
        project.sheet = sheet
        project.updated_at = utc_now()
        return self.repo.save(project)

    def clear_frame(self, project_id: str) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        sheet = dict(project.sheet or {"titleBlock": None, "frame": None})
        sheet["frame"] = None
        project.sheet = sheet
        project.updated_at = utc_now()
        return self.repo.save(project)

    def delete_file(self, project_id: str, file_id: str) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        target = next((f for f in project.files if f.id == file_id), None)
        if not target:
            return None
        project.files = [f for f in project.files if f.id != file_id]
        self._reparse_all_files(project)
        return self.repo.save(project)

    def rename_file(
        self,
        project_id: str,
        file_id: str,
        *,
        name: str | None = None,
        path: str | None = None,
        source_path: str | None = None,
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        target = next((f for f in project.files if f.id == file_id), None)
        if not target:
            return None

        if source_path is not None:
            target.source_path = source_path

        new_rel: str | None = None
        if path is not None:
            new_rel = sanitize_rel_path(path, name or target.name)
        elif name is not None:
            # Rename within same directory
            parent = Path(target.relative_path()).parent
            candidate = name if str(parent) in (".", "") else f"{parent.as_posix()}/{name}"
            new_rel = sanitize_rel_path(candidate, name)

        if new_rel and new_rel != target.relative_path():
            existing = {
                f.relative_path() for f in project.files if f.id != file_id
            }
            if new_rel in existing:
                return None
            target.path = new_rel
            target.name = Path(new_rel).name

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
        suggested = (
            None
            if name
            else suggest_connection_name(source, target, project.semantic)
        )
        base_name = name or suggested or f"conn{len(existing) + 1}"
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
        target.content = serialize_file(
            project.semantic, fid, previous_content=target.content
        )

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
        if parent.kind != ArtifactKind.PART:
            return None
        file_id = parent.file_id or self._primary_file_id(project)
        if not name and type_ref:
            name = suggest_port_name_for_type(
                type_ref, parent.name, parent_type_ref=parent.type_ref
            )
        base = name or "port"
        port_name, element_id = self._unique_child_name(project, parent_id, base)
        el = SemanticElement(
            id=element_id,
            kind=ArtifactKind.PORT,
            name=port_name,
            parent_id=parent_id,
            type_ref=type_ref,
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
        return self.rename_file(
            project_id, file_id, source_path=source_path
        )

    def update_visualization(self, project_id: str, patch: dict) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None

        from domain.view_layouts import apply_view_layout_edge_patch, apply_view_layout_patch

        view_id = patch.get("viewId")
        nodes_patch = dict(patch.get("nodes") or {})
        edges_patch = dict(patch.get("edges") or {})

        if view_id:
            geo_patch: dict[str, dict] = {}
            other_patch: dict[str, dict] = {}
            for artifact_id, node_data in nodes_patch.items():
                geo: dict = {}
                other: dict = {}
                for key, value in node_data.items():
                    if key in ("x", "y", "width", "height"):
                        geo[key] = value
                    else:
                        other[key] = value
                if geo:
                    geo_patch[artifact_id] = geo
                if other:
                    other_patch[artifact_id] = other
            if geo_patch:
                project.view_layouts = apply_view_layout_patch(
                    project.view_layouts, view_id, geo_patch
                )
            nodes_patch = other_patch

            geo_edge_patch: dict[str, dict] = {}
            other_edge_patch: dict[str, dict] = {}
            for artifact_id, edge_data in edges_patch.items():
                geo_e: dict = {}
                other_e: dict = {}
                for key, value in edge_data.items():
                    if key in ("routing", "waypoints", "labelOffset"):
                        geo_e[key] = value
                    else:
                        other_e[key] = value
                if geo_e:
                    geo_edge_patch[artifact_id] = geo_e
                if other_e:
                    other_edge_patch[artifact_id] = other_e
            if geo_edge_patch:
                project.view_layouts = apply_view_layout_edge_patch(
                    project.view_layouts, view_id, geo_edge_patch
                )
            edges_patch = other_edge_patch

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
                if "style" in node_data and node_data["style"] is not None:
                    if existing.style is None:
                        existing.style = ElementStyle()
                    existing.style.merge(node_data["style"])
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
                if "style" in edge_data and edge_data["style"] is not None:
                    if existing.style is None:
                        existing.style = ElementStyle()
                    existing.style.merge(edge_data["style"])
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
        from domain.diagram_mode import expected_root_kinds, resolve_diagram_mode
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

        # Prefer typeRef from semantic view element when ViewDef lacks it (legacy)
        if view.type_ref is None and view.id in project.semantic:
            view.type_ref = project.semantic[view.id].type_ref

        root = project.semantic.get(view.root_artifact_id)
        if not root:
            return None

        diagram_mode = resolve_diagram_mode(view, root)
        mode_error: str | None = None
        expected = expected_root_kinds(diagram_mode)
        if expected is not None and root.kind not in expected:
            mode_error = (
                f"{view.type_ref or diagram_mode} requires expose of kind "
                f"{', '.join(k.value for k in expected)}; got '{root.kind.value}'"
            )

        if diagram_mode in {"sequence", "state", "actionFlow"}:
            # Root + direct children (lifelines/messages, states/transitions, …)
            artifact_ids = {root.id}
            for cid in root.children:
                artifact_ids.add(cid)
                child = project.semantic.get(cid)
                if child:
                    for gc in child.children:
                        artifact_ids.add(gc)
        elif diagram_mode == "tree":
            artifact_ids = collect_artifacts_to_depth(
                project.semantic, root.id, hierarchical_levels
            )
            # Include non-part children for tree browsing
            extra: set[str] = set()
            for aid in list(artifact_ids):
                el = project.semantic.get(aid)
                if not el:
                    continue
                for cid in el.children:
                    child = project.semantic.get(cid)
                    if child and child.kind not in {
                        ArtifactKind.PORT,
                        ArtifactKind.CONNECTION,
                        ArtifactKind.ATTRIBUTE,
                        ArtifactKind.MESSAGE,
                        ArtifactKind.TRANSITION,
                        ArtifactKind.SUCCESSION,
                    }:
                        extra.add(cid)
            artifact_ids |= extra
        elif diagram_mode == "allocation":
            artifact_ids = {root.id}
            for cid in root.children:
                child = project.semantic.get(cid)
                if not child:
                    continue
                if child.kind == ArtifactKind.PORT:
                    artifact_ids.add(cid)
                elif child.kind == ArtifactKind.PART:
                    if child.name == "logical":
                        artifact_ids |= collect_artifacts_to_depth(
                            project.semantic, child.id, hierarchical_levels
                        )
                    else:
                        artifact_ids.add(child.id)
                        for pc in child.children:
                            port = project.semantic.get(pc)
                            if port and port.kind == ArtifactKind.PORT:
                                artifact_ids.add(pc)
            for el in project.semantic.values():
                if el.kind != ArtifactKind.CONNECTION:
                    continue
                if not el.name.startswith("alloc"):
                    continue
                if el.parent_id != root.id:
                    continue
                artifact_ids.add(el.id)
                if el.source_id:
                    artifact_ids.add(el.source_id)
                if el.target_id:
                    artifact_ids.add(el.target_id)
        elif root.kind == ArtifactKind.PART:
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
        nodes = {}
        from domain.merge import DEFAULT_TREE_HEIGHT, DEFAULT_TREE_WIDTH
        from domain.view_layouts import resolve_view_edge, resolve_view_node

        for aid in artifact_ids:
            global_node = project.visualization.nodes.get(aid)
            if not global_node:
                continue
            overlay = (
                project.view_layouts.get_node(view.id, aid)
                if project.view_layouts is not None
                else None
            )
            resolved = resolve_view_node(global_node, overlay)
            if diagram_mode == "tree":
                if overlay is None or overlay.width is None:
                    resolved["width"] = DEFAULT_TREE_WIDTH
                if overlay is None or overlay.height is None:
                    resolved["height"] = DEFAULT_TREE_HEIGHT
            nodes[aid] = resolved
        edges = {}
        for aid in artifact_ids:
            global_edge = project.visualization.edges.get(aid)
            if not global_edge:
                continue
            edge_overlay = (
                project.view_layouts.get_edge(view.id, aid)
                if project.view_layouts is not None
                else None
            )
            resolved_edge = resolve_view_edge(global_edge, edge_overlay)
            if diagram_mode == "allocation":
                conn = project.semantic.get(aid)
                if conn and conn.kind == ArtifactKind.CONNECTION:
                    resolved_edge = {**resolved_edge, "isAllocation": True}
            edges[aid] = resolved_edge

        subdiagrams = child_view_ids(view.root_artifact_id, project.views, project.semantic)
        menus: dict[str, list[dict[str, str]]] = {}
        for aid in artifact_ids:
            menus[aid] = child_view_ids(aid, project.views, project.semantic)

        result: dict = {
            "view": view.to_dict(),
            "diagramMode": diagram_mode,
            "hierarchicalLevels": hierarchical_levels,
            "semantic": semantic,
            "visualization": {"nodes": nodes, "edges": edges},
            "subdiagrams": subdiagrams,
            "menus": menus,
        }
        if mode_error:
            result["modeError"] = mode_error
        return result
