from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

RelationTodoAction = Literal["add", "change", "delete"]
RelationTodoType = Literal[
    "connection",
    "dependency",
    "use",
    "extend",
    "include",
    "flow",
    "satisfy",
    "derive",
    "refine",
    "allocation",
]

ALLOWED_TYPES = frozenset(
    {
        "connection",
        "dependency",
        "use",
        "extend",
        "include",
        "flow",
        "satisfy",
        "derive",
        "refine",
        "allocation",
    }
)


class RelationTodoStore:
    """JSON list of relation edit TODOs in the project root."""

    FILENAME = ".update_relations_todos.json"

    def __init__(self, project_root: Path) -> None:
        self.path = project_root / self.FILENAME

    def load(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        raw = self.path.read_text(encoding="utf-8").strip()
        if not raw:
            return []
        data = json.loads(raw)
        if not isinstance(data, list):
            raise ValueError("todo file must be a JSON array")
        return data

    def save(self, items: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(items, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        tmp.replace(self.path)

    def next_id(self, items: list[dict[str, Any]] | None = None) -> int:
        items = items if items is not None else self.load()
        if not items:
            return 1
        return max(int(i["id"]) for i in items) + 1

    def append(self, entry: dict[str, Any]) -> dict[str, Any]:
        if entry.get("type") not in ALLOWED_TYPES:
            raise ValueError(f"invalid type: {entry.get('type')}")
        if entry.get("action") not in {"add", "change", "delete"}:
            raise ValueError(f"invalid action: {entry.get('action')}")
        items = self.load()
        entry = dict(entry)
        entry["id"] = self.next_id(items)
        items = self._coalesce(items, entry)
        self.save(items)
        # return the effective entry after coalesce (may have been merged)
        for it in items:
            if it["id"] == entry["id"] or (
                entry["action"] == "change"
                and it.get("action") == "change"
                and it.get("source") == entry.get("source")
                and it.get("type") == entry.get("type")
            ):
                # prefer last matching
                pass
        return entry if any(i["id"] == entry["id"] for i in items) else items[-1] if items else entry

    def delete(self, todo_id: int) -> bool:
        items = self.load()
        next_items = [i for i in items if int(i["id"]) != todo_id]
        if len(next_items) == len(items):
            return False
        self.save(next_items)
        return True

    def _coalesce(
        self, items: list[dict[str, Any]], entry: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """
        - add then delete of same source/target/type → remove both
        - two changes on same relation → keep original, update new_def/ends
        """
        key = (
            entry.get("relationId")
            or f"{entry.get('source')}->{entry.get('target')}:{entry.get('type')}"
        )

        def same_relation(it: dict[str, Any]) -> bool:
            if entry.get("relationId") and it.get("relationId") == entry["relationId"]:
                return True
            return (
                it.get("source") == entry.get("source")
                and it.get("target") == entry.get("target")
                and it.get("type") == entry.get("type")
            )

        if entry["action"] == "delete":
            # cancel a prior add
            kept: list[dict[str, Any]] = []
            cancelled_add = False
            for it in items:
                if it.get("action") == "add" and same_relation(it):
                    cancelled_add = True
                    continue
                kept.append(it)
            if cancelled_add:
                return kept
            return kept + [entry]

        if entry["action"] == "change":
            for i, it in enumerate(items):
                if it.get("action") == "change" and (
                    (entry.get("relationId") and it.get("relationId") == entry["relationId"])
                    or (
                        it.get("type") == entry.get("type")
                        and it.get("relationId") == entry.get("relationId")
                    )
                ):
                    merged = dict(it)
                    merged["new_def"] = entry.get("new_def", merged.get("new_def"))
                    merged["source"] = entry.get("source", merged.get("source"))
                    merged["target"] = entry.get("target", merged.get("target"))
                    # keep original + id from first
                    out = items[:]
                    out[i] = merged
                    return out
            return items + [entry]

        return items + [entry]
