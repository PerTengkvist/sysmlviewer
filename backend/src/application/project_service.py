from __future__ import annotations

import threading
from pathlib import Path

from adapters.persistence.workspace_repo import sanitize_rel_path
from adapters.persistence.relation_todo_store import RelationTodoStore
from domain.interface_naming import (
    lint_interface_naming,
    suggest_connection_name,
    suggest_port_name_for_type,
)
from domain.merge import child_view_ids, merge_visualization, rebuild_views
from domain.view_usage import effective_view, legacy_definition_warnings
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
from domain.view_layouts import ViewLayout, apply_view_snapshot
from domain.view_verification import (
    GeometrySnapshot,
    Mismatch,
    compare_geometry,
    snapshot_from_layout,
    snapshot_from_view_payload,
)
from ports import EventLog, NullEventLog, ProjectRepository, SysmlParser


def _remap_stale_relation_layouts(before: dict, project: Project) -> bool:
    """Keep per-view edge geometry when a relation id changes but its ends do not."""
    from domain.relationships import is_relation_edge

    new_by_ends: dict[tuple[str, str, str], str] = {}
    for el in project.semantic.values():
        if not el.source_id or not el.target_id or not is_relation_edge(el.kind):
            continue
        new_by_ends.setdefault((el.kind.value, el.source_id, el.target_id), el.id)
    if not project.view_layouts or not project.view_layouts.by_view:
        return False
    changed = False
    for layout in project.view_layouts.by_view.values():
        edges = dict(layout.edges)
        renamed = False
        for old_id in list(edges):
            if old_id in project.semantic:
                continue
            old = before.get(old_id) or {}
            new_id = new_by_ends.get(
                (str(old.get("kind") or ""), str(old.get("sourceId") or ""), str(old.get("targetId") or ""))
            )
            if not new_id or new_id == old_id or new_id in edges:
                continue
            edges[new_id] = edges.pop(old_id)
            renamed = True
        if renamed:
            layout.edges = edges
            changed = True
    return changed


def _split_use_edge(relation_id: str) -> tuple[str, str] | None:
    if not relation_id.startswith("use:") or "->" not in relation_id:
        return None
    actor_id, _, use_case_id = relation_id[len("use:") :].partition("->")
    if not actor_id or not use_case_id:
        return None
    return actor_id, use_case_id


# Diagram modes that draw no canvas, so there is no geometry to save or compare.
_MODES_WITHOUT_GEOMETRY = frozenset({"requirementTable"})
_MAX_NAMED_ELEMENTS = 10


def _view_display_name(view_id: str) -> str:
    return view_id.rsplit("::", 1)[-1]


def _declared_view_name(project: Project, view_id: str) -> str | None:
    """Name for the layout file. Generated artifact views have none."""
    return next((v.name for v in project.views if v.id == view_id), None)


def _normalize_notation(raw: object) -> str:
    return "arcadia" if str(raw or "").strip().lower() == "arcadia" else "sysmlv2"


class _ViewReport:
    """Events and mismatch details for one save or compare of a diagram."""

    def __init__(self, events: EventLog, view_id: str, semantic: dict) -> None:
        self.events = events
        self.view_id = view_id
        self.view_name = _view_display_name(view_id)
        self.semantic = semantic
        self.recorded: list[dict] = []
        self.details: list[dict] = []

    def record(
        self, level: str, code: str, message: str, details: list[dict] | None = None
    ) -> None:
        self.recorded.append(
            self.events.record(
                level,
                code,
                message,
                view_id=self.view_id,
                view_name=self.view_name,
                details=details,
            )
        )

    def describe(self, mismatches: list[Mismatch]) -> list[dict]:
        return [self._detail(mismatch) for mismatch in mismatches]

    def _detail(self, mismatch: Mismatch) -> dict:
        element = self.semantic.get(mismatch.id) or {}
        kind = mismatch.element
        if kind == "edge":
            kind = "binding" if element.get("kind") == "binding" else "connection"
        return {
            "element": kind,
            "id": mismatch.id,
            "name": element.get("name") or mismatch.id.rsplit("::", 1)[-1],
            "field": mismatch.field,
            "canvas": mismatch.canvas,
            "saved": mismatch.saved,
            "source": mismatch.source,
        }

    @staticmethod
    def elements_named(details: list[dict]) -> str:
        names = list(dict.fromkeys(f"{d['element']} {d['name']}" for d in details))
        text = ", ".join(names[:_MAX_NAMED_ELEMENTS])
        if len(names) > _MAX_NAMED_ELEMENTS:
            text += f" and {len(names) - _MAX_NAMED_ELEMENTS} more"
        return text

    def report_result(self, canvas: GeometrySnapshot, mismatches: list[Mismatch]) -> None:
        """Confirm or name the differences, separately for parts and connections."""
        parts = self.describe(
            [m for m in mismatches if m.element in ("part", "port")]
        )
        edges = self.describe([m for m in mismatches if m.element == "edge"])
        self.details = parts + edges
        if parts:
            self.record(
                "error",
                "parts.mismatch",
                f"Positions differ for diagram {self.view_name}: "
                f"{self.elements_named(parts)}",
                parts,
            )
        else:
            self.record(
                "info",
                "parts.confirmed",
                f"Parts positions confirmed for diagram {self.view_name} "
                f"({len(canvas.parts)} parts, {len(canvas.ports)} ports)",
            )
        if edges:
            self.record(
                "error",
                "connections.mismatch",
                f"Routing differs for diagram {self.view_name}: "
                f"{self.elements_named(edges)}",
                edges,
            )
        else:
            self.record(
                "info",
                "connections.confirmed",
                f"Connections and bindings confirmed for diagram {self.view_name} "
                f"({len(canvas.edges)})",
            )

    def result(self, status: str) -> dict:
        return {
            "status": status,
            "mismatches": self.details,
            "events": self.recorded,
        }


