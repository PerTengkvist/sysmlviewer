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


TRACE_SRC = """
package TracePkg {
  package UseCases {
    use case def Start;
  }
  package Requirements {
    requirement def <'R-1'> PowerModes;
  }
  #refine dependency from UseCases::Start to Requirements::PowerModes;

  view TraceView : UseCaseView {
    expose UseCases;
    expose Requirements;
  }

  view def TraceDef :> UseCaseView {
    expose UseCases;
    expose Requirements;
  }
  view inherited : TraceDef;
}
"""


def _trace_payload(tmp_path: Path, view_id: str) -> dict:
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "T"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "trace.sysml", TRACE_SRC)
    res = client.get(
        api_url(f"/projects/{project_id}/views/{view_id}"),
        params={"levels": 3},
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_view_payload_lists_every_expose_root(tmp_path: Path):
    payload = _trace_payload(tmp_path, "TracePkg::TraceView")
    assert payload["diagramMode"] == "useCase"
    assert payload["exposeRootIds"] == [
        "TracePkg::UseCases",
        "TracePkg::Requirements",
    ]
    ids = set(payload["semantic"])
    assert "TracePkg::UseCases::Start" in ids
    assert "TracePkg::Requirements::PowerModes" in ids


def test_view_payload_expose_roots_inherited_from_view_def(tmp_path: Path):
    payload = _trace_payload(tmp_path, "TracePkg::inherited")
    assert payload["exposeRootIds"] == [
        "TracePkg::UseCases",
        "TracePkg::Requirements",
    ]


UC_FILE = """
package UseCases {
  use case def Start;
  #refine dependency from Start to Requirements::PowerModes;

  view TraceView : UseCaseView {
    expose UseCases;
    expose Requirements;
  }
  view QualifiedTraceView : UseCaseView {
    expose UseCases;
    expose Requirements::Driving;
  }
}
"""

REQ_FILE = """
package Requirements {
  requirement def <'R-1'> PowerModes;
  package Driving {
    requirement def <'R-2'> Braking;
  }
}
"""


def test_parse_project_resolves_expose_into_another_file():
    from domain.models import SysmlFile

    files = [
        SysmlFile(id="uc", name="uc.sysml", content=UC_FILE),
        SysmlFile(id="req", name="req.sysml", content=REQ_FILE),
    ]
    elements = SubsetSysmlParser().parse_project(files).elements
    assert elements["UseCases::TraceView"].expose_refs == [
        "UseCases",
        "Requirements",
    ]
    assert elements["UseCases::QualifiedTraceView"].expose_refs == [
        "UseCases",
        "Requirements::Driving",
    ]


def test_get_view_shows_requirements_exposed_from_another_file(tmp_path: Path):
    app = create_app(data_dir=tmp_path)
    client = TestClient(app)
    project_id = client.post(api_url("/projects"), json={"name": "X"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "uc.sysml", UC_FILE)
    add_content_file(client, project_id, tmp_path, "req.sysml", REQ_FILE)
    payload = client.get(
        api_url(f"/projects/{project_id}/views/UseCases::TraceView"),
        params={"levels": 3},
    ).json()
    assert payload["exposeRootIds"] == ["UseCases", "Requirements"]
    assert "Requirements::PowerModes" in payload["semantic"]
