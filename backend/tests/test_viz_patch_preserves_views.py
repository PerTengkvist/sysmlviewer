"""Regression: layout patches must not wipe views when state.json semantic is empty."""

from pathlib import Path
import json

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url


SAMPLE = """\
package Sample {
  part def Box {
    part child;
  }

  view def BoxView : GeneralView {
    expose Box;
  }
}
"""


def test_viz_patch_with_empty_state_semantic_preserves_views(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "ViewsBug"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "box.sysml", SAMPLE)

    project = client.get(api_url(f"/projects/{project_id}")).json()
    assert len(project["views"]) >= 1
    view_id = project["views"][0]["id"]
    box_id = next(k for k, v in project["semantic"].items() if v["name"] == "Box")

    # Corrupt state the way the production bug did: empty semantic/views, keep files.
    state_path = tmp_path / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    saved_viz = state.get("visualization") or {"nodes": {}, "edges": {}}
    state["semantic"] = {}
    state["views"] = []
    state["visualization"] = saved_viz
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    patched = client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "nodes": {box_id: {"x": 120, "y": 80, "width": 180, "height": 110}},
        },
    ).json()

    assert len(patched["views"]) >= 1
    assert any(v["name"] == "BoxView" for v in patched["views"])
    assert box_id in patched["semantic"]

    # Persisted state must also be healthy after the patch.
    state_after = json.loads(state_path.read_text(encoding="utf-8"))
    assert len(state_after["views"]) >= 1
    assert len(state_after["semantic"]) >= 1


def test_save_project_with_empty_state_semantic_preserves_views(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "SaveBug"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "box.sysml", SAMPLE)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    assert len(project["views"]) >= 1

    state_path = tmp_path / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["semantic"] = {}
    state["views"] = []
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    saved = client.put(
        api_url(f"/projects/{project_id}"),
        json={"name": "SaveBug", "visualization": project["visualization"]},
    ).json()
    assert len(saved["views"]) >= 1
    assert len(saved["semantic"]) >= 1
