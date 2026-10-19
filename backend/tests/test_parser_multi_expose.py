"""Multiple expose clauses on one view are preserved and unioned in get_view."""

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.parser.subset_parser import SubsetSysmlParser
from helpers import add_content_file, api_url


SRC = """
package MultiExposePkg {
  package LogicalCounterparts {
    #Logical ref part engine;
  }

  part def Vehicle {
    part motor;
    #implements dependency from motor to LogicalCounterparts::engine;
  }

  view def DepsView : GeneralView {
    expose Vehicle;
    expose LogicalCounterparts;
    filter @PartUsage or @Dependency;
  }
}
"""


def test_parser_stores_multiple_expose_refs():
    result = SubsetSysmlParser().parse(SRC, "f1")
    view = result.elements["MultiExposePkg::DepsView"]
    assert view.expose_ref == "MultiExposePkg::Vehicle"
    assert view.expose_refs == [
        "MultiExposePkg::Vehicle",
        "MultiExposePkg::LogicalCounterparts",
    ]


def test_get_view_unions_multiple_expose_roots(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "M"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "multi.sysml", SRC)
    payload = client.get(
        api_url(f"/projects/{project_id}/views/MultiExposePkg::DepsView"),
        params={"levels": 3},
    ).json()
    ids = set(payload["semantic"])
    assert "MultiExposePkg::Vehicle" in ids
    assert "MultiExposePkg::Vehicle::motor" in ids
    assert "MultiExposePkg::LogicalCounterparts::engine" in ids
    assert any(e["kind"] == "dependency" for e in payload["semantic"].values())
