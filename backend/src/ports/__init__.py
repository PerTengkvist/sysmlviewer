from __future__ import annotations

from typing import Protocol

from domain.models import Project, SemanticElement


class ProjectRepository(Protocol):
    def list_summaries(self) -> list[dict[str, str]]:
        ...

    def get(self, project_id: str) -> Project | None:
        ...

    def save(self, project: Project) -> Project:
        ...

    def delete(self, project_id: str) -> bool:
        ...


class ParseResult:
    def __init__(
        self,
        elements: dict[str, SemanticElement],
        warnings: list[str] | None = None,
    ) -> None:
        self.elements = elements
        self.warnings = warnings or []


class SysmlParser(Protocol):
    def parse(self, content: str, file_id: str) -> ParseResult:
        ...
