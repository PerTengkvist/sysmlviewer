from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app


def _client(tmp_path: Path) -> tuple[TestClient, str]:
    """Bind workspace to tmp_path and create a named project."""
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    created = client.post("/projects", json={"name": "Demo"}).json()
    return client, created["id"]


def test_project_crud_and_add_file_from_path(tmp_path: Path):
    client, project_id = _client(tmp_path)

    listed = client.get("/projects").json()
    assert any(p["id"] == project_id for p in listed)

    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle.sysml"
    (tmp_path / "vehicle.sysml").write_bytes(sample.read_bytes())

    uploaded = client.post(
        f"/projects/{project_id}/files",
        json={"path": "vehicle.sysml"},
    ).json()

    assert len(uploaded["files"]) == 1
    assert uploaded["files"][0]["path"] == "vehicle.sysml"
    assert "Example::Vehicle" in uploaded["semantic"]
    assert "Example::Vehicle" in uploaded["visualization"]["nodes"]
    assert uploaded["views"] == []

    client.patch(
        f"/projects/{project_id}/visualization",
        json={
            "nodes": {
                "Example::Vehicle": {"x": 777, "y": 10},
            }
        },
    )
    file_id = uploaded["files"][0]["id"]
    refreshed = client.post(
        f"/projects/{project_id}/files/refresh/{file_id}",
    ).json()
    assert refreshed["visualization"]["nodes"]["Example::Vehicle"]["x"] == 777


def test_delete_project_removes_manifest(tmp_path: Path):
    client, project_id = _client(tmp_path)
    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle.sysml"
    (tmp_path / "vehicle.sysml").write_bytes(sample.read_bytes())
    client.post(
        f"/projects/{project_id}/files",
        json={"path": "vehicle.sysml"},
    )

    assert (tmp_path / "project.json").exists()
    assert (tmp_path / "state.json").exists()
    assert (tmp_path / "vehicle.sysml").exists()

    deleted = client.delete(f"/projects/{project_id}")
    assert deleted.status_code in (200, 204)

    assert client.get(f"/projects/{project_id}").status_code == 400
    assert not (tmp_path / "project.json").exists()
    assert not (tmp_path / "state.json").exists()


def test_delete_project_not_found(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    # workspace open but no project — delete unknown id
    client.post("/projects", json={"name": "X"})
    assert client.delete("/projects/does-not-exist").status_code == 404


def test_add_file_missing_returns_404(tmp_path: Path):
    client, project_id = _client(tmp_path)
    res = client.post(
        f"/projects/{project_id}/files",
        json={"path": "missing.sysml"},
    )
    assert res.status_code == 404


def test_add_file_path_escape_returns_400(tmp_path: Path):
    client, project_id = _client(tmp_path)
    res = client.post(
        f"/projects/{project_id}/files",
        json={"path": "../outside.sysml"},
    )
    assert res.status_code == 400


def test_refresh_from_disk_reparses(tmp_path: Path):
    client, project_id = _client(tmp_path)

    path = tmp_path / "a.sysml"
    path.write_text("package Example { part Vehicle; }\n", encoding="utf-8")
    uploaded = client.post(
        f"/projects/{project_id}/files",
        json={"path": "a.sysml"},
    ).json()
    file_id = uploaded["files"][0]["id"]
    assert "Example::Vehicle" in uploaded["semantic"]

    client.patch(
        f"/projects/{project_id}/visualization",
        json={"nodes": {"Example::Vehicle": {"x": 777, "y": 10}}},
    )

    path.write_text(
        "package Example { part Vehicle; part Engine; }\n",
        encoding="utf-8",
    )
    refreshed = client.post(
        f"/projects/{project_id}/files/refresh/{file_id}",
    ).json()

    assert "Example::Vehicle" in refreshed["semantic"]
    assert "Example::Engine" in refreshed["semantic"]
    assert refreshed["visualization"]["nodes"]["Example::Vehicle"]["x"] == 777


def test_refresh_nested_relative_path(tmp_path: Path):
    """File ids with '/' must refresh (path converter), not 404."""
    from adapters.persistence.workspace_repo import WorkspaceProjectRepository
    from domain.models import Project, SysmlFile, new_id

    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "main.sysml").write_text(
        "package Lib { part A; }\n", encoding="utf-8"
    )
    repo = WorkspaceProjectRepository(tmp_path)
    project = Project.create("NestedIds")
    project.files.append(
        SysmlFile(
            id="lib/main.sysml",
            name="main.sysml",
            content="package Lib { part A; }\n",
            path="lib/main.sysml",
        )
    )
    repo.save(project)

    app = create_app(workspace=tmp_path)
    client = TestClient(app)
    project_id = client.get("/session").json()["project"]["id"]
    file_id = "lib/main.sysml"
    assert "/" in file_id

    (tmp_path / "lib" / "main.sysml").write_text(
        "package Lib { part A; part B; }\n", encoding="utf-8"
    )
    refreshed = client.post(
        f"/projects/{project_id}/files/refresh/{file_id}",
    )
    assert refreshed.status_code == 200, refreshed.text
    body = refreshed.json()
    assert "Lib::B" in body["semantic"]


def test_create_file_with_content(tmp_path: Path):
    client, project_id = _client(tmp_path)
    created = client.post(
        f"/projects/{project_id}/files",
        json={
            "path": "new.sysml",
            "content": "package New { part P; }\n",
        },
    ).json()
    assert (tmp_path / "new.sysml").exists()
    assert "New::P" in created["semantic"]


def test_documentation_list_and_read(tmp_path: Path):
    client, project_id = _client(tmp_path)
    docs_dir = tmp_path / "logical" / "docs"
    docs_dir.mkdir(parents=True)
    (docs_dir / "ComputeEngine.md").write_text("# Compute Engine\n\nDocs here.\n", encoding="utf-8")
    (tmp_path / "other.md").write_text("not in docs/", encoding="utf-8")

    listed = client.get(f"/projects/{project_id}/documentation").json()
    assert listed["paths"] == ["logical/docs/ComputeEngine.md"]

    doc = client.get(
        f"/projects/{project_id}/documentation/logical/docs/ComputeEngine.md"
    ).json()
    assert doc["content"].startswith("# Compute Engine")

    assert client.get(f"/projects/{project_id}/documentation/missing.md").status_code == 400
    assert (
        client.get(f"/projects/{project_id}/documentation/logical/docs/missing.md").status_code
        == 404
    )

