"""A general view draws a use case with only its name.

Relations of the use case's members (subject, actors and what is inside
them) must still reach the frontend, which draws them to the use case.
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

MODEL = """
package Trace {
  part def Vehicle;
  actor def Driver;

  requirement def <'R-1'> Stop {
    doc /* Stop safely */
  }
  requirement def <'R-2'> Steer {
    doc /* Steer */
  }

  use case def Drive {
    actor driver : Driver;
    subject vehicle : Vehicle;
  }

  satisfy Stop by Drive::driver;
  satisfy Steer by Drive::vehicle;

  view TraceView : GeneralView {
    expose Trace;
  }
}
"""

VIEW = "Trace::TraceView"


def _view(tmp_path: Path, levels: int = 2) -> dict:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "T"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "trace.sysml", MODEL)
    res = client.get(
        api_url(f"/projects/{project_id}/views/{VIEW}"), params={"levels": levels}
    )
    assert res.status_code == 200, res.text
    return res.json()


def _satisfies(view: dict) -> dict[str, dict]:
    return {
        el["targetId"]: el
        for el in view["semantic"].values()
        if el["kind"] == "satisfy"
    }


def test_relations_of_hidden_use_case_members_are_kept(tmp_path: Path):
    view = _view(tmp_path, levels=2)
    sat = _satisfies(view)
    assert set(sat) == {"Trace::Stop", "Trace::Steer"}
    # The hidden ends and their owners up to the use case come along, so the
    # frontend can find the use case that holds them.
    semantic = view["semantic"]
    assert "Trace::Drive::driver" in semantic
    assert "Trace::Drive::vehicle" in semantic
    assert semantic["Trace::Drive::vehicle"]["parentId"] == "Trace::Drive"


def test_a_new_use_case_gets_the_use_case_view_size(tmp_path: Path):
    view = _view(tmp_path)
    node = view["visualization"]["nodes"]["Trace::Drive"]
    assert (node["width"], node["height"]) == (168.0, 72.0)
