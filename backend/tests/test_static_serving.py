"""Static file serving and /api mount."""

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app


def _dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>ok</html>", encoding="utf-8")
    (dist / "assets").mkdir()
    (dist / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")
    return dist


def test_health_under_api_prefix(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    assert client.get("/api/health").json() == {"status": "ok"}


def test_legacy_health_not_at_root(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    assert client.get("/health").status_code == 404


def test_serves_index_html(tmp_path: Path):
    dist = _dist(tmp_path)
    client = TestClient(create_app(data_dir=tmp_path, static_dir=dist))
    assert client.get("/").text == "<html>ok</html>"


def test_serves_bundled_asset(tmp_path: Path):
    dist = _dist(tmp_path)
    client = TestClient(create_app(data_dir=tmp_path, static_dir=dist))
    res = client.get("/assets/app.js")
    assert res.status_code == 200
    assert "console.log" in res.text


def test_api_not_shadowed_by_static(tmp_path: Path):
    dist = _dist(tmp_path)
    client = TestClient(create_app(data_dir=tmp_path, static_dir=dist))
    session = client.get("/api/session")
    assert session.status_code == 200
    assert "workspaceRoot" in session.json()


def test_no_static_mount_when_dir_missing(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    assert client.get("/").status_code == 404
    assert client.get("/api/health").status_code == 200
