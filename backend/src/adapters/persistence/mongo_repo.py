"""MongoDB project repository stub for future persistence (NFR / alpha polish)."""

from __future__ import annotations

from pathlib import Path

from domain.models import Project
from domain.view_layouts import ViewLayout


class MongoProjectRepository:
    """Stub adapter. Raises until a real Mongo implementation is wired."""

    def __init__(self, uri: str = "mongodb://localhost:27017", db_name: str = "sysmlviewer") -> None:
        self.uri = uri
        self.db_name = db_name

    def list_summaries(self) -> list[dict[str, str]]:
        raise NotImplementedError(
            "MongoProjectRepository is a stub. Use JsonFileProjectRepository in alpha."
        )

    def get(self, project_id: str) -> Project | None:
        raise NotImplementedError(
            "MongoProjectRepository is a stub. Use JsonFileProjectRepository in alpha."
        )

    def save(self, project: Project) -> Project:
        raise NotImplementedError(
            "MongoProjectRepository is a stub. Use JsonFileProjectRepository in alpha."
        )

    def delete(self, project_id: str) -> bool:
        raise NotImplementedError(
            "MongoProjectRepository is a stub. Use JsonFileProjectRepository in alpha."
        )

    def load_view_layout(
        self, view_id: str, *, structure_notation: str = "sysmlv2"
    ) -> ViewLayout | None:
        raise NotImplementedError(
            "MongoProjectRepository is a stub. Use JsonFileProjectRepository in alpha."
        )

    def save_view_layout(
        self,
        view_id: str,
        name: str | None,
        layout: ViewLayout,
        *,
        structure_notation: str = "sysmlv2",
    ) -> Path:
        raise NotImplementedError(
            "MongoProjectRepository is a stub. Use JsonFileProjectRepository in alpha."
        )

    def duplicate_view_files(
        self, view_id: str, *, structure_notation: str = "sysmlv2"
    ) -> list[Path]:
        raise NotImplementedError(
            "MongoProjectRepository is a stub. Use JsonFileProjectRepository in alpha."
        )

    def corrupt_view_files(self) -> list[Path]:
        raise NotImplementedError(
            "MongoProjectRepository is a stub. Use JsonFileProjectRepository in alpha."
        )
