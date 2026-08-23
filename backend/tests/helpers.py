"""Shared test helpers for workspace-based API tests."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def add_example_file(
    client: TestClient,
    project_id: str,
    workspace: Path,
    example_name: str,
    *,
    dest_name: str | None = None,
) -> dict:
    """Copy examples/<example_name> into workspace and register via path API."""
    sample = Path(__file__).resolve().parents[2] / "examples" / example_name
    rel = dest_name or example_name
    dest = workspace / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(sample.read_bytes())
    res = client.post(
        f"/projects/{project_id}/files",
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
        f"/projects/{project_id}/files",
        json={"path": rel},
    )
    assert res.status_code == 200, res.text
    return res.json()
