"""Per-view AutoLayout edge-kind choices (connections / bindings / relations)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.view_layouts import ViewLayout
from helpers import add_content_file, api_url

SIMPLE = """
package Pkg {
  part def Root {
    part engine;
    part wheel;
  }
  view SimpleView : GeneralView {
    expose Root;
  }
}
"""


def _client(tmp_path: Path) -> tuple[TestClient, str, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "F"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "simple.sysml", SIMPLE)
    return client, project_id, "Pkg::SimpleView"


def _view(client: TestClient, project_id: str, view_id: str) -> dict:
    return client.get(api_url(f"/projects/{project_id}/views/{view_id}")).json()


def test_view_layout_normalizes_edge_kinds():
    layout = ViewLayout.from_dict(
        {
            "nodes": {},
            "autoLayoutEdgeKinds": {
                "connections": False,
                "bindings": "yes",
                "relations": True,
                "other": True,
            },
        }
    )
    assert layout.to_dict()["autoLayoutEdgeKinds"] == {
        "connections": False,
        "bindings": True,
        "relations": True,
    }
    assert "autoLayoutEdgeKinds" not in ViewLayout.from_dict({"nodes": {}}).to_dict()


def test_edge_kinds_roundtrip_preserve_and_clear(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)
    assert _view(client, project_id, view_id)["autoLayoutEdgeKinds"] is None

    kinds = {"connections": False, "bindings": False, "relations": True}
    patched = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "autoLayoutEdgeKinds": kinds, "structureNotation": "sysmlv2"},
    )
    assert patched.status_code == 200
    assert _view(client, project_id, view_id)["autoLayoutEdgeKinds"] == kinds

    # A later geometry patch keeps the choice.
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "structureNotation": "sysmlv2",
            "nodes": {"Pkg::Root::engine": {"x": 10, "y": 20}},
        },
    )
    assert _view(client, project_id, view_id)["autoLayoutEdgeKinds"] == kinds

    # Persisted in the per-view layout file.
    view_file = next(tmp_path.rglob("views/SimpleView.json"))
    assert json.loads(view_file.read_text())["autoLayoutEdgeKinds"] == kinds

    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "autoLayoutEdgeKinds": None, "structureNotation": "sysmlv2"},
    )
    assert _view(client, project_id, view_id)["autoLayoutEdgeKinds"] is None
