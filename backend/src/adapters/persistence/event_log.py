"""Append-only event log kept per workspace.

Each event is one JSON line in ``.sysmlviewer/events.jsonl`` and one line in
Python logging, and the API serves the same record, so the GUI shows exactly
what the log holds.
"""

from __future__ import annotations

import json
import logging
import sys
import threading
from collections import deque
from pathlib import Path
from typing import Any

from adapters.persistence.atomic_write import atomic_write_text
from domain.models import utc_now

EVENTS_FILE = Path(".sysmlviewer") / "events.jsonl"
MAX_EVENTS = 2000

logger = logging.getLogger("sysmlviewer.events")

_LOG_LEVELS = {
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}


class _CurrentStdoutHandler(logging.StreamHandler):
    """Looks up ``sys.stdout`` per record, which uvicorn output is redirected to."""

    def __init__(self) -> None:
        logging.Handler.__init__(self)

    @property
    def stream(self) -> Any:
        return sys.stdout


def configure_event_logging() -> None:
    """Send events to stdout. Without a handler, info records would be dropped."""
    logger.setLevel(logging.INFO)
    if any(isinstance(h, _CurrentStdoutHandler) for h in logger.handlers):
        return
    handler = _CurrentStdoutHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)


def _format_detail(detail: dict[str, Any]) -> str:
    return (
        f"{detail.get('element')} {detail.get('name') or detail.get('id')}: "
        f"{detail.get('field')} canvas={detail.get('canvas')} "
        f"saved={detail.get('saved')} ({detail.get('source')})"
    )


def format_event_line(event: dict[str, Any]) -> str:
    line = f"{event['code']}: {event['message']}"
    details = event.get("details") or []
    if details:
        line += " | " + "; ".join(_format_detail(d) for d in details)
    return line


class JsonlEventLog:
    def __init__(self, root: Path, *, max_events: int = MAX_EVENTS) -> None:
        self._path = Path(root) / EVENTS_FILE
        self._max_events = max_events
        self._lock = threading.Lock()
        self._events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self._lines_on_disk = 0
        self._seq = 0
        self._reported_unwritable = False
        self._load()

    def _load(self) -> None:
        try:
            lines = self._path.read_text(encoding="utf-8").splitlines()
        except (OSError, ValueError):
            return
        self._lines_on_disk = len(lines)
        for line in lines:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict) and isinstance(event.get("seq"), int):
                self._events.append(event)
                self._seq = max(self._seq, event["seq"])

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
        with self._lock:
            event = self._append(level, code, message, view_id, view_name, details)
            try:
                self._persist(event)
            except OSError as exc:
                self._report_unwritable(exc)
        logger.log(_LOG_LEVELS.get(level, logging.INFO), format_event_line(event))
        return event

    def _append(
        self,
        level: str,
        code: str,
        message: str,
        view_id: str | None,
        view_name: str | None,
        details: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        self._seq += 1
        event = {
            "seq": self._seq,
            "ts": utc_now().isoformat(),
            "level": level,
            "code": code,
            "viewId": view_id,
            "viewName": view_name,
            "message": message,
            "details": details or [],
        }
        self._events.append(event)
        return event

    def _persist(self, event: dict[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")
        self._lines_on_disk += 1
        # Trim in batches so a save does not rewrite the file for every event.
        if self._lines_on_disk >= 2 * self._max_events:
            lines = [json.dumps(e, ensure_ascii=False) for e in self._events]
            atomic_write_text(self._path, "\n".join(lines) + "\n")
            self._lines_on_disk = len(lines)

    def _report_unwritable(self, exc: OSError) -> None:
        if self._reported_unwritable:
            return
        self._reported_unwritable = True
        event = self._append(
            "warning",
            "eventlog.unwritable",
            f"Cannot write {self._path}: {exc}. Events are kept in memory only.",
            None,
            None,
            None,
        )
        logger.warning(format_event_line(event))

    def read(self, *, after: int = 0, limit: int = 500) -> list[dict[str, Any]]:
        with self._lock:
            newer = [e for e in self._events if e["seq"] > after]
        return newer[-limit:]
