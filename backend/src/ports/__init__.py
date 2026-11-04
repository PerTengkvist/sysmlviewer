from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from domain.models import Project, SemanticElement, SysmlFile
from domain.view_layouts import ViewLayout


class ProjectRepository(Protocol):
    def list_summaries(self) -> list[dict[str, str]]:
        ...

    def get(self, project_id: str) -> Project | None:
        ...

    def save(self, project: Project) -> Project:
        ...

    def delete(self, project_id: str) -> bool:
        ...

    def load_view_layout(
        self, view_id: str, *, structure_notation: str = "sysmlv2"
    ) -> ViewLayout | None:
        ...

    def save_view_layout(
        self,
        view_id: str,
        name: str | None,
        layout: ViewLayout,
        *,
        structure_notation: str = "sysmlv2",
    ) -> Path:
        ...

    def duplicate_view_files(
        self, view_id: str, *, structure_notation: str = "sysmlv2"
    ) -> list[Path]:
        ...

    def corrupt_view_files(self) -> list[Path]:
        ...


class EventLog(Protocol):
    def record(
        self,
        level: str,
        code: str,
        message: str,
        *,
        view_id: str | None = None,
        view_name: str | None = None,
        details: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        ...

    def read(self, *, after: int = 0, limit: int = 500) -> list[dict[str, Any]]:
        ...


class NullEventLog:
    """Used where no workspace log is bound. Records nothing."""

    def record(
        self,
        level: str,
        code: str,
        message: str,
        *,
        view_id: str | None = None,
        view_name: str | None = None,
        details: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return {
            "seq": 0,
            "ts": None,
            "level": level,
            "code": code,
            "viewId": view_id,
            "viewName": view_name,
            "message": message,
            "details": details or [],
        }

    def read(self, *, after: int = 0, limit: int = 500) -> list[dict[str, Any]]:
        return []


class ParseResult:
    def __init__(
        self,
        elements: dict[str, SemanticElement],
        warnings: list[str] | None = None,
        *,
        file_warnings: dict[str, list[str]] | None = None,
        imports: list[dict] | None = None,
    ) -> None:
        self.elements = elements
        self.warnings = warnings or []
        self.file_warnings = file_warnings or {}
        self.imports = imports or []


class SysmlParser(Protocol):
    def parse(self, content: str, file_id: str) -> ParseResult:
        ...

    def parse_project(self, files: list[SysmlFile]) -> ParseResult:
        ...
