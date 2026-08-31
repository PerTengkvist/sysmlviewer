"""API tests for exporting a view layout JSON via save dialog / explicit path."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

SAMPLE = """\
package Sample {
  part def Box;
  view def BoxView : GeneralView {
    expose Box;
  }
}
"""


def _setup(tmp_path: Path) -> tuple[TestClient, str, str]:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Exp"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "s.sysml", SAMPLE)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if v["name"] == "BoxView")
    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={
            "viewId": view_id,
            "nodes": {"Sample::Box": {"x": 11, "y": 22, "width": 100, "height": 50}},
        },
    )
    return client, project_id, view_id


def test_export_view_writes_chosen_path(tmp_path: Path):
    client, project_id, view_id = _setup(tmp_path)
    out = tmp_path / "export" / "my-view.json"
    res = client.post(
        api_url(f"/projects/{project_id}/views/{view_id}/export"),
        json={"path": str(out)},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["path"] == str(out.resolve())
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["viewId"] == view_id
    assert data["nodes"]["Sample::Box"]["x"] == 11


def test_export_view_cancel_returns_null_path(tmp_path: Path):
    client, project_id, view_id = _setup(tmp_path)
    with patch(
        "adapters.api.native_dialog.pick_save_path",
        return_value=None,
    ):
        res = client.post(
            api_url(f"/projects/{project_id}/views/{view_id}/export"),
            json={},
        )
    assert res.status_code == 200
    assert res.json()["path"] is None


def test_export_view_requires_open_view(tmp_path: Path):
    client, project_id, _view_id = _setup(tmp_path)
    res = client.post(
        api_url(f"/projects/{project_id}/views/does-not-exist/export"),
        json={"path": str(tmp_path / "x.json")},
    )
    assert res.status_code == 404
