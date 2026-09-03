from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated, Any

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from adapters.api.static_paths import resolve_static_dir
from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from application.project_service import ProjectService
from domain.models import Project


class CreateProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    folder: str | None = None


class SessionCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    folder: str


class SessionOpenBody(BaseModel):
    folder: str | None = None
    projectFile: str | None = None

    @model_validator(mode="after")
    def exactly_one(self) -> SessionOpenBody:
        if bool(self.folder) == bool(self.projectFile):
            raise ValueError("Provide exactly one of folder or projectFile")
        return self


class SessionBrowseBody(BaseModel):
    kind: str = Field(pattern="^(folder|file)$")


class SaveProjectBody(BaseModel):
    name: str | None = None
    visualization: dict[str, Any] | None = None


class VisualizationPatch(BaseModel):
    nodes: dict[str, Any] | None = None
    edges: dict[str, Any] | None = None
    viewId: str | None = None
    structureNotation: str | None = None
    # Present + null clears per-view override; omit to leave unchanged.
    hierarchicalLevelsOverride: int | None = None


class AddConnectionBody(BaseModel):
    sourceId: str
    targetId: str
    name: str | None = None


class ParentNameBody(BaseModel):
    parentId: str
    name: str | None = None
    typeRef: str | None = None
    exposeRef: str | None = None


class RenameBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class FileMetaBody(BaseModel):
    sourcePath: str | None = None
    name: str | None = None
    path: str | None = None


class AddFileBody(BaseModel):
    path: str = Field(min_length=1)
    content: str | None = None


class ExportViewBody(BaseModel):
    path: str | None = None


class TitleBlockBody(BaseModel):
    title: str = ""
    createdBy: str = ""
    editedBy: str = ""
    version: str = ""
    lastUpdated: str = ""
    drawingId: str = ""
    position: str = Field(
        pattern="^(top-left|top-right|bottom-right|bottom-left)$"
    )


class FrameBody(BaseModel):
    paper: str = Field(pattern="^(A4|A3)$")
    orientation: str = Field(pattern="^(landscape|portrait)$")
    visible: bool = True


