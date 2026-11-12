"""Boundary anchors saved on a node that has no position of its own in a view."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

REQS = """
package Reqs {
  requirement def Top;
  requirement def Leaf;
  #refine dependency from Leaf to Top;
  view ReqView : GeneralView {
    expose Reqs;
  }
}
"""

VIEW = "Reqs::ReqView"


def _client(tmp_path: Path) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "F"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "reqs.sysml", REQS)
    return client, project_id


def _patch(client: TestClient, project_id: str, body: dict) -> None:
    res = client.patch(
        api_url(f"/projects/{project_id}/visualization"), json={"viewId": VIEW, **body}
    )
    assert res.status_code == 200, res.text


def _view(client: TestClient, project_id: str) -> dict:
    return client.get(api_url(f"/projects/{project_id}/views/{VIEW}")).json()


def test_anchors_survive_when_the_node_has_no_saved_position(tmp_path: Path):
    client, project_id = _client(tmp_path)
    # Top is placed in the view; Leaf keeps the view's default placement.
    _patch(client, project_id, {"nodes": {"Reqs::Top": {"x": 400, "y": 40}}})
    leaf_before = _view(client, project_id)["visualization"]["nodes"]["Reqs::Leaf"]

    anchors = [
        {"id": "a-left", "side": "left", "offset": 0.5},
        {"id": "rel:Reqs::dep1", "side": "top", "offset": 0.3},
    ]
    _patch(client, project_id, {"nodes": {"Reqs::Leaf": {"anchors": anchors}}})

    leaf = _view(client, project_id)["visualization"]["nodes"]["Reqs::Leaf"]
    assert leaf["anchors"] == anchors
    # The anchors do not move the node.
    assert (leaf["x"], leaf["y"]) == (leaf_before["x"], leaf_before["y"])


def test_undo_can_clear_a_relation_attachment(tmp_path: Path):
    """Undo of a first redraw sends null for attachments the edge never had."""
    client, project_id = _client(tmp_path)
    _patch(client, project_id, {"nodes": {"Reqs::Top": {"x": 400, "y": 40}}})
    edge_id = next(
        eid
        for eid, el in _view(client, project_id)["semantic"].items()
        if el["kind"] == "dependency"
    )
    attached = {
        "sourceSide": "top",
        "sourceOffset": 0.3,
        "sourceAnchorId": f"rel:{edge_id}",
        "targetSide": "bottom",
        "targetOffset": 0.7,
        "targetAnchorId": f"rel:{edge_id}",
    }
    _patch(client, project_id, {"nodes": {}, "edges": {edge_id: dict(attached)}})
    saved = _view(client, project_id)["visualization"]["edges"][edge_id]
    assert {k: saved.get(k) for k in attached} == attached

    _patch(
        client,
        project_id,
        {"nodes": {}, "edges": {edge_id: {k: None for k in attached}}},
    )
    cleared = _view(client, project_id)["visualization"]["edges"][edge_id]
    assert all(cleared.get(k) is None for k in attached), cleared
