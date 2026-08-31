"""Static path resolution for unified server."""

from pathlib import Path

from adapters.api.static_paths import resolve_repo_root, resolve_static_dir


def test_resolve_repo_root_from_app_module():
    root = resolve_repo_root()
    assert (root / "backend" / "src").is_dir()
    assert (root / "frontend").is_dir()


def test_resolve_static_dir_from_env(tmp_path: Path, monkeypatch):
    dist = tmp_path / "dist"
    dist.mkdir()
    monkeypatch.setenv("SYSMLVIEWER_STATIC_DIR", str(dist))
    assert resolve_static_dir() == dist.resolve()


def test_resolve_static_dir_default(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("SYSMLVIEWER_STATIC_DIR", raising=False)
    root = resolve_repo_root()
    default = root / "frontend" / "dist"
    if default.is_dir():
        assert resolve_static_dir() == default.resolve()
    else:
        assert resolve_static_dir() is None


def test_resolve_static_dir_missing_returns_none(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SYSMLVIEWER_STATIC_DIR", str(tmp_path / "missing"))
    assert resolve_static_dir() is None
