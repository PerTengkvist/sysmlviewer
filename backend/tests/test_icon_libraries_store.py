"""Workspace icons/libraries.json load and save."""

from pathlib import Path

from domain.icon_libraries_store import (
    libraries_config_path,
    load_library_settings,
    save_library_settings,
)


def test_load_defaults_without_file(tmp_path: Path):
    settings = load_library_settings(tmp_path)
    assert settings["iconoven"]["enabled"] is True
    assert settings["iconoven"]["style"] == "round"


def test_save_and_reload(tmp_path: Path):
    saved = save_library_settings(
        tmp_path,
        {"iconoven": {"enabled": False, "style": "sharp"}},
    )
    assert saved["iconoven"]["enabled"] is False
    assert libraries_config_path(tmp_path).is_file()
    loaded = load_library_settings(tmp_path)
    assert loaded["iconoven"]["style"] == "sharp"
    assert loaded["iconoven"]["enabled"] is False


def test_disabled_lib_blocks_vendor(tmp_path: Path):
    from adapters.icons.registry import clear_registry, register_fetcher
    from domain.icon_vendor import ensure_icon

    clear_registry()
    calls: list[str] = []

    class Fake:
        def fetch(self, slug: str) -> str:
            calls.append(slug)
            return f"<svg id='{slug}'></svg>"

    register_fetcher("iconoven", lambda style: Fake())
    save_library_settings(tmp_path, {"iconoven": {"enabled": False}})
    assert (
        ensure_icon(
            "iconoven",
            "home",
            workspace=tmp_path,
            repo_icons=tmp_path / "repo_icons",
        )
        is None
    )
    assert calls == []
    clear_registry()


def test_style_passed_to_fetcher(tmp_path: Path):
    from adapters.icons.registry import clear_registry, register_fetcher
    from domain.icon_vendor import ensure_icon

    clear_registry()
    seen: list[str] = []

    class Fake:
        def __init__(self, style: str) -> None:
            self.style = style

        def fetch(self, slug: str) -> str:
            seen.append(self.style)
            return f"<svg id='{slug}'></svg>"

    register_fetcher("iconoven", lambda style: Fake(style))
    save_library_settings(tmp_path, {"iconoven": {"style": "sharp"}})
    path = ensure_icon(
        "iconoven",
        "home",
        workspace=tmp_path,
        repo_icons=tmp_path / "repo_icons",
    )
    assert path is not None
    assert seen == ["sharp"]
    clear_registry()
