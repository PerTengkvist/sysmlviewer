"""VisualizationEdge side/offset attachment roundtrip."""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path

from adapters.api.app import create_app
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from domain.models import PortSide, VisualizationEdge
from domain.view_layouts import (
    ViewEdgeLayout,
    ViewLayouts,
    apply_view_layout_edge_patch,
    resolve_view_edge,
)
from fastapi.testclient import TestClient

from tests.helpers import add_content_file, api_url


def test_visualization_edge_roundtrip_source_target_side_offset():
    edge = VisualizationEdge(
        artifact_id="P::dep1",
        source_side=PortSide.RIGHT,
        source_offset=0.25,
        target_side=PortSide.LEFT,
        target_offset=0.8,
    )
    data = edge.to_dict()
    assert data["sourceSide"] == "right"
    assert data["sourceOffset"] == 0.25
    assert data["targetSide"] == "left"
    assert data["targetOffset"] == 0.8
    restored = VisualizationEdge.from_dict(data)
    assert restored.source_side == PortSide.RIGHT
    assert restored.source_offset == 0.25
    assert restored.target_side == PortSide.LEFT
    assert restored.target_offset == 0.8


def test_view_edge_layout_side_offset_patch_and_resolve():
    layouts = apply_view_layout_edge_patch(
        ViewLayouts(),
        "P::View",
        {
            "P::dep1": {
                "sourceSide": "top",
                "sourceOffset": 0.1,
                "targetSide": "bottom",
                "targetOffset": 0.9,
            }
        },
    )
    overlay = layouts.get_edge("P::View", "P::dep1")
    assert overlay is not None
    assert overlay.source_side == "top"
    assert overlay.source_offset == 0.1

    global_edge = VisualizationEdge(artifact_id="P::dep1")
    merged = resolve_view_edge(global_edge, overlay)
    assert merged["sourceSide"] == "top"
    assert merged["sourceOffset"] == 0.1
    assert merged["targetSide"] == "bottom"
    assert merged["targetOffset"] == 0.9


def test_view_edge_layout_to_dict_includes_sides():
    layout = ViewEdgeLayout(
        source_side="left",
        source_offset=0.5,
        target_side="right",
        target_offset=0.5,
    )
    d = layout.to_dict()
    assert d["sourceSide"] == "left"
    assert d["targetSide"] == "right"
    assert ViewEdgeLayout.from_dict(d).source_offset == 0.5


def test_atomic_write_json_survives_concurrent_writers(tmp_path: Path):
    path = tmp_path / "project.json"

    def write(i: int) -> None:
        WorkspaceProjectRepository._atomic_write_json(path, {"n": i, "pad": "x" * 200})

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(write, range(80)))

    assert path.is_file()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert "n" in data
    leftovers = list(tmp_path.glob(".project.json.*.tmp"))
    assert leftovers == []


SAMPLE_REL = """\
package Rel {
  part def A;
  part def B;
  part def System {
    part a : A;
    part b : B;
    dependency d from a to b;
  }
  view def RelView {
    expose System;
  }
}
"""


def test_patch_relation_end_with_view_id_persists_view_file(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Rel"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "rel.sysml", SAMPLE_REL)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if "RelView" in v["name"])
    dep_id = next(
        k for k, v in project["semantic"].items() if v.get("kind") == "dependency"
    )
    state_before = (tmp_path / "state.json").read_text(encoding="utf-8")

    res = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "edges": {
                dep_id: {
                    "artifactId": dep_id,
                    "sourceSide": "top",
                    "sourceOffset": 0.22,
                    "targetSide": "left",
                    "targetOffset": 0.77,
                }
            },
        },
    )
    assert res.status_code == 200, res.text
    patched = res.json()
    overlay = patched["viewLayouts"][view_id]["edges"][dep_id]
    assert overlay["sourceSide"] == "top"
    assert overlay["sourceOffset"] == 0.22
    assert overlay["targetSide"] == "left"
    assert overlay["targetOffset"] == 0.77

    # Layout-only: view file updated, state.json not rewritten (avoids PATCH races).
    assert (tmp_path / "state.json").read_text(encoding="utf-8") == state_before
    view_files = list((tmp_path / "views").glob("*.json"))
    assert view_files

    found = False
    for vf in view_files:
        doc = json.loads(vf.read_text(encoding="utf-8"))
        edge = (doc.get("edges") or {}).get(dep_id)
        if edge:
            assert edge["sourceSide"] == "top"
            assert edge["sourceOffset"] == 0.22
            found = True
    assert found


def test_get_view_includes_dependency_overlay_without_global_viz(tmp_path: Path):
    """Per-view routing/attachment for dependencies must appear in get_view."""
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Rel"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "rel.sysml", SAMPLE_REL)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if "RelView" in v["name"])
    dep_id = next(
        k for k, v in project["semantic"].items() if v.get("kind") == "dependency"
    )

    assert (
        client.patch(
            api_url(f"/projects/{project_id}/visualization"),
            json={
                "viewId": view_id,
                "edges": {
                    dep_id: {
                        "artifactId": dep_id,
                        "routing": "spline",
                        "sourceSide": "right",
                        "sourceOffset": 0.4,
                    }
                },
            },
        ).status_code
        == 200
    )

    loaded = client.get(api_url(f"/projects/{project_id}/views/{view_id}")).json()
    edge = loaded["visualization"]["edges"][dep_id]
    assert edge["routing"] == "spline"
    assert edge["sourceSide"] == "right"
    assert edge["sourceOffset"] == 0.4

    # Overlay-only path: drop global viz row, keep view file — get_view still merges.
    state_path = tmp_path / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state.get("visualization", {}).get("edges", {}).pop(dep_id, None)
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    loaded2 = client.get(api_url(f"/projects/{project_id}/views/{view_id}")).json()
    edge2 = loaded2["visualization"]["edges"][dep_id]
    assert edge2["routing"] == "spline"
    assert edge2["sourceSide"] == "right"
    assert edge2["sourceOffset"] == 0.4


def test_concurrent_relation_end_patches_do_not_500(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Race"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "rel.sysml", SAMPLE_REL)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if "RelView" in v["name"])
    dep_id = next(
        k for k, v in project["semantic"].items() if v.get("kind") == "dependency"
    )

    def one_patch(i: int) -> int:
        r = client.patch(
            api_url(f"/projects/{project_id}/visualization"),
            json={
                "viewId": view_id,
                "edges": {
                    dep_id: {
                        "artifactId": dep_id,
                        "sourceSide": "bottom",
                        "sourceOffset": (i % 10) / 10,
                    }
                },
            },
        )
        return r.status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(one_patch, range(24)))
    assert codes == [200] * 24
