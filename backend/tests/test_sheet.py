"""Sheet: title block and drawing frame per project."""

from pathlib import Path
from helpers import api_url

from fastapi.testclient import TestClient

from adapters.api.app import create_app


def _project(tmp_path: Path) -> tuple[TestClient, str]:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Sheet"}).json()["id"]
    return client, project_id


def test_new_project_has_empty_sheet(tmp_path: Path):
    client, project_id = _project(tmp_path)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    assert project["sheet"]["titleBlock"] is None
    assert project["sheet"]["frame"] is None

    session = client.get(api_url("/session")).json()
    assert session["project"]["sheet"]["titleBlock"] is None
    assert session["project"]["sheet"]["frame"] is None


def test_put_and_delete_title_block(tmp_path: Path):
    client, project_id = _project(tmp_path)
    body = {
        "title": "Vehicle IBD",
        "createdBy": "Ada",
        "editedBy": "Bob",
        "version": "0.1",
        "lastUpdated": "2026-08-15",
        "drawingId": "DRW-001",
        "position": "bottom-right",
    }
    updated = client.put(api_url(f"/projects/{project_id}/sheet/title-block"),
        json=body,
    ).json()
    assert updated["sheet"]["titleBlock"]["title"] == "Vehicle IBD"
    assert updated["sheet"]["titleBlock"]["position"] == "bottom-right"

    cleared = client.delete(api_url(f"/projects/{project_id}/sheet/title-block")).json()
    assert cleared["sheet"]["titleBlock"] is None


def test_invalid_title_block_position(tmp_path: Path):
    client, project_id = _project(tmp_path)
    res = client.put(api_url(f"/projects/{project_id}/sheet/title-block"),
        json={
            "title": "X",
            "createdBy": "",
            "editedBy": "",
            "version": "",
            "lastUpdated": "",
            "drawingId": "",
            "position": "center",
        },
    )
    assert res.status_code == 422


def test_put_and_delete_frame(tmp_path: Path):
    client, project_id = _project(tmp_path)
    updated = client.put(api_url(f"/projects/{project_id}/sheet/frame"),
        json={"paper": "A3", "orientation": "landscape"},
    ).json()
    assert updated["sheet"]["frame"]["paper"] == "A3"
    assert updated["sheet"]["frame"]["orientation"] == "landscape"
    assert updated["sheet"]["frame"]["visible"] is True

    hidden = client.put(api_url(f"/projects/{project_id}/sheet/frame"),
        json={"paper": "A4", "orientation": "portrait", "visible": False},
    ).json()
    assert hidden["sheet"]["frame"]["visible"] is False

    cleared = client.delete(api_url(f"/projects/{project_id}/sheet/frame")).json()
    assert cleared["sheet"]["frame"] is None
