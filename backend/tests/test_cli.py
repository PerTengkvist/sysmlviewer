"""CLI argument parsing for sysmlviewer backend."""

import os
from pathlib import Path

import pytest

from cli import main, parse_args, resolve_startup


def test_parse_f_and_p_mutually_exclusive():
    with pytest.raises(SystemExit):
        parse_args(["-f", "/tmp/a", "-p", "/tmp/a/project.json"])


def test_parse_f_sets_workspace(tmp_path: Path):
    args = parse_args(["-f", str(tmp_path)])
    assert args.folder == str(tmp_path)
    assert args.project_file is None


def test_parse_p_sets_project_file(tmp_path: Path):
    pf = tmp_path / "project.json"
    pf.write_text("{}", encoding="utf-8")
    args = parse_args(["-p", str(pf)])
    assert args.project_file == str(pf)
    assert args.folder is None


def test_resolve_startup_folder_without_project(tmp_path: Path):
    workspace, project_file = resolve_startup(folder=str(tmp_path), project_file=None)
    assert workspace == tmp_path.resolve()
    assert project_file is None


def test_resolve_startup_folder_missing(tmp_path: Path):
    missing = tmp_path / "nope"
    with pytest.raises(FileNotFoundError):
        resolve_startup(folder=str(missing), project_file=None)


def test_resolve_startup_project_file(tmp_path: Path):
    pf = tmp_path / "project.json"
    pf.write_text('{"id":"x"}', encoding="utf-8")
    workspace, project_file = resolve_startup(folder=None, project_file=str(pf))
    assert workspace == tmp_path.resolve()
    assert project_file == pf.resolve()


def test_resolve_startup_project_file_missing(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        resolve_startup(folder=None, project_file=str(tmp_path / "missing.json"))


def test_main_sets_static_dir_env(tmp_path: Path, monkeypatch):
    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    monkeypatch.setattr("cli.resolve_repo_root", lambda: tmp_path)
    captured: dict[str, str] = {}

    def fake_run(*_args, **_kwargs):
        captured["static"] = os.environ.get("SYSMLVIEWER_STATIC_DIR", "")

    monkeypatch.setattr("uvicorn.run", fake_run)

    main([])
    assert captured["static"] == str(dist.resolve())
