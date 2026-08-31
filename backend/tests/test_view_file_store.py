"""Unit/integration tests for per-view JSON layout files under views/."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.persistence.view_file_store import (
    migrate_from_state,
    read_all,
    safe_view_filename,
    write_one,
)
from domain.view_layouts import ViewLayout, ViewLayouts, ViewNodeLayout
from helpers import add_content_file, api_url

SAMPLE = """\
package Sample {
  part def Box {
    part child;
  }

  view def BoxView : GeneralView {
    expose Box;
  }

  view def BoxTree : TreeView {
    expose Box;
  }
}
"""


def test_view_filename_from_unique_name():
    assert safe_view_filename(
        "Pkg::BoxView", "BoxView", existing_names=set()
    ) == "BoxView.json"


def test_view_filename_disambiguates_duplicate_names():
    name = safe_view_filename(
        "PkgA::BoxView",
        "BoxView",
        existing_names={"BoxView", "Other"},
    )
    assert name == "PkgA__BoxView.json"
    assert "/" not in name
    assert ":" not in name


def test_write_and_read_single_view_file(tmp_path: Path):
    layout = ViewLayout(
        nodes={"Sample::Box": ViewNodeLayout(x=10, y=20, width=180, height=110)}
    )
    path = write_one(
        tmp_path,
        view_id="Sample::BoxView",
        name="BoxView",
        layout=layout,
    )
    assert path == tmp_path / "views" / "BoxView.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["schemaVersion"] == 1
    assert data["viewId"] == "Sample::BoxView"
    assert data["name"] == "BoxView"
    assert data["nodes"]["Sample::Box"]["x"] == 10

    loaded = read_all(tmp_path)
    node = loaded.get_node("Sample::BoxView", "Sample::Box")
    assert node is not None
    assert node.x == 10
    assert node.y == 20


def test_load_view_layouts_from_directory(tmp_path: Path):
    write_one(
        tmp_path,
        "A::One",
        "One",
        ViewLayout(nodes={"a": ViewNodeLayout(x=1)}),
    )
    write_one(
        tmp_path,
        "A::Two",
        "Two",
        ViewLayout(nodes={"b": ViewNodeLayout(x=2)}),
    )
    layouts = read_all(tmp_path)
    assert set(layouts.by_view) == {"A::One", "A::Two"}
    assert layouts.get_node("A::One", "a") is not None
    assert layouts.get_node("A::Two", "b") is not None


def test_migrate_state_view_layouts_to_files(tmp_path: Path):
    state = {
        "viewLayouts": {
            "Sample::BoxView": {
                "nodes": {"Sample::Box": {"x": 42, "y": 7, "width": 100, "height": 50}}
            }
        }
    }
    layouts = migrate_from_state(
        tmp_path,
        state,
        view_names={"Sample::BoxView": "BoxView"},
    )
    assert (tmp_path / "views" / "BoxView.json").is_file()
    assert layouts.get_node("Sample::BoxView", "Sample::Box").x == 42

    # Workspace save must drop viewLayouts from state.json
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Mig"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "s.sysml", SAMPLE)
    # Seed legacy key then trigger save via GET (reparse+save if changed) / patch
    state_path = tmp_path / "state.json"
    raw = json.loads(state_path.read_text(encoding="utf-8"))
    raw["viewLayouts"] = state["viewLayouts"]
    state_path.write_text(json.dumps(raw), encoding="utf-8")

    # Re-open via get triggers load+migrate path
    app2 = create_app(data_dir=tmp_path)
    client2 = TestClient(app2)
    project = client2.get(api_url(f"/projects/{project_id}")).json()
    assert "BoxView" in {v["name"] for v in project["views"]}
    client2.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"nodes": {"Sample::Box": {"x": 1}}},
    )
    after = json.loads(state_path.read_text(encoding="utf-8"))
    assert "viewLayouts" not in after
    assert (tmp_path / "views").is_dir()


def test_patch_visualization_writes_only_that_view_file(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Iso"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "s.sysml", SAMPLE)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    views = {v["name"]: v["id"] for v in project["views"]}
    box_id = "Sample::Box"

    # Establish both view files via patches
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": views["BoxView"],
            "nodes": {box_id: {"x": 10, "y": 10, "width": 100, "height": 50}},
        },
    )
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": views["BoxTree"],
            "nodes": {box_id: {"x": 20, "y": 20, "width": 80, "height": 40}},
        },
    )
    tree_path = tmp_path / "views" / "BoxTree.json"
    tree_before = tree_path.read_text(encoding="utf-8")
    tree_mtime = tree_path.stat().st_mtime_ns

    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": views["BoxView"],
            "nodes": {box_id: {"x": 99, "y": 10, "width": 100, "height": 50}},
        },
    )

    assert tree_path.read_text(encoding="utf-8") == tree_before
    assert tree_path.stat().st_mtime_ns == tree_mtime
    box_view = json.loads((tmp_path / "views" / "BoxView.json").read_text())
    assert box_view["nodes"][box_id]["x"] == 99

    state = json.loads((tmp_path / "state.json").read_text(encoding="utf-8"))
    assert "viewLayouts" not in state


def test_get_view_merges_per_view_file_overlay(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Merge"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "s.sysml", SAMPLE)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if v["name"] == "BoxView")
    box_id = "Sample::Box"

    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"nodes": {box_id: {"x": 0, "y": 0, "width": 800, "height": 600}}},
    )
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "nodes": {box_id: {"x": 5, "y": 6, "width": 160, "height": 40}},
        },
    )
    loaded = client.get(api_url(f"/projects/{project_id}/views/{view_id}")).json()
    node = loaded["visualization"]["nodes"][box_id]
    assert node["x"] == 5.0
    assert node["width"] == 160.0
