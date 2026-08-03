from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app


def test_project_crud_and_upload(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)

    created = client.post("/projects", json={"name": "Demo"}).json()
    assert created["name"] == "Demo"
    project_id = created["id"]

    listed = client.get("/projects").json()
    assert any(p["id"] == project_id for p in listed)

    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle.sysml"
    content = sample.read_bytes()
    uploaded = client.post(
        f"/projects/{project_id}/files",
        files={"file": ("vehicle.sysml", content, "text/plain")},
        data={"sourcePath": str(sample.resolve())},
    ).json()

    assert len(uploaded["files"]) == 1
    assert uploaded["files"][0]["sourcePath"] == str(sample.resolve())
    assert "Example::Vehicle" in uploaded["semantic"]
    assert "Example::Vehicle" in uploaded["visualization"]["nodes"]
    # vehicle.sysml has no declared `view` — Views list stays empty
    assert uploaded["views"] == []

    # Move node then refresh with same content — layout should stay
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
        f"/projects/{project_id}/files/{file_id}/refresh",
        files={"file": ("vehicle.sysml", content, "text/plain")},
        data={"sourcePath": str(sample.resolve())},
    ).json()
    assert refreshed["visualization"]["nodes"]["Example::Vehicle"]["x"] == 777


def test_delete_project_removes_persisted_data(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)

    created = client.post("/projects", json={"name": "ToDelete"}).json()
    project_id = created["id"]
    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle.sysml"
    client.post(
        f"/projects/{project_id}/files",
        files={"file": ("vehicle.sysml", sample.read_bytes(), "text/plain")},
    )

    assert (tmp_path / f"{project_id}.json").exists()

    deleted = client.delete(f"/projects/{project_id}")
    assert deleted.status_code in (200, 204)

    assert client.get(f"/projects/{project_id}").status_code == 404
    listed = client.get("/projects").json()
    assert not any(p["id"] == project_id for p in listed)
    assert not (tmp_path / f"{project_id}.json").exists()


def test_delete_project_not_found(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    assert client.delete("/projects/does-not-exist").status_code == 404


def test_upload_stores_source_path(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "Paths"}).json()["id"]

    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle.sysml"
    source_path = str(sample.resolve())
    uploaded = client.post(
        f"/projects/{project_id}/files",
        files={"file": ("vehicle.sysml", sample.read_bytes(), "text/plain")},
        data={"sourcePath": source_path},
    ).json()

    assert uploaded["files"][0]["sourcePath"] == source_path


def test_refresh_replaces_content_and_reparses(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "Refresh"}).json()["id"]

    content_a = b"package Example { part Vehicle; }\n"
    uploaded = client.post(
        f"/projects/{project_id}/files",
        files={"file": ("a.sysml", content_a, "text/plain")},
        data={"sourcePath": "/tmp/a.sysml"},
    ).json()
    file_id = uploaded["files"][0]["id"]
    assert "Example::Vehicle" in uploaded["semantic"]

    client.patch(
        f"/projects/{project_id}/visualization",
        json={"nodes": {"Example::Vehicle": {"x": 777, "y": 10}}},
    )

    content_b = b"package Example { part Vehicle; part Engine; }\n"
    refreshed = client.post(
        f"/projects/{project_id}/files/{file_id}/refresh",
        files={"file": ("b.sysml", content_b, "text/plain")},
        data={"sourcePath": "/tmp/b.sysml"},
    ).json()

    assert refreshed["files"][0]["content"] == content_b.decode("utf-8")
    assert refreshed["files"][0]["sourcePath"] == "/tmp/b.sysml"
    assert "Example::Vehicle" in refreshed["semantic"]
    assert "Example::Engine" in refreshed["semantic"]
    assert refreshed["visualization"]["nodes"]["Example::Vehicle"]["x"] == 777


def test_refresh_without_file_body_fails(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post("/projects", json={"name": "NoBody"}).json()["id"]
    sample = Path(__file__).resolve().parents[2] / "examples" / "vehicle.sysml"
    uploaded = client.post(
        f"/projects/{project_id}/files",
        files={"file": ("vehicle.sysml", sample.read_bytes(), "text/plain")},
    ).json()
    file_id = uploaded["files"][0]["id"]

    res = client.post(f"/projects/{project_id}/files/{file_id}/refresh")
    assert res.status_code == 400
