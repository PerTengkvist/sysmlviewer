"""Per-view realization matrix choice: what the rows and the columns list."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from adapters.api.app import create_app
from domain.view_layouts import ViewLayout, normalize_realization_matrix
from helpers import add_content_file, api_url

PROBE = (Path(__file__).parent / "fixtures" / "realization_probe.sysml").read_text(
    encoding="utf-8"
)
VIEWS = "package Views { view Matrix : GridView { expose RealizationProbe::UC; } }"
VIEW_ID = "Views::Matrix"


def _client(tmp_path: Path) -> tuple[TestClient, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    pid = client.post(api_url("/projects"), json={"name": "M"}).json()["id"]
    add_content_file(client, pid, tmp_path, "m.sysml", PROBE + "\n" + VIEWS)
    return client, pid


def _view(client: TestClient, pid: str) -> dict:
    return client.get(api_url(f"/projects/{pid}/views/{VIEW_ID}")).json()


def _patch(client: TestClient, pid: str, **extra) -> None:
    res = client.patch(
        api_url(f"/projects/{pid}/visualization"),
        json={"viewId": VIEW_ID, "structureNotation": "sysmlv2", **extra},
    )
    assert res.status_code == 200, res.text


def test_normalize_keeps_known_values_only():
    assert normalize_realization_matrix({"rows": "steps", "columns": "parts"}) == {
        "rows": "steps",
        "columns": "parts",
    }
    assert normalize_realization_matrix({"rows": "x", "columns": "nodes", "junk": 1}) == {
        "columns": "nodes"
    }
    assert normalize_realization_matrix(None) is None
    assert normalize_realization_matrix("junk") is None
    assert normalize_realization_matrix({}) == {}


def test_view_layout_roundtrip_and_absent_when_unset():
    layout = ViewLayout.from_dict({"nodes": {}, "realizationMatrix": {"rows": "steps"}})
    assert layout.to_dict()["realizationMatrix"] == {"rows": "steps"}
    assert "realizationMatrix" not in ViewLayout.from_dict({"nodes": {}}).to_dict()


def test_matrix_choice_api_roundtrip_preserve_and_clear(tmp_path: Path):
    client, pid = _client(tmp_path)
    assert _view(client, pid)["realizationMatrix"] is None

    choice = {"rows": "steps", "columns": "parts"}
    _patch(client, pid, realizationMatrix=choice)
    assert _view(client, pid)["realizationMatrix"] == choice

    # A later patch of another field keeps the choice.
    _patch(client, pid, sequenceLayout={"order": ["a"]})
    assert _view(client, pid)["realizationMatrix"] == choice

    view_file = next(tmp_path.rglob("views/Matrix.json"))
    assert json.loads(view_file.read_text())["realizationMatrix"] == choice

    _patch(client, pid, realizationMatrix=None)
    assert _view(client, pid)["realizationMatrix"] is None
    assert "realizationMatrix" not in json.loads(view_file.read_text())


def test_matrix_choice_survives_reopening(tmp_path: Path):
    client, pid = _client(tmp_path)
    _patch(client, pid, realizationMatrix={"columns": "parts"})
    again = TestClient(create_app(data_dir=tmp_path))
    pid2 = again.get(api_url("/projects")).json()[0]["id"]
    res = again.get(api_url(f"/projects/{pid2}/views/{VIEW_ID}")).json()
    assert res["realizationMatrix"] == {"columns": "parts"}
