"""GET /api/icons serving default library, project icons, and remote vendor."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.icons.registry import clear_registry, register_fetcher


@pytest.fixture(autouse=True)
def _reset_registry():
    clear_registry()
    yield
    clear_registry()


class FakeFetcher:
    def __init__(self, body: str = "<svg id='remote'></svg>") -> None:
        self.body = body
        self.calls: list[str] = []

    def fetch(self, slug: str) -> str:
        self.calls.append(slug)
        if self.body is None:
            raise RuntimeError("fetch failed")
        return self.body


def _patch_repo(monkeypatch, repo_root: Path) -> None:
    import adapters.api.static_paths as static_paths

    monkeypatch.setattr(static_paths, "resolve_repo_root", lambda: repo_root)


def test_default_icon_from_carbon(tmp_path: Path, monkeypatch):
    icons = tmp_path / "icons" / "carbon"
    icons.mkdir(parents=True)
    (icons / "user.svg").write_text("<svg></svg>", encoding="utf-8")
    monkeypatch.setenv("SYSMLVIEWER_ICON_LIBRARY", "carbon")
    _patch_repo(monkeypatch, tmp_path)

    client = TestClient(create_app(data_dir=tmp_path))
    res = client.get("/api/icons/user.svg")
    assert res.status_code == 200
    assert b"<svg" in res.content


def test_iconmind_prefixed_path(tmp_path: Path, monkeypatch):
    mind = tmp_path / "icons" / "iconmind"
    mind.mkdir(parents=True)
    (mind / "agent.svg").write_text("<svg id='agent'></svg>", encoding="utf-8")
    (tmp_path / "icons" / "carbon").mkdir(parents=True)
    _patch_repo(monkeypatch, tmp_path)

    client = TestClient(create_app(data_dir=tmp_path))
    res = client.get("/api/icons/iconmind/agent.svg")
    assert res.status_code == 200
    assert b"agent" in res.content


def test_path_traversal_rejected(tmp_path: Path, monkeypatch):
    (tmp_path / "icons" / "carbon").mkdir(parents=True)
    _patch_repo(monkeypatch, tmp_path)

    client = TestClient(create_app(data_dir=tmp_path))
    res = client.get("/api/icons/../secret.svg")
    assert res.status_code == 404


def test_project_icon_preferred_over_viewer(tmp_path: Path, monkeypatch):
    workspace = tmp_path / "workspace"
    repo = tmp_path / "repo"
    workspace.mkdir()
    (repo / "icons" / "iconmind").mkdir(parents=True)
    proj = workspace / "icons" / "iconmind"
    proj.mkdir(parents=True)
    (proj / "agent.svg").write_text("<svg id='project'></svg>", encoding="utf-8")
    (repo / "icons" / "iconmind" / "agent.svg").write_text(
        "<svg id='viewer'></svg>", encoding="utf-8"
    )
    _patch_repo(monkeypatch, repo)

    client = TestClient(create_app(workspace=workspace))
    res = client.get("/api/icons/iconmind/agent.svg")
    assert res.status_code == 200
    assert b"project" in res.content


def test_viewer_hit_skips_fetcher(tmp_path: Path, monkeypatch):
    workspace = tmp_path / "workspace"
    repo = tmp_path / "repo"
    workspace.mkdir()
    mind = repo / "icons" / "iconmind"
    mind.mkdir(parents=True)
    (mind / "agent.svg").write_text("<svg id='viewer'></svg>", encoding="utf-8")
    _patch_repo(monkeypatch, repo)
    fake = FakeFetcher()
    register_fetcher("iconmind", lambda style: fake)

    client = TestClient(create_app(workspace=workspace))
    res = client.get("/api/icons/iconmind/agent.svg")
    assert res.status_code == 200
    assert b"viewer" in res.content
    assert fake.calls == []


def test_miss_vendors_into_project(tmp_path: Path, monkeypatch):
    workspace = tmp_path / "workspace"
    repo = tmp_path / "repo"
    workspace.mkdir()
    (repo / "icons").mkdir(parents=True)
    _patch_repo(monkeypatch, repo)
    fake = FakeFetcher("<svg id='vendored'></svg>")
    register_fetcher("iconmind", lambda style: fake)

    client = TestClient(create_app(workspace=workspace))
    res = client.get("/api/icons/iconmind/agent.svg")
    assert res.status_code == 200
    assert b"vendored" in res.content
    dest = workspace / "icons" / "iconmind" / "agent.svg"
    assert dest.is_file()
    assert "vendored" in dest.read_text(encoding="utf-8")


def test_miss_fetcher_fails_404(tmp_path: Path, monkeypatch):
    workspace = tmp_path / "workspace"
    repo = tmp_path / "repo"
    workspace.mkdir()
    (repo / "icons").mkdir(parents=True)
    _patch_repo(monkeypatch, repo)

    class Boom:
        def fetch(self, slug: str) -> str:
            raise RuntimeError("nope")

    register_fetcher("iconmind", lambda style: Boom())

    client = TestClient(create_app(workspace=workspace))
    res = client.get("/api/icons/iconmind/agent.svg")
    assert res.status_code == 404
    assert not (workspace / "icons" / "iconmind" / "agent.svg").exists()


def test_fetcher_called_once_across_two_gets(tmp_path: Path, monkeypatch):
    workspace = tmp_path / "workspace"
    repo = tmp_path / "repo"
    workspace.mkdir()
    (repo / "icons").mkdir(parents=True)
    _patch_repo(monkeypatch, repo)
    fake = FakeFetcher("<svg id='once'></svg>")
    register_fetcher("iconmind", lambda style: fake)

    client = TestClient(create_app(workspace=workspace))
    assert client.get("/api/icons/iconmind/agent.svg").status_code == 200
    assert client.get("/api/icons/iconmind/agent.svg").status_code == 200
    assert fake.calls == ["agent"]
