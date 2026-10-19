"""ensure_icon: vendor remote SVGs into the project workspace."""

from __future__ import annotations

from pathlib import Path

import pytest

from adapters.icons.registry import clear_registry, register_fetcher
from domain.icon_vendor import ensure_icon


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
        return self.body


def test_vendors_on_miss_and_returns_path(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    workspace.mkdir()
    repo_icons.mkdir()
    fake = FakeFetcher()
    register_fetcher("iconmind", lambda style: fake)

    path = ensure_icon(
        "iconmind",
        "agent",
        workspace=workspace,
        repo_icons=repo_icons,
    )
    assert path is not None
    assert path == (workspace / "icons" / "iconmind" / "agent.svg").resolve()
    assert path.is_file()
    assert "remote" in path.read_text(encoding="utf-8")
    assert fake.calls == ["agent"]


def test_second_call_skips_fetcher(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    workspace.mkdir()
    repo_icons.mkdir()
    fake = FakeFetcher()
    register_fetcher("iconmind", lambda style: fake)

    ensure_icon("iconmind", "agent", workspace=workspace, repo_icons=repo_icons)
    ensure_icon("iconmind", "agent", workspace=workspace, repo_icons=repo_icons)
    assert fake.calls == ["agent"]


def test_unknown_library_no_write_returns_viewer_or_none(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    view = repo_icons / "custom"
    view.mkdir(parents=True)
    workspace.mkdir()
    (view / "x.svg").write_text("<svg id='v'></svg>", encoding="utf-8")

    path = ensure_icon("custom", "x", workspace=workspace, repo_icons=repo_icons)
    assert path == (view / "x.svg").resolve()
    assert not (workspace / "icons" / "custom" / "x.svg").exists()

    assert (
        ensure_icon("custom", "missing", workspace=workspace, repo_icons=repo_icons)
        is None
    )


def test_no_workspace_never_writes(tmp_path: Path):
    repo_icons = tmp_path / "repo_icons"
    view = repo_icons / "iconmind"
    view.mkdir(parents=True)
    (view / "agent.svg").write_text("<svg id='v'></svg>", encoding="utf-8")
    fake = FakeFetcher()
    register_fetcher("iconmind", lambda style: fake)

    path = ensure_icon("iconmind", "agent", workspace=None, repo_icons=repo_icons)
    assert path == (view / "agent.svg").resolve()
    assert fake.calls == []

    assert (
        ensure_icon("iconmind", "other", workspace=None, repo_icons=repo_icons) is None
    )
    assert fake.calls == []


def test_traversal_name_never_writes(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    workspace.mkdir()
    repo_icons.mkdir()
    fake = FakeFetcher()
    register_fetcher("iconmind", lambda style: fake)

    assert (
        ensure_icon("iconmind", "../secret", workspace=workspace, repo_icons=repo_icons)
        is None
    )
    assert list(workspace.rglob("*.svg")) == []
    assert fake.calls == []


def test_viewer_hit_skips_fetcher(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    view = repo_icons / "iconmind"
    view.mkdir(parents=True)
    workspace.mkdir()
    (view / "agent.svg").write_text("<svg id='viewer'></svg>", encoding="utf-8")
    fake = FakeFetcher()
    register_fetcher("iconmind", lambda style: fake)

    path = ensure_icon("iconmind", "agent", workspace=workspace, repo_icons=repo_icons)
    assert path == (view / "agent.svg").resolve()
    assert fake.calls == []
    assert not (workspace / "icons" / "iconmind" / "agent.svg").exists()
