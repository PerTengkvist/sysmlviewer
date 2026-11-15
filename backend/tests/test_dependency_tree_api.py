"""GET /api/projects/{pid}/dependency-tree/{artifact_id}."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

REQS = """
package Requirements {
  requirement def <'R-1'> Safety;
  requirement def <'R-2'> Stop;
  #refine dependency from Stop to Safety;
  satisfy Stop by Arch::Car::brakes;
}
"""

ARCH = """
package Arch {
  part def Car {
    part brakes;
  }
}
"""


def _client(tmp_path: Path) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "T"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "reqs.sysml", REQS)
    add_content_file(client, project_id, tmp_path, "arch.sysml", ARCH)
    return client, project_id


def test_dependency_tree_spans_the_whole_project(tmp_path: Path):
    client, project_id = _client(tmp_path)
    res = client.get(
        api_url(f"/projects/{project_id}/dependency-tree/Requirements::Stop")
    )
    assert res.status_code == 200, res.text
    tree = res.json()

    assert tree["root"]["id"] == "Requirements::Stop"
    assert tree["root"]["shortId"] == "R-2"
    assert [n["id"] for n in tree["up"]] == ["Requirements::Safety"]

    (brakes,) = tree["down"]["children"]
    # Found across files.
    assert brakes["id"] == "Arch::Car::brakes"
    for key in ("id", "name", "kind", "shortId", "relationId", "label", "children"):
        assert key in brakes
    assert brakes["label"] == "satisfy"
    assert brakes["kind"] == "part"


def test_dependency_tree_unknown_element_is_404(tmp_path: Path):
    client, project_id = _client(tmp_path)
    res = client.get(api_url(f"/projects/{project_id}/dependency-tree/Nope::X"))
    assert res.status_code == 404


def test_dependency_tree_unknown_project_is_404(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    res = client.get(api_url("/projects/nope/dependency-tree/A::B"))
    assert res.status_code == 404
