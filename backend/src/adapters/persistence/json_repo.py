from __future__ import annotations

import json
from pathlib import Path

from domain.models import Project


class JsonFileProjectRepository:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, project_id: str) -> Path:
        return self.root / f"{project_id}.json"

    def list_summaries(self) -> list[dict[str, str]]:
        summaries: list[dict[str, str]] = []
        for path in sorted(self.root.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                summaries.append(
                    {
                        "id": data["id"],
                        "name": data["name"],
                        "updatedAt": data.get("updatedAt", ""),
                    }
                )
            except (json.JSONDecodeError, KeyError, OSError):
                continue
        summaries.sort(key=lambda s: s.get("updatedAt", ""), reverse=True)
        return summaries

    def get(self, project_id: str) -> Project | None:
        path = self._path(project_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return Project.from_dict(data)

    def save(self, project: Project) -> Project:
        path = self._path(project.id)
        path.write_text(
            json.dumps(project.to_dict(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return project

    def delete(self, project_id: str) -> bool:
        path = self._path(project_id)
        if not path.exists():
            return False
        path.unlink()
        return True
