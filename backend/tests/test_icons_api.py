"""GET /api/icons serving default library and prefixed libraries."""

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app


def test_default_icon_from_carbon(tmp_path: Path, monkeypatch):
    icons = tmp_path / "icons" / "carbon"
    icons.mkdir(parents=True)
    (icons / "user.svg").write_text("<svg></svg>", encoding="utf-8")
    monkeypatch.setenv("SYSMLVIEWER_ICON_LIBRARY", "carbon")

    import adapters.api.static_paths as static_paths

    monkeypatch.setattr(static_paths, "resolve_repo_root", lambda: tmp_path)

    client = TestClient(create_app(data_dir=tmp_path))
    res = client.get("/api/icons/user.svg")
    assert res.status_code == 200
    assert b"<svg" in res.content


def test_iconmind_prefixed_path(tmp_path: Path, monkeypatch):
    mind = tmp_path / "icons" / "iconmind"
    mind.mkdir(parents=True)
    (mind / "agent.svg").write_text("<svg id='agent'></svg>", encoding="utf-8")
    (tmp_path / "icons" / "carbon").mkdir(parents=True)

    import adapters.api.static_paths as static_paths

    monkeypatch.setattr(static_paths, "resolve_repo_root", lambda: tmp_path)

    client = TestClient(create_app(data_dir=tmp_path))
    res = client.get("/api/icons/iconmind/agent.svg")
    assert res.status_code == 200
    assert b"agent" in res.content


def test_path_traversal_rejected(tmp_path: Path, monkeypatch):
    (tmp_path / "icons" / "carbon").mkdir(parents=True)
    import adapters.api.static_paths as static_paths

    monkeypatch.setattr(static_paths, "resolve_repo_root", lambda: tmp_path)

    client = TestClient(create_app(data_dir=tmp_path))
    res = client.get("/api/icons/../secret.svg")
    assert res.status_code == 404
