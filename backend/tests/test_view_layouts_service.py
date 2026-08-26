"""Service/API tests for view-scoped geometry overlays."""

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.merge import DEFAULT_TREE_HEIGHT, DEFAULT_TREE_WIDTH
from helpers import add_content_file

DUAL_VIEW_SYSML = """\
package Dual {
  part def Box {
    part child : Box;
  }

  view def BoxTree : TreeView {
    expose Box;
  }

  view def BoxView : GeneralView {
    expose Box;
  }
}
"""


def _client(tmp_path: Path) -> tuple[TestClient, str]:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    created = client.post("/projects", json={"name": "Dual"}).json()
    return client, created["id"]


def _setup_dual(tmp_path: Path) -> tuple[TestClient, str, str, str, str]:
    client, project_id = _client(tmp_path)
    add_content_file(client, project_id, tmp_path, "dual.sysml", DUAL_VIEW_SYSML)
    project = client.get(f"/projects/{project_id}").json()
    views = {v["name"]: v["id"] for v in project["views"]}
    assert "BoxTree" in views and "BoxView" in views
    part_id = "Dual::Box"
    # Make global geometry large (whitebox-scale)
    client.patch(
        f"/projects/{project_id}/visualization",
        json={"nodes": {part_id: {"x": 10, "y": 20, "width": 800, "height": 600}}},
    )
    return client, project_id, views["BoxTree"], views["BoxView"], part_id


def test_get_view_tree_without_overlay_uses_compact_defaults(tmp_path: Path):
    client, project_id, tree_id, general_id, part_id = _setup_dual(tmp_path)

    tree = client.get(f"/projects/{project_id}/views/{tree_id}").json()
    assert tree["diagramMode"] == "tree"
    node = tree["visualization"]["nodes"][part_id]
    assert node["width"] == DEFAULT_TREE_WIDTH
    assert node["height"] == DEFAULT_TREE_HEIGHT

    general = client.get(f"/projects/{project_id}/views/{general_id}").json()
    gnode = general["visualization"]["nodes"][part_id]
    assert gnode["width"] == 800.0
    assert gnode["height"] == 600.0


def test_patch_with_view_id_writes_overlay_not_global(tmp_path: Path):
    client, project_id, tree_id, general_id, part_id = _setup_dual(tmp_path)

    patched = client.patch(
        f"/projects/{project_id}/visualization",
        json={
            "viewId": tree_id,
            "nodes": {part_id: {"width": 160, "height": 40, "x": 5, "y": 6}},
        },
    ).json()
    assert patched["visualization"]["nodes"][part_id]["width"] == 800.0
    assert patched["viewLayouts"][tree_id]["nodes"][part_id]["width"] == 160.0
    assert patched["viewLayouts"][tree_id]["nodes"][part_id]["height"] == 40.0

    tree = client.get(f"/projects/{project_id}/views/{tree_id}").json()
    assert tree["visualization"]["nodes"][part_id]["width"] == 160.0
    assert tree["visualization"]["nodes"][part_id]["x"] == 5.0

    general = client.get(f"/projects/{project_id}/views/{general_id}").json()
    assert general["visualization"]["nodes"][part_id]["width"] == 800.0


def test_patch_without_view_id_updates_global(tmp_path: Path):
    client, project_id, _tree_id, _general_id, part_id = _setup_dual(tmp_path)
    patched = client.patch(
        f"/projects/{project_id}/visualization",
        json={"nodes": {part_id: {"width": 500}}},
    ).json()
    assert patched["visualization"]["nodes"][part_id]["width"] == 500.0


def test_patch_with_view_id_style_goes_global(tmp_path: Path):
    client, project_id, tree_id, _general_id, part_id = _setup_dual(tmp_path)
    patched = client.patch(
        f"/projects/{project_id}/visualization",
        json={
            "viewId": tree_id,
            "nodes": {
                part_id: {
                    "width": 160,
                    "style": {"light": {"backgroundColor": "#ff0000"}},
                }
            },
        },
    ).json()
    assert patched["visualization"]["nodes"][part_id]["style"]["light"][
        "backgroundColor"
    ] == "#ff0000"
    # Overlay stores geometry only
    overlay = patched["viewLayouts"][tree_id]["nodes"][part_id]
    assert overlay["width"] == 160.0
    assert "style" not in overlay


DUAL_CONN_SYSML = """\
package Conn {
  part def Box {
    port p1;
    port p2;
    connect p1 to p2;
  }

  view def BoxView : GeneralView {
    expose Box;
  }
}
"""


def test_patch_with_view_id_writes_edge_overlay_not_global(tmp_path: Path):
    client, project_id = _client(tmp_path)
    add_content_file(client, project_id, tmp_path, "conn.sysml", DUAL_CONN_SYSML)
    project = client.get(f"/projects/{project_id}").json()
    view_id = next(v["id"] for v in project["views"] if v["name"] == "BoxView")
    conn_id = next(
        eid
        for eid, el in project["semantic"].items()
        if el.get("kind") == "connection"
    )
    waypoints = [{"x": 100, "y": 200, "locked": True}]

    patched = client.patch(
        f"/projects/{project_id}/visualization",
        json={
            "viewId": view_id,
            "edges": {conn_id: {"waypoints": waypoints}},
        },
    ).json()
    global_wps = patched["visualization"]["edges"].get(conn_id, {}).get("waypoints")
    assert not global_wps
    assert patched["viewLayouts"][view_id]["edges"][conn_id]["waypoints"] == waypoints

    loaded = client.get(f"/projects/{project_id}/views/{view_id}").json()
    assert loaded["visualization"]["edges"][conn_id]["waypoints"] == waypoints
