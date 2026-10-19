"""Per-browser-session view navigation history (last + previous 5)."""

from __future__ import annotations

from dataclasses import dataclass, field

MAX_PREVIOUS = 5


@dataclass
class ViewHistory:
    last_view_id: str | None = None
    previous: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "lastViewId": self.last_view_id,
            "previous": list(self.previous),
        }

    @classmethod
    def from_dict(cls, data: dict | None) -> ViewHistory:
        if not data:
            return cls()
        prev = data.get("previous") or []
        if not isinstance(prev, list):
            prev = []
        return cls(
            last_view_id=data.get("lastViewId"),
            previous=[str(p) for p in prev][:MAX_PREVIOUS],
        )


def record_view(history: ViewHistory, view_id: str) -> ViewHistory:
    """Push view_id as last; keep up to MAX_PREVIOUS prior views (no consecutive dupes)."""
    if not view_id:
        return history
    if history.last_view_id == view_id:
        return history
    previous = list(history.previous)
    if history.last_view_id:
        previous.append(history.last_view_id)
        previous = previous[-MAX_PREVIOUS:]
    return ViewHistory(last_view_id=view_id, previous=previous)


def go_back(history: ViewHistory) -> tuple[ViewHistory, str | None]:
    """Pop last into forgotten; return previous tip as new last (or None if empty)."""
    if not history.previous:
        if history.last_view_id is None:
            return history, None
        # Only last remains — clear it, nowhere to go
        return ViewHistory(), None
    previous = list(history.previous)
    target = previous.pop()
    return ViewHistory(last_view_id=target, previous=previous), target
