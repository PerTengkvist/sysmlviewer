"""TDD: frontend/dist must not be tracked; prod start auto-builds when missing."""

from __future__ import annotations

import os
import stat
import subprocess
import textwrap
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "sysmlviewer.sh"


def _gitignore_text() -> str:
    return (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")


def _frontend_gitignore_text() -> str:
    return (REPO_ROOT / "frontend" / ".gitignore").read_text(encoding="utf-8")


def test_root_gitignore_ignores_frontend_dist():
    text = _gitignore_text()
    assert "frontend/dist/" in text or "frontend/dist" in text


def test_frontend_gitignore_ignores_dist():
    text = _frontend_gitignore_text()
    assert "\ndist\n" in f"\n{text}" or text.strip().startswith("dist") or "\ndist/" in f"\n{text}"


def test_frontend_dist_not_tracked_by_git():
    result = subprocess.run(
        ["git", "ls-files", "frontend/dist"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == "", (
        "frontend/dist must not be tracked; run: git rm -r --cached frontend/dist"
    )


def _write_stub_npm(bin_dir: Path, *, fail_if_build: bool = False) -> None:
    bin_dir.mkdir(parents=True, exist_ok=True)
    npm = bin_dir / "npm"
    if fail_if_build:
        body = textwrap.dedent(
            """\
            #!/usr/bin/env bash
            if [[ "$1" == "run" && "$2" == "build" ]]; then
              echo "npm run build should not be called" >&2
              exit 99
            fi
            exit 0
            """
        )
    else:
        body = textwrap.dedent(
            """\
            #!/usr/bin/env bash
            if [[ "$1" == "install" ]]; then
              mkdir -p node_modules
              exit 0
            fi
            if [[ "$1" == "run" && "$2" == "build" ]]; then
              mkdir -p dist
              printf '%s\\n' '<html>built</html>' > dist/index.html
              exit 0
            fi
            echo "unexpected npm args: $*" >&2
            exit 1
            """
        )
    npm.write_text(body, encoding="utf-8")
    npm.chmod(npm.stat().st_mode | stat.S_IXUSR)


def _source_ensure_dist(root: Path, path_prefix: Path) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "SYSMLVIEWER_ROOT": str(root),
        "PATH": f"{path_prefix}:{os.environ.get('PATH', '')}",
    }
    # Source script (main must not run) and invoke ensure_dist.
    script = textwrap.dedent(
        f"""\
        set -euo pipefail
        # shellcheck disable=SC1091
        source "{SCRIPT}"
        ensure_dist
        """
    )
    return subprocess.run(
        ["bash", "-c", script],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
    )


@pytest.fixture
def fake_root(tmp_path: Path) -> Path:
    frontend = tmp_path / "frontend"
    frontend.mkdir()
    (tmp_path / "backend").mkdir()
    return tmp_path


def test_ensure_dist_auto_builds_when_index_missing(fake_root: Path):
    stub_bin = fake_root / "stub-bin"
    _write_stub_npm(stub_bin, fail_if_build=False)
    dist_index = fake_root / "frontend" / "dist" / "index.html"
    assert not dist_index.exists()

    result = _source_ensure_dist(fake_root, stub_bin)
    assert result.returncode == 0, result.stderr + result.stdout
    assert dist_index.is_file()
    assert "built" in dist_index.read_text(encoding="utf-8")


def test_ensure_dist_skips_build_when_index_present(fake_root: Path):
    stub_bin = fake_root / "stub-bin"
    _write_stub_npm(stub_bin, fail_if_build=True)
    dist = fake_root / "frontend" / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>prebuilt</html>", encoding="utf-8")

    result = _source_ensure_dist(fake_root, stub_bin)
    assert result.returncode == 0, result.stderr + result.stdout
    assert (dist / "index.html").read_text(encoding="utf-8") == "<html>prebuilt</html>"
