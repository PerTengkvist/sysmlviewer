"""GET /api/projects/{pid}/realization."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from helpers import add_content_file, api_url

PROBE = (Path(__file__).parent / "fixtures" / "realization_probe.sysml").read_text(
    encoding="utf-8"
)

P = "RealizationProbe"
START = f"{P}::UC::Start"
UNLOCK = f"{P}::UC::Unlock"
LOCK = f"{P}::UC::Lock"
DRIVE = f"{P}::UC::Drive"
SEC = f"{P}::F::Security"


def _client(tmp_path: Path, content: str | None = PROBE) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "T"}).json()["id"]
    if content is not None:
        add_content_file(client, project_id, tmp_path, "probe.sysml", content)
    return client, project_id


def _get(client: TestClient, project_id: str) -> dict:
    res = client.get(api_url(f"/projects/{project_id}/realization"))
    assert res.status_code == 200, res.text
    return res.json()


def test_get_realization(tmp_path: Path):
    client, pid = _client(tmp_path)
    data = _get(client, pid)

    assert set(data) == {
        "links",
        "actorSteps",
        "systemSteps",
        "stepRealizers",
        "coarseRealizers",
        "realizerNodes",
        "nodeParts",
        "useCases",
        "inScope",
        "findings",
    }
    by_target = {(link["sourceId"], link["targetId"]): link for link in data["links"]}
    step_link = by_target[(f"{SEC}::startFlow::checkKeyInCabin", f"{START}::checkKey")]
    assert step_link["precision"] == "step"
    assert set(step_link) == {"refineId", "sourceId", "targetId", "precision"}
    assert by_target[(SEC, LOCK)]["precision"] == "explicit"

    assert data["actorSteps"][START][f"{START}::pressStart"] == f"{START}::Driver"
    assert f"{START}::checkKey" in data["systemSteps"][START]
    assert data["stepRealizers"][f"{START}::checkKey"] == [
        f"{SEC}::startFlow::checkKeyInCabin"
    ]
    assert data["coarseRealizers"][UNLOCK] == [f"{SEC}::unlockFlow"]
    assert START in data["inScope"]

    start = data["useCases"][START]
    assert start["functions"] == {SEC: "step"}
    assert start["nodes"] == {
        f"{SEC}::auth": "step",
        f"{SEC}::immo": "step",
    }
    assert start["parts"] == {f"{P}::L::vc": "step"}
    assert start["viaInclude"] == []
    assert start["origin"][SEC] in {link["refineId"] for link in data["links"]}

    drive = data["useCases"][DRIVE]
    assert SEC in drive["viaInclude"]
    assert drive["declared"] == []
    assert data["useCases"][LOCK]["declared"] == [SEC]

    codes = {f["code"] for f in data["findings"]}
    assert "unrealized-system-step" in codes
    assert set(data["findings"][0]) == {"code", "elementId", "message"}


ORDER = """
package O {
  USE1
  USE2
  part def F {
    action f { action s; action t; }
  }
  #refine dependency from F::f::s to U1::a;
  #refine dependency from F::f::t to U2::b;
}
"""
U1 = "use case def U1 { action a; }"
U2 = "use case def U2 { action b; }"


def test_realization_follows_declaration_order(tmp_path: Path):
    from adapters.parser.subset_parser import SubsetSysmlParser
    from adapters.persistence.workspace_repo import WorkspaceProjectRepository
    from application.project_service import ProjectService

    client, pid = _client(tmp_path, ORDER.replace("USE1", U1).replace("USE2", U2))
    service = ProjectService(
        repo=WorkspaceProjectRepository(tmp_path), parser=SubsetSysmlParser()
    )
    first = service.get_realization(pid)
    assert first is not None
    assert list(first["useCases"]) == ["O::U1", "O::U2"]
    (tmp_path / "probe.sysml").write_text(
        ORDER.replace("USE1", U2).replace("USE2", U1), encoding="utf-8"
    )
    after = service.get_realization(pid)
    assert after is not None
    assert list(after["useCases"]) == ["O::U2", "O::U1"]


def test_empty_model(tmp_path: Path):
    client, pid = _client(tmp_path, content=None)
    assert _get(client, pid) == {
        "links": [],
        "actorSteps": {},
        "systemSteps": {},
        "stepRealizers": {},
        "coarseRealizers": {},
        "realizerNodes": {},
        "nodeParts": {},
        "useCases": {},
        "inScope": [],
        "findings": [],
    }


def test_unknown_project_is_404(tmp_path: Path):
    client, _ = _client(tmp_path, content=None)
    assert client.get(api_url("/projects/nope/realization")).status_code == 404


NODES = """
package N {
  package UC {
    use case def Run {
      action a1;
      action a2;
      action a3;
    }
  }
  package F {
    part def Fx {
      part shared { perform fxFlow.s1; perform F::Fy::fyFlow.t1; }
      part only  { perform fxFlow.s2; }
      action fxFlow { action s1; action s2; }
    }
    part def Fy {
      action fyFlow { action t1; }
    }
    part def Fz {
      part zn { perform zFlow.z1; }
      action zFlow { action z1; action z2; }
    }
    occurrence def Seq {
      part ghost { perform fxFlow.s1; }
    }
  }
  package L { part vc; part bc; }
  allocate F::Fx::shared to L::vc;
  allocate F::Fx::shared to L::bc;
  #refine dependency from F::Fx::fxFlow::s1 to UC::Run::a1;
  #refine dependency from F::Fy::fyFlow::t1 to UC::Run::a2;
  #refine dependency from F::Fz::zFlow to UC::Run::a3;
}
"""

N = "N"
RUN = f"{N}::UC::Run"


def test_realization_view_data_for_the_details_panel(tmp_path: Path):
    client, pid = _client(tmp_path, NODES)
    data = _get(client, pid)
    run = data["useCases"][RUN]

    # A function node that performs steps of two functions sits under both of them.
    shared = f"{N}::F::Fx::shared"
    assert run["nodeFunctions"][shared] == [f"{N}::F::Fx", f"{N}::F::Fy"]
    assert data["realizerNodes"][f"{N}::F::Fy::fyFlow::t1"] == [shared]

    # A flow that realizes coarsely lists the nodes of its steps.
    assert data["realizerNodes"][f"{N}::F::Fz::zFlow"] == [f"{N}::F::Fz::zn"]
    # A part in an occurrence is not a function node.
    assert data["realizerNodes"][f"{N}::F::Fx::fxFlow::s1"] == [shared]
    assert f"{N}::F::Seq::ghost" not in run["nodes"]
    # Allocation targets of a function node.
    assert data["nodeParts"][shared] == [f"{N}::L::vc", f"{N}::L::bc"]
