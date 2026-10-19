"""GET/PUT /api/icon-libraries curated settings."""

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.icon_libraries_store import libraries_config_path


def test_get_icon_libraries_defaults(tmp_path: Path, monkeypatch):
    import adapters.api.static_paths as static_paths

    monkeypatch.setattr(static_paths, "resolve_repo_root", lambda: tmp_path)
    (tmp_path / "icons").mkdir()
    client = TestClient(create_app(workspace=tmp_path))
    res = client.get("/api/icon-libraries")
    assert res.status_code == 200
    body = res.json()
    ids = {lib["id"] for lib in body["libraries"]}
    assert ids == {"iconmind", "iconoven", "energy"}
    by_id = {lib["id"]: lib for lib in body["libraries"]}
    assert by_id["iconoven"]["enabled"] is True
    assert by_id["iconoven"]["style"] == "round"
    assert by_id["energy"]["enabled"] is True
    assert by_id["energy"]["style"] == "20"


def test_put_icon_libraries_persists(tmp_path: Path, monkeypatch):
    import adapters.api.static_paths as static_paths

    monkeypatch.setattr(static_paths, "resolve_repo_root", lambda: tmp_path)
    (tmp_path / "icons").mkdir()
    client = TestClient(create_app(workspace=tmp_path))
    res = client.put(
        "/api/icon-libraries",
        json={
            "libraries": {
                "iconoven": {"enabled": True, "style": "sharp"},
                "iconmind": {"enabled": False},
            }
        },
    )
    assert res.status_code == 200
    by_id = {lib["id"]: lib for lib in res.json()["libraries"]}
    assert by_id["iconoven"]["style"] == "sharp"
    assert by_id["iconmind"]["enabled"] is False
    assert libraries_config_path(tmp_path).is_file()

    again = client.get("/api/icon-libraries").json()
    by_id2 = {lib["id"]: lib for lib in again["libraries"]}
    assert by_id2["iconoven"]["style"] == "sharp"


def test_put_requires_workspace(tmp_path: Path, monkeypatch):
    import adapters.api.static_paths as static_paths

    monkeypatch.setattr(static_paths, "resolve_repo_root", lambda: tmp_path)
    (tmp_path / "icons").mkdir()
    # Create app with no workspace binding
    client = TestClient(create_app(data_dir=None))
    # data_dir=None and workspace=None — may fail create_app; use empty without bind
    from adapters.api.app import create_api_app

    api = create_api_app(data_dir=None, workspace=None)
    from fastapi import FastAPI

    root = FastAPI()
    root.mount("/api", api)
    client = TestClient(root)
    res = client.put(
        "/api/icon-libraries",
        json={"libraries": {"iconoven": {"style": "sharp"}}},
    )
    assert res.status_code == 400
