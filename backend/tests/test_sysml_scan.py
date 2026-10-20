"""Discover *.sysml under a workspace root with exclude segments."""

from pathlib import Path

from adapters.persistence.workspace_repo import list_sysml_paths


def test_empty_tree(tmp_path: Path):
    assert list_sysml_paths(tmp_path) == []


def test_nested_sysml_listed(tmp_path: Path):
    path = tmp_path / "a" / "b" / "c.sysml"
    path.parent.mkdir(parents=True)
    path.write_text("package C {}\n", encoding="utf-8")
    assert list_sysml_paths(tmp_path) == ["a/b/c.sysml"]


def test_skips_excluded_segments(tmp_path: Path):
    keep = tmp_path / "model" / "ok.sysml"
    keep.parent.mkdir(parents=True)
    keep.write_text("package Ok {}\n", encoding="utf-8")

    excluded = [
        tmp_path / "views" / "x.sysml",
        tmp_path / "icons" / "y.sysml",
        tmp_path / ".sysmlviewer" / "z.sysml",
        tmp_path / "docs" / "d.sysml",
        tmp_path / "model" / "docs" / "nested.sysml",
        tmp_path / ".git" / "objects" / "g.sysml",
        tmp_path / "node_modules" / "pkg" / "n.sysml",
    ]
    for path in excluded:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("package Skip {}\n", encoding="utf-8")

    assert list_sysml_paths(tmp_path) == ["model/ok.sysml"]


def test_sorted_stable_order(tmp_path: Path):
    for rel in ("z/a.sysml", "a/b.sysml", "m.sysml"):
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("package X {}\n", encoding="utf-8")
    assert list_sysml_paths(tmp_path) == ["a/b.sysml", "m.sysml", "z/a.sysml"]
