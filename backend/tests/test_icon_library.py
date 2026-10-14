from pathlib import Path

from domain.icon_library import (
    OFFLINE_ICONS,
    log_icon_library_startup,
    offline_icon_files,
    resolve_icon_library,
)


def test_default_library_is_carbon(tmp_path: Path):
    (tmp_path / "icons" / "carbon").mkdir(parents=True)
    name, path = resolve_icon_library(env={}, repo_root=tmp_path)
    assert name == "carbon"
    assert path == (tmp_path / "icons" / "carbon").resolve()


def test_env_overrides_library(tmp_path: Path):
    (tmp_path / "icons" / "custom").mkdir(parents=True)
    name, path = resolve_icon_library(
        env={"SYSMLVIEWER_ICON_LIBRARY": "custom"},
        repo_root=tmp_path,
    )
    assert name == "custom"
    assert path == (tmp_path / "icons" / "custom").resolve()


def test_startup_log_includes_name_and_path(tmp_path: Path):
    path = tmp_path / "icons" / "carbon"
    msg = log_icon_library_startup("carbon", path)
    assert "carbon" in msg
    assert str(path) in msg


def test_offline_icons_exist_in_repo():
    from adapters.api.static_paths import resolve_repo_root

    _, path = resolve_icon_library(repo_root=resolve_repo_root())
    files = offline_icon_files(path)
    assert [f.stem for f in files] == list(OFFLINE_ICONS)
    for f in files:
        assert f.is_file(), f"missing offline icon {f}"
