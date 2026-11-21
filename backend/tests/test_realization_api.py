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


def test_realization_cached_per_revision(tmp_path: Path):
    from adapters.parser.subset_parser import SubsetSysmlParser
    from adapters.persistence.workspace_repo import WorkspaceProjectRepository
    from application.project_service import ProjectService

    client, pid = _client(tmp_path)
    service = ProjectService(
        repo=WorkspaceProjectRepository(tmp_path), parser=SubsetSysmlParser()
    )
    first = service.get_realization(pid)
    assert first is not None
    assert service.get_realization(pid) is first
    assert _get(client, pid) == first

    # Drop the step links: the use case leaves scope and the result is recomputed.
    changed = "\n".join(
        line for line in PROBE.splitlines() if "UC::Start::" not in line or "#refine" not in line
    )
    (tmp_path / "probe.sysml").write_text(changed, encoding="utf-8")
    after = service.get_realization(pid)
    assert after is not first
    assert START in first["inScope"] and START not in after["inScope"]


def test_empty_model(tmp_path: Path):
    client, pid = _client(tmp_path, content=None)
    assert _get(client, pid) == {
        "links": [],
        "actorSteps": {},
        "systemSteps": {},
        "stepRealizers": {},
        "coarseRealizers": {},
        "useCases": {},
        "inScope": [],
        "findings": [],
    }


def test_unknown_project_is_404(tmp_path: Path):
    client, _ = _client(tmp_path, content=None)
    assert client.get(api_url("/projects/nope/realization")).status_code == 404
