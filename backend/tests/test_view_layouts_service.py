"""Service/API tests for view-scoped geometry overlays."""

from pathlib import Path

from fastapi.testclient import TestClient
from helpers import api_url

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
    created = client.post(api_url("/projects"), json={"name": "Dual"}).json()
    return client, created["id"]


def _setup_dual(tmp_path: Path) -> tuple[TestClient, str, str, str, str]:
    client, project_id = _client(tmp_path)
    add_content_file(client, project_id, tmp_path, "dual.sysml", DUAL_VIEW_SYSML)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    views = {v["name"]: v["id"] for v in project["views"]}
    assert "BoxTree" in views and "BoxView" in views
    part_id = "Dual::Box"
    # Make global geometry large (whitebox-scale)
    client.patch(api_url(f"/projects/{project_id}/visualization"),
        json={"nodes": {part_id: {"x": 10, "y": 20, "width": 800, "height": 600}}},
    )
    return client, project_id, views["BoxTree"], views["BoxView"], part_id


def test_get_view_tree_without_overlay_uses_compact_defaults(tmp_path: Path):
    client, project_id, tree_id, general_id, part_id = _setup_dual(tmp_path)

    tree = client.get(api_url(f"/projects/{project_id}/views/{tree_id}")).json()
    assert tree["diagramMode"] == "tree"
    node = tree["visualization"]["nodes"][part_id]
    assert node["width"] == DEFAULT_TREE_WIDTH
    assert node["height"] == DEFAULT_TREE_HEIGHT

    general = client.get(api_url(f"/projects/{project_id}/views/{general_id}")).json()
    gnode = general["visualization"]["nodes"][part_id]
    assert gnode["width"] == 800.0
    assert gnode["height"] == 600.0


def test_patch_with_view_id_writes_overlay_not_global(tmp_path: Path):
    client, project_id, tree_id, general_id, part_id = _setup_dual(tmp_path)

    patched = client.patch(api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": tree_id,
            "nodes": {part_id: {"width": 160, "height": 40, "x": 5, "y": 6}},
        },
    ).json()
    assert patched["visualization"]["nodes"][part_id]["width"] == 800.0
    assert patched["viewLayouts"][tree_id]["nodes"][part_id]["width"] == 160.0
    assert patched["viewLayouts"][tree_id]["nodes"][part_id]["height"] == 40.0

    tree = client.get(api_url(f"/projects/{project_id}/views/{tree_id}")).json()
    assert tree["visualization"]["nodes"][part_id]["width"] == 160.0
    assert tree["visualization"]["nodes"][part_id]["x"] == 5.0

    general = client.get(api_url(f"/projects/{project_id}/views/{general_id}")).json()
    assert general["visualization"]["nodes"][part_id]["width"] == 800.0


def test_patch_without_view_id_updates_global(tmp_path: Path):
    client, project_id, _tree_id, _general_id, part_id = _setup_dual(tmp_path)
    patched = client.patch(api_url(f"/projects/{project_id}/visualization"),
        json={"nodes": {part_id: {"width": 500}}},
    ).json()
    assert patched["visualization"]["nodes"][part_id]["width"] == 500.0


def test_patch_with_view_id_style_goes_global(tmp_path: Path):
    client, project_id, tree_id, _general_id, part_id = _setup_dual(tmp_path)
    patched = client.patch(api_url(f"/projects/{project_id}/visualization"),
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


DUAL_PORT_SYSML = """\
package DualPort {
  part def Box {
    port p1;
  }

  view def BoxTree : TreeView {
    expose Box;
  }

  view def BoxView : GeneralView {
    expose Box;
  }
}
"""


def _setup_dual_port(tmp_path: Path) -> tuple[TestClient, str, str, str, str, str]:
    client, project_id = _client(tmp_path)
    add_content_file(client, project_id, tmp_path, "dual_port.sysml", DUAL_PORT_SYSML)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    views = {v["name"]: v["id"] for v in project["views"]}
    assert "BoxTree" in views and "BoxView" in views
    port_id = "DualPort::Box::p1"
    assert port_id in project["visualization"]["nodes"]
    # Seed both view files so we can assert the other file stays untouched.
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": views["BoxView"],
            "nodes": {"DualPort::Box": {"x": 10, "y": 10, "width": 200, "height": 100}},
        },
    )
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": views["BoxTree"],
            "nodes": {"DualPort::Box": {"x": 20, "y": 20, "width": 80, "height": 40}},
        },
    )
    return (
        client,
        project_id,
        views["BoxTree"],
        views["BoxView"],
        "DualPort::Box",
        port_id,
    )


