"""Single-workspace project repository: project.json at folder root."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from domain.models import Project, SemanticElement, SysmlFile, VisualizationModel, ViewDef
from domain.view_layouts import ViewLayout, ViewLayouts
from adapters.persistence import view_file_store


def sanitize_rel_path(raw: str | None, fallback_name: str) -> str:
    """Return a safe project-relative path (no absolute, no '..')."""
    candidate = (raw or fallback_name).strip().replace("\\", "/")
    if not candidate:
        candidate = fallback_name
    path = Path(candidate)
    if path.is_absolute() or (len(path.parts) and path.parts[0].endswith(":")):
        candidate = path.name or fallback_name
        path = Path(candidate)
    parts = [p for p in path.parts if p not in ("", ".", "..")]
    if not parts:
        parts = [fallback_name]
    if ".." in parts:
        parts = [fallback_name]
    return "/".join(parts)


class WorkspaceProjectRepository:
    """Persist one project whose root is ``root`` (manifest at root/project.json)."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _manifest_path(self) -> Path:
        return self.root / "project.json"

    def _state_path(self) -> Path:
        return self.root / "state.json"

    def _resolve_under_root(self, rel: str) -> Path:
        safe = sanitize_rel_path(rel, "untitled.sysml")
        target = (self.root / safe).resolve()
        try:
            target.relative_to(self.root)
        except ValueError as exc:
            raise ValueError(f"Path escapes project directory: {rel}") from exc
        return target

    def read_sysml(self, rel: str) -> str:
        disk = self._resolve_under_root(rel)
        if not disk.is_file():
            raise FileNotFoundError(rel)
        return disk.read_text(encoding="utf-8")

    @staticmethod
    def is_documentation_path(rel: str) -> bool:
        """True when rel is a markdown file under a docs/ directory."""
        safe = sanitize_rel_path(rel, "untitled.md")
        if not safe.endswith(".md"):
            return False
        parts = Path(safe).parts
        return "docs" in parts

    def list_documentation(self) -> list[str]:
        """Return project-relative paths of all **/docs/*.md files."""
        if not self.root.is_dir():
            return []
        paths: list[str] = []
        for path in self.root.rglob("*.md"):
            if not path.is_file():
                continue
            try:
                rel = path.relative_to(self.root).as_posix()
            except ValueError:
                continue
            if self.is_documentation_path(rel):
                paths.append(rel)
        return sorted(paths)

    def read_documentation(self, rel: str) -> str:
        if not self.is_documentation_path(rel):
            raise ValueError(f"Not a documentation path: {rel}")
        disk = self._resolve_under_root(rel)
        if not disk.is_file():
            raise FileNotFoundError(rel)
        return disk.read_text(encoding="utf-8")

    def write_sysml(self, rel: str, content: str) -> None:
        disk = self._resolve_under_root(rel)
        disk.parent.mkdir(parents=True, exist_ok=True)
        # Never blank out an existing SysML source (viewer must not wipe models).
        if disk.is_file() and disk.stat().st_size > 0 and not (content or "").strip():
            raise ValueError(
                f"Refusing to overwrite non-empty SysML with empty content: {rel}"
            )
        disk.write_text(content, encoding="utf-8")

    def move_sysml(self, old_rel: str, new_rel: str) -> None:
        """Rename/move a SysML file on disk without rewriting its contents."""
        src = self._resolve_under_root(old_rel)
        dst = self._resolve_under_root(new_rel)
        if not src.is_file():
            raise FileNotFoundError(old_rel)
        if src.resolve() == dst.resolve():
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            raise FileExistsError(new_rel)
        src.rename(dst)

    def list_summaries(self) -> list[dict[str, str]]:
        project = self._load_any()
        if not project:
            return []
        return [
            {
                "id": project.id,
                "name": project.name,
                "updatedAt": project.updated_at.isoformat(),
            }
        ]

    def get(self, project_id: str) -> Project | None:
        project = self._load_any()
        if not project or project.id != project_id:
            return None
        return project

    def get_open(self) -> Project | None:
        return self._load_any()

    def _load_any(self) -> Project | None:
        manifest_path = self._manifest_path()
        if not manifest_path.exists():
            return None
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

        state: dict = {}
        state_path = self._state_path()
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
        files: list[SysmlFile] = []
        for rel in sysmlfiles:
            meta = file_metas.get(rel) or {}
            content = ""
            try:
                disk = self._resolve_under_root(rel)
                if disk.exists():
                    content = disk.read_text(encoding="utf-8")
            except (ValueError, OSError):
                content = ""
            files.append(
                SysmlFile(
                    id=meta.get("id") or rel,
                    name=meta.get("name") or Path(rel).name,
                    content=content,
                    warnings=list(meta.get("warnings") or []),
                    source_path=None,
                    path=rel,
                )
            )

        name = manifest.get("projektnamn") or manifest.get("name") or "Untitled"
        created = manifest.get("created") or manifest.get("createdAt")
        updated = manifest.get("updated") or manifest.get("updatedAt")
        if not created or not updated:
            return None

        sheet = state.get("sheet")
        if sheet is None:
            sheet = {"titleBlock": None, "frame": None}

        view_layouts = view_file_store.read_all(self.root)
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
                        self.root, vid, view_names.get(vid) or None, layout
                    )
            view_layouts = view_file_store.read_all(self.root)

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
            sheet=sheet,
            view_layouts=view_layouts,
        )

    def save_view_layout(
        self,
        view_id: str,
        name: str | None,
        layout: ViewLayout,
        *,
        structure_notation: str = "sysmlv2",
    ) -> Path:
        """Persist a single view overlay file without rewriting state.json."""
        return view_file_store.write_one(
            self.root,
            view_id,
            name,
            layout,
            structure_notation=structure_notation,
        )

    def save(self, project: Project) -> Project:
        """Persist project.json + state.json only (no viewLayouts blob).

        SysML sources on disk are read-only for the viewer: never rewrite or
        prune ``*.sysml`` here. New files are created via ``write_sysml`` /
        ``add_file`` only. Per-view geometry lives under ``views/*.json``.
        """
        self.root.mkdir(parents=True, exist_ok=True)

        # One-shot migrate: if in-memory layouts exist but files missing, write them
        if project.view_layouts and project.view_layouts.by_view:
            on_disk = view_file_store.read_all(self.root)
            for view_id, layout in project.view_layouts.by_view.items():
                if view_id not in on_disk.by_view:
                    view_name = next(
                        (v.name for v in project.views if v.id == view_id),
                        None,
                    )
                    view_file_store.write_one(self.root, view_id, view_name, layout)

        sysmlfiles: list[str] = []
        file_metas: list[dict] = []
        for sysml_file in project.files:
            rel = sanitize_rel_path(
                sysml_file.path or sysml_file.name, sysml_file.name or "untitled.sysml"
            )
            sysml_file.path = rel
            sysml_file.source_path = None
            sysmlfiles.append(rel)
            file_metas.append(
                {
                    "id": sysml_file.id,
                    "name": sysml_file.name,
                    "path": rel,
                    "warnings": list(sysml_file.warnings),
                }
            )

        manifest = {
            "id": project.id,
            "projektnamn": project.name,
            "created": project.created_at.isoformat(),
            "updated": project.updated_at.isoformat(),
            "sysmlfiles": sysmlfiles,
        }
        sheet: dict[str, Any]
        if project.sheet is not None:
            sheet = project.sheet
        else:
            sheet = {"titleBlock": None, "frame": None}
        state = {
            "files": file_metas,
            "semantic": {k: v.to_dict() for k, v in project.semantic.items()},
            "visualization": project.visualization.to_dict(),
            "views": [v.to_dict() for v in project.views],
            "sheet": sheet,
        }
        self._atomic_write_json(self._manifest_path(), manifest)
        self._atomic_write_json(self._state_path(), state)
        return project

    @staticmethod
    def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
        """Write JSON via unique temp + replace (safe under concurrent PATCH).

        A fixed ``path.tmp`` name races: two writers replace the same temp and the
        loser hits FileNotFoundError on replace (500 Internal Server Error).
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        fd, tmp_name = tempfile.mkstemp(
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=path.parent,
        )
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(text)
                handle.flush()
                os.fsync(handle.fileno())
            tmp.replace(path)
        except Exception:
            tmp.unlink(missing_ok=True)
            raise

    def delete(self, project_id: str) -> bool:
        project = self.get(project_id)
        if not project:
            return False
        for path in (self._manifest_path(), self._state_path()):
            if path.exists():
                path.unlink()
        return True
