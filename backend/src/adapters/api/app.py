from pathlib import Path
from typing import Annotated, Any

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.json_repo import JsonFileProjectRepository
from application.project_service import ProjectService


class CreateProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SaveProjectBody(BaseModel):
    name: str | None = None
    visualization: dict[str, Any] | None = None


class VisualizationPatch(BaseModel):
    nodes: dict[str, Any] | None = None
    edges: dict[str, Any] | None = None


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


class FileSourcePathBody(BaseModel):
    sourcePath: str | None = None


def create_app(data_dir: Path | None = None) -> FastAPI:
    root = data_dir or Path(__file__).resolve().parents[4] / "data" / "projects"
    repo = JsonFileProjectRepository(root)
    parser = SubsetSysmlParser()
    service = ProjectService(repo=repo, parser=parser)

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

    @app.post("/projects")
    def create_project(payload: Annotated[CreateProjectBody, Body()]) -> dict:
        project = service.create_project(payload.name)
        return project.to_dict()

    @app.get("/projects")
    def list_projects() -> list[dict]:
        return service.list_projects()

    @app.get("/projects/{project_id}")
    def get_project(project_id: str) -> dict:
        project = service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.put("/projects/{project_id}")
    def save_project(
        project_id: str, payload: Annotated[SaveProjectBody, Body()]
    ) -> dict:
        project = service.save_project(
            project_id, payload.model_dump(exclude_none=True)
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.delete("/projects/{project_id}")
    def delete_project(project_id: str) -> dict:
        if not service.delete_project(project_id):
            raise HTTPException(status_code=404, detail="Project not found")
        return {"ok": True}

    @app.post("/projects/{project_id}/files")
    async def upload_file(
        project_id: str,
        file: UploadFile = File(...),
        name: str | None = Form(default=None),
        sourcePath: str | None = Form(default=None),
    ) -> dict:
        content_bytes = await file.read()
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="File must be UTF-8 text") from exc
        filename = name or file.filename or "untitled.sysml"
        project = service.add_file(
            project_id,
            filename,
            content,
            source_path=sourcePath or None,
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.post("/projects/{project_id}/files/{file_id}/refresh")
    async def refresh_file(
        project_id: str,
        file_id: str,
        file: UploadFile | None = File(default=None),
        sourcePath: str | None = Form(default=None),
    ) -> dict:
        if file is None:
            raise HTTPException(
                status_code=400,
                detail="Refresh requires a file body (pick the SysML file again)",
            )
        content_bytes = await file.read()
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="File must be UTF-8 text") from exc
        # Prefer explicit sourcePath; fall back to uploaded filename as path hint
        path_hint = sourcePath or file.filename
        project = service.refresh_file(
            project_id,
            file_id,
            content=content,
            source_path=path_hint,
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project or file not found")
        return project.to_dict()

    @app.patch("/projects/{project_id}/visualization")
    def patch_visualization(
        project_id: str, payload: Annotated[VisualizationPatch, Body()]
    ) -> dict:
        project = service.update_visualization(
            project_id, payload.model_dump(exclude_none=True)
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project.to_dict()

    @app.post("/projects/{project_id}/connections")
    def add_connection(
        project_id: str, payload: Annotated[AddConnectionBody, Body()]
    ) -> dict:
        project = service.add_connection(
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
        project = service.add_part(
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
        project = service.add_port(
            project_id, parent_id=payload.parentId, name=payload.name
        )
        if not project:
            raise HTTPException(status_code=400, detail="Could not add port")
        return project.to_dict()

    @app.post("/projects/{project_id}/attributes")
    def add_attribute(
        project_id: str, payload: Annotated[ParentNameBody, Body()]
    ) -> dict:
        project = service.add_attribute(
            project_id, parent_id=payload.parentId, name=payload.name
        )
        if not project:
            raise HTTPException(status_code=400, detail="Could not add attribute")
        return project.to_dict()

    @app.post("/projects/{project_id}/declared-views")
    def add_view(
        project_id: str, payload: Annotated[ParentNameBody, Body()]
    ) -> dict:
        project = service.add_view(
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
        project = service.rename_artifact(project_id, artifact_id, payload.name)
        if not project:
            raise HTTPException(status_code=404, detail="Artifact not found")
        return project.to_dict()

    @app.delete("/projects/{project_id}/semantic/{artifact_id:path}")
    def delete_artifact(project_id: str, artifact_id: str) -> dict:
        project = service.delete_artifact(project_id, artifact_id)
        if not project:
            raise HTTPException(status_code=404, detail="Artifact not found")
        return project.to_dict()

    @app.patch("/projects/{project_id}/files/{file_id}")
    def patch_file_meta(
        project_id: str,
        file_id: str,
        payload: Annotated[FileSourcePathBody, Body()],
    ) -> dict:
        project = service.update_file_source_path(
            project_id, file_id, payload.sourcePath
        )
        if not project:
            raise HTTPException(status_code=404, detail="File not found")
        return project.to_dict()

    @app.get("/projects/{project_id}/views/{view_id:path}")
    def get_view(
        project_id: str, view_id: str, levels: int = 2
    ) -> dict:
        view = service.get_view(project_id, view_id, hierarchical_levels=levels)
        if not view:
            raise HTTPException(status_code=404, detail="View not found")
        return view

    return app


app = create_app()
