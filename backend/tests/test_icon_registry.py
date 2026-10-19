"""Icon fetcher registry: curated builtins and pluggable libraries."""

from __future__ import annotations

from pathlib import Path

import pytest

from adapters.icons.energy import EnergyIconsFetcher
from adapters.icons.iconmind import IconMindFetcher
from adapters.icons.iconoven import IconOvenFetcher
from adapters.icons.registry import clear_registry, get_fetcher, register_fetcher
from domain.icon_vendor import ensure_icon


@pytest.fixture(autouse=True)
def _reset_registry():
    clear_registry()
    yield
    clear_registry()


def test_iconmind_is_registered():
    fetcher = get_fetcher("iconmind")
    assert fetcher is not None
    assert isinstance(fetcher, IconMindFetcher)


def test_iconoven_is_registered():
    fetcher = get_fetcher("iconoven", style="sharp")
    assert fetcher is not None
    assert isinstance(fetcher, IconOvenFetcher)
    assert fetcher.style == "sharp"


def test_energy_is_registered():
    fetcher = get_fetcher("energy", style="48-bold")
    assert fetcher is not None
    assert isinstance(fetcher, EnergyIconsFetcher)
    assert fetcher.style == "48-bold"


def test_unknown_lib_returns_none():
    assert get_fetcher("not-a-real-lib") is None


def test_register_fake_lib_used_by_ensure_icon(tmp_path: Path):
    workspace = tmp_path / "project"
    repo_icons = tmp_path / "repo_icons"
    workspace.mkdir()
    repo_icons.mkdir()

    class HeroFetcher:
        def fetch(self, slug: str) -> str:
            return f"<svg id='hero-{slug}'></svg>"

    register_fetcher("heroicons", lambda style: HeroFetcher())

    path = ensure_icon(
        "heroicons",
        "home",
        workspace=workspace,
        repo_icons=repo_icons,
    )
    assert path is not None
    assert path == (workspace / "icons" / "heroicons" / "home.svg").resolve()
    assert "hero-home" in path.read_text(encoding="utf-8")
