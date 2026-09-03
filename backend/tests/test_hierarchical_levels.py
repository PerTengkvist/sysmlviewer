"""Hierarchical diagram levels: depth filter, package roots, edge hiding, override."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

NESTED = """
package Pkg {
  package PartDefinitions {
    part FD1 {
      part F1;
      part F2;
      dependency from F1 to F2;
    }
    part FD2 {
      part F3;
    }
    dependency from FD1 to FD2;
  }
  view def NestedView : GeneralView {
    expose PartDefinitions;
  }
}
"""


def _client(tmp_path: Path) -> tuple[TestClient, str, str]:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "H"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "nested.sysml", NESTED)
    view_id = "Pkg::NestedView"
    return client, project_id, view_id


def test_package_root_respects_levels(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)

    shallow = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 2},
    ).json()
    assert "Pkg::PartDefinitions::FD1" in shallow["semantic"]
    assert "Pkg::PartDefinitions::FD2" in shallow["semantic"]
    assert "Pkg::PartDefinitions::FD1::F1" not in shallow["semantic"]
    assert shallow["hierarchicalLevels"] == 2
    assert shallow["hierarchicalLevelsOverride"] is None

    deep = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 3},
    ).json()
    assert "Pkg::PartDefinitions::FD1::F1" in deep["semantic"]
    assert "Pkg::PartDefinitions::FD1::F2" in deep["semantic"]
    assert deep["hierarchicalLevels"] == 3


def test_hidden_subpart_dependencies_excluded(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)

    shallow = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 2},
    ).json()
    deps = [
        e
        for e in shallow["semantic"].values()
        if e["kind"] == "dependency"
    ]
    sources = {d["sourceId"] for d in deps}
    assert "Pkg::PartDefinitions::FD1" in sources
    assert "Pkg::PartDefinitions::FD1::F1" not in sources

    deep = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 3},
    ).json()
    deep_sources = {
        e["sourceId"]
        for e in deep["semantic"].values()
        if e["kind"] == "dependency"
    }
    assert "Pkg::PartDefinitions::FD1::F1" in deep_sources
    assert "Pkg::PartDefinitions::FD1" in deep_sources

def test_view_hierarchy_override(tmp_path: Path):
    client, project_id, view_id = _client(tmp_path)

    patched = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "hierarchicalLevelsOverride": 3,
            "structureNotation": "sysmlv2",
        },
    )
    assert patched.status_code == 200

    # Global levels=2 but override=3 → include F1
    payload = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 2},
    ).json()
    assert payload["hierarchicalLevels"] == 3
    assert payload["hierarchicalLevelsOverride"] == 3
    assert "Pkg::PartDefinitions::FD1::F1" in payload["semantic"]

    cleared = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "hierarchicalLevelsOverride": None,
            "structureNotation": "sysmlv2",
        },
    )
    assert cleared.status_code == 200
    payload2 = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 2},
    ).json()
    assert payload2["hierarchicalLevels"] == 2
    assert payload2["hierarchicalLevelsOverride"] is None
    assert "Pkg::PartDefinitions::FD1::F1" not in payload2["semantic"]
