"""Serve built-in tutorial markdown from docs/tutorials/."""

from __future__ import annotations

from pathlib import Path

from adapters.api.static_paths import resolve_repo_root

TUTORIAL_FILES = (
    "sysml-v2.md",
    "cheatsheet.md",
    "use-cases-and-scenarios.md",
    "mbse.md",
)

TUTORIAL_TITLES = {
    "sysml-v2": "SysML v2 introduction",
    "cheatsheet": "SysML v2 cheatsheet",
    "use-cases-and-scenarios": "Use cases and scenarios",
    "mbse": "MBSE introduction",
}


def tutorials_dir() -> Path:
    return resolve_repo_root() / "docs" / "tutorials"


def list_tutorials() -> list[dict[str, str]]:
    root = tutorials_dir()
    items: list[dict[str, str]] = []
    for name in TUTORIAL_FILES:
        path = root / name
        if not path.is_file():
            continue
        stem = path.stem
        items.append(
            {
                "id": stem,
                "title": TUTORIAL_TITLES.get(stem, stem),
                "filename": name,
            }
        )
    return items


def read_tutorial(tutorial_id: str) -> str:
    safe = Path(tutorial_id).name
    if safe != tutorial_id or "/" in tutorial_id or "\\" in tutorial_id:
        raise ValueError("invalid tutorial id")
    # Accept id with or without .md
    stem = safe[:-3] if safe.endswith(".md") else safe
    path = (tutorials_dir() / f"{stem}.md").resolve()
    root = tutorials_dir().resolve()
    if not str(path).startswith(str(root)) or not path.is_file():
        raise FileNotFoundError(tutorial_id)
    return path.read_text(encoding="utf-8")