def test_port_side_patch_with_view_id_is_view_local(tmp_path: Path):
    client, project_id, tree_id, general_id, _part_id, port_id = _setup_dual_port(
        tmp_path
    )
    project = client.get(api_url(f"/projects/{project_id}")).json()
    global_side = project["visualization"]["nodes"][port_id]["side"]
    global_offset = project["visualization"]["nodes"][port_id]["offset"]
    assert global_side is not None

    tree_path = tmp_path / "views" / "BoxTree.json"
    tree_before = tree_path.read_text(encoding="utf-8")
    tree_mtime = tree_path.stat().st_mtime_ns

    patched = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": general_id,
            "nodes": {port_id: {"side": "top", "offset": 0.2}},
        },
    ).json()
    assert patched["visualization"]["nodes"][port_id]["side"] == global_side
    assert patched["visualization"]["nodes"][port_id]["offset"] == global_offset
    assert patched["viewLayouts"][general_id]["nodes"][port_id]["side"] == "top"
    assert patched["viewLayouts"][general_id]["nodes"][port_id]["offset"] == 0.2

    general = client.get(api_url(f"/projects/{project_id}/views/{general_id}")).json()
    assert general["visualization"]["nodes"][port_id]["side"] == "top"
    assert general["visualization"]["nodes"][port_id]["offset"] == 0.2

    tree = client.get(api_url(f"/projects/{project_id}/views/{tree_id}")).json()
    assert tree["visualization"]["nodes"][port_id]["side"] == global_side
    assert tree["visualization"]["nodes"][port_id]["offset"] == global_offset

    assert tree_path.read_text(encoding="utf-8") == tree_before
    assert tree_path.stat().st_mtime_ns == tree_mtime


def test_port_side_patch_without_view_id_stays_global(tmp_path: Path):
    client, project_id, _tree_id, _general_id, _part_id, port_id = _setup_dual_port(
        tmp_path
    )
    patched = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"nodes": {port_id: {"side": "bottom", "offset": 0.7}}},
    ).json()
    assert patched["visualization"]["nodes"][port_id]["side"] == "bottom"
    assert patched["visualization"]["nodes"][port_id]["offset"] == 0.7


def test_mixed_geometry_and_port_patch_stays_in_one_view(tmp_path: Path):
    client, project_id, tree_id, general_id, part_id, port_id = _setup_dual_port(
        tmp_path
    )
    project = client.get(api_url(f"/projects/{project_id}")).json()
    global_side = project["visualization"]["nodes"][port_id]["side"]
    global_offset = project["visualization"]["nodes"][port_id]["offset"]

    patched = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": general_id,
            "nodes": {
                part_id: {"x": 50, "y": 60, "width": 220, "height": 140},
                port_id: {"side": "right", "offset": 0.33},
            },
        },
    ).json()
    overlay = patched["viewLayouts"][general_id]["nodes"]
    assert overlay[part_id]["x"] == 50.0
    assert overlay[part_id]["width"] == 220.0
    assert overlay[port_id]["side"] == "right"
    assert overlay[port_id]["offset"] == 0.33
    assert patched["visualization"]["nodes"][port_id]["side"] == global_side
    assert patched["visualization"]["nodes"][port_id]["offset"] == global_offset

    tree = client.get(api_url(f"/projects/{project_id}/views/{tree_id}")).json()
    assert tree["visualization"]["nodes"][port_id]["side"] == global_side
    assert tree["visualization"]["nodes"][part_id]["x"] == 20.0


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
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if v["name"] == "BoxView")
    conn_id = next(
        eid
        for eid, el in project["semantic"].items()
        if el.get("kind") == "connection"
    )
    waypoints = [{"x": 100, "y": 200, "locked": True}]

    patched = client.patch(api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "edges": {conn_id: {"waypoints": waypoints}},
        },
    ).json()
    global_wps = patched["visualization"]["edges"].get(conn_id, {}).get("waypoints")
    assert not global_wps
    assert patched["viewLayouts"][view_id]["edges"][conn_id]["waypoints"] == waypoints

    loaded = client.get(api_url(f"/projects/{project_id}/views/{view_id}")).json()
    assert loaded["visualization"]["edges"][conn_id]["waypoints"] == waypoints


REQ_GRAPH_SYSML = """\
package ReqPkg {
  requirement def Safety {
    doc /* Be safe */
  }
  part def Controller;

  view def ReqGraph : GeneralView {
    expose ReqPkg;
  }
}
"""


def test_get_view_places_new_requirements_in_view_local_space(tmp_path: Path):
    """Nodes missing from a view overlay must not use far-away global coords."""
    client, project_id = _client(tmp_path)
    add_content_file(client, project_id, tmp_path, "req.sysml", REQ_GRAPH_SYSML)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if v["name"] == "ReqGraph")
    controller = "ReqPkg::Controller"
    safety = "ReqPkg::Safety"

    # Global positions far from origin (simulates packed project canvas).
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "nodes": {
                controller: {"x": 360.0, "y": 5480.0, "width": 200.0, "height": 120.0},
                safety: {"x": 360.0, "y": 5120.0, "width": 200.0, "height": 120.0},
            }
        },
    )
    # View layout only knows about Controller (as when reqs were added later).
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "nodes": {
                controller: {"x": 48.0, "y": 56.0, "width": 140.0, "height": 76.0},
            },
        },
    )

    loaded = client.get(api_url(f"/projects/{project_id}/views/{view_id}")).json()
    assert loaded["diagramMode"] == "structure"
    assert safety in loaded["semantic"]
    ctrl = loaded["visualization"]["nodes"][controller]
    req = loaded["visualization"]["nodes"][safety]
    assert ctrl["x"] == 48.0 and ctrl["y"] == 56.0
    # Requirement must be placed in view-local grid, not global y=5120.
    assert req["y"] < 1000.0
    assert req["x"] == 80.0
    assert req["y"] == 80.0