def create_api_app(
    data_dir: Path | None = None,
    *,
    workspace: Path | None = None,
    project_file: Path | None = None,
) -> FastAPI:
    """Create FastAPI app with JSON API routes at the app root (mount at /api)."""
    initial_workspace = workspace or data_dir
    if project_file is not None:
        pf = Path(project_file).resolve()
        if not pf.is_file():
            raise FileNotFoundError(f"Project file not found: {pf}")
        initial_workspace = pf.parent

    session: dict[str, Any] = {
        "workspace_root": None,
        "repo": None,
        "service": None,
        "parser": SubsetSysmlParser(),
    }

    def _bind_workspace(folder: Path) -> WorkspaceProjectRepository:
        repo = WorkspaceProjectRepository(folder)
        session["workspace_root"] = repo.root
        session["repo"] = repo
        session["service"] = ProjectService(repo=repo, parser=session["parser"])
        return repo

    def _service() -> ProjectService:
        svc = session["service"]
        if svc is None:
            raise HTTPException(status_code=400, detail="No workspace open")
        return svc

    def _session_payload() -> dict:
        root: Path | None = session["workspace_root"]
        svc: ProjectService | None = session["service"]
        project = None
        if svc is not None and root is not None:
            open_project = session["repo"].get_open() if session["repo"] else None
            if open_project is not None:
                project = svc.get_project(open_project.id)
                if project:
                    project = project.to_dict()
        return {
            "workspaceRoot": str(root) if root else None,
            "project": project,
        }

    if initial_workspace is not None:
        folder = Path(initial_workspace).resolve()
        if not folder.is_dir():
            raise FileNotFoundError(f"Workspace folder not found: {folder}")
        repo = _bind_workspace(folder)
        # If project.json exists, it is already loadable; otherwise empty workspace
        _ = repo

    app = FastAPI(title="SysML Viewer API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/session")
    def get_session() -> dict:
        return _session_payload()

    @app.get("/session/example-projects")
    def session_example_projects() -> list[dict]:
        from adapters.api.example_projects import list_example_projects

        return list_example_projects()

    @app.post("/session/create")
    def session_create(payload: Annotated[SessionCreateBody, Body()]) -> dict:
        folder = Path(payload.folder).expanduser().resolve()
        if not folder.is_dir():
            raise HTTPException(status_code=400, detail="Folder does not exist")
        repo = _bind_workspace(folder)
        if repo._manifest_path().exists():
            raise HTTPException(
                status_code=400, detail="Project already exists in folder"
            )
        project = Project.create(payload.name.strip() or "Untitled")
        repo.save(project)
        return _session_payload()

    @app.post("/session/open")
    def session_open(payload: Annotated[SessionOpenBody, Body()]) -> dict:
        if payload.projectFile:
            pf = Path(payload.projectFile).expanduser().resolve()
            if not pf.is_file():
                raise HTTPException(status_code=404, detail="Project file not found")
            folder = pf.parent
        else:
            folder = Path(payload.folder or "").expanduser().resolve()
            if not folder.is_dir():
                raise HTTPException(status_code=404, detail="Folder not found")
        repo = _bind_workspace(folder)
        project = repo.get_open()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return _session_payload()

    @app.post("/session/browse")
    def session_browse(payload: Annotated[SessionBrowseBody, Body()]) -> dict:
        from adapters.api.native_dialog import pick_path

        title = (
            "Choose project folder"
            if payload.kind == "folder"
            else "Choose project.json"
        )
        try:
            path = pick_path(kind=payload.kind, title=title)
        except RuntimeError as exc:
            raise HTTPException(status_code=501, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=501,
                detail=f"Native file dialog failed: {exc}",
            ) from exc
        return {"path": path}

    @app.post("/projects")
    def create_project(payload: Annotated[CreateProjectBody, Body()]) -> dict:
        if not payload.folder and session["workspace_root"] is None:
            raise HTTPException(
                status_code=400,
                detail="folder is required (or open a workspace first)",
            )
        if payload.folder:
            folder = Path(payload.folder).expanduser().resolve()
            if not folder.is_dir():
                raise HTTPException(status_code=400, detail="Folder does not exist")
            repo = _bind_workspace(folder)
            if repo._manifest_path().exists():
                raise HTTPException(
                    status_code=400, detail="Project already exists in folder"
                )
            project = Project.create(payload.name.strip() or "Untitled")
            repo.save(project)
            return project.to_dict()
        # Create in already-open workspace that has no project yet
        repo = session["repo"]
        if repo is None:
            raise HTTPException(status_code=400, detail="No workspace open")
        if repo.get_open() is not None:
            raise HTTPException(
                status_code=400, detail="Workspace already has a project"
            )
        project = Project.create(payload.name.strip() or "Untitled")
        return repo.save(project).to_dict()

    @app.get("/projects")
    def list_projects() -> list[dict]:
        if session["service"] is None:
            return []
        return _service().list_projects()

    @app.get("/projects/{project_id}")
    def get_project(project_id: str) -> dict:
        project = _service().get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.put("/projects/{project_id}")
    def save_project(
        project_id: str, payload: Annotated[SaveProjectBody, Body()]
    ) -> dict:
        project = _service().save_project(
            project_id, payload.model_dump(exclude_none=True)
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.delete("/projects/{project_id}")
    def delete_project(project_id: str) -> dict:
        if not _service().delete_project(project_id):
            raise HTTPException(status_code=404, detail="Project not found")
        session["workspace_root"] = None
        session["repo"] = None
        session["service"] = None
        return {"ok": True}

    @app.post("/projects/{project_id}/files")
    def add_file(
        project_id: str, payload: Annotated[AddFileBody, Body()]
    ) -> dict:
        try:
            project = _service().add_file_from_path(
                project_id,
                path=payload.path,
                content=payload.content,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.post("/projects/{project_id}/files/refresh/{file_id:path}")
    def refresh_file(project_id: str, file_id: str) -> dict:
        try:
            project = _service().refresh_file_from_disk(project_id, file_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not project:
            raise HTTPException(status_code=404, detail="Project or file not found")
        return project.to_dict()

    @app.patch("/projects/{project_id}/visualization")
    def patch_visualization(
        project_id: str, payload: Annotated[VisualizationPatch, Body()]
    ) -> dict:
        project = _service().update_visualization(
            project_id, payload.model_dump(exclude_unset=True)
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.post("/projects/{project_id}/connections")
    def add_connection(
        project_id: str, payload: Annotated[AddConnectionBody, Body()]
    ) -> dict:
        project = _service().add_connection(
            project_id,
            source_port_id=payload.sourceId,
            target_port_id=payload.targetId,
            name=payload.name,
        )
        if not project:
            raise HTTPException(
                status_code=400,
                detail="Could not create connection (invalid ports or project)",
            )
        return project.to_dict()

    @app.post("/projects/{project_id}/parts")
    def add_part(
        project_id: str, payload: Annotated[ParentNameBody, Body()]
    ) -> dict:
        project = _service().add_part(
            project_id,
            parent_id=payload.parentId,
            name=payload.name,
            type_ref=payload.typeRef,
        )
        if not project:
            raise HTTPException(status_code=400, detail="Could not add part")
        return project.to_dict()

    @app.post("/projects/{project_id}/ports")
    def add_port(
        project_id: str, payload: Annotated[ParentNameBody, Body()]
    ) -> dict:
        project = _service().add_port(
            project_id,
            parent_id=payload.parentId,
            name=payload.name,
            type_ref=payload.typeRef,
        )
        if not project:
            raise HTTPException(status_code=400, detail="Could not add port")
        return project.to_dict()

    @app.post("/projects/{project_id}/attributes")
    def add_attribute(
        project_id: str, payload: Annotated[ParentNameBody, Body()]
    ) -> dict:
        project = _service().add_attribute(
            project_id, parent_id=payload.parentId, name=payload.name
        )
        if not project:
            raise HTTPException(status_code=400, detail="Could not add attribute")
        return project.to_dict()

    @app.post("/projects/{project_id}/declared-views")
    def add_view(
        project_id: str, payload: Annotated[ParentNameBody, Body()]
    ) -> dict:
        project = _service().add_view(
            project_id,
            parent_id=payload.parentId,
            name=payload.name,
            expose_ref=payload.exposeRef,
            type_ref=payload.typeRef or "GeneralView",
        )
        if not project:
            raise HTTPException(status_code=400, detail="Could not add view")
        return project.to_dict()

    @app.patch("/projects/{project_id}/semantic/{artifact_id:path}")
    def rename_artifact(
        project_id: str,
        artifact_id: str,
        payload: Annotated[RenameBody, Body()],
    ) -> dict:
        project = _service().rename_artifact(project_id, artifact_id, payload.name)
        if not project:
            raise HTTPException(status_code=404, detail="Artifact not found")
        return project.to_dict()

    @app.delete("/projects/{project_id}/semantic/{artifact_id:path}")
    def delete_artifact(project_id: str, artifact_id: str) -> dict:
        project = _service().delete_artifact(project_id, artifact_id)
        if not project:
            raise HTTPException(status_code=404, detail="Artifact not found")
        return project.to_dict()

    @app.patch("/projects/{project_id}/files/item/{file_id:path}")
    def patch_file_meta(
        project_id: str,
        file_id: str,
        payload: Annotated[FileMetaBody, Body()],
    ) -> dict:
        project = _service().rename_file(
            project_id,
            file_id,
            name=payload.name,
            path=payload.path,
            source_path=payload.sourcePath,
        )
        if not project:
            raise HTTPException(status_code=404, detail="File not found")
        return project.to_dict()

    @app.delete("/projects/{project_id}/files/item/{file_id:path}")
    def delete_file(project_id: str, file_id: str) -> dict:
        project = _service().delete_file(project_id, file_id)
        if not project:
            raise HTTPException(status_code=404, detail="File not found")
        return project.to_dict()

    @app.get("/projects/{project_id}/documentation")
    def list_documentation(project_id: str) -> dict:
        paths = _service().list_documentation(project_id)
        if paths is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"paths": paths}

    @app.get("/projects/{project_id}/documentation/{doc_path:path}")
    def get_documentation(project_id: str, doc_path: str) -> dict:
        try:
            content = _service().read_documentation(project_id, doc_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if content is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"path": doc_path, "content": content}

    @app.post("/projects/{project_id}/views/{view_id:path}/export")
    def export_view(
        project_id: str,
        view_id: str,
        payload: Annotated[ExportViewBody | None, Body()] = None,
    ) -> dict:
        body = payload or ExportViewBody()
        try:
            path = _service().export_view(
                project_id, view_id, path=body.path
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except KeyError:
            raise HTTPException(status_code=404, detail="View not found") from None
        except RuntimeError as exc:
            raise HTTPException(status_code=501, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"path": path}

    @app.get("/projects/{project_id}/views/{view_id:path}")
    def get_view(
        project_id: str,
        view_id: str,
        levels: int = 2,
        notation: str = "sysmlv2",
    ) -> dict:
        view = _service().get_view(
            project_id,
            view_id,
            hierarchical_levels=levels,
            structure_notation=notation,
        )
        if not view:
            raise HTTPException(status_code=404, detail="View not found")
        return view

    @app.put("/projects/{project_id}/sheet/title-block")
    def put_title_block(
        project_id: str, payload: Annotated[TitleBlockBody, Body()]
    ) -> dict:
        project = _service().set_title_block(
            project_id, payload.model_dump()
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.delete("/projects/{project_id}/sheet/title-block")
    def delete_title_block(project_id: str) -> dict:
        project = _service().clear_title_block(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.put("/projects/{project_id}/sheet/frame")
    def put_frame(
        project_id: str, payload: Annotated[FrameBody, Body()]
    ) -> dict:
        project = _service().set_frame(project_id, payload.model_dump())
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.delete("/projects/{project_id}/sheet/frame")
    def delete_frame(project_id: str) -> dict:
        project = _service().clear_frame(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    return app


def create_app(
    data_dir: Path | None = None,
    *,
    workspace: Path | None = None,
    project_file: Path | None = None,
    static_dir: Path | None = None,
) -> FastAPI:
    """Create composite app: API under /api and optional static frontend at /."""
    api = create_api_app(
        data_dir,
        workspace=workspace,
        project_file=project_file,
    )
    root = FastAPI(title="SysML Viewer", version="0.1.0")
    root.mount("/api", api)

    resolved_static = static_dir
    if resolved_static is not None:
        resolved_static = (
            Path(resolved_static).resolve()
            if Path(resolved_static).is_dir()
            else None
        )
    if resolved_static is not None:
        root.mount(
            "/",
            StaticFiles(directory=resolved_static, html=True),
            name="static",
        )
    return root


def _app_from_env() -> FastAPI:
    folder = os.environ.get("SYSMLVIEWER_FOLDER") or None
    project = os.environ.get("SYSMLVIEWER_PROJECT") or None
    workspace = Path(folder).resolve() if folder else None
    project_file = Path(project).resolve() if project else None
    static = resolve_static_dir()
    return create_app(
        workspace=workspace,
        project_file=project_file,
        static_dir=static,
    )


app = _app_from_env()
