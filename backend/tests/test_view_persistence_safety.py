"""Persistence safety for views/*.json: one winning file, atomic, permission aware."""

from __future__ import annotations

import json
import os
import stat
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.persistence import atomic_write as atomic_write_module
from adapters.persistence.view_file_store import (
    ViewFileNotWritable,
    duplicate_view_files,
    find_view_file,
    read_for_view,
    write_one,
)
from domain.view_layouts import ViewLayout, ViewNodeLayout
from helpers import add_content_file, api_url

VIEW_ID = "Pkg::BoxView"
SAMPLE = """\
package Sample {
  part def Box {
    part a;
    part b;
    part c;
    part d;
    part e;
    part f;
  }

  view def BoxView : GeneralView {
    expose Box;
  }
}
"""


def _layout(x: float) -> ViewLayout:
    return ViewLayout(nodes={"Pkg::Box": ViewNodeLayout(x=x, y=1.0)})


def _write_raw(root: Path, filename: str, x: float) -> Path:
    directory = root / "views"
    directory.mkdir(exist_ok=True)
    path = directory / filename
    path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "viewId": VIEW_ID,
                "name": "BoxView",
                "nodes": {"Pkg::Box": {"x": x, "y": 1.0}},
                "edges": {},
            }
        ),
        encoding="utf-8",
    )
    return path


def _with_duplicates(root: Path) -> tuple[Path, Path]:
    return (
        _write_raw(root, "BoxView.json", 1.0),
        _write_raw(root, "Pkg__BoxView.json", 2.0),
    )


def test_write_targets_file_that_read_returns_when_duplicates_exist(tmp_path: Path):
    _with_duplicates(tmp_path)

    write_one(tmp_path, VIEW_ID, "BoxView", _layout(99.0))

    loaded = read_for_view(tmp_path, VIEW_ID)
    assert loaded is not None
    assert loaded.nodes["Pkg::Box"].x == 99.0


def test_find_view_file_returns_file_that_read_uses(tmp_path: Path):
    _, winner = _with_duplicates(tmp_path)

    assert find_view_file(tmp_path, VIEW_ID) == winner


def test_duplicate_view_files_are_reported(tmp_path: Path):
    first, second = _with_duplicates(tmp_path)

    assert duplicate_view_files(tmp_path, VIEW_ID) == [first, second]


def test_single_view_file_is_not_a_duplicate(tmp_path: Path):
    _write_raw(tmp_path, "BoxView.json", 1.0)

    assert duplicate_view_files(tmp_path, VIEW_ID) == []


def test_write_one_leaves_no_partial_file_on_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    path = write_one(tmp_path, VIEW_ID, "BoxView", _layout(1.0))
    before = path.read_text(encoding="utf-8")

    def fail_replace(*_args: object, **_kwargs: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(atomic_write_module.os, "replace", fail_replace)

    with pytest.raises(OSError, match="disk full"):
        write_one(tmp_path, VIEW_ID, "BoxView", _layout(2.0))

    assert path.read_text(encoding="utf-8") == before
    assert [p.name for p in path.parent.iterdir()] == [path.name]


def test_write_one_preserves_file_mode(tmp_path: Path):
    path = write_one(tmp_path, VIEW_ID, "BoxView", _layout(1.0))
    path.chmod(0o640)

    write_one(tmp_path, VIEW_ID, "BoxView", _layout(2.0))

    assert stat.S_IMODE(path.stat().st_mode) == 0o640


def test_new_view_file_is_readable_by_group_and_others(tmp_path: Path):
    path = write_one(tmp_path, VIEW_ID, "BoxView", _layout(1.0))

    assert stat.S_IMODE(path.stat().st_mode) == 0o644


@pytest.mark.skipif(os.geteuid() == 0, reason="root ignores file permissions")
def test_write_refuses_read_only_view_file(tmp_path: Path):
    path = write_one(tmp_path, VIEW_ID, "BoxView", _layout(1.0))
    before = path.read_text(encoding="utf-8")
    path.chmod(0o444)

    with pytest.raises(ViewFileNotWritable) as caught:
        write_one(tmp_path, VIEW_ID, "BoxView", _layout(2.0))

    assert caught.value.path == path.resolve()
    assert path.read_text(encoding="utf-8") == before


def _setup_project(tmp_path: Path) -> tuple[TestClient, str, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "Safe"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "box.sysml", SAMPLE)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if v["name"] == "BoxView")
    return client, project_id, view_id


def test_concurrent_patches_keep_all_updates(tmp_path: Path):
    client, project_id, view_id = _setup_project(tmp_path)
    node_ids = [f"Sample::Box::{name}" for name in "abcdef"] * 4
    targets = [f"{node_id}#{index}" for index, node_id in enumerate(node_ids)]

    def one_patch(target: str) -> int:
        response = client.patch(
            api_url(f"/projects/{project_id}/visualization"),
            json={"viewId": view_id, "nodes": {target: {"x": 5, "y": 6}}},
        )
        return response.status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(one_patch, targets))

    assert all(code == 200 for code in codes)
    saved = read_for_view(tmp_path, view_id)
    assert saved is not None
    assert sorted(saved.nodes) == sorted(targets)


@pytest.mark.skipif(os.geteuid() == 0, reason="root ignores file permissions")
def test_patch_permission_error_returns_403_with_path(tmp_path: Path):
    client, project_id, view_id = _setup_project(tmp_path)
    url = api_url(f"/projects/{project_id}/visualization")
    patch = {"viewId": view_id, "nodes": {"Sample::Box::a": {"x": 5, "y": 6}}}
    assert client.patch(url, json=patch).status_code == 200
    path = find_view_file(tmp_path, view_id)
    assert path is not None
    path.chmod(0o444)

    response = client.patch(url, json=patch)

    assert response.status_code == 403
    assert path.name in response.json()["detail"]


def test_patch_os_error_returns_500_with_reason(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    client, project_id, view_id = _setup_project(tmp_path)

    def fail_replace(*_args: object, **_kwargs: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(atomic_write_module.os, "replace", fail_replace)

    response = TestClient(client.app, raise_server_exceptions=False).patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "nodes": {"Sample::Box::a": {"x": 5, "y": 6}}},
    )

    assert response.status_code == 500
    assert "disk full" in response.json()["detail"]
