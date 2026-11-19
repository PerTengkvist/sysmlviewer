"""Shared test helpers for workspace-based API tests."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi.testclient import TestClient

API_PREFIX = "/api"


def api_url(path: str) -> str:
    """Prefix API paths with /api for composite app routing."""
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{API_PREFIX}{path}"


def resolve_example_path(name: str) -> Path:
    """Locate an example file under examples/ or examples/diagrams/."""
    root = Path(__file__).resolve().parents[2] / "examples"
    for candidate in (root / name, root / "diagrams" / name):
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"Example not found: {name}")


def add_example_file(
    client: TestClient,
    project_id: str,
    workspace: Path,
    example_name: str,
    *,
    dest_name: str | None = None,
) -> dict:
    """Copy examples/<example_name> into workspace and register via path API."""
    sample = resolve_example_path(example_name)
    rel = dest_name or example_name
    dest = workspace / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(sample.read_bytes())
    res = client.post(
        api_url(f"/projects/{project_id}/files"),
        json={"path": rel},
    )
    assert res.status_code == 200, res.text
    return res.json()


def add_content_file(
    client: TestClient,
    project_id: str,
    workspace: Path,
    rel: str,
    content: str,
) -> dict:
    dest = workspace / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content, encoding="utf-8")
    res = client.post(
        api_url(f"/projects/{project_id}/files"),
        json={"path": rel},
    )
    assert res.status_code == 200, res.text
    return res.json()


def car_ignore(*names: str):
    """`shutil.copytree(ignore=...)`: skip `names` anywhere, and the generated reports in fmea/docs.

    A plain "docs" pattern would also drop the element docs of every package folder.
    """
    base = shutil.ignore_patterns(*names)

    def ignore(directory, entries):
        skipped = set(base(directory, entries))
        if Path(directory).name == "fmea" and "docs" in entries:
            skipped.add("docs")
        return skipped

    return ignore
