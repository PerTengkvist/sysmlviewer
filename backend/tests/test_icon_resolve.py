"""Resolve icon files: project > viewer > None."""

from pathlib import Path

import pytest

from domain.icon_resolve import (
    project_icon_path,
    resolve_icon_file,
    sanitize_icon_name,
    viewer_icon_path,
)


def test_prefer_project_when_both_exist(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    proj = workspace / "icons" / "iconmind"
    view = repo_icons / "iconmind"
    proj.mkdir(parents=True)
    view.mkdir(parents=True)
    (proj / "agent.svg").write_text("<svg id='project'></svg>", encoding="utf-8")
    (view / "agent.svg").write_text("<svg id='viewer'></svg>", encoding="utf-8")

    found = resolve_icon_file("iconmind", "agent", workspace=workspace, repo_icons=repo_icons)
    assert found == (proj / "agent.svg").resolve()
    assert "project" in found.read_text(encoding="utf-8")


def test_fallback_to_viewer_when_project_missing(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    view = repo_icons / "iconmind"
    view.mkdir(parents=True)
    workspace.mkdir()
    (view / "agent.svg").write_text("<svg id='viewer'></svg>", encoding="utf-8")

    found = resolve_icon_file("iconmind", "agent", workspace=workspace, repo_icons=repo_icons)
    assert found == (view / "agent.svg").resolve()


def test_returns_none_when_neither_exists(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    workspace.mkdir()
    repo_icons.mkdir()

    assert (
        resolve_icon_file("iconmind", "agent", workspace=workspace, repo_icons=repo_icons)
        is None
    )


@pytest.mark.parametrize(
    "name",
    ["", "..", "../x", "/abs", "a/b", "a\\b", ".", " "],
)
def test_sanitize_rejects_bad_names(name: str):
    assert sanitize_icon_name(name) is None


def test_sanitize_accepts_simple_slug():
    assert sanitize_icon_name("agent") == "agent"
    assert sanitize_icon_name("user-filled") == "user-filled"


def test_project_and_viewer_paths(tmp_path: Path):
    workspace = tmp_path / "ws"
    repo_icons = tmp_path / "icons"
    assert project_icon_path(workspace, "iconmind", "agent") == (
        workspace / "icons" / "iconmind" / "agent.svg"
    )
    assert viewer_icon_path(repo_icons, "iconmind", "agent") == (
        repo_icons / "iconmind" / "agent.svg"
    )


def test_bare_carbon_resolves_under_viewer(tmp_path: Path, monkeypatch):
    repo_root = tmp_path / "repo"
    carbon = repo_root / "icons" / "carbon"
    carbon.mkdir(parents=True)
    (carbon / "user.svg").write_text("<svg></svg>", encoding="utf-8")
    monkeypatch.setenv("SYSMLVIEWER_ICON_LIBRARY", "carbon")

    found = resolve_icon_file(
        None,
        "user",
        workspace=None,
        repo_icons=repo_root / "icons",
        repo_root=repo_root,
    )
    assert found == (carbon / "user.svg").resolve()


def test_resolve_rejects_bad_name_even_if_file_exists(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    bad = workspace / "icons" / "iconmind"
    bad.mkdir(parents=True)
    # Would-be traversal target should never be resolved via name
    assert (
        resolve_icon_file("iconmind", "..", workspace=workspace, repo_icons=repo_icons)
        is None
    )
