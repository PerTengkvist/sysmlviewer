"""Session API: empty by default; open/create binds a workspace folder."""

from pathlib import Path
from helpers import api_url

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import api_url


def test_empty_session_without_workspace():
    app = create_app()
    client = TestClient(app)
    session = client.get(api_url("/session")).json()
    assert session["workspaceRoot"] is None
    assert session["project"] is None


def test_create_project_without_folder_returns_400():
    app = create_app()
    client = TestClient(app)
    res = client.post(api_url("/projects"), json={"name": "NoFolder"})
    assert res.status_code == 400


def test_session_create_writes_project_at_folder_root(tmp_path: Path):
    app = create_app()
    client = TestClient(app)
    res = client.post(api_url("/session/create"),
        json={"name": "Fresh", "folder": str(tmp_path)},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["project"]["name"] == "Fresh"
    assert body["workspaceRoot"] == str(tmp_path.resolve())
    assert (tmp_path / "project.json").exists()
    assert (tmp_path / "state.json").exists()

    session = client.get(api_url("/session")).json()
    assert session["project"]["id"] == body["project"]["id"]
    assert session["workspaceRoot"] == str(tmp_path.resolve())


def test_session_create_requires_existing_folder(tmp_path: Path):
    app = create_app()
    client = TestClient(app)
    missing = tmp_path / "nope"
    res = client.post(api_url("/session/create"),
        json={"name": "X", "folder": str(missing)},
    )
    assert res.status_code == 400


def test_session_open_folder(tmp_path: Path):
    app = create_app()
    client = TestClient(app)
    created = client.post(api_url("/session/create"),
        json={"name": "OpenMe", "folder": str(tmp_path)},
    ).json()
    project_id = created["project"]["id"]

    # New app process simulating restart with same folder
    app2 = create_app()
    client2 = TestClient(app2)
    opened = client2.post(api_url("/session/open"), json={"folder": str(tmp_path)}).json()
    assert opened["project"]["id"] == project_id
    assert opened["project"]["name"] == "OpenMe"
    assert opened["workspaceRoot"] == str(tmp_path.resolve())


def test_get_project_reparses_stale_semantic_from_disk(tmp_path: Path):
    """External SysML edits must win over cached state.json semantic."""
    from helpers import add_content_file

    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "Stale"}).json()["id"]
    add_content_file(
        client,
        project_id,
        tmp_path,
        "m.sysml",
        "package P { part def Box { port oldPort; } }\n",
    )
    assert any(
        v["name"] == "oldPort"
        for v in client.get(api_url(f"/projects/{project_id}")).json()["semantic"].values()
    )

    (tmp_path / "m.sysml").write_text(
        "package P { part def Box { port Orchestrator_sap; } }\n",
        encoding="utf-8",
    )
    refreshed = client.get(api_url(f"/projects/{project_id}")).json()
    names = {v["name"] for v in refreshed["semantic"].values()}
    assert "Orchestrator_sap" in names
    assert "oldPort" not in names


def test_session_open_folder_missing_project_file(tmp_path: Path):
    app = create_app()
    client = TestClient(app)
    res = client.post(api_url("/session/open"), json={"folder": str(tmp_path)})
    assert res.status_code == 404


def test_session_open_project_file(tmp_path: Path):
    app = create_app()
    client = TestClient(app)
    client.post(api_url("/session/create"),
        json={"name": "ViaFile", "folder": str(tmp_path)},
    )
    project_file = tmp_path / "project.json"
    app2 = create_app()
    client2 = TestClient(app2)
    opened = client2.post(
        api_url("/session/open"),
        json={"projectFile": str(project_file)},
    ).json()
    assert opened["project"]["name"] == "ViaFile"
    assert opened["workspaceRoot"] == str(tmp_path.resolve())


def test_session_browse_returns_path(monkeypatch):
    app = create_app()
    client = TestClient(app)

    def fake_pick(*, kind, title):
        assert kind == "folder"
        return "/tmp/example"

    monkeypatch.setattr("adapters.api.native_dialog.pick_path", fake_pick)
    res = client.post(api_url("/session/browse"), json={"kind": "folder"})
    assert res.status_code == 200
    assert res.json()["path"] == "/tmp/example"


def test_session_browse_cancelled(monkeypatch):
    app = create_app()
    client = TestClient(app)
    monkeypatch.setattr("adapters.api.native_dialog.pick_path", lambda **_: None)
    res = client.post(api_url("/session/browse"), json={"kind": "file"})
    assert res.status_code == 200
    assert res.json()["path"] is None
