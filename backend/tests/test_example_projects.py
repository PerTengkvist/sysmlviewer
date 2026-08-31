"""Tests for built-in example project discovery."""

from pathlib import Path

from helpers import api_url

from adapters.api.example_projects import list_example_projects
from adapters.api.static_paths import resolve_repo_root
from fastapi.testclient import TestClient

from adapters.api.app import create_app


def test_list_example_projects_includes_repo_examples():
    projects = list_example_projects()
    ids = {p["id"] for p in projects}
    assert "examples/data_center" in ids
    assert "examples/diagrams" in ids
    for project in projects:
        folder = Path(project["folder"])
        assert folder.is_dir()
        assert (folder / "project.json").is_file()


def test_example_projects_endpoint_without_workspace():
    app = create_app()
    client = TestClient(app)
    res = client.get(api_url("/session/example-projects"))
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    assert len(body) >= 2
    names = {p["name"] for p in body}
    assert "Data Center" in names
    assert "Diagrams" in names


def test_example_projects_use_repo_root_not_cwd(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    projects = list_example_projects()
    repo = resolve_repo_root()
    for project in projects:
        assert project["folder"].startswith(str(repo / "examples"))


def test_session_open_example_diagrams_from_other_workspace(tmp_path: Path):
    from adapters.api.example_projects import list_example_projects

    diagrams = next(p for p in list_example_projects() if p["id"] == "examples/diagrams")
    app = create_app(workspace=tmp_path)
    client = TestClient(app)
    assert client.get(api_url("/session")).json()["project"] is None

    opened = client.post(api_url("/session/open"), json={"folder": diagrams["folder"]}).json()
    assert opened["project"]["name"] == "Diagrams"
    assert opened["workspaceRoot"] == diagrams["folder"]
    assert len(opened["project"]["files"]) == 8
