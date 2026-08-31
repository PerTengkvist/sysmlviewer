from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path

from domain.models import Project, SysmlFile, VisualizationModel, ViewDef, SemanticElement
from domain.view_layouts import ViewLayout, ViewLayouts
from adapters.persistence import view_file_store


def sanitize_rel_path(raw: str | None, fallback_name: str) -> str:
    """Return a safe project-relative path (no absolute, no '..')."""
    candidate = (raw or fallback_name).strip().replace("\\", "/")
    if not candidate:
        candidate = fallback_name
    path = Path(candidate)
    # Absolute or drive-letter paths → basename only
    if path.is_absolute() or (len(path.parts) and path.parts[0].endswith(":")):
        candidate = path.name or fallback_name
        path = Path(candidate)
    parts = [p for p in path.parts if p not in ("", ".", "..")]
    if not parts:
        parts = [fallback_name]
    # Reject leftover parent refs
    if ".." in parts:
        parts = [fallback_name]
    return "/".join(parts)


class JsonFileProjectRepository:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _project_dir(self, project_id: str) -> Path:
        return self.root / project_id

    def _legacy_path(self, project_id: str) -> Path:
        return self.root / f"{project_id}.json"

    def _manifest_path(self, project_id: str) -> Path:
        return self._project_dir(project_id) / "project.json"

    def _state_path(self, project_id: str) -> Path:
        return self._project_dir(project_id) / "state.json"

    def _resolve_under_project(self, project_id: str, rel: str) -> Path:
        project_dir = self._project_dir(project_id).resolve()
        safe = sanitize_rel_path(rel, "untitled.sysml")
        target = (project_dir / safe).resolve()
        try:
            target.relative_to(project_dir)
        except ValueError as exc:
            raise ValueError(f"Path escapes project directory: {rel}") from exc
        return target

    def list_summaries(self) -> list[dict[str, str]]:
        self._migrate_all_legacy()
        summaries: list[dict[str, str]] = []
        for manifest in sorted(self.root.glob("*/project.json")):
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
                summaries.append(
                    {
                        "id": data["id"],
                        "name": data.get("projektnamn") or data.get("name", ""),
                        "updatedAt": data.get("updated") or data.get("updatedAt", ""),
                    }
                )
            except (json.JSONDecodeError, KeyError, OSError):
                continue
        summaries.sort(key=lambda s: s.get("updatedAt", ""), reverse=True)
        return summaries

    def get(self, project_id: str) -> Project | None:
        self._migrate_legacy_if_needed(project_id)
        manifest_path = self._manifest_path(project_id)
        if not manifest_path.exists():
            return None
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

        state_path = self._state_path(project_id)
        state: dict = {}
        if state_path.exists():
            try:
                state = json.loads(state_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                state = {}

        sysmlfiles = list(manifest.get("sysmlfiles") or [])
        file_metas = {
            (f.get("path") or f.get("name")): f
            for f in (state.get("files") or [])
            if isinstance(f, dict)
        }
        # Also index by id for lookups when path missing
        files: list[SysmlFile] = []
        for rel in sysmlfiles:
            meta = file_metas.get(rel) or {}
            content = ""
            try:
                disk = self._resolve_under_project(project_id, rel)
                if disk.exists():
                    content = disk.read_text(encoding="utf-8")
            except (ValueError, OSError):
                content = meta.get("content") or ""
            files.append(
                SysmlFile(
                    id=meta.get("id") or rel,
                    name=meta.get("name") or Path(rel).name,
                    content=content,
                    warnings=list(meta.get("warnings") or []),
                    source_path=meta.get("sourcePath"),
                    path=rel,
                )
            )

        # Files in state but not listed (shouldn't happen) — skip
        name = manifest.get("projektnamn") or manifest.get("name") or "Untitled"
        created = manifest.get("created") or manifest.get("createdAt")
        updated = manifest.get("updated") or manifest.get("updatedAt")
        if not created or not updated:
            return None

        project_dir = self._project_dir(project_id)
        view_layouts = view_file_store.read_all(project_dir)
        legacy = state.get("viewLayouts")
        if isinstance(legacy, dict) and legacy:
            view_names = {
                str(v.get("id")): str(v.get("name") or "")
                for v in (state.get("views") or [])
                if isinstance(v, dict) and v.get("id")
            }
            for vid, layout in ViewLayouts.from_dict(legacy).by_view.items():
                if vid not in view_layouts.by_view:
                    view_file_store.write_one(
                        project_dir, vid, view_names.get(vid) or None, layout
                    )
            view_layouts = view_file_store.read_all(project_dir)

        self._current_project_id = project_id
        return Project(
            id=manifest["id"],
            name=name,
            created_at=datetime.fromisoformat(created),
            updated_at=datetime.fromisoformat(updated),
            files=files,
            semantic={
                k: SemanticElement.from_dict(v)
                for k, v in (state.get("semantic") or {}).items()
            },
            visualization=VisualizationModel.from_dict(state.get("visualization")),
            views=[ViewDef.from_dict(v) for v in state.get("views") or []],
            view_layouts=view_layouts,
        )

    def save_view_layout(
        self,
        view_id: str,
        name: str | None,
        layout: ViewLayout,
    ) -> Path:
        project_id = getattr(self, "_current_project_id", None)
        if not project_id:
            raise RuntimeError("No project context for save_view_layout")
        return view_file_store.write_one(
            self._project_dir(project_id), view_id, name, layout
        )

    def write_sysml(self, rel: str, content: str, *, project_id: str | None = None) -> None:
        """Write a new SysML file. Requires project_id for multi-project roots."""
        if not project_id:
            raise ValueError("project_id is required to write SysML in JsonFileProjectRepository")
        disk = self._resolve_under_project(project_id, rel)
        disk.parent.mkdir(parents=True, exist_ok=True)
        disk.write_text(content, encoding="utf-8")

    def move_sysml(self, old_rel: str, new_rel: str, *, project_id: str | None = None) -> None:
        if not project_id:
            raise ValueError("project_id is required to move SysML in JsonFileProjectRepository")
        src = self._resolve_under_project(project_id, old_rel)
        dst = self._resolve_under_project(project_id, new_rel)
        if not src.is_file():
            raise FileNotFoundError(old_rel)
        if src.resolve() == dst.resolve():
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            raise FileExistsError(new_rel)
        src.rename(dst)

    def save(self, project: Project) -> Project:
        self._current_project_id = project.id
        project_dir = self._project_dir(project.id)
        project_dir.mkdir(parents=True, exist_ok=True)

        # Persist manifest + state only; SysML on disk is read-only after create.
        sysmlfiles: list[str] = []
        file_metas: list[dict] = []
        for sysml_file in project.files:
            rel = sanitize_rel_path(
                sysml_file.path or sysml_file.name, sysml_file.name or "untitled.sysml"
            )
            sysml_file.path = rel
            sysmlfiles.append(rel)
            file_metas.append(
                {
                    "id": sysml_file.id,
                    "name": sysml_file.name,
                    "path": rel,
                    "warnings": list(sysml_file.warnings),
                    "sourcePath": sysml_file.source_path,
                }
            )

        manifest = {
            "id": project.id,
            "projektnamn": project.name,
            "created": project.created_at.isoformat(),
            "updated": project.updated_at.isoformat(),
            "sysmlfiles": sysmlfiles,
        }
        project_dir = self._project_dir(project.id)
        if project.view_layouts and project.view_layouts.by_view:
            on_disk = view_file_store.read_all(project_dir)
            for view_id, layout in project.view_layouts.by_view.items():
                if view_id not in on_disk.by_view:
                    view_name = next(
                        (v.name for v in project.views if v.id == view_id),
                        None,
                    )
                    view_file_store.write_one(project_dir, view_id, view_name, layout)
        state = {
            "files": file_metas,
            "semantic": {k: v.to_dict() for k, v in project.semantic.items()},
            "visualization": project.visualization.to_dict(),
            "views": [v.to_dict() for v in project.views],
        }
        self._manifest_path(project.id).write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        self._state_path(project.id).write_text(
            json.dumps(state, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        # Drop legacy flat file if present
        legacy = self._legacy_path(project.id)
        if legacy.exists():
            legacy.unlink()

        return project

    def delete(self, project_id: str) -> bool:
        project_dir = self._project_dir(project_id)
        legacy = self._legacy_path(project_id)
        deleted = False
        if project_dir.is_dir():
            shutil.rmtree(project_dir)
            deleted = True
        if legacy.exists():
            legacy.unlink()
            deleted = True
        return deleted

    def _prune_orphaned_sysml(self, project_id: str, keep: set[str]) -> None:
        project_dir = self._project_dir(project_id)
        if not project_dir.is_dir():
            return
        for path in project_dir.rglob("*.sysml"):
            try:
                rel = path.relative_to(project_dir).as_posix()
            except ValueError:
                continue
            if rel not in keep:
                try:
                    path.unlink()
                except OSError:
                    pass

    def _migrate_all_legacy(self) -> None:
        for path in list(self.root.glob("*.json")):
            if path.name == ".gitkeep":
                continue
            project_id = path.stem
            self._migrate_legacy_if_needed(project_id)

    def _migrate_legacy_if_needed(self, project_id: str) -> None:
        legacy = self._legacy_path(project_id)
        if not legacy.exists():
            return
        if self._manifest_path(project_id).exists():
            # Already migrated; remove leftover legacy
            try:
                legacy.unlink()
            except OSError:
                pass
            return
        try:
            data = json.loads(legacy.read_text(encoding="utf-8"))
            project = Project.from_dict(data)
            for f in project.files:
                if not f.path:
                    # Prefer basename of sourcePath if relative-looking, else name
                    raw = f.source_path or f.name
                    f.path = sanitize_rel_path(raw, f.name)
            self.save(project)
        except (json.JSONDecodeError, KeyError, OSError, ValueError, TypeError):
            # Leave legacy file; get() will return None for this id via folder
            return