class ProjectService:
    def __init__(
        self,
        repo: ProjectRepository,
        parser: SysmlParser,
        events: EventLog | None = None,
    ) -> None:
        self.repo = repo
        self.parser = parser
        self.events: EventLog = events or NullEventLog()
        self._reported_once: set[tuple] = set()
        # Sync routes run in a threadpool; a view layout is read, merged and
        # written back, so overlapping writers would drop each other's changes.
        self._layout_lock = threading.RLock()

    def _todo_store(self) -> RelationTodoStore | None:
        root = getattr(self.repo, "root", None)
        if root is None:
            return None
        return RelationTodoStore(Path(root))

    def record_relation_todo(self, entry: dict) -> dict | None:
        store = self._todo_store()
        if not store:
            return None
        return store.append(entry)

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
            if _remap_stale_relation_layouts(before, project):
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
        lint = lint_interface_naming(project.semantic) + legacy_definition_warnings(
            project.semantic
        )
        for file_id, message in lint:
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
        # Reparse from SysML first so a stale/empty state.json cannot wipe views.
        project = self.get_project(project_id)
        if not project:
            return None
        if "name" in payload and payload["name"]:
            project.name = str(payload["name"])
        if "visualization" in payload and payload["visualization"] is not None:
            from domain.models import VisualizationModel

            project.visualization = VisualizationModel.from_dict(payload["visualization"])
        project.updated_at = utc_now()
        try:
            saved = self.repo.save(project)
        except OSError as exc:
            self._record_write_failure(None, exc)
            raise
        self.events.record("info", "project.saved", f"Project saved: {saved.name}")
        return saved

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

        existing_paths = {f.relative_path() for f in project.files}
        rel = self._resolve_file_path(name, source_path, existing_paths)
        display_name = Path(rel).name
        # File id is the relative path so Model-tree folders follow the filesystem.
        sysml_file = SysmlFile(
            id=rel,
            name=display_name,
            content=content,
            warnings=[],
            source_path=None,
            path=rel,
        )
        project.files.append(sysml_file)
        self._reparse_all_files(project)
        write_fn = getattr(self.repo, "write_sysml", None)
        if write_fn is not None:
            write_fn(rel, content)
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

        # Already discovered via disk scan — refresh content instead of duplicating.
        if rel in existing_paths:
            return self.refresh_file(project_id, rel, text)

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
        rel = target.relative_path()
        unlink_fn = getattr(self.repo, "delete_sysml", None)
        if unlink_fn is not None:
            try:
                unlink_fn(rel)
            except FileNotFoundError:
                pass
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
            old_rel = target.relative_path()
            move_fn = getattr(self.repo, "move_sysml", None)
            if move_fn is not None:
                try:
                    move_fn(old_rel, new_rel)
                except FileNotFoundError:
                    # Manifest-only rename when the source file is missing.
                    pass
                except FileExistsError:
                    return None
            target.path = new_rel
            target.id = new_rel
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
        self.record_relation_todo(
            {
                "action": "add",
                "original": "",
                "filepath": el.file_id or "",
                "rownumber": 0,
                "source": source_port_id,
                "target": target_port_id,
                "type": "connection",
                "new_def": (
                    f"connection {conn_name} connect {source_port_id} "
                    f"to {target_port_id};"
                ),
                "relationId": element_id,
            }
        )
        project.updated_at = utc_now()
        return self.repo.save(project)

    def _primary_file_id(self, project: Project) -> str | None:
        return project.files[0].id if project.files else None

    def _sync_sysml_file(self, project: Project, file_id: str | None) -> None:
        """SysML sources are read-only; structural edits update state.json only.

        Previously this re-serialized semantic → ``.sysml`` text and ``save()``
        wrote it back, which could wipe files when serialization failed or
        in-memory content was empty.
        """
        return

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
            expose_refs=[expose_ref] if expose_ref else [],
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
        return self.patch_artifact(project_id, artifact_id, name=name)

    def patch_artifact(
        self,
        project_id: str,
        artifact_id: str,
        *,
        name: str | None = None,
        metadata_keywords: list[str] | None = None,
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        el = project.semantic.get(artifact_id)
        if not el:
            return None
        changed = False
        if name is not None:
            stripped = name.strip()
            if not stripped:
                return None
            if el.name != stripped:
                el.name = stripped
                changed = True
        if metadata_keywords is not None:
            cleaned = [kw.strip() for kw in metadata_keywords if kw and kw.strip()]
            if list(el.metadata_keywords) != cleaned:
                el.metadata_keywords = cleaned
                changed = True
        if not changed and name is None and metadata_keywords is None:
            return None
        self._sync_sysml_file(project, el.file_id)
        project.views = rebuild_views(project.semantic)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def delete_artifact(self, project_id: str, artifact_id: str) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        if artifact_id.startswith("use:"):
            participation = self._use_participation(project, artifact_id)
            if not participation:
                return None
            pair = _split_use_edge(artifact_id)
            self.record_relation_todo(
                {
                    "action": "delete",
                    "original": "",
                    "filepath": participation.file_id or "",
                    "rownumber": getattr(participation, "source_line_start", None) or 0,
                    "source": pair[0] if pair else "",
                    "target": pair[1] if pair else "",
                    "type": "use",
                    "new_def": "",
                    "relationId": artifact_id,
                }
            )
            artifact_id = participation.id
        if artifact_id not in project.semantic:
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

        # Also remove relationships referencing removed artifacts
        from domain.relationships import is_relation_edge

        changed = True
        while changed:
            changed = False
            for eid, el in list(project.semantic.items()):
                if not is_relation_edge(el.kind):
                    continue
                if el.source_id in to_remove or el.target_id in to_remove:
                    if eid not in to_remove:
                        to_remove.add(eid)
                        changed = True

        for eid in to_remove:
            el = project.semantic.pop(eid, None)
            if el and el.parent_id and el.parent_id in project.semantic:
                parent = project.semantic[el.parent_id]
                parent.children = [c for c in parent.children if c != eid]
            project.visualization.nodes.pop(eid, None)
            project.visualization.edges.pop(eid, None)
            if el and is_relation_edge(el.kind):
                todo_type = el.kind.value
                if todo_type not in {
                    "connection",
                    "dependency",
                    "use",
                    "extend",
                    "include",
                    "flow",
                    "satisfy",
                    "derive",
                    "refine",
                    "allocation",
                }:
                    todo_type = "dependency"
                self.record_relation_todo(
                    {
                        "action": "delete",
                        "original": getattr(el, "source_text", None) or "",
                        "filepath": el.file_id or "",
                        "rownumber": getattr(el, "source_line_start", None) or 0,
                        "source": el.source_id or "",
                        "target": el.target_id or "",
                        "type": todo_type,
                        "new_def": "",
                        "relationId": eid,
                    }
                )

        project.views = rebuild_views(project.semantic)
        self._sync_sysml_file(project, file_id)
        project.updated_at = utc_now()
        return self.repo.save(project)

    def update_relation_ends(
        self,
        project_id: str,
        relation_id: str,
        source_id: str,
        target_id: str,
    ) -> Project | None:
        project = self.repo.get(project_id)
        if not project:
            return None
        if source_id not in project.semantic or target_id not in project.semantic:
            return None
        if relation_id.startswith("use:"):
            return self._retarget_use_edge(project, relation_id, source_id, target_id)
        el = project.semantic.get(relation_id)
        from domain.relationships import is_relation_edge

        if not el or not is_relation_edge(el.kind):
            return None
        el.source_id = source_id
        el.target_id = target_id
        self.record_relation_todo(
            {
                "action": "change",
                "original": getattr(el, "source_text", None) or "",
                "filepath": el.file_id or "",
                "rownumber": getattr(el, "source_line_start", None) or 0,
                "source": source_id,
                "target": target_id,
                "type": el.kind.value if el.kind.value in {
                    "connection",
                    "dependency",
                    "use",
                    "extend",
                    "include",
                    "flow",
                    "satisfy",
                } else "dependency",
                "new_def": (
                    f"{el.kind.value} from {source_id} to {target_id};"
                ),
                "relationId": relation_id,
            }
        )
        project.updated_at = utc_now()
        return self.repo.save(project)

    def _use_participation(self, project: Project, relation_id: str):
        pair = _split_use_edge(relation_id)
        if not pair:
            return None
        actor_id, use_case_id = pair
        actor = project.semantic.get(actor_id)
        if not actor:
            return None
        for el in project.semantic.values():
            if (
                el.kind == ArtifactKind.ACTOR
                and el.parent_id == use_case_id
                and el.name == actor.name
            ):
                return el
        return None

    def _retarget_use_edge(
        self,
        project: Project,
        relation_id: str,
        source_id: str,
        target_id: str,
    ) -> Project | None:
        participation = self._use_participation(project, relation_id)
        source = project.semantic.get(source_id)
        target = project.semantic.get(target_id)
        if not participation or not source or not target:
            return None
        old_parent_id = participation.parent_id
        if old_parent_id and old_parent_id in project.semantic:
            parent = project.semantic[old_parent_id]
            parent.children = [cid for cid in parent.children if cid != participation.id]
        participation.name = source.name
        participation.parent_id = target.id
        if participation.id not in project.semantic[target.id].children:
            project.semantic[target.id].children.append(participation.id)
        self.record_relation_todo(
            {
                "action": "change",
                "original": "",
                "filepath": participation.file_id or "",
                "rownumber": 0,
                "source": source_id,
                "target": target_id,
                "type": "use",
                "new_def": f"actor {source.name};",
                "relationId": relation_id,
            }
        )
        project.updated_at = utc_now()
        return self.repo.save(project)

    def update_file_source_path(
        self, project_id: str, file_id: str, source_path: str | None
    ) -> Project | None:
        return self.rename_file(
            project_id, file_id, source_path=source_path
        )

    def list_events(self, *, after: int = 0, limit: int = 500) -> list[dict]:
        return self.events.read(after=after, limit=limit)

    def record_client_event(self, payload: dict) -> dict:
        """Store a failure only the browser saw. The code is not the client's to pick."""
        return self.events.record(
            "warning" if payload.get("level") == "warning" else "error",
            "client.error",
            str(payload.get("message") or ""),
            view_id=payload.get("viewId"),
            view_name=payload.get("viewName"),
            details=payload.get("details"),
        )

    def _record_write_failure(self, view_id: str | None, exc: OSError) -> None:
        view_name = _view_display_name(view_id) if view_id else None
        if isinstance(exc, PermissionError):
            target = Path(exc.filename).name if exc.filename else "view layout"
            self.events.record(
                "error",
                "file.permissions.denied",
                f"Cannot write {target}: {exc.strerror or exc}",
                view_id=view_id,
                view_name=view_name,
            )
        self.events.record(
            "error",
            "save.failed",
            f"Save failed: {exc}",
            view_id=view_id,
            view_name=view_name,
        )

    def _report_view_file_problems(self, view_id: str, notation: str) -> None:
        """Log unusable view files once, not on every request that meets them."""
        for path in self.repo.corrupt_view_files():
            key = ("corrupt", path, path.stat().st_mtime_ns)
            if key in self._reported_once:
                continue
            self._reported_once.add(key)
            self.events.record(
                "error",
                "view.file.corrupt",
                f"View file {path.name} cannot be read and is ignored",
            )
        duplicates = self.repo.duplicate_view_files(
            view_id, structure_notation=notation
        )
        key = ("duplicate", view_id, tuple(duplicates))
        if duplicates and key not in self._reported_once:
            self._reported_once.add(key)
            names = ", ".join(path.name for path in duplicates)
            view_name = _view_display_name(view_id)
            self.events.record(
                "warning",
                "view.file.duplicate",
                f"Several files hold diagram {view_name}: {names}. "
                f"Using {duplicates[-1].name}.",
                view_id=view_id,
                view_name=view_name,
            )

    def save_view_snapshot(
        self, project_id: str, view_id: str, payload: dict
    ) -> dict | None:
        """Store the diagram's geometry and check it against what a reload gets."""
        try:
            with self._layout_lock:
                return self._save_view_snapshot(project_id, view_id, payload)
        except OSError as exc:
            self._record_write_failure(view_id, exc)
            raise

    def _save_view_snapshot(
        self, project_id: str, view_id: str, payload: dict
    ) -> dict | None:
        notation = _normalize_notation(payload.get("structureNotation"))
        levels = payload.get("levels") or 2
        view = self.get_view(
            project_id, view_id, levels, structure_notation=notation
        )
        if view is None:
            return None
        report = _ViewReport(self.events, view_id, view.get("semantic") or {})
        if view.get("diagramMode") in _MODES_WITHOUT_GEOMETRY:
            return self._skip_verification(report)

        canvas = GeometrySnapshot.from_dict(payload)
        before = (
            self.repo.load_view_layout(view_id, structure_notation=notation)
            or ViewLayout()
        )
        drift = compare_geometry(
            canvas, snapshot_from_layout(before), source="disk", partial=True
        )
        if drift:
            details = report.describe(drift)
            report.record(
                "warning",
                "drift.before_save",
                f"Diagram {report.view_name} differed from its saved layout "
                f"before saving: {report.elements_named(details)}",
                details,
            )

        project = self.repo.get(project_id)
        path = self.repo.save_view_layout(
            view_id,
            _declared_view_name(project, view_id) if project else None,
            apply_view_snapshot(
                before, parts=canvas.parts, ports=canvas.ports, edges=canvas.edges
            ),
            structure_notation=notation,
        )
        report.record("info", "file.permissions.ok", f"File permissions OK: {path.name}")

        # Read through the same paths a reload uses, not what was just written.
        mismatches = self._compare_with_saved(
            canvas, project_id, view_id, levels, notation, partial=False
        )
        report.report_result(canvas, mismatches)
        if mismatches:
            report.record(
                "error",
                "save.unverified",
                f"Save finished with {len(mismatches)} mismatches "
                f"for diagram {report.view_name}",
            )
            return report.result("mismatch")
        report.record("info", "save.successful", f"Save successful: {path.name}")
        return report.result("confirmed")

    def _compare_with_saved(
        self,
        canvas: GeometrySnapshot,
        project_id: str,
        view_id: str,
        levels: int,
        notation: str,
        *,
        partial: bool,
    ) -> list[Mismatch]:
        layout = (
            self.repo.load_view_layout(view_id, structure_notation=notation)
            or ViewLayout()
        )
        served = self.get_view(
            project_id, view_id, levels, structure_notation=notation
        )
        return compare_geometry(
            canvas, snapshot_from_layout(layout), source="disk", partial=partial
        ) + compare_geometry(
            canvas, snapshot_from_view_payload(served or {}), source="served"
        )

    @staticmethod
    def _skip_verification(report: _ViewReport) -> dict:
        report.record(
            "info",
            "verify.skipped",
            f"Diagram {report.view_name} has no canvas positions to verify",
        )
        return report.result("skipped")

    def compare_view(
        self, project_id: str, view_id: str, payload: dict
    ) -> dict | None:
        """Compare the diagram with what is saved, without writing the layout."""
        with self._layout_lock:
            notation = _normalize_notation(payload.get("structureNotation"))
            levels = payload.get("levels") or 2
            view = self.get_view(
                project_id, view_id, levels, structure_notation=notation
            )
            if view is None:
                return None
            report = _ViewReport(self.events, view_id, view.get("semantic") or {})
            if payload.get("trigger") == "restore":
                return self._compare_restored(report, payload, notation)
            if view.get("diagramMode") in _MODES_WITHOUT_GEOMETRY:
                return self._skip_verification(report)
            canvas = GeometrySnapshot.from_dict(payload)
            mismatches = self._compare_with_saved(
                canvas, project_id, view_id, levels, notation, partial=True
            )
            report.report_result(canvas, mismatches)
            return report.result("mismatch" if mismatches else "confirmed")

    def _compare_restored(
        self, report: _ViewReport, payload: dict, notation: str
    ) -> dict:
        """Check a freshly opened diagram, which logs only when it found something.

        Layouts hold what was placed by hand, so anything unsaved is not an error.
        """
        layout = (
            self.repo.load_view_layout(report.view_id, structure_notation=notation)
            or ViewLayout()
        )
        mismatches = compare_geometry(
            GeometrySnapshot.from_dict(payload),
            snapshot_from_layout(layout),
            source="restored",
            partial=True,
        )
        if not mismatches:
            return report.result("confirmed")
        report.details = report.describe(mismatches)
        # A view opens many times; the same difference is news only once.
        key = ("restore", report.view_id, repr(report.details))
        if key in self._reported_once:
            return report.result("mismatch")
        self._reported_once.add(key)
        report.record(
            "warning",
            "restore.mismatch",
            f"Diagram {report.view_name} differs from its saved layout after "
            f"opening: {report.elements_named(report.details)}",
            report.details,
        )
        return report.result("mismatch")

    def update_visualization(self, project_id: str, patch: dict) -> Project | None:
        try:
            with self._layout_lock:
                return self._update_visualization(project_id, patch)
        except OSError as exc:
            self._record_write_failure(patch.get("viewId"), exc)
            raise

    def _update_visualization(self, project_id: str, patch: dict) -> Project | None:
        # Always refresh semantic/views from SysML before persisting layout.
        # Otherwise a corrupted empty state.json is re-saved on every drag and
        # the Views tab clears in the UI (project.views becomes []).
        project = self.get_project(project_id)
        if not project:
            return None

        from domain.view_layouts import (
            ViewLayout,
            ViewLayouts,
            apply_auto_layout_edge_kinds,
            apply_layered_layout,
            apply_layout_rules,
            apply_view_filters,
            apply_view_hierarchy_override,
            apply_view_layout_edge_patch,
            apply_view_layout_patch,
        )

        view_id = patch.get("viewId")
        notation = _normalize_notation(patch.get("structureNotation"))
        nodes_patch = dict(patch.get("nodes") or {})
        edges_patch = dict(patch.get("edges") or {})
        hierarchy_override_patch = "hierarchicalLevelsOverride" in patch
        view_filters_patch = "viewFilters" in patch
        layout_rules_patch = "layoutRules" in patch
        layered_layout_patch = "layeredLayout" in patch
        edge_kinds_patch = "autoLayoutEdgeKinds" in patch
        # True when the only disk write needed is views/<name>.json (already done).
        layout_only = False

        if view_id:
            loaded = self.repo.load_view_layout(
                view_id, structure_notation=notation
            )
            # Arcadia layouts must not land on project.view_layouts — save() would
            # migrate them into the SysML v2 views/<name>.json file.
            if notation == "arcadia":
                working = ViewLayouts(
                    by_view={view_id: loaded or ViewLayout()}
                )
            else:
                by_view = dict(project.view_layouts.by_view)
                by_view[view_id] = loaded or by_view.get(view_id) or ViewLayout()
                project.view_layouts = ViewLayouts(by_view=by_view)
                working = project.view_layouts

            if hierarchy_override_patch:
                raw_override = patch.get("hierarchicalLevelsOverride")
                override_val: int | None
                if raw_override is None:
                    override_val = None
                else:
                    try:
                        override_val = max(1, int(raw_override))
                    except (TypeError, ValueError):
                        override_val = None
                working = apply_view_hierarchy_override(
                    working, view_id, override_val
                )
                if notation != "arcadia":
                    project.view_layouts = working

            if view_filters_patch:
                working = apply_view_filters(
                    working, view_id, patch.get("viewFilters")
                )
                if notation != "arcadia":
                    project.view_layouts = working

            if layout_rules_patch:
                working = apply_layout_rules(
                    working, view_id, patch.get("layoutRules")
                )
                if notation != "arcadia":
                    project.view_layouts = working

            if layered_layout_patch:
                working = apply_layered_layout(
                    working, view_id, patch.get("layeredLayout")
                )
                if notation != "arcadia":
                    project.view_layouts = working

            if edge_kinds_patch:
                working = apply_auto_layout_edge_kinds(
                    working, view_id, patch.get("autoLayoutEdgeKinds")
                )
                if notation != "arcadia":
                    project.view_layouts = working

            geo_patch: dict[str, dict] = {}
            other_patch: dict[str, dict] = {}
            for artifact_id, node_data in nodes_patch.items():
                geo: dict = {}
                other: dict = {}
                for key, value in node_data.items():
                    if key == "artifactId":
                        continue
                    if key in (
                        "x",
                        "y",
                        "width",
                        "height",
                        "side",
                        "offset",
                        "anchors",
                        "editLocked",
                        "labelOffset",
                    ):
                        geo[key] = value
                    else:
                        other[key] = value
                if geo:
                    geo_patch[artifact_id] = geo
                if other:
                    other_patch[artifact_id] = other
            if geo_patch:
                working = apply_view_layout_patch(working, view_id, geo_patch)
                if notation != "arcadia":
                    project.view_layouts = working
            nodes_patch = other_patch

            geo_edge_patch: dict[str, dict] = {}
            other_edge_patch: dict[str, dict] = {}
            for artifact_id, edge_data in edges_patch.items():
                geo_e: dict = {}
                other_e: dict = {}
                for key, value in edge_data.items():
                    if key == "artifactId":
                        continue
                    if key in (
                        "routing",
                        "waypoints",
                        "labelOffset",
                        "sourceSide",
                        "sourceOffset",
                        "targetSide",
                        "targetOffset",
                        "sourceAnchorId",
                        "targetAnchorId",
                        "editLocked",
                    ):
                        geo_e[key] = value
                    else:
                        other_e[key] = value
                if geo_e:
                    geo_edge_patch[artifact_id] = geo_e
                if other_e:
                    other_edge_patch[artifact_id] = other_e
            if geo_edge_patch:
                working = apply_view_layout_edge_patch(
                    working, view_id, geo_edge_patch
                )
                if notation != "arcadia":
                    project.view_layouts = working
            edges_patch = other_edge_patch

            if (
                geo_patch
                or geo_edge_patch
                or hierarchy_override_patch
                or view_filters_patch
                or layout_rules_patch
                or layered_layout_patch
                or edge_kinds_patch
            ):
                layout = working.by_view.get(view_id)
                if layout is not None:
                    self.repo.save_view_layout(
                        view_id,
                        _declared_view_name(project, view_id),
                        layout,
                        structure_notation=notation,
                    )
                # Relation-end / node moves with viewId only touch view files.
                # Skip rewriting project.json+state.json (avoids PATCH races).
                layout_only = not nodes_patch and not edges_patch

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
                if "editLocked" in node_data:
                    existing.edit_locked = bool(node_data["editLocked"])
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
                if "sourceSide" in edge_data and edge_data["sourceSide"]:
                    existing.source_side = PortSide(edge_data["sourceSide"])
                if "sourceOffset" in edge_data and edge_data["sourceOffset"] is not None:
                    existing.source_offset = float(edge_data["sourceOffset"])
                if "targetSide" in edge_data and edge_data["targetSide"]:
                    existing.target_side = PortSide(edge_data["targetSide"])
                if "targetOffset" in edge_data and edge_data["targetOffset"] is not None:
                    existing.target_offset = float(edge_data["targetOffset"])
                if "style" in edge_data and edge_data["style"] is not None:
                    if existing.style is None:
                        existing.style = ElementStyle()
                    existing.style.merge(edge_data["style"])
                if "editLocked" in edge_data:
                    existing.edit_locked = bool(edge_data["editLocked"])
            else:
                project.visualization.edges[artifact_id] = VisualizationEdge.from_dict(
                    {"artifactId": artifact_id, **edge_data}
                )

        project.updated_at = utc_now()
        if layout_only:
            return project
        return self.repo.save(project)

    def export_view(
        self,
        project_id: str,
        view_id: str,
        *,
        path: str | None = None,
    ) -> str | None:
        """Write the view layout JSON to ``path`` or a native Save As dialog.

        Returns the absolute path written, or ``None`` if the user cancelled.
        """
        import json

        project = self.get_project(project_id)
        if not project:
            raise FileNotFoundError("Project not found")
        view = next((v for v in project.views if v.id == view_id), None)
        if not view:
            raise KeyError(view_id)

        from adapters.persistence.view_file_store import (
            layout_document,
            safe_view_filename,
            views_dir,
        )
        from domain.view_layouts import ViewLayout

        layout = (
            project.view_layouts.by_view.get(view_id)
            if project.view_layouts
            else None
        ) or ViewLayout()
        doc = layout_document(view_id, view.name, layout)
        default_name = safe_view_filename(view_id, view.name, existing_names=set())

        if path:
            target = Path(path).expanduser().resolve()
        else:
            from adapters.api.native_dialog import pick_save_path

            root = getattr(self.repo, "root", None)
            default_dir = str(views_dir(root)) if root is not None else None
            if default_dir:
                Path(default_dir).mkdir(parents=True, exist_ok=True)
            chosen = pick_save_path(
                title="Export view JSON",
                default_dir=default_dir,
                default_name=default_name,
            )
            if not chosen:
                return None
            target = Path(chosen).expanduser().resolve()

        target.parent.mkdir(parents=True, exist_ok=True)
        if target.suffix.lower() != ".json":
            target = target.with_suffix(".json")
        target.write_text(
            json.dumps(doc, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return str(target)

    def get_view(
        self,
        project_id: str,
        view_id: str,
        hierarchical_levels: int = 2,
        *,
        structure_notation: str = "sysmlv2",
    ) -> dict | None:
        project = self.get_project(project_id)
        if not project:
            return None

        from domain.view_layouts import ViewLayouts

        notation = (
            "arcadia"
            if str(structure_notation or "").strip().lower() == "arcadia"
            else "sysmlv2"
        )
        self._report_view_file_problems(view_id, notation)
        loaded = self.repo.load_view_layout(view_id, structure_notation=notation)
        # Prefer notation file for this response. Keep Arcadia off project.view_layouts
        # so a later save() cannot migrate it into views/<name>.json.
        if loaded is not None:
            by_view = dict(project.view_layouts.by_view)
            by_view[view_id] = loaded
            overlay_layouts = ViewLayouts(by_view=by_view)
            if notation != "arcadia":
                project.view_layouts = overlay_layouts
        else:
            overlay_layouts = project.view_layouts
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
                diagrams = {v.id: v for v in project.views}
                general_views = [
                    e
                    for e in project.semantic.values()
                    if e.id in diagrams
                    and e.parent_id == artifact_id
                    and diagrams[e.id].type_ref in ("GeneralView", None)
                ]
                general_views.sort(key=lambda e: e.id)
                if general_views:
                    return self.get_view(
                        project_id,
                        general_views[0].id,
                        hierarchical_levels,
                        structure_notation=notation,
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

        view_el = project.semantic.get(view.id)
        expose_root_ids: list[str] = []
        stored_filters: list[dict] | None = None
        if view_el is not None:
            # A view usage takes what it lacks from its `view def`.
            _, exposed, stored_filters = effective_view(view_el, project.semantic)
            expose_root_ids = [rid for rid in exposed if rid in project.semantic]
        if not expose_root_ids:
            expose_root_ids = [root.id]
        expose_roots = [
            project.semantic[rid] for rid in expose_root_ids if rid in project.semantic
        ]

        levels_override: int | None = None
        layout_for_view = (
            overlay_layouts.by_view.get(view.id)
            if overlay_layouts is not None
            else None
        )
        if (
            layout_for_view is not None
            and layout_for_view.hierarchical_levels_override is not None
        ):
            levels_override = layout_for_view.hierarchical_levels_override
        effective_levels = (
            levels_override
            if levels_override is not None
            else max(1, hierarchical_levels)
        )

        diagram_mode = resolve_diagram_mode(view, root)
        mode_error: str | None = None
        expected = expected_root_kinds(diagram_mode)
        if expected is not None and root.kind not in expected:
            mode_error = (
                f"{view.type_ref or diagram_mode} requires expose of kind "
                f"{', '.join(k.value for k in expected)}; got '{root.kind.value}'"
            )

        artifact_ids: set[str] = set()
        if diagram_mode in {"sequence", "state", "actionFlow"}:
            # Root + direct children (lifelines/messages, states/transitions, …)
            for eroot in expose_roots:
                artifact_ids.add(eroot.id)
                for cid in eroot.children:
                    artifact_ids.add(cid)
                    child = project.semantic.get(cid)
                    if child:
                        for gc in child.children:
                            artifact_ids.add(gc)
        elif diagram_mode == "tree":
            for eroot in expose_roots:
                artifact_ids |= collect_artifacts_to_depth(
                    project.semantic, eroot.id, effective_levels
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
            for eroot in expose_roots:
                artifact_ids.add(eroot.id)
                for cid in eroot.children:
                    child = project.semantic.get(cid)
                    if not child:
                        continue
                    if child.kind == ArtifactKind.PORT:
                        artifact_ids.add(cid)
                    elif child.kind == ArtifactKind.PART:
                        if child.name == "logical":
                            artifact_ids |= collect_artifacts_to_depth(
                                project.semantic, child.id, effective_levels
                            )
                        else:
                            artifact_ids.add(child.id)
                            for pc in child.children:
                                port = project.semantic.get(pc)
                                if port and port.kind == ArtifactKind.PORT:
                                    artifact_ids.add(pc)
                for el in project.semantic.values():
                    if el.kind == ArtifactKind.ALLOCATION:
                        if el.parent_id != eroot.id:
                            continue
                        artifact_ids.add(el.id)
                        if el.source_id:
                            artifact_ids.add(el.source_id)
                        if el.target_id:
                            artifact_ids.add(el.target_id)
                        continue
                    if el.kind != ArtifactKind.CONNECTION:
                        continue
                    if not el.name.startswith("alloc"):
                        continue
                    if el.parent_id != eroot.id:
                        continue
                    artifact_ids.add(el.id)
                    if el.source_id:
                        artifact_ids.add(el.source_id)
                    if el.target_id:
                        artifact_ids.add(el.target_id)
        else:
            # Structure / whitebox: depth-limit parts & packages (incl. package roots)
            for eroot in expose_roots:
                artifact_ids |= collect_artifacts_to_depth(
                    project.semantic, eroot.id, effective_levels
                )

        # SysML view filter clauses (alpha: @metaclass, name.startsWith)
        from domain.view_filter import apply_view_filters, parse_stored_filters

        view_filters = parse_stored_filters(stored_filters)
        if view_filters:
            artifact_ids = apply_view_filters(
                project.semantic,
                artifact_ids,
                view_filters,
                root_id=root.id,
                root_ids=set(expose_root_ids),
            )

        from domain.merge import STRUCTURE_EDGE_KINDS as structure_edge_kinds

        # Drop relations to/from parts outside the depth window (even if nested
        # under an included parent as a child feature).
        hidden_relations = {
            aid
            for aid in artifact_ids
            if (el := project.semantic.get(aid)) is not None
            and el.kind in structure_edge_kinds
            and not (
                el.source_id
                and el.target_id
                and el.source_id in artifact_ids
                and el.target_id in artifact_ids
            )
        }
        artifact_ids -= hidden_relations

        semantic = {
            aid: project.semantic[aid].to_dict()
            for aid in artifact_ids
            if aid in project.semantic
        }
        nodes = {}
        from domain.merge import DEFAULT_TREE_HEIGHT, DEFAULT_TREE_WIDTH
        from domain.view_layouts import (
            default_view_local_xy,
            layout_has_local_geometry,
            overlay_has_xy,
            resolve_view_edge,
            resolve_view_node,
            stamp_edit_lock,
        )

        # Kinds that are placed as top-level diagram nodes in structure views.
        # When a view already has local geometry, nodes missing from the overlay
        # must not fall back to global project coordinates (different space).
        _VIEW_LOCAL_PLACE_KINDS = {
            ArtifactKind.PART,
            ArtifactKind.REQUIREMENT,
            ArtifactKind.USE_CASE,
            ArtifactKind.ACTOR,
            ArtifactKind.INTERFACE,
        }
        layout_for_geom = (
            overlay_layouts.by_view.get(view.id)
            if overlay_layouts is not None
            else None
        )
        has_local_geometry = layout_has_local_geometry(layout_for_geom)
        use_local_defaults = has_local_geometry and diagram_mode in {
            "structure",
            "whitebox",
        }
        pending_local: list[str] = []

        for aid in artifact_ids:
            global_node = project.visualization.nodes.get(aid)
            if not global_node:
                continue
            overlay = (
                overlay_layouts.get_node(view.id, aid)
                if overlay_layouts is not None
                else None
            )
            el = project.semantic.get(aid)
            if (
                use_local_defaults
                and not overlay_has_xy(overlay)
                and el is not None
                and el.kind in _VIEW_LOCAL_PLACE_KINDS
                and not (
                    el.kind == ArtifactKind.INTERFACE
                    and el.source_id
                    and el.target_id
                )
                and aid != root.id
            ):
                pending_local.append(aid)
                continue
            resolved = resolve_view_node(global_node, overlay)
            if diagram_mode == "tree":
                if overlay is None or overlay.width is None:
                    resolved["width"] = DEFAULT_TREE_WIDTH
                if overlay is None or overlay.height is None:
                    resolved["height"] = DEFAULT_TREE_HEIGHT
            nodes[aid] = resolved

        for index, aid in enumerate(sorted(pending_local)):
            global_node = project.visualization.nodes[aid]
            pending_overlay = (
                overlay_layouts.get_node(view.id, aid)
                if overlay_layouts is not None
                else None
            )
            # Keep what the view saved without a position (boundary anchors,
            # size, lock); only the position is the view's default.
            out = resolve_view_node(global_node, pending_overlay)
            x, y = default_view_local_xy(index)
            out["x"] = x
            out["y"] = y
            nodes[aid] = out

        # Edges: only relations whose endpoints are both in the depth-limited set.
        # Do not reintroduce hidden-subpart relations via layout overlays.
        def _endpoints_visible(el: SemanticElement) -> bool:
            src, tgt = el.source_id, el.target_id
            return bool(src and tgt and src in artifact_ids and tgt in artifact_ids)

        def _viz_synthetic_endpoints(eid: str) -> bool:
            """True for Arcadia composition/aggregation edges with both ends visible."""
            for prefix in ("viz::composition::", "viz::aggregation::"):
                if not eid.startswith(prefix):
                    continue
                rest = eid[len(prefix) :]
                # Prefer longest parent match — both ids contain '::'.
                for parent in sorted(artifact_ids, key=len, reverse=True):
                    marker = f"{parent}::"
                    if rest.startswith(marker):
                        child = rest[len(marker) :]
                        return parent in artifact_ids and child in artifact_ids
                return False
            return False

        edge_ids = set(artifact_ids)
        for eid, el in project.semantic.items():
            if el.kind not in structure_edge_kinds:
                continue
            if _endpoints_visible(el):
                edge_ids.add(eid)
        if overlay_layouts is not None:
            layout = overlay_layouts.by_view.get(view.id)
            if layout is not None:
                for eid in layout.edges:
                    if _viz_synthetic_endpoints(eid):
                        edge_ids.add(eid)
                        continue
                    if eid.startswith("use:") and "->" in eid:
                        body = eid[4:]
                        src, _, tgt = body.partition("->")
                        if src in artifact_ids and tgt in artifact_ids:
                            edge_ids.add(eid)
                        continue
                    el = project.semantic.get(eid)
                    if el is None or el.kind not in structure_edge_kinds:
                        continue
                    if _endpoints_visible(el):
                        edge_ids.add(eid)

        edges = {}
        for aid in edge_ids:
            global_edge = project.visualization.edges.get(aid)
            edge_overlay = (
                overlay_layouts.get_edge(view.id, aid)
                if overlay_layouts is not None
                else None
            )
            if not global_edge and edge_overlay is None:
                continue
            if not global_edge:
                # Structure relations (dependency etc.) often have no global viz
                # row — still surface per-view routing/attachment overlays.
                out: dict = {
                    "artifactId": aid,
                    "waypoints": [],
                    "labelOffset": {"x": 0, "y": 0},
                }
                if edge_overlay.routing is not None:
                    out["routing"] = edge_overlay.routing
                if edge_overlay.waypoints is not None:
                    out["waypoints"] = [w.to_dict() for w in edge_overlay.waypoints]
                if (
                    edge_overlay.label_offset_x is not None
                    or edge_overlay.label_offset_y is not None
                ):
                    out["labelOffset"] = {
                        "x": edge_overlay.label_offset_x or 0,
                        "y": edge_overlay.label_offset_y or 0,
                    }
                if edge_overlay.source_side is not None:
                    out["sourceSide"] = edge_overlay.source_side
                if edge_overlay.source_offset is not None:
                    out["sourceOffset"] = edge_overlay.source_offset
                if edge_overlay.target_side is not None:
                    out["targetSide"] = edge_overlay.target_side
                if edge_overlay.target_offset is not None:
                    out["targetOffset"] = edge_overlay.target_offset
                if edge_overlay.source_anchor_id is not None:
                    out["sourceAnchorId"] = edge_overlay.source_anchor_id
                if edge_overlay.target_anchor_id is not None:
                    out["targetAnchorId"] = edge_overlay.target_anchor_id
                stamp_edit_lock(out, edge_overlay.edit_locked)
                edges[aid] = out
                continue
            resolved_edge = resolve_view_edge(global_edge, edge_overlay)
            if diagram_mode == "allocation":
                conn = project.semantic.get(aid)
                if conn and conn.kind in {
                    ArtifactKind.CONNECTION,
                    ArtifactKind.ALLOCATION,
                }:
                    resolved_edge = {**resolved_edge, "isAllocation": True}
            edges[aid] = resolved_edge

        subdiagrams = child_view_ids(view.root_artifact_id, project.views, project.semantic)
        menus: dict[str, list[dict[str, str]]] = {}
        for aid in artifact_ids:
            menus[aid] = child_view_ids(aid, project.views, project.semantic)

        result: dict = {
            "view": view.to_dict(),
            # Every `expose` of the view (inherited from its `view def` when
            # it has none), so modes can place content from all of them.
            "exposeRootIds": [r.id for r in expose_roots],
            "diagramMode": diagram_mode,
            "hierarchicalLevels": effective_levels,
            "hierarchicalLevelsOverride": levels_override,
            "viewFilters": list(layout_for_view.view_filters)
            if layout_for_view
            else [],
            "layoutRules": list(layout_for_view.layout_rules)
            if layout_for_view
            else [],
            "layeredLayout": (
                dict(layout_for_view.layered_layout)
                if layout_for_view and layout_for_view.layered_layout is not None
                else None
            ),
            "autoLayoutEdgeKinds": (
                dict(layout_for_view.auto_layout_edge_kinds)
                if layout_for_view
                and layout_for_view.auto_layout_edge_kinds is not None
                else None
            ),
            "semantic": semantic,
            "visualization": {"nodes": nodes, "edges": edges},
            "subdiagrams": subdiagrams,
            "menus": menus,
        }
        if mode_error:
            result["modeError"] = mode_error
        return result
