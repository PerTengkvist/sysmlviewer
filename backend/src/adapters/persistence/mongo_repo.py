"""MongoDB project repository stub for future persistence (NFR / alpha polish)."""

from __future__ import annotations

from domain.models import Project


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
