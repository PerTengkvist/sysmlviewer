"""Tests for native file/folder picker helpers."""

import platform
import subprocess

import pytest

from adapters.api.native_dialog import _is_user_cancel, pick_path


def test_is_user_cancel():
    assert _is_user_cancel("User canceled.")
    assert _is_user_cancel("Error: User cancelled (-128)")
    assert not _is_user_cancel("Something else failed")


def test_pick_path_macos_folder(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Darwin")

    def fake_run(cmd, **kwargs):
        assert cmd[0] == "osascript"
        return subprocess.CompletedProcess(cmd, 0, stdout="/tmp/project\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert pick_path(kind="folder", title="Choose") == "/tmp/project"


def test_pick_path_macos_cancelled(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Darwin")

    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(
            cmd,
            1,
            stdout="",
            stderr="User canceled.",
        )

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert pick_path(kind="file", title="Choose") is None


def test_pick_path_macos_failure(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Darwin")

    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 2, stdout="", stderr="boom")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        pick_path(kind="folder", title="Choose")
