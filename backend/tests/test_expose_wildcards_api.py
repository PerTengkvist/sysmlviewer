"""get_view honours the expose kind: `::*`, `::**` and `::*::**`."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

MODEL = """
package Pkg {
  package PartDefinitions {
    part FD1 {
      part F1 {
        part G1;
      }
      part F2;
      dependency from F1 to F2;
    }
    part FD2 {
      part F3;
    }
    part FD3;
    dependency from FD1 to FD2;
    dependency from FD3 to FD1::F1;
  }
  part Car {
    part engine {
      part piston;
    }
    part wheel;
  }
  view MembersView : GeneralView {
    expose PartDefinitions::*;
  }
  view AllView : GeneralView {
    expose PartDefinitions::**;
  }
  view AllMembersView : GeneralView {
    expose PartDefinitions::*::**;
  }
  view CarMembersView : GeneralView {
    expose Car::*;
  }
  view FilteredAllView : GeneralView {
    expose PartDefinitions::**;
    filter @PartUsage;
  }
}
"""

PD = "Pkg::PartDefinitions"


def _view(tmp_path: Path, view: str, levels: int = 2) -> dict:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "W"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "w.sysml", MODEL)
    res = client.get(
        api_url(f"/projects/{project_id}/views/Pkg::{view}"), params={"levels": levels}
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_members_expose_shows_only_the_direct_members(tmp_path: Path):
    view = _view(tmp_path, "MembersView", levels=3)
    ids = set(view["semantic"])
    assert {f"{PD}::FD1", f"{PD}::FD2", f"{PD}::FD3"} <= ids
    assert f"{PD}::FD1::F1" not in ids
    assert f"{PD}::FD2::F3" not in ids
    assert PD not in ids
    assert view["diagramMode"] == "structure"
    assert view["exposeControlsDepth"] is True
    assert view["exposeKinds"] == {PD: "members"}


def test_recursive_expose_ignores_the_levels(tmp_path: Path):
    view = _view(tmp_path, "AllView", levels=2)
    ids = set(view["semantic"])
    assert PD in ids
    assert {f"{PD}::FD1::F1", f"{PD}::FD1::F2", f"{PD}::FD1::F1::G1"} <= ids
    # The payload depth lets the frontend draw every level.
    assert view["hierarchicalLevels"] >= 4
    assert view["exposeControlsDepth"] is True


def test_recursive_members_expose_leaves_out_the_package(tmp_path: Path):
    view = _view(tmp_path, "AllMembersView", levels=2)
    ids = set(view["semantic"])
    assert PD not in ids
    assert {f"{PD}::FD1", f"{PD}::FD1::F1", f"{PD}::FD1::F1::G1"} <= ids
    assert view["diagramMode"] == "structure"


def test_members_of_a_part_draw_no_frame(tmp_path: Path):
    view = _view(tmp_path, "CarMembersView", levels=3)
    ids = set(view["semantic"])
    assert "Pkg::Car" not in ids
    assert {"Pkg::Car::engine", "Pkg::Car::wheel"} <= ids
    assert "Pkg::Car::engine::piston" not in ids
    assert view["diagramMode"] == "structure"


def test_relations_follow_what_is_exposed(tmp_path: Path):
    view = _view(tmp_path, "MembersView", levels=3)
    deps = [
        (e["sourceId"], e["targetId"])
        for e in view["semantic"].values()
        if e["kind"] == "dependency"
    ]
    assert (f"{PD}::FD1", f"{PD}::FD2") in deps
    # F1 is a member of FD1, not exposed by `PartDefinitions::*`.
    assert all(t != f"{PD}::FD1::F1" for _, t in deps)
    assert all(s != f"{PD}::FD1::F1" for s, _ in deps)


def test_filter_narrows_a_recursive_expose(tmp_path: Path):
    view = _view(tmp_path, "FilteredAllView", levels=2)
    kinds = {e["kind"] for e in view["semantic"].values()}
    assert "dependency" not in kinds
    assert f"{PD}::FD1::F1::G1" in view["semantic"]


def test_plain_expose_payload_says_levels_decide(tmp_path: Path):
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "W"}).json()["id"]
    add_content_file(
        client,
        project_id,
        tmp_path,
        "p.sysml",
        "package Q { package D { part A { part B; } } view V : GeneralView { expose D; } }",
    )
    view = client.get(
        api_url(f"/projects/{project_id}/views/Q::V"), params={"levels": 2}
    ).json()
    assert view["exposeControlsDepth"] is False
    assert view["exposeKinds"] == {"Q::D": "member"}
    assert "Q::D::A" in view["semantic"]
    assert "Q::D::A::B" not in view["semantic"]
