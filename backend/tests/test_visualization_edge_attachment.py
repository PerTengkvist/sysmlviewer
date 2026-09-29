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

from helpers import add_content_file, api_url


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
    assert all(c == 200 for c in codes)


def test_get_view_returns_arcadia_composition_edge_attachment(tmp_path: Path):
    """Synthetic viz::composition edges must round-trip through GET ?notation=arcadia."""
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Comp"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "rel.sysml", SAMPLE_REL)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if "RelView" in v["name"])
    parent_id = "Rel::System"
    child_id = "Rel::System::a"
    edge_id = f"viz::composition::{parent_id}::{child_id}"

    res = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "structureNotation": "arcadia",
            "edges": {
                edge_id: {
                    "artifactId": edge_id,
                    "sourceSide": "bottom",
                    "sourceOffset": 0.33,
                    "targetSide": "top",
                    "targetOffset": 0.5,
                }
            },
        },
    )
    assert res.status_code == 200, res.text

    loaded = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}?notation=arcadia")
    ).json()
    edges = loaded["visualization"]["edges"]
    assert edge_id in edges, f"missing composition edge; got {list(edges)}"
    assert edges[edge_id]["sourceSide"] == "bottom"
    assert edges[edge_id]["sourceOffset"] == 0.33
    assert edges[edge_id]["targetSide"] == "top"


def test_arcadia_style_patch_does_not_migrate_into_sysmlv2_file(tmp_path: Path):
    """Non-layout Arcadia PATCH must not write Arcadia edges into views/<name>.json."""
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Mig"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "rel.sysml", SAMPLE_REL)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if "RelView" in v["name"])
    parent_id = "Rel::System"
    child_id = "Rel::System::a"
    edge_id = f"viz::composition::{parent_id}::{child_id}"
    part_id = "Rel::System::a"

    # Seed Arcadia layout only (no SysML v2 sibling).
    assert (
        client.patch(
            api_url(f"/projects/{project_id}/visualization"),
            json={
                "viewId": view_id,
                "structureNotation": "arcadia",
                "edges": {
                    edge_id: {
                        "artifactId": edge_id,
                        "sourceSide": "bottom",
                        "sourceOffset": 0.2,
                    }
                },
            },
        ).status_code
        == 200
    )
    arc_path = tmp_path / "views" / "RelView.arcadia.json"
    v2_path = tmp_path / "views" / "RelView.json"
    assert arc_path.is_file()
    # Remove any sysmlv2 file so migrate-on-save would invent one.
    if v2_path.exists():
        v2_path.unlink()

    # Style patch is not layout-only → triggers repo.save() migrate path.
    res = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "structureNotation": "arcadia",
            "nodes": {
                part_id: {
                    "artifactId": part_id,
                    "style": {"light": {"fillColor": "#ff0000"}},
                }
            },
        },
    )
    assert res.status_code == 200, res.text

    if v2_path.exists():
        doc = json.loads(v2_path.read_text(encoding="utf-8"))
        assert edge_id not in (doc.get("edges") or {}), (
            "Arcadia composition edge leaked into SysML v2 layout file"
        )
