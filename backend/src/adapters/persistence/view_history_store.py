"""File-backed per-browser-session view history under .sysmlviewer/sessions/."""

from __future__ import annotations

import json
import re
from pathlib import Path

from domain.view_history import ViewHistory

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class ViewHistoryStore:
    def __init__(self, workspace_root: Path) -> None:
        self.root = Path(workspace_root)
        self.dir = self.root / ".sysmlviewer" / "sessions"

    def _path(self, session_id: str) -> Path:
        if not _SAFE_ID.match(session_id):
            raise ValueError("invalid session id")
        return self.dir / f"{session_id}.json"

    def load(self, session_id: str) -> ViewHistory:
        path = self._path(session_id)
        if not path.is_file():
            return ViewHistory()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return ViewHistory()
        return ViewHistory.from_dict(data if isinstance(data, dict) else None)

    def save(self, session_id: str, history: ViewHistory) -> None:
        path = self._path(session_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(history.to_dict(), indent=2) + "\n",
            encoding="utf-8",
        )
